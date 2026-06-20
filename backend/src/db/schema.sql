-- Agora · esquema de base de datos (SQLite vía node:sqlite)
-- Ver docs/database.md para el diagrama entidad-relacion y la justificacion de cada tabla.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  preferred_lang  TEXT NOT NULL DEFAULT 'es',
  avatar_color    TEXT NOT NULL DEFAULT '#1A4878',
  is_online       INTEGER NOT NULL DEFAULT 0,
  last_seen_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Una fila por conversacion: la sala publica, un chat 1-a-1 o un grupo.
CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,            -- 'public' | 'priv_<id>' | 'grp_<uuid>'
  type          TEXT NOT NULL CHECK (type IN ('public','private','group')),
  name          TEXT,                        -- solo se usa en grupos
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_read_at    TEXT,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_msg_id   TEXT UNIQUE,                -- idempotencia: evita duplicados en reconexion
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id),
  content         TEXT NOT NULL,
  source_lang     TEXT NOT NULL DEFAULT 'es',
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','delivered','read')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON messages(conversation_id, created_at);

-- Cache persistente de traducciones (ademas de la cache LRU en memoria).
CREATE TABLE IF NOT EXISTS message_translations (
  message_id      INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  target_lang     TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  PRIMARY KEY (message_id, target_lang)
);

CREATE TABLE IF NOT EXISTS user_backgrounds (
  user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bg_type   TEXT NOT NULL CHECK (bg_type IN ('gradient','url','upload')),
  bg_value  TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sala publica unica, siempre presente.
INSERT OR IGNORE INTO conversations (id, type, name) VALUES ('public', 'public', 'Plaza Publica');
