'use strict';
const conversationService = require('../../services/conversationService');
const messageService = require('../../services/messageService');
const userService = require('../../services/userService');
const { buildTranslations, serialize } = require('./chat');

/**
 * Tras una reconexion, el cliente envia, para cada conversacion que tenia
 * abierta, el id del ultimo mensaje que SI alcanzo a ver. El servidor
 * devuelve unicamente los mensajes posteriores a ese id (delta), evitando
 * re-transmitir todo el historial. Esto cubre tanto cortes de red breves
 * como cierres de la pestana/app por tiempo prolongado.
 */
function registerSyncHandlers(io, socket) {
  const userId = socket.user.id;

  socket.on('sync:request', async (data, cb) => {
    try {
      const cursors = Array.isArray(data?.conversations) ? data.conversations : [];
      const sender = userService.findById(userId);
      const results = [];
      for (const { conversationId, lastMessageId } of cursors) {
        if (!conversationService.isMember(conversationId, userId)) continue;
        socket.join(conversationId);
        const missed = messageService.since(conversationId, lastMessageId || 0);
        const serialized = [];
        for (const m of missed) {
          const senderUser = m.sender_id === userId ? sender : userService.findById(m.sender_id);
          const translations = await buildTranslations(m);
          serialized.push(serialize(m, senderUser, translations));
        }
        results.push({ conversationId, messages: serialized });
      }
      cb?.({ ok: true, conversations: results });
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });
}

module.exports = { registerSyncHandlers };
