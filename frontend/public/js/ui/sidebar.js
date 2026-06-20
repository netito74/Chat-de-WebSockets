import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from './toast.js';

function initials(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}

function avatarEl(label, color, { presence = false, online = false } = {}) {
  const span = document.createElement('span');
  span.className = `avatar${presence ? ' with-presence' : ''}${online ? ' online' : ''}`;
  span.style.background = color || '#786F61';
  span.textContent = initials(label);
  return span;
}

function timePreview(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function renderConversationList(onSelect) {
  const container = document.getElementById('conversation-list');
  container.innerHTML = '';
  const items = [...state.conversations.values()].sort((a, b) => {
    if (a.type === 'public') return -1;
    if (b.type === 'public') return 1;
    return (b.lastMessageAt || '').localeCompare(a.lastMessageAt || '');
  });

  for (const conv of items) {
    const btn = document.createElement('button');
    btn.className = `conv-item${conv.id === state.activeConversationId ? ' is-active' : ''}`;
    btn.dataset.conversationId = conv.id;

    const color = conv.type === 'private' ? conv.peer?.avatarColor : '#1F6F6B';
    const online = conv.type === 'private' ? !!conv.peer?.isOnline : false;
    btn.appendChild(avatarEl(conv.name, color, { presence: conv.type === 'private', online }));

    const meta = document.createElement('span');
    meta.className = 'conv-meta';
    const nameEl = document.createElement('span');
    nameEl.className = 'conv-name';
    nameEl.textContent = conv.name;
    const preview = document.createElement('span');
    preview.className = 'conv-preview';
    preview.textContent = conv.lastMessage ? conv.lastMessage : 'Sin mensajes todavia';
    meta.appendChild(nameEl);
    meta.appendChild(preview);
    btn.appendChild(meta);

    if (conv.type === 'group') {
      const badge = document.createElement('span');
      badge.className = 'conv-badge';
      badge.textContent = `${conv.members.length}`;
      btn.appendChild(badge);
    }

    btn.addEventListener('click', () => onSelect(conv.id));
    container.appendChild(btn);
  }
}

export function setConversationPresence(userId, isOnline) {
  for (const conv of state.conversations.values()) {
    if (conv.type === 'private' && conv.peer?.id === userId) {
      conv.peer.isOnline = isOnline;
    }
    const member = conv.members?.find((m) => m.id === userId);
    if (member) member.is_online = isOnline ? 1 : 0;
  }
}

async function renderUserPickList(container, { multi = false } = {}) {
  container.innerHTML = '';
  const { users } = await api.listUsers();
  if (users.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No hay otros usuarios registrados todavia.';
    container.appendChild(li);
    return users;
  }
  for (const u of users) {
    const li = document.createElement('li');
    li.className = 'user-pick-item';
    li.dataset.username = u.username;
    li.appendChild(avatarEl(u.username, u.avatarColor, { presence: true, online: u.isOnline }));
    const label = document.createElement('span');
    label.textContent = u.username;
    li.appendChild(label);
    if (multi) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = u.username;
      li.appendChild(cb);
      li.addEventListener('click', (e) => {
        if (e.target !== cb) cb.checked = !cb.checked;
      });
    }
    container.appendChild(li);
  }
  return users;
}

export function wireSidebarActions({ openModal, closeModal, onStartPrivate, onGroupCreated }) {
  document.getElementById('btn-new-private').addEventListener('click', async () => {
    openModal('modal-new-private');
    const list = document.getElementById('private-user-list');
    try {
      const users = await renderUserPickList(list, { multi: false });
      list.querySelectorAll('.user-pick-item').forEach((li, i) => {
        li.addEventListener('click', () => {
          closeModal();
          onStartPrivate(users[i]);
        });
      });
    } catch (err) {
      toast(err.message, { error: true });
    }
  });

  document.getElementById('btn-new-group').addEventListener('click', async () => {
    openModal('modal-new-group');
    document.getElementById('group-name-input').value = '';
    document.getElementById('group-create-error').textContent = '';
    try {
      await renderUserPickList(document.getElementById('group-user-list'), { multi: true });
    } catch (err) {
      toast(err.message, { error: true });
    }
  });

  document.getElementById('btn-create-group').addEventListener('click', async () => {
    const name = document.getElementById('group-name-input').value.trim();
    const errorEl = document.getElementById('group-create-error');
    errorEl.textContent = '';
    if (name.length < 2) {
      errorEl.textContent = 'Escribe un nombre de al menos 2 caracteres';
      return;
    }
    const checked = [...document.querySelectorAll('#group-user-list input[type=checkbox]:checked')].map(
      (cb) => cb.value
    );
    try {
      const { group } = await api.createGroup({ name, memberUsernames: checked });
      closeModal();
      onGroupCreated(group);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}
