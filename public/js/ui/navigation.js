import { dom } from "./dom.js";
import { state } from "../core/state.js";
import { t } from "../services/translationService.js";
import { panelManager } from "./panelManager.js";
import { agregarMensaje } from "./messagesView.js";

/**
 * Centraliza toda la lógica de "volver a sala pública" en un único lugar.
 * La usa el botón de volver, la detección de expulsión de un canal, y
 * cualquier otra ruta futura que necesite resetear la vista principal.
 */
export async function irASalaPublica() {
    state.vistaActual = "publico";

    dom.chatTitulo.textContent = await t("sala-publica");
    dom.btnVolverPublico.style.display = "none";
    dom.mensajes.innerHTML = "";
    dom.indicadorTyping.textContent = "";
    dom.texto.disabled = false;
    dom.btnEnviar.disabled = false;
    dom.texto.placeholder = await t("escribe-mensaje");
    dom.texto.value = "";

    panelManager.cerrarTodos();
    dom.btnGestionarMiembros.style.display = "none";

    state.historiales.publico.forEach(msg => agregarMensaje(msg.from, msg.text, msg.time));
}
