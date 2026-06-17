const { horaActual } = require("../../utils/time");

/**
 * Mensaje público: se guarda una sola vez en el historial común, y se
 * traduce de forma individual al idioma preferido de cada receptor antes
 * de enviárselo.
 */
function crearPublicoHandler({ wss, clientRegistry, publicHistory, broadcaster, translationService }) {
    return async function manejarPublico(ws, clienteOrigen, datos) {
        const hora = horaActual();
        publicHistory.agregar({ type: "public", from: clienteOrigen.nickname, text: datos.text, time: hora });

        wss.clients.forEach(async wsDestino => {
            const destino = clientRegistry.obtener(wsDestino);
            if (!destino) return;

            const texto = await translationService.traducir(datos.text, "auto", destino.lang);
            broadcaster.enviar(wsDestino, { type: "public", from: clienteOrigen.nickname, text: texto, time: hora });
        });
    };
}

module.exports = { crearPublicoHandler };
