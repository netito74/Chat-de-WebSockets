import { state, setLastSeen, clearOutboxItem } from './state.js';

let socket = null;

export function getSocket() {
  return socket;
}

export function createSocket() {
  // `io` es global, cargado por /socket.io/socket.io.js en index.html.
  socket = io({
    auth: { token: state.token },
    // Reconexion con backoff exponencial acotado: Socket.IO reintenta
    // indefinidamente por defecto, lo cual cubre tanto cortes breves de
    // wifi como caidas largas del servidor (ver docs/architecture.md,
    // seccion "Reconexion y sincronizacion").
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 8000,
  });
  return socket;
}

export function joinConversation(conversationId) {
  return new Promise((resolve) => {
    socket.emit('conversation:join', { conversationId }, (resp) => resolve(resp));
  });
}

export function sendMessage(conversationId, content, clientMsgId) {
  return new Promise((resolve) => {
    socket.emit('message:send', { conversationId, content, clientMsgId }, (resp) => resolve(resp));
  });
}

export function ackDelivered(conversationId, messageId) {
  socket.emit('message:ack', { conversationId, messageId });
}

export function ackRead(conversationId, messageId) {
  socket.emit('message:read', { conversationId, messageId });
}

export function sendTyping(conversationId, isTyping) {
  socket.emit('typing', { conversationId, isTyping });
}

/**
 * Se ejecuta cada vez que el socket (re)conecta. Envia, por cada
 * conversacion que el cliente ya cargo en esta sesion (lastSeenMessageId >
 * 0), el cursor del ultimo mensaje visto; el servidor responde solo con los
 * mensajes posteriores ("delta"). Tras aplicar el delta, se reintenta el
 * envio de cualquier mensaje que haya quedado en la bandeja de salida local
 * (outbox) por haberse compuesto sin conexion.
 */
export function requestSync(onMessages) {
  const cursors = Object.entries(state.lastSeenMessageId)
    .filter(([, lastId]) => lastId > 0)
    .map(([conversationId, lastMessageId]) => ({ conversationId, lastMessageId }));

  if (cursors.length === 0) return flushOutbox();

  socket.emit('sync:request', { conversations: cursors }, (resp) => {
    if (resp?.ok) {
      for (const { conversationId, messages } of resp.conversations) {
        if (messages.length) {
          onMessages(conversationId, messages);
          setLastSeen(conversationId, messages[messages.length - 1].id);
        }
      }
    }
    flushOutbox();
  });
}

async function flushOutbox() {
  for (const [conversationId, items] of Object.entries(state.outbox)) {
    for (const item of [...items]) {
      const resp = await sendMessage(conversationId, item.content, item.clientMsgId);
      if (resp?.ok) clearOutboxItem(conversationId, item.clientMsgId);
    }
  }
}
