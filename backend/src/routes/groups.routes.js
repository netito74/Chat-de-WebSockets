'use strict';
const express = require('express');
const conversationService = require('../services/conversationService');
const userService = require('../services/userService');
const validators = require('../utils/validators');
const { requireAuth } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(requireAuth, apiLimiter);

function notifyMembers(req, conversationId, event, payload) {
  const io = req.app.get('io');
  if (io) io.to(conversationId).emit(event, payload);
}

function requireAdmin(req, res, conversationId) {
  const role = conversationService.getRole(conversationId, req.user.id);
  if (role !== 'admin') {
    res.status(403).json({ error: 'Solo un administrador del grupo puede hacer esto' });
    return false;
  }
  return true;
}

router.post('/', (req, res, next) => {
  try {
    const input = validators.createGroup.parse(req.body);
    const memberIds = [];
    for (const uname of input.memberUsernames) {
      const u = userService.findByUsername(uname);
      if (u) memberIds.push(u.id);
    }
    const group = conversationService.createGroup({
      name: input.name,
      creatorId: req.user.id,
      memberIds,
    });
    const full = conversationService.listForUser(req.user.id).find((c) => c.id === group.id);

    // Une en tiempo real los sockets activos de todos los miembros a la
    // nueva sala (ver sockets/handlers/chat.js, ensureMembersJoined).
    const io = req.app.get('io');
    if (io) {
      const { ensureMembersJoined } = require('../sockets/handlers/chat');
      ensureMembersJoined(io, group.id);
      for (const uid of [...memberIds, req.user.id]) {
        io.to(`user:${uid}`).emit('group:created', full);
      }
    }
    res.status(201).json({ group: full });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    if (!conversationService.isMember(id, req.user.id)) {
      return res.status(403).json({ error: 'No perteneces a este grupo' });
    }
    if (!requireAdmin(req, res, id)) return;
    const input = validators.renameGroup.parse(req.body);
    conversationService.renameGroup(id, input.name);
    notifyMembers(req, id, 'group:renamed', { conversationId: id, name: input.name });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/members', (req, res, next) => {
  try {
    const { id } = req.params;
    if (!requireAdmin(req, res, id)) return;
    const input = validators.addMembers.parse(req.body);
    const added = [];
    const io = req.app.get('io');
    for (const uname of input.usernames) {
      const u = userService.findByUsername(uname);
      if (u && !conversationService.isMember(id, u.id)) {
        conversationService.addMember(id, u.id, 'member');
        added.push(userService.toPublic(u));
        if (io) io.to(`user:${u.id}`).emit('group:added', { conversationId: id });
      }
    }
    notifyMembers(req, id, 'group:members_updated', {
      conversationId: id,
      members: conversationService.getMembers(id),
    });
    if (io && added.length) {
      const { ensureMembersJoined } = require('../sockets/handlers/chat');
      ensureMembersJoined(io, id);
    }
    res.json({ added });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/members/:userId', (req, res, next) => {
  try {
    const { id, userId } = req.params;
    const targetId = Number(userId);
    const isSelf = targetId === req.user.id;
    if (!isSelf && !requireAdmin(req, res, id)) return;

    conversationService.removeMember(id, targetId);
    const remaining = conversationService.getMembers(id);

    const io = req.app.get('io');
    if (io) io.in(`user:${targetId}`).socketsLeave(id);

    if (remaining.length === 0) {
      conversationService.deleteGroup(id);
      notifyMembers(req, id, 'group:deleted', { conversationId: id });
    } else {
      // Si el ultimo admin se va, se promueve automaticamente al miembro mas antiguo
      const hasAdmin = remaining.some((m) => m.role === 'admin');
      if (!hasAdmin) {
        const db = require('../db/db');
        db.prepare(
          "UPDATE conversation_members SET role='admin' WHERE conversation_id = ? AND user_id = ?"
        ).run(id, remaining[0].id);
      }
      notifyMembers(req, id, 'group:members_updated', {
        conversationId: id,
        members: conversationService.getMembers(id),
      });
    }
    if (io) io.to(`user:${targetId}`).emit('group:removed', { conversationId: id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    if (!requireAdmin(req, res, id)) return;
    const members = conversationService.getMembers(id);
    conversationService.deleteGroup(id);
    const io = req.app.get('io');
    if (io) {
      for (const m of members) {
        io.in(`user:${m.id}`).socketsLeave(id);
        io.to(`user:${m.id}`).emit('group:deleted', { conversationId: id });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
