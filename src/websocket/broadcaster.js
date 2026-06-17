const WebSocket = require("ws");

/**
 * Crea las funciones de envío y difusión, atadas a una instancia concreta
 * de WebSocket.Server. Separar esto de los manejadores evita que cada
 * manejador tenga que saber cómo iterar `wss.clients` o construir los
 * payloads de "user-list" / "channel-list".
 */
function crearBroadcaster({ wss, clientRegistry, channelRepository }) {
    /** Envía datos JSON a un WebSocket solo si está abierto. */
    function enviar(ws, datos) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(datos));
    }

    /** Envía el mismo payload a todos los clientes conectados. */
    function broadcast(payload) {
        wss.clients.forEach(ws => enviar(ws, payload));
    }

    /** Envía la lista actualizada de usuarios a todos. */
    function emitirListaUsuarios() {
        broadcast({ type: "user-list", users: clientRegistry.listaPublica() });
    }

    /** Envía la lista completa de canales a todos. */
    function emitirListaCanales() {
        broadcast({ type: "channel-list", channels: channelRepository.listaPublica() });
    }

    return { enviar, broadcast, emitirListaUsuarios, emitirListaCanales };
}

module.exports = { crearBroadcaster };
