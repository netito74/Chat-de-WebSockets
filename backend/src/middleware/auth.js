'use strict';
const { verifyToken } = require('../utils/jwt');
const userService = require('../services/userService');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

  try {
    const payload = verifyToken(token);
    const user = userService.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

module.exports = { requireAuth };
