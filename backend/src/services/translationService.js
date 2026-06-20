'use strict';
const { LRUCache } = require('lru-cache');
const db = require('../db/db');
const config = require('../config');

const mockProvider = require('./providers/mockProvider');
const googleProvider = require('./providers/googleProvider');
const deeplProvider = require('./providers/deeplProvider');

const PROVIDERS = { mock: mockProvider, google: googleProvider, deepl: deeplProvider };
const activeProvider = PROVIDERS[config.translation.provider] || mockProvider;

// Cache nivel 1: memoria de proceso (rapida, se pierde al reiniciar el nodo).
const memoryCache = new LRUCache({
  max: config.translation.cacheMaxEntries,
  ttl: config.translation.cacheTtlMs,
});

function cacheKey(messageId, targetLang) {
  return `${messageId}:${targetLang}`;
}

const insertTranslation = db.prepare(
  'INSERT OR REPLACE INTO message_translations (message_id, target_lang, translated_text) VALUES (?, ?, ?)'
);
const selectTranslation = db.prepare(
  'SELECT translated_text FROM message_translations WHERE message_id = ? AND target_lang = ?'
);

/**
 * Traduce un mensaje ya persistido (con id) al idioma destino.
 * Estrategia de cache en 2 niveles:
 *   1. LRU en memoria del proceso (mas rapido, por nodo).
 *   2. Tabla `message_translations` en SQLite (compartida entre nodos,
 *      sobrevive reinicios; cada traduccion solo se calcula una vez en todo
 *      el cluster para un mismo mensaje+idioma).
 * Manejo de errores: si el proveedor falla (timeout, cuota, red), se
 * devuelve el texto original marcado, nunca se rompe el flujo de chat.
 */
async function translateMessage({ messageId, text, sourceLang, targetLang }) {
  if (sourceLang === targetLang) return text;

  const mem = memoryCache.get(cacheKey(messageId, targetLang));
  if (mem) return mem;

  if (messageId != null) {
    const row = selectTranslation.get(messageId, targetLang);
    if (row) {
      memoryCache.set(cacheKey(messageId, targetLang), row.translated_text);
      return row.translated_text;
    }
  }

  try {
    const translated = await activeProvider.translate(text, targetLang, sourceLang);
    if (messageId != null) {
      insertTranslation.run(messageId, targetLang, translated);
      memoryCache.set(cacheKey(messageId, targetLang), translated);
    }
    return translated;
  } catch (err) {
    // Degradacion controlada: el chat sigue funcionando con el texto
    // original si el servicio de traduccion no esta disponible.
    console.error(`[translation] proveedor "${activeProvider.name}" fallo:`, err.message);
    return `${text} [traduccion no disponible]`;
  }
}

module.exports = { translateMessage, providerName: activeProvider.name };
