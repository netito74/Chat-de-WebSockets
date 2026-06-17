import { dom } from "../ui/dom.js";
import { state } from "../core/state.js";
import { socketClient } from "../core/socketClient.js";
import { panelManager } from "../ui/panelManager.js";
import { renderizarSeleccionUsuarios } from "../ui/usersView.js";
import { renderizarPanelMiembros } from "../ui/channelsView.js";

const cerrarFormularioCrear = () => {
    dom.inputNombreCanal.value = "";
    dom.contenedorCrearCanal.style.display = "none";
};

/** Conecta el flujo de creación de canales y el panel de gestión de miembros. */
export function inicializarCanales() {
    panelManager.registrar("miembros", dom.panelMiembros, [dom.btnGestionarMiembros]);

    dom.btnCrearCanal.addEventListener("click", () => {
        dom.contenedorCrearCanal.style.display = "block";
        dom.inputNombreCanal.focus();
        renderizarSeleccionUsuarios(state.usuariosConectados);
    });

    dom.btnCancelarCrear.addEventListener("click", cerrarFormularioCrear);

    dom.btnConfirmarCrear.addEventListener("click", () => {
        const nombre = dom.inputNombreCanal.value.trim();
        if (!nombre) return;

        const miembros = [...dom.listaMiembros.querySelectorAll("input:checked")].map(input => input.value);

        socketClient.send("channel-create", { nombre, miembros });
        cerrarFormularioCrear();
    });

    dom.btnGestionarMiembros.addEventListener("click", e => {
        e.stopPropagation();
        renderizarPanelMiembros();
        panelManager.toggle("miembros");
    });

    dom.btnCerrarPanelMiembros.addEventListener("click", () => panelManager.cerrar("miembros"));
}
