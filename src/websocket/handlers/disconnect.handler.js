/** Desconexión: limpia el registro del cliente y notifica a los demás. */
function crearDesconexionHandler({ clientRegistry, broadcaster }) {
    return function manejarDesconexion(ws) {
        const cliente = clientRegistry.obtener(ws);
        if (!cliente) return;

        broadcaster.broadcast({ type: "system", text: `${cliente.nickname} ha salido del chat.` });
        clientRegistry.eliminar(ws);
        broadcaster.emitirListaUsuarios();
    };
}

module.exports = { crearDesconexionHandler };
