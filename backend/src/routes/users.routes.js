'use strict';
const express = require('express');
const userService = require('../services/userService');
const conversationService = require('../services/conversationService');
const messageService = require('../services/messageService');
const { buildTranslations, serialize } = require('../sockets/handlers/chat');
const { requireAuth } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(requireAuth, apiLimiter);

router.get('/', (req, res) => {
  const users = userService
    .listAll()
    .filter((u) => u.id !== req.user.id)
    .map((u) => userService.toPublic(u));
  res.json({ users });
});

router.get('/conversations', (req, res) => {
  res.json({ conversations: conversationService.listForUser(req.user.id) });
});

router.get('/conversations/:id/history', async (req, res) => {
  const { id } = req.params;
  if (!conversationService.isMember(id, req.user.id)) {
    return res.status(403).json({ error: 'No perteneces a esta conversacion' });
  }
  const before = req.query.before ? Number(req.query.before) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const rows = messageService.history(id, { before, limit });

  // Misma logica de traduccion que en tiempo real (sockets/handlers/chat.js)
  // para que el historial cargado por REST se vea igual que los mensajes
  // que llegan en vivo, sin importar por que canal entro cada uno.
  const senderCache = new Map();
  const messages = await Promise.all(
    rows.map(async (m) => {
      if (!senderCache.has(m.sender_id)) senderCache.set(m.sender_id, userService.findById(m.sender_id));
      const sender = senderCache.get(m.sender_id);
      const translations = await buildTranslations(m);
      return serialize(m, sender, translations);
    })
  );
  res.json({ messages });
});

module.exports = router;
