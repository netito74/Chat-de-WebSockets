import { api } from './api.js';
import { state, clearSession, persistSessionFields, setLastSeen, incrementUnread, clearUnread } from './state.js';
import { createSocket, getSocket, joinConversation, requestSync, ackDelivered } from './socket.js';
import { initAuthScreen } from './ui/auth.js';
import { renderConversationList, setConversationPresence, wireSidebarActions } from './ui/sidebar.js';
import {
  renderMessages,
  appendIncomingMessage,
  updateMessageStatus,
  wireMessageForm,
  showTyping,
  hideTyping,
  applyBackground,
} from './ui/chatWindow.js';
import { renderGroupInfo } from './ui/groupModal.js';
import { initSettingsModal } from './ui/backgroundModal.js';
import { toast } from './ui/toast.js';

let currentGradients = {};
let typingHideTimer = null;

// ---------------------------------------------------------------- modales
function openModal(id) {
  document.querySelectorAll('.modal').forEach((m) => (m.hidden = m.id !== id));
  document.getElementById('modal-overlay').classList.remove('is-hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('is-hidden');
}
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});
document.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', closeModal));

// ---------------------------------------------------------- pantalla auth
function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('is-hidden');
  document.getElementById('app-screen').classList.add('is-hidden');
}
function showAppScreen() {
  document.getElementById('auth-screen').classList.add('is-hidden');
  document.getElementById('app-screen').classList.remove('is-hidden');
}

// --------------------------------------------------------- estado conexion
function setConnectionState(connState) {
  const banner = document.getElementById('connection-banner');
  banner.dataset.state = connState;
  const text = document.getElementById('connection-text');
  text.textContent =
    connState === 'online' ? 'Conectado' : connState === 'reconnecting' ? 'Reconectando...' : 'Sin conexion';
}

// ------------------------------------------------------ seleccion de chat
async function selectConversation(conversationId) {
  state.activeConversationId = conversationId;
  clearUnread(conversationId); // notificaciones: abrir la conversacion quita su burbuja de no-leidos
  persistSessionFields();
  renderConversationList(selectConversation);

  const conv = state.conversations.get(conversationId);
  if (!conv) return;

  document.getElementById('chat-empty').classList.add('is-hidden');
  document.getElementById('chat-active').classList.remove('is-hidden');
  document.getElementById('app-screen').classList.add('is-chat-active'); // navegacion movil: muestra el chat, oculta la lista
  document.getElementById('chat-title').textContent = conv.name;
  document.getElementById('chat-subtitle').textContent =
    conv.type === 'public'
      ? 'Sala publica · todos los usuarios'
      : conv.type === 'group'
      ? `Grupo · ${conv.members.length} miembros`
      : conv.peer?.isOnline
      ? 'En linea'
      : conv.peer?.lastSeenAt
      ? `Ultima conexion ${new Date(conv.peer.lastSeenAt.replace(' ', 'T') + 'Z').toLocaleString()}`
      : 'Desconectado';
  document.getElementById('btn-group-info').classList.toggle('is-hidden', conv.type !== 'group');

  const socket = getSocket();
  if (socket?.connected) await joinConversation(conversationId);

  if (!state.messagesByConversation.has(conversationId)) {
    try {
      const { messages } = await api.history(conversationId);
      state.messagesByConversation.set(
        conversationId,
        messages.map((m) => ({ ...toClientMessage(m) }))
      );
      const lastId = messages.length ? messages[messages.length - 1].id : 0;
      if (lastId) setLastSeen(conversationId, lastId);
    } catch (err) {
      toast(err.message, { error: true });
    }
  }
  // Reinserta cualquier mensaje pendiente (compuesto sin conexion) al final.
  for (const item of state.outbox[conversationId] || []) {
    appendIncomingMessage(conversationId, {
      clientMsgId: item.clientMsgId,
      conversationId,
      senderId: state.user.id,
      senderUsername: state.user.username,
      content: item.content,
      sourceLang: state.user.preferredLang,
      translations: { [state.user.preferredLang]: item.content },
      status: 'pending',
      createdAt: item.composedAt,
    });
  }

  renderMessages(conversationId);
  applyBackground(conv.userBackground, currentGradients);
}

function toClientMessage(m) {
  return {
    id: m.id,
    clientMsgId: m.client_msg_id || m.clientMsgId,
    conversationId: m.conversation_id || m.conversationId,
    senderId: m.sender_id ?? m.senderId,
    senderUsername: m.senderUsername,
    content: m.content,
    sourceLang: m.source_lang || m.sourceLang,
    translations: m.translations || { [m.source_lang || m.sourceLang]: m.content },
    status: m.status,
    createdAt: m.created_at || m.createdAt,
  };
}

// ------------------------------------------------------------ carga inicial
async function loadConversations() {
  const { conversations } = await api.listConversations();
  state.conversations.clear();
  for (const c of conversations) state.conversations.set(c.id, c);
  renderConversationList(selectConversation);
}

