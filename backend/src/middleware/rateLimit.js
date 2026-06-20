'use strict';
const rateLimit = require('express-rate-limit');
const config = require('../config');

// Limita intentos de login/registro por IP: mitigacion de fuerza bruta
// (requerimiento de seguridad explicito del documento de solicitud).
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en un minuto.' },
});

const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.apiMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' },
});

module.exports = { authLimiter, apiLimiter };
