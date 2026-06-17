/** Añadir miembro a un canal: solo el creador puede hacerlo. */
function crearAgregarMiembroHandler({ channelRepository, broadcaster }) {
    return function manejarAgregarMiembro(ws, cliente, datos) {
        if (!channelRepository.esCreador(datos.canalId, cliente.id)) return;

        const agregado = channelRepository.agregarMiembro(datos.canalId, datos.userId);
        if (!agregado) return;

        const canal = channelRepository.obtener(datos.canalId);
        console.log(`Miembro ${datos.userId} añadido al canal "${canal.nombre}" por ${cliente.nickname}`);
        broadcaster.emitirListaCanales();
    };
}

module.exports = { crearAgregarMiembroHandler };
