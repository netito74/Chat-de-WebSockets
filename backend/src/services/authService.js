'use strict';
const userService = require('./userService');
const { signToken } = require('../utils/jwt');

async function register({ username, password, preferredLang }) {
  const user = await userService.create({ username, password, preferredLang });
  const token = signToken(user);
  return { token, user: userService.toPublic(user) };
}

async function login({ username, password }) {
  const user = userService.findByUsername(username);
  if (!user) {
    const err = new Error('Usuario o contrasena invalidos');
    err.status = 401;
    throw err;
  }
  const ok = await userService.verifyPassword(user, password);
  if (!ok) {
    const err = new Error('Usuario o contrasena invalidos');
    err.status = 401;
    throw err;
  }
  const token = signToken(user);
  return { token, user: userService.toPublic(user) };
}

module.exports = { register, login };