// ------------------------------------------------------------------ socket
function wireSocketEvents() {
  const socket = getSocket();

  socket.on('connect', () => {
    setConnectionState('online');
    requestSync((conversationId, messages) => {
      for (const m of messages) appendIncomingMessage(conversationId, toClientMessage(m));
      if (conversationId === state.activeConversationId) renderMessages(conversationId);
    });
    loadConversations();
  });

  socket.io.on('reconnect_attempt', () => setConnectionState('reconnecting'));
  socket.on('disconnect', () => setConnectionState('offline'));
  socket.on('connect_error', (err) => {
    if (err.message?.startsWith('AUTH_')) {
      toast('Tu sesion expiro. Inicia sesion de nuevo.', { error: true });
      logout();
    }
  });

  socket.on('message:new', async (message) => {
    let conv = state.conversations.get(message.conversationId);
    if (!conv) {
      // Conversacion desconocida para este cliente: pasa normalmente cuando
      // OTRA persona inicia por primera vez un chat privado con nosotros
      // (el servidor crea la conversacion al vuelo, pero este cliente
      // todavia no tiene esa fila en `state.conversations`). Se refresca la
      // lista antes de continuar para que aparezca en el sidebar y la
      // notificacion tenga el nombre/tipo correcto.
      await loadConversations();
      conv = state.conversations.get(message.conversationId);
    }
    appendIncomingMessage(message.conversationId, message);
    if (conv) {
      conv.lastMessage = message.content;
      conv.lastMessageAt = message.createdAt;
    }
    if (message.conversationId !== state.activeConversationId) {
      // Notificaciones: si el mensaje no es propio y la conversacion no
      // esta abierta, se suma a la burbuja de no-leidos y se muestra un
      // emergente clicable que salta directo a esa conversacion.
      if (message.senderId !== state.user.id) {
        incrementUnread(message.conversationId);
        const isGroupOrPublic = conv?.type === 'group' || conv?.type === 'public';
        const title = isGroupOrPublic
          ? `${message.senderUsername} · ${conv.name}`
          : `Nuevo mensaje de ${message.senderUsername}`;
        const myLang = state.user.preferredLang;
        const preview = message.translations?.[myLang] ?? message.content;
        toast(preview, { title, onClick: () => selectConversation(message.conversationId) });
      }
      renderConversationList(selectConversation);
    }
    if (message.senderId !== state.user.id) ackDelivered(message.conversationId, message.id);
  });

  socket.on('message:status', ({ conversationId, messageId, status }) => {
    updateMessageStatus(conversationId, messageId, status);
  });

  socket.on('presence:update', ({ userId, isOnline, lastSeenAt }) => {
    setConversationPresence(userId, isOnline);
    if (state.activeConversationId) {
      const conv = state.conversations.get(state.activeConversationId);
      if (conv?.type === 'private' && conv.peer?.id === userId) {
        conv.peer.isOnline = isOnline;
        conv.peer.lastSeenAt = lastSeenAt;
        document.getElementById('chat-subtitle').textContent = isOnline ? 'En linea' : 'Desconectado';
      }
    }
    renderConversationList(selectConversation);
  });

  socket.on('typing', ({ conversationId, userId, isTyping }) => {
    if (conversationId !== state.activeConversationId || userId === state.user.id) return;
    const conv = state.conversations.get(conversationId);
    const member = conv?.members.find((m) => m.id === userId);
    clearTimeout(typingHideTimer);
    if (isTyping) {
      showTyping(member?.username || 'Alguien');
      typingHideTimer = setTimeout(hideTyping, 3000);
    } else {
      hideTyping();
    }
  });

  socket.on('group:created', async (group) => {
    state.conversations.set(group.id, group);
    renderConversationList(selectConversation);
    toast(`Te agregaron al grupo "${group.name}"`);
  });
  socket.on('group:renamed', async ({ conversationId, name }) => {
    const conv = state.conversations.get(conversationId);
    if (conv) conv.name = name;
    if (conversationId === state.activeConversationId) document.getElementById('chat-title').textContent = name;
    renderConversationList(selectConversation);
  });
  socket.on('group:members_updated', ({ conversationId, members }) => {
    const conv = state.conversations.get(conversationId);
    if (conv) conv.members = members;
    renderConversationList(selectConversation);
  });
  socket.on('group:added', async () => loadConversations());
  socket.on('group:removed', ({ conversationId }) => {
    if (state.activeConversationId === conversationId) showEmptyChat();
    state.conversations.delete(conversationId);
    renderConversationList(selectConversation);
    toast('Saliste de un grupo');
  });
  socket.on('group:deleted', ({ conversationId }) => {
    if (state.activeConversationId === conversationId) showEmptyChat();
    state.conversations.delete(conversationId);
    renderConversationList(selectConversation);
  });
}

function showEmptyChat() {
  state.activeConversationId = null;
  persistSessionFields();
  document.getElementById('chat-active').classList.add('is-hidden');
  document.getElementById('chat-empty').classList.remove('is-hidden');
  document.getElementById('app-screen').classList.remove('is-chat-active'); // navegacion movil: vuelve a la lista
}

