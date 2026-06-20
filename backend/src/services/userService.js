'use strict';
const bcrypt = require('bcryptjs');
const db = require('../db/db');

const SALT_ROUNDS = 12;

function toPublic(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    preferredLang: user.preferred_lang,
    avatarColor: user.avatar_color,
    isOnline: !!user.is_online,
    lastSeenAt: user.last_seen_at,
  };
}

const AVATAR_PALETTE = ['#1A4878', '#2BC8AE', '#C28E0E', '#7C6FB0', '#C2674F', '#4A8FA3'];
function colorFor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function findByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

async function create({ username, password, preferredLang }) {
  const existing = findByUsername(username);
  if (existing) {
    const err = new Error('El nombre de usuario ya esta en uso');
    err.status = 409;
    throw err;
  }
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const color = colorFor(username);
  const result = db
    .prepare(
      'INSERT INTO users (username, password_hash, preferred_lang, avatar_color) VALUES (?, ?, ?, ?)'
    )
    .run(username, hash, preferredLang, color);
  return findById(Number(result.lastInsertRowid));
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

function setOnline(userId, isOnline) {
  db.prepare("UPDATE users SET is_online = ?, last_seen_at = datetime('now') WHERE id = ?").run(
    isOnline ? 1 : 0,
    userId
  );
}

function listAll() {
  return db
    .prepare('SELECT id, username, preferred_lang, avatar_color, is_online, last_seen_at FROM users ORDER BY username')
    .all();
}

function updateLanguage(userId, lang) {
  db.prepare('UPDATE users SET preferred_lang = ? WHERE id = ?').run(lang, userId);
}

module.exports = {
  toPublic,
  findByUsername,
  findById,
  create,
  verifyPassword,
  setOnline,
  listAll,
  updateLanguage,
};