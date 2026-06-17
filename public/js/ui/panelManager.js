/**
 * Gestiona un único panel flotante abierto a la vez (acordeón exclusivo).
 * Registro: { id → { panel, triggers } }. Al abrir uno, cierra todos los
 * demás antes de aplicar el toggle. Un único listener global en document
 * cierra cualquier panel abierto al hacer clic fuera de él.
 */
function crearPanelManager() {
    const _registro = {};

    /** Registra un panel junto con los elementos que lo activan. */
    function registrar(id, panel, triggers = []) {
        _registro[id] = { panel, triggers };
    }

    /** ¿Está actualmente visible el panel indicado? */
    function estaAbierto(id) {
        return _registro[id] && !_registro[id].panel.classList.contains("oculto");
    }

    function cerrar(id) {
        if (_registro[id]) _registro[id].panel.classList.add("oculto");
    }

    function cerrarTodos() {
        Object.keys(_registro).forEach(cerrar);
    }

    /** Toggle exclusivo: cierra los demás antes de abrir el solicitado. */
    function toggle(id) {
        if (estaAbierto(id)) {
            cerrar(id);
        } else {
            cerrarTodos();
            if (_registro[id]) _registro[id].panel.classList.remove("oculto");
        }
    }

    document.addEventListener("click", e => {
        Object.entries(_registro).forEach(([id, { panel, triggers }]) => {
            const dentroDelPanel = panel.contains(e.target);
            const esUnTrigger = triggers.some(t => t === e.target || t.contains(e.target));
            if (!dentroDelPanel && !esUnTrigger) cerrar(id);
        });
    });

    return { registrar, toggle, cerrar, cerrarTodos, estaAbierto };
}

export const panelManager = crearPanelManager();
