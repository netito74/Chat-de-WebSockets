'use strict';
const { z } = require('zod');

// Usuario: 3-24 caracteres alfanumericos + guion/guion bajo, evita inyeccion
// y normaliza identificadores usados luego como claves de socket.io rooms.
const username = z
  .string()
  .trim()
  .min(3, 'El usuario debe tener al menos 3 caracteres')
  .max(24, 'El usuario debe tener como maximo 24 caracteres')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Solo letras, numeros, guion y guion bajo');

const password = z
  .string()
  .min(8, 'La contrasena debe tener al menos 8 caracteres')
  .max(128);

const register = z.object({
  username,
  password,
  preferredLang: z.enum(['es', 'en']).default('es'),
});

const login = z.object({
  username,
  password,
});

const createGroup = z.object({
  name: z.string().trim().min(2).max(60),
  memberUsernames: z.array(username).max(200).optional().default([]),
});

const renameGroup = z.object({
  name: z.string().trim().min(2).max(60),
});

const addMembers = z.object({
  usernames: z.array(username).min(1).max(50),
});

const background = z.object({
  type: z.enum(['gradient', 'url']),
  value: z.string().min(1).max(2048),
});

module.exports = { register, login, createGroup, renameGroup, addMembers, background };
