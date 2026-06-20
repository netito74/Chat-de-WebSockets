'use strict';
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const config = require('../config');
const { getClient, getSubscriberClient } = require('../db/redisClient');
const { socketAuthMiddleware } = require('./authMiddleware');
const { registerChatHandlers } = require('./handlers/chat');
const { registerSyncHandlers } = require('./handlers/sync');
const { handleConnect, handleDisconnect } = require('./handlers/presence');

function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.cors.origin },
    // El motor de polling se mantiene como fallback para clientes/proxies
    // que no soportan upgrade a WebSocket; ver docs/architecture.md.
    transports: ['websocket', 'polling'],
  });

  if (config.redis.enabled) {
    const pub = getClient();
    const sub = getSubscriberClient();
    io.adapter(createAdapter(pub, sub));
    console.log(`[socket.io] adaptador Redis activo (instancia ${config.instanceId})`);
  } else {
    console.log('[socket.io] ejecutando sin Redis: solo valido para un unico proceso/dev');
  }

  io.use(socketAuthMiddleware);

  io.on('connection', async (socket) => {
    console.log(`[socket.io] ${socket.user.username} conectado (${config.instanceId}, socket ${socket.id})`);
    await handleConnect(io, socket);

    registerChatHandlers(io, socket);
    registerSyncHandlers(io, socket);

    socket.on('disconnect', async (reason) => {
      console.log(`[socket.io] ${socket.user.username} desconectado (${reason})`);
      await handleDisconnect(io, socket);
    });
  });

  return io;
}

module.exports = { initSocketServer };
