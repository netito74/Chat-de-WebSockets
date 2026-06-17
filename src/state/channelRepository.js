const { generarId } = require("../utils/id");
const { pushConLimite } = require("../utils/limitedList");

/**
 * Encapsula el Map<canalId, Canal> y todas las reglas de negocio que le
 * pertenecen (crear, añadir/quitar miembro, guardar historial, listar).
 * Mantener estas reglas aquí —en vez de en los manejadores de WebSocket—
 * es lo que permite testear "¿puede X añadir un miembro?" sin levantar
 * ningún servidor.
 *
 * @typedef {{ id: string, nombre: string, creadorId: string, miembros: string[], historial: any[] }} Canal
 */
function crearChannelRepository({ limiteHistorial }) {
    /** @type {Map<string, Canal>} */
    const canales = new Map();

    /** Crea un canal nuevo; el creador queda automáticamente como miembro. */
    function crear({ nombre, creadorId, miembrosIniciales = [] }) {
        const id = generarId();
        const canal = {
            id,
            nombre: nombre.trim(),
            creadorId,
            miembros: [creadorId, ...miembrosIniciales],
            historial: [],
        };
        canales.set(id, canal);
        return canal;
    }

    function obtener(canalId) {
        return canales.get(canalId);
    }

    function eliminar(canalId) {
        canales.delete(canalId);
    }

    function listar() {
        return Array.from(canales.values());
    }

    /** Representación pública apta para enviar al frontend. */
    function listaPublica() {
        return listar().map(c => ({
            id: c.id,
            nombre: c.nombre,
            creadorId: c.creadorId,
            miembros: c.miembros,
        }));
    }

    /** Solo el creador del canal puede gestionarlo (añadir/quitar/eliminar). */
    function esCreador(canalId, clienteId) {
        const canal = obtener(canalId);
        return !!canal && canal.creadorId === clienteId;
    }

    function agregarMiembro(canalId, userId) {
        const canal = obtener(canalId);
        if (!canal || !userId || canal.miembros.includes(userId)) return false;
        canal.miembros.push(userId);
        return true;
    }

    function eliminarMiembro(canalId, userId) {
        const canal = obtener(canalId);
        if (!canal) return false;
        canal.miembros = canal.miembros.filter(id => id !== userId);
        return true;
    }

    function guardarMensaje(canalId, mensaje) {
        const canal = obtener(canalId);
        if (!canal) return;
        pushConLimite(canal.historial, mensaje, limiteHistorial);
    }

    return {
        crear,
        obtener,
        eliminar,
        listar,
        listaPublica,
        esCreador,
        agregarMiembro,
        eliminarMiembro,
        guardarMensaje,
    };
}

module.exports = { crearChannelRepository };
