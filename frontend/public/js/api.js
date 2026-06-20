import { state } from './state.js';

const BASE = '/api';

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const message = data?.error || `Error ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),

  listUsers: () => request('/users'),
  listConversations: () => request('/users/conversations'),
  history: (conversationId, before) =>
    request(`/users/conversations/${encodeURIComponent(conversationId)}/history${before ? `?before=${before}` : ''}`),

  createGroup: (payload) => request('/groups', { method: 'POST', body: payload }),
  renameGroup: (id, name) => request(`/groups/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } }),
  addGroupMembers: (id, usernames) =>
    request(`/groups/${encodeURIComponent(id)}/members`, { method: 'POST', body: { usernames } }),
  removeGroupMember: (id, userId) =>
    request(`/groups/${encodeURIComponent(id)}/members/${userId}`, { method: 'DELETE' }),
  deleteGroup: (id) => request(`/groups/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getGradients: () => request('/backgrounds/gradients'),
  getBackground: () => request('/backgrounds'),
  setBackground: (payload) => request('/backgrounds', { method: 'PUT', body: payload }),
  uploadBackground: (file) => {
    const form = new FormData();
    form.append('image', file);
    return request('/uploads/background', { method: 'POST', body: form, isForm: true });
  },
};
