const { horaActual } = require("../../utils/time");

/** Mensaje privado: solo llega al remitente y al destinatario, cada uno con su traducción. */
function crearPrivadoHandler({ wss, clientRegistry, broadcaster, translationService }) {
    return async function manejarPrivado(ws, clienteOrigen, datos) {
        const hora = horaActual();

        wss.clients.forEach(async wsDestino => {
            const destino = clientRegistry.obtener(wsDestino);
            if (!destino) return;

            const esParte = destino.id === datos.to || destino.id === clienteOrigen.id;
            if (!esParte) return;

            const texto = await translationService.traducir(datos.text, "auto", destino.lang);
            broadcaster.enviar(wsDestino, {
                type: "private",
                from: clienteOrigen.nickname,
                fromId: clienteOrigen.id,
                text: texto,
                time: hora,
            });
        });
    };
}

module.exports = { crearPrivadoHandler };
