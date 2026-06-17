const { horaActual } = require("../../utils/time");

/** Mensaje de canal: solo llega a los miembros del canal, cada uno con su traducción. */
function crearMensajeCanalHandler({ wss, clientRegistry, channelRepository, broadcaster, translationService }) {
    return async function manejarMensajeCanal(ws, clienteOrigen, datos) {
        const canal = channelRepository.obtener(datos.canalId);
        if (!canal) return;

        const hora = horaActual();
        channelRepository.guardarMensaje(canal.id, {
            type: "channel-msg",
            canalId: canal.id,
            from: clienteOrigen.nickname,
            text: datos.text,
            time: hora,
        });

        wss.clients.forEach(async wsDestino => {
            const destino = clientRegistry.obtener(wsDestino);
            if (!destino || !canal.miembros.includes(destino.id)) return;

            const texto = await translationService.traducir(datos.text, "auto", destino.lang);
            broadcaster.enviar(wsDestino, {
                type: "channel-msg",
                canalId: canal.id,
                from: clienteOrigen.nickname,
                text: texto,
                time: hora,
            });
        });
    };
}

module.exports = { crearMensajeCanalHandler };
