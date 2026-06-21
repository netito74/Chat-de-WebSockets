import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from './toast.js';

function avatarColor(seed) {
  return seed || '#6B7585';
}

export function renderGroupInfo(conv, { onChanged, onLeftOrDeleted }) {
  document.getElementById('group-rename-input').value = conv.name;
  document.getElementById('group-info-error').textContent = '';
  const myRole = conv.members.find((m) => m.id === state.user.id)?.role;
  const isAdmin = myRole === 'admin';

  const renameField = document.getElementById('rename-field');
  renameField.classList.toggle('is-hidden', !isAdmin);

  const list = document.getElementById('group-member-list');
  list.innerHTML = '';
  for (const m of conv.members) {
    const li = document.createElement('li');
    li.className = 'member-item';
    const dot = document.createElement('span');
    dot.className = 'avatar';
    dot.style.width = '24px';
    dot.style.height = '24px';
    dot.style.fontSize = '0.65rem';
    dot.style.background = avatarColor(m.avatar_color);
    dot.textContent = m.username.slice(0, 2).toUpperCase();
    li.appendChild(dot);
    const name = document.createElement('span');
    name.textContent = m.username;
    li.appendChild(name);
    if (m.role === 'admin') {
      const badge = document.createElement('span');
      badge.className = 'role-badge';
      badge.textContent = 'admin';
      li.appendChild(badge);
    }
    if (isAdmin && m.id !== state.user.id) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove';
      removeBtn.textContent = 'Quitar';
      removeBtn.addEventListener('click', async () => {
        try {
          await api.removeGroupMember(conv.id, m.id);
          onChanged();
        } catch (err) {
          toast(err.message, { error: true });
        }
      });
      li.appendChild(removeBtn);
    }
    list.appendChild(li);
  }

  document.getElementById('btn-delete-group').classList.toggle('is-hidden', !isAdmin);

  document.getElementById('btn-group-rename').onclick = async () => {
    const name = document.getElementById('group-rename-input').value.trim();
    const errorEl = document.getElementById('group-info-error');
    if (name.length < 2) {
      errorEl.textContent = 'El nombre debe tener al menos 2 caracteres';
      return;
    }
    try {
      await api.renameGroup(conv.id, name);
      onChanged();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  };

  document.getElementById('btn-add-member').onclick = async () => {
    const input = document.getElementById('add-member-input');
    const username = input.value.trim();
    if (!username) return;
    try {
      await api.addGroupMembers(conv.id, [username]);
      input.value = '';
      onChanged();
    } catch (err) {
      document.getElementById('group-info-error').textContent = err.message;
    }
  };

  document.getElementById('btn-leave-group').onclick = async () => {
    try {
      await api.removeGroupMember(conv.id, state.user.id);
      onLeftOrDeleted();
    } catch (err) {
      toast(err.message, { error: true });
    }
  };

  document.getElementById('btn-delete-group').onclick = async () => {
    if (!confirm(`¿Eliminar el grupo "${conv.name}" para todos los miembros?`)) return;
    try {
      await api.deleteGroup(conv.id);
      onLeftOrDeleted();
    } catch (err) {
      toast(err.message, { error: true });
    }
  };
}
