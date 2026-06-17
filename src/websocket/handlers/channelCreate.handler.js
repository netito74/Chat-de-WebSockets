/** Crear canal: el cliente que lo crea queda registrado como su dueño. */
function crearCrearCanalHandler({ channelRepository, broadcaster }) {
    return function manejarCrearCanal(ws, cliente, datos) {
        const canal = channelRepository.crear({
            nombre: datos.nombre,
            creadorId: cliente.id,
            miembrosIniciales: datos.miembros || [],
        });

        console.log(`Canal "${canal.nombre}" creado por ${cliente.nickname}`);
        broadcaster.emitirListaCanales();
    };
}

module.exports = { crearCrearCanalHandler };
