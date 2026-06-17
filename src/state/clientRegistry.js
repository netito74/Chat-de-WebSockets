const { generarId } = require("../utils/id");

/**
 * Encapsula el Map<WebSocket, ClienteInfo> que antes vivía suelto en
 * server.js. Nadie fuera de este módulo manipula el Map directamente:
 * todo acceso pasa por estas funciones, lo que permite cambiar la
 * estructura interna (por ejemplo migrar a Redis) sin tocar al resto
 * de la aplicación.
 *
 * @typedef {{ id: string, nickname: string, lang: string }} ClienteInfo
 */
function crearClientRegistry() {
    /** @type {Map<import("ws").WebSocket, ClienteInfo>} */
    const clientes = new Map();

    /** Registra una nueva conexión y le asigna un id único. */
    function registrar(ws) {
        const info = { id: generarId(), nickname: "Anónimo", lang: "es" };
        clientes.set(ws, info);
        return info;
    }

    /** Devuelve la info asociada a un socket, o undefined si no existe. */
    function obtener(ws) {
        return clientes.get(ws);
    }

    /** Elimina el registro de un socket (al desconectarse). */
    function eliminar(ws) {
        clientes.delete(ws);
    }

    /** Lista de toda la info de clientes conectados. */
    function listar() {
        return Array.from(clientes.values());
    }

    /** Itera pares [ws, info] — útil para broadcasts personalizados. */
    function entradas() {
        return clientes.entries();
    }

    /** Representación pública apta para enviar al frontend. */
    function listaPublica() {
        return listar().map(c => ({ id: c.id, nickname: c.nickname }));
    }

    return { registrar, obtener, eliminar, listar, entradas, listaPublica };
}

module.exports = { crearClientRegistry };
