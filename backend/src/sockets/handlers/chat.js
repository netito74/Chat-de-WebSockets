'use strict';
const conversationService = require('../../services/conversationService');
const messageService = require('../../services/messageService');
const userService = require('../../services/userService');
const translationService = require('../../services/translationService');

/** Calcula el conjunto de idiomas a los que hay que traducir un mensaje segun los miembros de la conversacion. */
function targetLanguagesFor(conversationId) {
  const members = conversationService.getMembers(conversationId);
  return [...new Set(members.map((m) => m.preferred_lang))];
}

async function buildTranslations(message) {
  const langs = targetLanguagesFor(message.conversation_id);
  const translations = {};
  await Promise.all(
    langs.map(async (lang) => {
      translations[lang] =
        lang === message.source_lang
          ? message.content
          : await translationService.translateMessage({
              messageId: message.id,
              text: message.content,
              sourceLang: message.source_lang,
              targetLang: lang,
            });
    })
  );
  return translations;
}

function serialize(message, sender, translations) {
  return {
    id: message.id,
    clientMsgId: message.client_msg_id,
    conversationId: message.conversation_id,
    senderId: message.sender_id,
    senderUsername: sender?.username,
    senderColor: sender?.avatar_color,
    content: message.content,
    sourceLang: message.source_lang,
    translations,
    status: message.status,
    createdAt: message.created_at,
  };
}

/**
 * Garantiza que los sockets activos de todos los miembros de una
 * conversacion (en cualquier instancia del cluster) esten unidos a esa
 * sala, usando el metodo `socketsJoin` del adaptador (funciona entre
 * procesos gracias al adaptador de Redis, ver sockets/index.js). Es
 * necesario porque una conversacion privada puede crearse en el instante
 * mismo del primer mensaje: sin esto, el destinatario no recibiria el
 * evento en tiempo real hasta abrir manualmente esa conversacion.
 */
async function ensureMembersJoined(io, conversationId) {
  const members = conversationService.getMembers(conversationId);
  // `socketsJoin` del adaptador de Redis es asincrono (implica una
  // ida y vuelta por Redis para que el socket remoto se una a la sala);
  // sin esperar esta promesa, el siguiente `io.to(conversationId).emit(...)`
  // puede ejecutarse ANTES de que el destinatario quede realmente unido a
  // la sala, perdiendo el primer mensaje (condicion de carrera).
  await Promise.all(members.map((m) => io.in(`user:${m.id}`).socketsJoin(conversationId)));
}

/** Mismo patron de entrega por canal personal que `message:new`, para las confirmaciones de entrega/lectura. */
function broadcastStatus(io, conversationId, messageId, status) {
  const members = conversationService.getMembers(conversationId);
  for (const member of members) {
    io.to(`user:${member.id}`).emit('message:status', { conversationId, messageId, status });
  }
}

function registerChatHandlers(io, socket) {
  const userId = socket.user.id;

  socket.on('conversation:join', (data, cb) => {
    try {
      const conversationId = data?.conversationId;
      if (!conversationService.ensureAccess(conversationId, userId)) {
        return cb?.({ ok: false, error: 'No perteneces a esta conversacion' });
      }
      socket.join(conversationId);
      cb?.({ ok: true });
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('message:send', async (data, cb) => {
    try {
      const { conversationId, content, clientMsgId } = data || {};
      if (!conversationService.ensureAccess(conversationId, userId)) {
        return cb?.({ ok: false, error: 'No perteneces a esta conversacion' });
      }
      socket.join(conversationId);
      await ensureMembersJoined(io, conversationId);
      const sender = userService.findById(userId);
      const message = messageService.create({
        clientMsgId,
        conversationId,
        senderId: userId,
        content,
        sourceLang: sender.preferred_lang,
      });
      const translations = await buildTranslations(message);
      const payload = serialize(message, sender, translations);

      // Entrega por canal personal (`user:<id>`) en vez de por la sala de la
      // conversacion: cada socket se une a su propio canal `user:<id>` de
      // forma SINCRONA en el momento de conectarse (ver handlers/presence.js,
      // handleConnect), asi que esta entrega nunca depende de que un join
      // dinamico a la sala de la conversacion (ensureMembersJoined, que es
      // asincrono con el adaptador de Redis) haya terminado a tiempo. Esto
      // cubre tanto multiples pestañas/dispositivos del mismo usuario como
      // instancias remotas del cluster (el adaptador de Redis tambien
      // propaga `io.to('user:id')` entre procesos).
      const members = conversationService.getMembers(conversationId);
      for (const member of members) {
        io.to(`user:${member.id}`).emit('message:new', payload);
      }
      cb?.({ ok: true, message: payload });
    } catch (err) {
      cb?.({ ok: false, error: err.message });
    }
  });

  // Confirmacion de entrega: el cliente receptor confirma que renderizo el mensaje.
  socket.on('message:ack', (data) => {
    const { conversationId, messageId } = data || {};
    if (!conversationId || !messageId) return;
    if (!conversationService.isMember(conversationId, userId)) return;
    const updated = messageService.markStatus(messageId, 'delivered');
    broadcastStatus(io, conversationId, messageId, updated.status);
  });

  socket.on('message:read', (data) => {
    const { conversationId, messageId } = data || {};
    if (!conversationId || !messageId) return;
    if (!conversationService.isMember(conversationId, userId)) return;
    const updated = messageService.markStatus(messageId, 'read');
    broadcastStatus(io, conversationId, messageId, updated.status);
  });

  socket.on('typing', (data) => {
    const { conversationId, isTyping } = data || {};
    if (!conversationId || !conversationService.isMember(conversationId, userId)) return;
    socket.to(conversationId).emit('typing', { conversationId, userId, isTyping: !!isTyping });
  });
}

module.exports = { registerChatHandlers, buildTranslations, serialize, ensureMembersJoined };
