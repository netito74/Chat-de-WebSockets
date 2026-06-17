/**
 * Registro inicial: guarda nickname/idioma, y envía al nuevo cliente
 * el historial público y la lista de canales para que pueda unirse.
 */
function crearRegistroHandler({ broadcaster, channelRepository, publicHistory }) {
    return function manejarRegistro(ws, cliente, datos) {
        cliente.nickname = datos.nickname;
        cliente.lang = datos.lang || "es";

        broadcaster.enviar(ws, { type: "history", history: publicHistory.obtenerTodo() });
        broadcaster.enviar(ws, { type: "channel-list", channels: channelRepository.listaPublica() });

        broadcaster.broadcast({ type: "system", text: `${cliente.nickname} se ha unido al chat.` });
        broadcaster.emitirListaUsuarios();
    };
}

module.exports = { crearRegistroHandler };
