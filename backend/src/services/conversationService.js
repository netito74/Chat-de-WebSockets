'use strict';
const { randomUUID } = require('crypto');
const db = require('../db/db');
const userService = require('./userService');

function privateConversationId(userIdA, userIdB) {
  const [a, b] = [userIdA, userIdB].sort((x, y) => x - y);
  return `priv_${a}_${b}`;
}

function getConversation(id) {
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

function getMembers(conversationId) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.avatar_color, u.is_online, u.preferred_lang, cm.role
       FROM conversation_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = ? ORDER BY u.username`
    )
    .all(conversationId);
}

function isMember(conversationId, userId) {
  return !!db
    .prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId);
}

function addMember(conversationId, userId, role = 'member') {
  db.prepare(
    'INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)'
  ).run(conversationId, userId, role);
}

function removeMember(conversationId, userId) {
  db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(
    conversationId,
    userId
  );
}

function ensurePublicMembership(userId) {
  addMember('public', userId, 'member');
}

/** Crea (si no existe) y devuelve la conversacion privada entre dos usuarios. */
function getOrCreatePrivate(userIdA, userIdB) {
  const id = privateConversationId(userIdA, userIdB);
  let conv = getConversation(id);
  if (!conv) {
    db.prepare('INSERT INTO conversations (id, type) VALUES (?, ?)').run(id, 'private');
    addMember(id, userIdA);
    addMember(id, userIdB);
    conv = getConversation(id);
  }
  return conv;
}

function createGroup({ name, creatorId, memberIds }) {
  const id = `grp_${randomUUID()}`;
  db.prepare('INSERT INTO conversations (id, type, name, created_by) VALUES (?, ?, ?, ?)').run(
    id,
    'group',
    name,
    creatorId
  );
  addMember(id, creatorId, 'admin');
  for (const uid of memberIds) {
    if (uid !== creatorId) addMember(id, uid, 'member');
  }
  return getConversation(id);
}

function renameGroup(conversationId, name) {
  db.prepare('UPDATE conversations SET name = ? WHERE id = ? AND type = \'group\'').run(
    name,
    conversationId
  );
}

function deleteGroup(conversationId) {
  db.prepare('DELETE FROM conversations WHERE id = ? AND type = \'group\'').run(conversationId);
}

function getRole(conversationId, userId) {
  const row = db
    .prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId);
  return row?.role || null;
}

/**
 * El cliente navega a una conversacion privada usando un id deterministico
 * (`priv_<idMenor>_<idMayor>`) antes de que exista ninguna fila en la base
 * de datos (para que ambos usuarios coincidan en la misma sala desde el
 * primer clic, sin una ronda previa de "crear conversacion"). Esta funcion
 * verifica la pertenencia real y, si el id tiene el formato esperado y el
 * usuario es uno de los dos participantes, crea la conversacion y las
 * membresias de forma perezosa (idempotente: no duplica si ya existe).
 */
function ensureAccess(conversationId, userId) {
  if (isMember(conversationId, userId)) return true;
  const match = /^priv_(\d+)_(\d+)$/.exec(conversationId);
  if (match) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    if ((userId === a || userId === b) && privateConversationId(a, b) === conversationId) {
      getOrCreatePrivate(a, b);
      return true;
    }
  }
  return false;
}

/** Lista todas las conversaciones (publica + privadas + grupos) de un usuario, con metadatos para el sidebar. */
function listForUser(userId) {
  const rows = db
    .prepare(
      `SELECT c.id, c.type, c.name,
              (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) as last_message,
              (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) as last_message_at
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id
       WHERE cm.user_id = ?
       ORDER BY last_message_at DESC NULLS LAST`
    )
    .all(userId);

  return rows.map((row) => {
    const members = getMembers(row.id);
    let displayName = row.name;
    let peer = null;
    if (row.type === 'private') {
      peer = members.find((m) => m.id !== userId) || null;
      displayName = peer ? peer.username : 'Usuario eliminado';
    } else if (row.type === 'public') {
      displayName = 'Plaza Publica';
    }
    return {
      id: row.id,
      type: row.type,
      name: displayName,
      members,
      peer: peer ? userService.toPublic(peer) : null,
      lastMessage: row.last_message,
      lastMessageAt: row.last_message_at,
    };
  });
}

module.exports = {
  privateConversationId,
  getConversation,
  getMembers,
  isMember,
  addMember,
  removeMember,
  ensurePublicMembership,
  getOrCreatePrivate,
  createGroup,
  renameGroup,
  deleteGroup,
  getRole,
  listForUser,
  ensureAccess,
};
