const { pushConLimite } = require("../utils/limitedList");

/** Historial de la sala pública (últimos N mensajes), encapsulado. */
function crearPublicHistoryStore({ limiteHistorial }) {
    const historial = [];

    function agregar(mensaje) {
        pushConLimite(historial, mensaje, limiteHistorial);
    }

    function obtenerTodo() {
        return historial;
    }

    return { agregar, obtenerTodo };
}

module.exports = { crearPublicHistoryStore };
