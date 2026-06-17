import { dom } from "../ui/dom.js";
import { state, historialDe } from "../core/state.js";
import { socketClient } from "../core/socketClient.js";
import { agregarMensaje } from "../ui/messagesView.js";
import { irASalaPublica } from "../ui/navigation.js";

const horaActual = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Despacha el mensaje al tipo correcto (público/privado/canal) según la vista activa. */
function enviarMensaje() {
    const contenido = dom.texto.value.trim();
    if (!contenido) return;

    if (state.vistaActual === "publico") {
        socketClient.send("public", { text: contenido });
    } else if (state.vistaActual.startsWith("privado:")) {
        const toId = state.vistaActual.split(":")[1];
        socketClient.send("private", { to: toId, text: contenido });

        // El remitente ve su propio mensaje de inmediato (sin round-trip).
        const hora = horaActual();
        historialDe(`privado:${toId}`).push({ from: state.miNickname, text: contenido, time: hora });
        agregarMensaje(state.miNickname, contenido, hora);
    } else if (state.vistaActual.startsWith("canal:")) {
        const canalId = state.vistaActual.split(":")[1];
        socketClient.send("channel-msg", { canalId, text: contenido });
    }

    dom.texto.value = "";
    dom.texto.focus();
}

/** Conecta los controles de envío de mensajes, indicador de escritura y navegación. */
export function inicializarChat() {
    dom.btnEnviar.addEventListener("click", enviarMensaje);
    dom.texto.addEventListener("keydown", e => { if (e.key === "Enter") enviarMensaje(); });

    // Indicador de escritura, solo activo en sala pública.
    let timerTyping = null;
    dom.texto.addEventListener("input", () => {
        if (state.vistaActual !== "publico") return;
        socketClient.send("typing", { isTyping: true });
        clearTimeout(timerTyping);
        timerTyping = setTimeout(() => {
            socketClient.send("typing", { isTyping: false });
        }, 1500);
    });

    dom.btnVolverPublico.addEventListener("click", async () => {
        await irASalaPublica();
        dom.texto.focus();
    });
}
