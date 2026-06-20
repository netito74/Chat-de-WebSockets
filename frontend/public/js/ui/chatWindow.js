import { state, getMessages, upsertMessage, setLastSeen, queueOutbox } from '../state.js';
import { sendMessage, ackDelivered, ackRead, sendTyping, getSocket } from '../socket.js';
import { toast } from './toast.js';

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function statusIcon(status) {
  if (status === 'read') return '✓✓';
  if (status === 'delivered') return '✓✓';
  if (status === 'pending') return '🕓';
  return '✓';
}

function formatTime(iso) {
  if (!iso) return '';
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  return new Date(normalized).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderBubble(message) {
  const mine = message.senderId === state.user.id;
  const row = document.createElement('div');
  row.className = `msg-row ${mine ? 'mine' : 'theirs'}`;
  row.dataset.messageId = message.id || '';
  row.dataset.clientMsgId = message.clientMsgId || '';

  if (!mine) {
    const sender = document.createElement('span');
    sender.className = 'msg-sender';
    sender.textContent = message.senderUsername || 'Usuario';
    row.appendChild(sender);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  // Texto plano siempre via textContent: nunca se interpreta como HTML,
  // segunda capa de defensa contra XSS ademas del saneamiento del backend.
  const myLang = state.user.preferredLang;
  const shown = message.translations?.[myLang] ?? message.content;
  bubble.textContent = shown;
  row.appendChild(bubble);

  if (message.translations && shown !== message.content && message.sourceLang !== myLang) {
    const original = document.createElement('div');
    original.className = 'msg-translation';
    original.textContent = `Original (${message.sourceLang}): ${message.content}`;
    row.appendChild(original);
  }

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const time = document.createElement('span');
  time.textContent = message.status === 'pending' ? 'enviando...' : formatTime(message.createdAt);
  meta.appendChild(time);
  if (mine) {
    const tick = document.createElement('span');
    tick.className = 'status-icon';
    tick.textContent = statusIcon(message.status);
    meta.appendChild(tick);
  }
  row.appendChild(meta);
  return row;
}

function renderOrUpdateBubble(container, message) {
  const existing =
    (message.id && container.querySelector(`.msg-row[data-message-id="${message.id}"]`)) ||
    (message.clientMsgId && container.querySelector(`.msg-row[data-client-msg-id="${message.clientMsgId}"]`));
  const fresh = renderBubble(message);
  if (existing) existing.replaceWith(fresh);
  else container.appendChild(fresh);
  return fresh;
}

export function renderMessages(conversationId) {
  const container = document.getElementById('messages');
  container.innerHTML = '';
  const messages = getMessages(conversationId);
  for (const m of messages) container.appendChild(renderBubble(m));
  container.scrollTop = container.scrollHeight;

  // Confirma entrega/lectura de los mensajes de otros que se acaban de ver.
  for (const m of messages) {
    if (m.senderId !== state.user.id && m.id) {
      if (m.status !== 'read') ackRead(conversationId, m.id);
    }
  }
}

export function appendIncomingMessage(conversationId, message) {
  upsertMessage(conversationId, message);
  if (message.id) setLastSeen(conversationId, message.id);
  if (conversationId === state.activeConversationId) {
    const container = document.getElementById('messages');
    renderOrUpdateBubble(container, message);
    container.scrollTop = container.scrollHeight;
    if (message.senderId !== state.user.id && message.id) ackRead(conversationId, message.id);
  }
  return message;
}

export function updateMessageStatus(conversationId, messageId, status) {
  const messages = getMessages(conversationId);
  const msg = messages.find((m) => m.id === messageId);
  if (msg) msg.status = status;
  if (conversationId === state.activeConversationId) {
    const row = document.querySelector(`.msg-row[data-message-id="${messageId}"] .status-icon`);
    if (row) row.textContent = statusIcon(status);
  }
}

let typingTimeout = null;

export function wireMessageForm() {
  const form = document.getElementById('message-form');
  const input = document.getElementById('message-input');

  input.addEventListener('input', () => {
    if (!state.activeConversationId) return;
    sendTyping(state.activeConversationId, true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => sendTyping(state.activeConversationId, false), 1200);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    const conversationId = state.activeConversationId;
    if (!text || !conversationId) return;
    input.value = '';

    const clientMsgId = uuid();
    const optimistic = {
      clientMsgId,
      conversationId,
      senderId: state.user.id,
      senderUsername: state.user.username,
      content: text,
      sourceLang: state.user.preferredLang,
      translations: { [state.user.preferredLang]: text },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    upsertMessage(conversationId, optimistic);
    if (conversationId === state.activeConversationId) {
      const container = document.getElementById('messages');
      renderOrUpdateBubble(container, optimistic);
      container.scrollTop = container.scrollHeight;
    }

    const socket = getSocket();
    if (!socket || !socket.connected) {
      // Sin conexion: se preserva el mensaje en la bandeja de salida local y
      // se reenviara automaticamente al reconectar (ver socket.js,
      // requestSync -> flushOutbox). La hora mostrada localmente es solo
      // informativa; la hora autoritativa sera la que asigne el servidor al
      // recibir el mensaje (ver docs/architecture.md, "Persistencia de
      // mensajes durante desconexiones").
      queueOutbox(conversationId, { clientMsgId, content: text, composedAt: optimistic.createdAt });
      toast('Sin conexion: el mensaje se enviara automaticamente al reconectar.');
      return;
    }

    const resp = await sendMessage(conversationId, text, clientMsgId);
    if (!resp?.ok) {
      toast(resp?.error || 'No se pudo enviar el mensaje', { error: true });
    }
  });
}

export function showTyping(username) {
  const el = document.getElementById('typing-indicator');
  el.textContent = `${username} esta escribiendo...`;
  el.classList.remove('is-hidden');
}
export function hideTyping() {
  document.getElementById('typing-indicator').classList.add('is-hidden');
}

export function applyBackground(bg, gradients) {
  const container = document.getElementById('messages');
  if (!bg) {
    container.style.backgroundImage = '';
    return;
  }
  if (bg.type === 'gradient') {
    container.style.backgroundImage = gradients?.[bg.value] || '';
  } else {
    container.style.backgroundImage = `url("${bg.value}")`;
  }
}
