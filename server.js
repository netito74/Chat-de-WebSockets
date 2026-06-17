const http = require("http");

const config = require("./src/config");
const { crearApp } = require("./src/app");
const { adjuntarWebSocketServer } = require("./src/websocket");

const app = crearApp();
const servidor = http.createServer(app);

adjuntarWebSocketServer(servidor, { limiteHistorial: config.limiteHistorial });

servidor.listen(config.puerto, config.host, () => {
    console.log(`Servidor escuchando en http://${config.host}:${config.puerto}`);
});
