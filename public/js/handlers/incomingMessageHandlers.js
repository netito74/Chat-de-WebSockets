import { socketClient } from "../core/socketClient.js";
import { state, historialDe } from "../core/state.js";
import { dom } from "../ui/dom.js";
import { t, traducirTextoDinamico } from "../services/translationService.js";
import { agregarMensaje, agregarSistema } from "../ui/messagesView.js";
import { renderizarUsuarios, actualizarBadgeUsuario } from "../ui/usersView.js";
import { renderizarCanales, actualizarBadgeCanal } from "../ui/channelsView.js";
import { irASalaPublica } from "../ui/navigation.js";
import { mostrarToast } from "../ui/toast.js";

/** Historial inicial de la sala pública al conectarse (ya traducido). */
async function recibirHistorial({ history }) {
    const historialTraducido = await Promise.all(
        history.map(async msg => ({ ...msg, text: await traducirTextoDinamico(msg.text, state.miIdioma) }))
    );

    historialTraducido.forEach(msg => {
        state.historiales.publico.push(msg);
        if (state.vistaActual === "publico") agregarMensaje(msg.from, msg.text, msg.time);
    });
}

function recibirSistema({ text }) {
    if (state.vistaActual === "publico") agregarSistema(text);
}

async function recibirPublico(msg) {
    const mensajeConTraduccion = { ...msg, text: await traducirTextoDinamico(msg.text, state.miIdioma) };

    state.historiales.publico.push(mensajeConTraduccion);
    if (state.vistaActual === "publico") {
        agregarMensaje(mensajeConTraduccion.from, mensajeConTraduccion.text, mensajeConTraduccion.time);
    }
}

/** Mensaje privado: traduce, guarda en historial y marca no-leído si la vista no está activa. */
async function recibirPrivado(msg) {
    const key = `privado:${msg.fromId}`;
    msg.text = await traducirTextoDinamico(msg.text, state.miIdioma);
    historialDe(key).push(msg);

    if (state.vistaActual === key) {
        agregarMensaje(msg.from, msg.text, msg.time);
    } else {
        state.noLeidos[key] = (state.noLeidos[key] || 0) + 1;
        actualizarBadgeUsuario(msg.fromId);
    }
}

/** Mensaje de canal: traduce, guarda en historial y marca no-leído si la vista no está activa. */
async function recibirMensajeCanal(msg) {
    const key = `canal:${msg.canalId}`;
    const mensajeConTraduccion = { ...msg, text: await traducirTextoDinamico(msg.text, state.miIdioma) };
    historialDe(key).push(mensajeConTraduccion);

    if (state.vistaActual === key) {
        agregarMensaje(mensajeConTraduccion.from, mensajeConTraduccion.text, mensajeConTraduccion.time);
    } else {
        state.noLeidos[key] = (state.noLeidos[key] || 0) + 1;
        actualizarBadgeCanal(msg.canalId);
    }
}

/** Canal eliminado por su creador: limpia estado local y redirige si era la vista activa. */
async function recibirCanalEliminado({ canalId, nombre }) {
    const key = `canal:${canalId}`;

    if (state.vistaActual === key) {
        await irASalaPublica();
        mostrarToast(`El canal «${nombre}» fue eliminado`, "warn", 5000);
    }

    state.canalesInfo.delete(canalId);
    delete state.historiales[key];
    delete state.noLeidos[key];
}

/** Indicador "está escribiendo": solo se muestra en la vista correspondiente. */
function recibirTyping(msg) {
    if (state.vistaActual !== "publico") return;
    if (msg.isTyping) {
        t("esta-escribiendo").then(txt => {
            dom.indicadorTyping.textContent = `${msg.from} ${txt}`;
        });
    } else {
        dom.indicadorTyping.textContent = "";
    }
}

/** Conecta cada tipo de mensaje entrante con su manejador. Llamar una sola vez al iniciar. */
export function registrarHandlersEntrantes() {
    socketClient.on("history", recibirHistorial);
    socketClient.on("system", recibirSistema);
    socketClient.on("user-list", msg => renderizarUsuarios(msg.users));
    socketClient.on("channel-list", msg => renderizarCanales(msg.channels));
    socketClient.on("channel-deleted", recibirCanalEliminado);
    socketClient.on("public", recibirPublico);
    socketClient.on("private", recibirPrivado);
    socketClient.on("channel-msg", recibirMensajeCanal);
    socketClient.on("typing", recibirTyping);
}
