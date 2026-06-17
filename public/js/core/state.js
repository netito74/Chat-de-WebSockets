/**
 * Único lugar donde vive el estado mutable de la app en el navegador.
 * Es deliberadamente un objeto plano (no una clase ni un store con
 * reducers): para el tamaño de esta app eso sería sobre-ingeniería.
 * Lo importante es que es el ÚNICO lugar — nadie declara variables de
 * estado sueltas en otros módulos.
 */
export const state = {
    miNickname: "",
    miId: "",
    miIdioma: "es",

    // Vista activa: "publico" | "privado:<userId>" | "canal:<canalId>"
    vistaActual: "publico",

    usuariosConectados: [],

    // Historiales en memoria para cambiar de vista sin perder mensajes.
    historiales: {
        publico: [],
    },

    // No-leídos: { [vistaKey]: número }
    noLeidos: {},

    // Datos de canales: Map<canalId, { id, nombre, creadorId, miembros }>
    canalesInfo: new Map(),
};

/** Devuelve (creando si falta) el array de historial para una vista dada. */
export function historialDe(key) {
    if (!state.historiales[key]) state.historiales[key] = [];
    return state.historiales[key];
}
