/** Eliminar canal completo: solo el creador puede hacerlo. Notifica a todos los clientes. */
function crearEliminarCanalHandler({ channelRepository, broadcaster }) {
    return function manejarEliminarCanal(ws, cliente, datos) {
        if (!channelRepository.esCreador(datos.canalId, cliente.id)) return;

        const canal = channelRepository.obtener(datos.canalId);
        channelRepository.eliminar(datos.canalId);

        console.log(`Canal "${canal.nombre}" eliminado por ${cliente.nickname}`);

        broadcaster.broadcast({
            type: "channel-deleted",
            canalId: datos.canalId,
            nombre: canal.nombre,
        });

        broadcaster.emitirListaCanales();
    };
}

module.exports = { crearEliminarCanalHandler };
