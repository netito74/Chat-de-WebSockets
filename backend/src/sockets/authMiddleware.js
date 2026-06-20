'use strict';
const { verifyToken } = require('../utils/jwt');
const userService = require('../services/userService');

/**
 * Autentica el handshake de Socket.IO usando el mismo JWT emitido por
 * /api/auth/login o /api/auth/register. El cliente lo envia en
 * `socket.handshake.auth.token`. Si el token es invalido o ha expirado, la
 * conexion se rechaza antes de que se establezca (no se permite "modo
 * anonimo" en ningun canal, ni siquiera la sala publica).
 */
function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('AUTH_REQUIRED'));
  try {
    const payload = verifyToken(token);
    const user = userService.findById(payload.sub);
    if (!user) return next(new Error('AUTH_USER_NOT_FOUND'));
    socket.user = userService.toPublic(user);
    next();
  } catch (err) {
    next(new Error('AUTH_INVALID_TOKEN'));
  }
}

module.exports = { socketAuthMiddleware };
