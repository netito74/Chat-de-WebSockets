'use strict';
const http = require('http');
const { createApp } = require('./app');
const { initSocketServer } = require('./sockets');
const config = require('./config');

const app = createApp();
const server = http.createServer(app);
const io = initSocketServer(server);
app.set('io', io);

server.listen(config.port, () => {
  console.log(
    `Agora [${config.instanceId}] escuchando en http://localhost:${config.port} (entorno: ${config.env}, redis: ${config.redis.enabled})`
  );
});

function shutdown(signal) {
  console.log(`${signal} recibido, iniciando apagado ordenado...`);
  // io.close() notifica a los clientes y cierra las conexiones de
  // Socket.IO activamente. Sin esto, http.Server#close() esperaria
  // indefinidamente a que las conexiones WebSocket de larga duracion se
  // cierren por si solas (no lo hacen), y el proceso nunca terminaria: una
  // causa comun de despliegues "zombie" que no liberan el puerto.
  io.close();
  server.close(() => process.exit(0));
  // Salvaguarda: si algo se queda colgado, se fuerza la salida para que un
  // orquestador (systemd, Docker, Kubernetes) pueda reiniciar el proceso
  // dentro de su ventana de "graceful shutdown".
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Red de seguridad: un error no controlado en un solo manejador de socket o
// de ruta no deberia derribar todo el proceso (y con el, a todos los demas
// usuarios conectados a esta instancia). Se registra para diagnostico; el
// proceso sigue vivo. Esto complementa, no sustituye, el manejo especifico
// de errores en cada capa (ver middleware/errorHandler.js y los callbacks
// `cb({ok:false,...})` en sockets/handlers/*.js).
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] error no controlado, el proceso continua:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection] promesa rechazada sin manejar:', err);
});
