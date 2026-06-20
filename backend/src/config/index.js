'use strict';
require('dotenv').config();
const path = require('path');

function bool(v, def) {
  if (v === undefined) return def;
  return v === 'true' || v === '1';
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  instanceId: process.env.INSTANCE_ID || `node-${process.pid}`,

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },

  db: {
    file: process.env.DB_FILE || path.join(__dirname, '..', '..', 'data', 'agora.sqlite'),
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    enabled: bool(process.env.REDIS_ENABLED, true),
  },

  uploads: {
    dir: process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'),
    maxSizeMb: parseInt(process.env.UPLOAD_MAX_MB || '5', 10),
    allowedMime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },

  translation: {
    // 'mock'   -> traductor offline por diccionario, util para desarrollo/demo
    //             sin salida a internet (ver services/providers/mockProvider.js)
    // 'google' -> Google Cloud Translation API (requiere GOOGLE_TRANSLATE_API_KEY)
    // 'deepl'  -> DeepL API (requiere DEEPL_API_KEY)
    provider: process.env.TRANSLATION_PROVIDER || 'mock',
    cacheTtlMs: parseInt(process.env.TRANSLATION_CACHE_TTL_MS || String(1000 * 60 * 60), 10),
    cacheMaxEntries: parseInt(process.env.TRANSLATION_CACHE_MAX || '5000', 10),
    googleApiKey: process.env.GOOGLE_TRANSLATE_API_KEY || '',
    deeplApiKey: process.env.DEEPL_API_KEY || '',
  },

  supportedLanguages: ['es', 'en'],

  rateLimit: {
    windowMs: 60 * 1000,
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '10', 10), // intentos de login/registro por minuto por IP
    apiMax: parseInt(process.env.RATE_LIMIT_API_MAX || '120', 10),
  },
};
