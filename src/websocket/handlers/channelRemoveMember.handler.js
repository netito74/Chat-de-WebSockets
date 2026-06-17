/** Eliminar miembro de un canal: solo el creador puede hacerlo, y no puede autoeliminarse. */
function crearEliminarMiembroHandler({ channelRepository, broadcaster }) {
    return function manejarEliminarMiembro(ws, cliente, datos) {
        if (!channelRepository.esCreador(datos.canalId, cliente.id)) return;
        if (datos.userId === cliente.id) return;

        const canal = channelRepository.obtener(datos.canalId);
        channelRepository.eliminarMiembro(datos.canalId, datos.userId);

        console.log(`Miembro ${datos.userId} eliminado del canal "${canal.nombre}" por ${cliente.nickname}`);
        broadcaster.emitirListaCanales();
    };
}

module.exports = { crearEliminarMiembroHandler };
