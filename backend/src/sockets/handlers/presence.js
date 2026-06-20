'use strict';
const presenceService = require('../../services/presenceService');
const conversationService = require('../../services/conversationService');
const userService = require('../../services/userService');

async function handleConnect(io, socket) {
  const userId = socket.user.id;

  // Canal personal: usado para notificaciones dirigidas (invitacion a grupo,
  // expulsion, etc.) sin depender de a que sala este unido el socket.
  socket.join(`user:${userId}`);

  conversationService.ensurePublicMembership(userId);
  const conversations = conversationService.listForUser(userId);
  for (const conv of conversations) socket.join(conv.id);

  const becameOnline = await presenceService.connect(userId);
  if (becameOnline) {
    io.emit('presence:update', { userId, isOnline: true, lastSeenAt: null });
  }
}

async function handleDisconnect(io, socket) {
  const userId = socket.user?.id;
  if (!userId) return;
  const becameOffline = await presenceService.disconnect(userId);
  if (becameOffline) {
    const user = userService.findById(userId);
    io.emit('presence:update', {
      userId,
      isOnline: false,
      lastSeenAt: user?.last_seen_at || new Date().toISOString(),
    });
  }
}

module.exports = { handleConnect, handleDisconnect };
