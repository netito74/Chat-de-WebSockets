'use strict';
/**
 * Presencia distribuida.
 *
 * Problema: un mismo usuario puede tener varias pestanas/dispositivos
 * abiertos, y cada conexion de socket puede caer en cualquiera de los N
 * procesos Node detras del balanceador. Si solo contaramos "conectado" por
 * proceso, al cerrar una pestana en el nodo A podriamos marcar al usuario
 * como desconectado aunque siga conectado en el nodo B.
 *
 * Solucion: un contador de conexiones activas por usuario en Redis
 * (`presence:count:<userId>`), compartido por todos los nodos. Solo cuando
 * el contador pasa de 0->1 se considera que el usuario "se conecto" (y se
 * notifica a todos los clientes via Socket.IO + se actualiza la DB); solo
 * cuando vuelve a 0 se considera "desconectado". Sin Redis (modo de un solo
 * proceso) se usa un Map en memoria con el mismo contrato.
 */
const userService = require('../services/userService');
const { getClient } = require('../db/redisClient');

const localCounts = new Map(); // fallback sin Redis

async function increment(userId) {
  const redis = getClient();
  if (redis) {
    const value = await redis.incr(`presence:count:${userId}`);
    return value;
  }
  const next = (localCounts.get(userId) || 0) + 1;
  localCounts.set(userId, next);
  return next;
}

async function decrement(userId) {
  const redis = getClient();
  if (redis) {
    const value = await redis.decr(`presence:count:${userId}`);
    if (value <= 0) await redis.del(`presence:count:${userId}`);
    return Math.max(value, 0);
  }
  const next = Math.max((localCounts.get(userId) || 1) - 1, 0);
  if (next === 0) localCounts.delete(userId);
  else localCounts.set(userId, next);
  return next;
}

/** Llamar cuando un socket se conecta. Devuelve true si el usuario paso de offline a online. */
async function connect(userId) {
  const count = await increment(userId);
  const becameOnline = count === 1;
  if (becameOnline) userService.setOnline(userId, true);
  return becameOnline;
}

/** Llamar cuando un socket se desconecta. Devuelve true si el usuario paso de online a offline. */
async function disconnect(userId) {
  const count = await decrement(userId);
  const becameOffline = count === 0;
  if (becameOffline) userService.setOnline(userId, false);
  return becameOffline;
}

module.exports = { connect, disconnect };
