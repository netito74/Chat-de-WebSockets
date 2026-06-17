const WebSocket = require("ws");

const { crearClientRegistry } = require("../state/clientRegistry");
const { crearChannelRepository } = require("../state/channelRepository");
const { crearPublicHistoryStore } = require("../state/publicHistoryStore");
const { crearBroadcaster } = require("./broadcaster");
const { crearDesconexionHandler } = require("./handlers/disconnect.handler");
const { crearTablaDeHandlers } = require("./handlers");
const translationService = require("../services/translation.service");

/**
 * Punto de composición del módulo WebSocket: aquí —y solo aquí— se
 * instancian los stores en memoria y se conectan entre sí. El resto del
 * código (handlers, broadcaster, repositorios) no sabe nada sobre cómo
 * se ensambla todo; solo recibe sus dependencias por parámetro.
 *
 * @param {import("http").Server} servidorHttp
 * @param {{ limiteHistorial: number }} opciones
 */
function adjuntarWebSocketServer(servidorHttp, { limiteHistorial }) {
    const wss = new WebSocket.Server({ server: servidorHttp });

    const clientRegistry = crearClientRegistry();
    const channelRepository = crearChannelRepository({ limiteHistorial });
    const publicHistory = crearPublicHistoryStore({ limiteHistorial });
    const broadcaster = crearBroadcaster({ wss, clientRegistry, channelRepository });

    const deps = { wss, clientRegistry, channelRepository, publicHistory, broadcaster, translationService };

    const handlers = crearTablaDeHandlers(deps);
    const manejarDesconexion = crearDesconexionHandler(deps);

    wss.on("connection", ws => {
        const cliente = clientRegistry.registrar(ws);

        ws.on("message", async raw => {
            try {
                const datos = JSON.parse(raw.toString());
                const handler = handlers[datos.type];
                if (handler) await handler(ws, cliente, datos);
            } catch (err) {
                console.error("Error procesando mensaje WS:", err);
            }
        });

        ws.on("close", () => manejarDesconexion(ws));
    });

    return wss;
}

module.exports = { adjuntarWebSocketServer };