/** Boton "<-" del encabezado del chat (solo visible en movil): vuelve a la lista sin perder la conversacion activa. */
function wireMobileNav() {
  document.getElementById('btn-mobile-back').addEventListener('click', () => {
    document.getElementById('app-screen').classList.remove('is-chat-active');
  });
}

/**
 * Menus flotantes genericos (nueva conversacion / cuenta). Cada par
 * trigger+menu vive dentro de un ".popover-wrap"; un solo listener
 * delegado se encarga de abrir/cerrar todos, cerrar al hacer clic afuera,
 * cerrar con Escape, y cerrar automaticamente al elegir una opcion.
 */
function wirePopovers() {
  const triggers = [
    { trigger: document.getElementById('btn-new-chat'), menu: document.getElementById('new-chat-menu') },
    { trigger: document.getElementById('btn-account-menu'), menu: document.getElementById('account-menu') },
  ];

  function closeAll() {
    for (const { trigger, menu } of triggers) {
      menu.classList.add('is-hidden');
      trigger.setAttribute('aria-expanded', 'false');
    }
  }

  for (const { trigger, menu } of triggers) {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.classList.contains('is-hidden');
      closeAll();
      if (willOpen) {
        menu.classList.remove('is-hidden');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('.popover-item')) {
      closeAll();
      return;
    }
    if (!e.target.closest('.popover-wrap')) closeAll();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });
}

/** Filtra la lista de conversaciones visibles segun el texto del buscador. */
function wireConversationSearch() {
  const input = document.getElementById('conversation-search');
  input.addEventListener('input', () => {
    renderConversationList(selectConversation);
  });
}

// --------------------------------------------------------------- arranque
async function startApp() {
  showAppScreen();
  document.getElementById('me-username').textContent = state.user.username;
  document.getElementById('me-lang').textContent = state.user.preferredLang === 'es' ? 'Espanol' : 'English';
  const meAvatar = document.getElementById('me-avatar');
  meAvatar.style.background = state.user.avatarColor;
  meAvatar.textContent = state.user.username.slice(0, 2).toUpperCase();

  await loadConversations();
  createSocket();
  wireSocketEvents();
  wireMessageForm();
  wireMobileNav();
  wirePopovers();
  wireConversationSearch();

  wireSidebarActions({
    openModal,
    closeModal,
    onStartPrivate: async (peerUser) => {
      // La conversacion privada se crea de forma perezosa en el primer
      // mensaje; mientras tanto se navega a un id deterministico para que
      // ambos clientes coincidan en la misma sala.
      const [a, b] = [state.user.id, peerUser.id].sort((x, y) => x - y);
      const id = `priv_${a}_${b}`;
      if (!state.conversations.has(id)) {
        state.conversations.set(id, {
          id,
          type: 'private',
          name: peerUser.username,
          peer: peerUser,
          members: [state.user, peerUser],
          lastMessage: null,
          lastMessageAt: null,
        });
      }
      await selectConversation(id);
    },
    onGroupCreated: async (group) => {
      await loadConversations();
      await selectConversation(group.id);
    },
  });

  function showGroupInfo(conversationId) {
    const conv = state.conversations.get(conversationId);
    if (!conv) return;
    renderGroupInfo(conv, {
      onChanged: async () => {
        await loadConversations();
        showGroupInfo(conversationId);
      },
      onLeftOrDeleted: () => {
        closeModal();
        showEmptyChat();
        loadConversations();
      },
    });
  }

  document.getElementById('btn-group-info').addEventListener('click', () => {
    if (!state.activeConversationId) return;
    openModal('modal-group-info');
    showGroupInfo(state.activeConversationId);
  });

  document.getElementById('btn-settings').addEventListener('click', async () => {
    openModal('modal-settings');
    try {
      currentGradients = await initSettingsModal({
        onBackgroundChanged: (bg, gradients) => {
          const conv = state.conversations.get(state.activeConversationId);
          if (conv) conv.userBackground = bg;
          applyBackground(bg, gradients);
          toast('Fondo actualizado');
        },
      });
    } catch (err) {
      toast(err.message, { error: true });
    }
  });

  document.getElementById('btn-logout').addEventListener('click', logout);

  // Aplica el fondo del usuario globalmente desde el inicio.
  try {
    const { background } = await api.getBackground();
    const { gradients } = await api.getGradients();
    currentGradients = gradients;
    for (const conv of state.conversations.values()) conv.userBackground = background;
    if (state.activeConversationId) applyBackground(background, gradients);
  } catch {
    /* no critico */
  }

  if (state.activeConversationId && state.conversations.has(state.activeConversationId)) {
    selectConversation(state.activeConversationId);
  } else if (state.conversations.has('public')) {
    selectConversation('public');
  }
}

function logout() {
  const socket = getSocket();
  if (socket) socket.disconnect();
  clearSession();
  showAuthScreen();
}

// ------------------------------------------------------------------ inicio
async function boot() {
  initAuthScreen({ onAuthenticated: startApp });

  if (state.token && state.user) {
    try {
      const { user } = await api.me();
      state.user = user;
      persistSessionFields();
      await startApp();
      return;
    } catch {
      clearSession();
    }
  }
  showAuthScreen();
}

boot();
