'use strict';
const sanitizeHtml = require('sanitize-html');
const db = require('../db/db');

const MAX_LEN = 4000;

/**
 * Saneamiento de contenido (defensa en profundidad contra XSS):
 * se elimina cualquier etiqueta/atributo HTML en el servidor antes de
 * persistir, y ademas el frontend nunca inserta mensajes con innerHTML
 * (ver frontend/public/js/ui/chatWindow.js), por lo que un mensaje
 * maliciosamente formado no puede ejecutar script ni en el primer ni en el
 * segundo nivel de defensa.
 */
function sanitize(text) {
  const clean = sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
  return clean.slice(0, MAX_LEN).trim();
}

const insertStmt = db.prepare(
  `INSERT INTO messages (client_msg_id, conversation_id, sender_id, content, source_lang, status)
   VALUES (?, ?, ?, ?, ?, 'sent')`
);
const getByClientId = db.prepare('SELECT * FROM messages WHERE client_msg_id = ?');
const getById = db.prepare('SELECT * FROM messages WHERE id = ?');

/**
 * Inserta un mensaje. `clientMsgId` (UUID generado por el cliente) garantiza
 * idempotencia: si el cliente reenvia el mismo mensaje tras una reconexion
 * (porque no recibio el ACK a tiempo), no se duplica.
 */
function create({ clientMsgId, conversationId, senderId, content, sourceLang }) {
  const clean = sanitize(content);
  if (!clean) {
    const err = new Error('El mensaje no puede estar vacio');
    err.status = 400;
    throw err;
  }
  if (clientMsgId) {
    const existing = getByClientId.get(clientMsgId);
    if (existing) return existing;
  }
  const result = insertStmt.run(clientMsgId || null, conversationId, senderId, clean, sourceLang || 'es');
  return getById.get(Number(result.lastInsertRowid));
}

function history(conversationId, { before, limit = 50 } = {}) {
  const lim = Math.min(limit, 200);
  let rows;
  if (before) {
    rows = db
      .prepare(
        `SELECT * FROM messages WHERE conversation_id = ? AND id < ?
         ORDER BY id DESC LIMIT ?`
      )
      .all(conversationId, before, lim);
  } else {
    rows = db
      .prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?`)
      .all(conversationId, lim);
  }
  return rows.reverse();
}

/** Mensajes creados despues de un id dado: usado para sincronizar tras una reconexion. */
function since(conversationId, afterId) {
  return db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC')
    .all(conversationId, afterId || 0);
}

function markStatus(messageId, status) {
  db.prepare('UPDATE messages SET status = ? WHERE id = ? AND status != \'read\'').run(
    status,
    messageId
  );
  return getById.get(messageId);
}

function lastMessageIdFor(conversationId) {
  const row = db
    .prepare('SELECT MAX(id) as maxId FROM messages WHERE conversation_id = ?')
    .get(conversationId);
  return row?.maxId || 0;
}

module.exports = { create, history, since, markStatus, lastMessageIdFor, sanitize };
