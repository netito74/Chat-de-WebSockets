'use strict';
const Redis = require('ioredis');
const config = require('../config');

let client = null;
let subClient = null;

function getClient() {
  if (!config.redis.enabled) return null;
  if (!client) {
    client = new Redis(config.redis.url, { lazyConnect: false });
    client.on('error', (err) => console.error('[redis] error en cliente principal:', err.message));
  }
  return client;
}

/** Cliente dedicado para suscripciones (ioredis exige una conexion separada para modo Pub/Sub). */
function getSubscriberClient() {
  if (!config.redis.enabled) return null;
  if (!subClient) {
    subClient = new Redis(config.redis.url, { lazyConnect: false });
    subClient.on('error', (err) => console.error('[redis] error en cliente de suscripcion:', err.message));
  }
  return subClient;
}

module.exports = { getClient, getSubscriberClient };
