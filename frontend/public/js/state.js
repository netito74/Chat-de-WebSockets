// Estado de la aplicacion en el cliente. Persiste en localStorage lo
// necesario para recuperar la sesion tras recargar la pagina o reconectar:
// token, usuario, ultima conversacion activa y, por conversacion, el id del
// ultimo mensaje visto (usado para pedir solo los mensajes "delta" al
// reconectar) y una cola de mensajes salientes pendientes (outbox) para que
// nada se pierda si el usuario escribe mientras esta sin conexion.

const STORAGE_KEY = 'agora.session.v1';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePersisted(partial) {
  const current = loadPersisted();
  const next = { ...current, ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

const persisted = loadPersisted();

export const state = {
  token: persisted.token || null,
  user: persisted.user || null,
  activeConversationId: persisted.activeConversationId || null,
  lastSeenMessageId: persisted.lastSeenMessageId || {}, // { [conversationId]: number }
  outbox: persisted.outbox || {}, // { [conversationId]: [{clientMsgId, content, composedAt}] }

  conversations: new Map(), // id -> conversation meta
  messagesByConversation: new Map(), // id -> array of message objects (ordenados asc por id)
  usersById: new Map(),
};

export function persistSessionFields() {
  savePersisted({
    token: state.token,
    user: state.user,
    activeConversationId: state.activeConversationId,
    lastSeenMessageId: state.lastSeenMessageId,
    outbox: state.outbox,
  });
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  state.token = null;
  state.user = null;
  state.activeConversationId = null;
  state.lastSeenMessageId = {};
  state.outbox = {};
  state.conversations.clear();
  state.messagesByConversation.clear();
  state.usersById.clear();
}

export function setLastSeen(conversationId, messageId) {
  const current = state.lastSeenMessageId[conversationId] || 0;
  if (messageId > current) {
    state.lastSeenMessageId[conversationId] = messageId;
    persistSessionFields();
  }
}

export function queueOutbox(conversationId, item) {
  if (!state.outbox[conversationId]) state.outbox[conversationId] = [];
  state.outbox[conversationId].push(item);
  persistSessionFields();
}

export function clearOutboxItem(conversationId, clientMsgId) {
  const list = state.outbox[conversationId];
  if (!list) return;
  state.outbox[conversationId] = list.filter((m) => m.clientMsgId !== clientMsgId);
  persistSessionFields();
}

export function getMessages(conversationId) {
  return state.messagesByConversation.get(conversationId) || [];
}

export function upsertMessage(conversationId, message) {
  const list = state.messagesByConversation.get(conversationId) || [];
  const idx = list.findIndex((m) => m.id === message.id || (m.clientMsgId && m.clientMsgId === message.clientMsgId));
  if (idx >= 0) list[idx] = { ...list[idx], ...message };
  else list.push(message);
  list.sort((a, b) => (a.id || 0) - (b.id || 0) || a.createdAt.localeCompare(b.createdAt));
  state.messagesByConversation.set(conversationId, list);
}
