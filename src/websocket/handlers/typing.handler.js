const WebSocket = require("ws");

/** Indicador de "está escribiendo…": se reenvía a todos excepto al emisor. */
function crearTypingHandler({ wss }) {
    return function manejarTyping(wsOrigen, clienteOrigen, datos) {
        wss.clients.forEach(ws => {
            if (ws !== wsOrigen && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "typing", from: clienteOrigen.nickname, isTyping: datos.isTyping }));
            }
        });
    };
}

module.exports = { crearTypingHandler };
