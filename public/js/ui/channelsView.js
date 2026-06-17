import { dom } from "./dom.js";
import { state, historialDe } from "../core/state.js";
import { t } from "../services/translationService.js";
import { socketClient } from "../core/socketClient.js";
import { agregarMensaje } from "./messagesView.js";
import { actualizarBadgeEnLi } from "./badge.js";
import { mostrarToast } from "./toast.js";
import { irASalaPublica } from "./navigation.js";
import { mostrarDialogoConfirmarEliminar } from "./confirmDialog.js";

/**
 * Actualiza el mapa local de canales y redibuja la lista en la barra
 * lateral. Antes de redibujar, comprueba si el usuario estaba activo en
 * un canal del que ya no es miembro (expulsión) y, si es así, lo
 * redirige a la Sala Pública con un aviso — sin bloquear la UI.
 */
export function renderizarCanales(channels) {
    detectarExpulsionDeCanalActivo(channels);

    state.canalesInfo.clear();
    dom.listaCanales.innerHTML = "";

    channels.forEach(c => {
        if (!c.miembros.includes(state.miId)) return; // solo canales propios

        state.canalesInfo.set(c.id, c);

        const li = document.createElement("li");
        li.dataset.id = c.id;

        const esMiCanal = c.creadorId === state.miId;
        const badge = state.noLeidos[`canal:${c.id}`] || 0;
        const badgeHtml = badge > 0 ? `<span class="badge-usuario">${badge}</span>` : "";

        li.innerHTML = `
            ${esMiCanal ? "(👑)" : "(👥)"}
            ${c.nombre}
            ${badgeHtml}
        `;
        li.addEventListener("click", () => abrirCanal(c.id));

        dom.listaCanales.appendChild(li);
    });

    actualizarBotonGestionar();
    if (!dom.panelMiembros.classList.contains("oculto")) {
        renderizarPanelMiembros();
    }
}

/**
 * Si el usuario estaba viendo un canal del que ya no forma parte (porque
 * fue expulsado o el canal fue vaciado), lo redirige a la Sala Pública y
 * limpia su estado local. Se ejecuta antes de cada re-render de canales.
 */
function detectarExpulsionDeCanalActivo(channels) {
    if (!state.vistaActual.startsWith("canal:") || !state.miId) return;

    const canalActivoId = state.vistaActual.split(":")[1];
    const siguePerteneciendo = channels.some(
        c => c.id === canalActivoId && c.miembros.includes(state.miId)
    );
    if (siguePerteneciendo) return;

    const nombreCanal = state.canalesInfo.get(canalActivoId)?.nombre ?? "ese canal";

    irASalaPublica();
    mostrarToast(`Ya no eres miembro de «${nombreCanal}»`, "warn", 5000);

    delete state.historiales[`canal:${canalActivoId}`];
    delete state.noLeidos[`canal:${canalActivoId}`];
}

/** Cambia la vista al canal indicado y carga su historial. */
export function abrirCanal(canalId) {
    const key = `canal:${canalId}`;
    state.vistaActual = key;

    const canal = state.canalesInfo.get(canalId);
    dom.chatTitulo.textContent = `${canal.nombre}`;
    dom.btnVolverPublico.style.display = "block";
    dom.mensajes.innerHTML = "";
    dom.indicadorTyping.textContent = "";

    historialDe(key).forEach(msg => agregarMensaje(msg.from, msg.text, msg.time));

    state.noLeidos[key] = 0;
    actualizarBadgeCanal(canalId);

    actualizarInputCanal();
    actualizarBotonGestionar();
    dom.barraLateral.classList.remove("activo");
    dom.texto.focus();
}

/** Habilita o deshabilita el input según si el usuario es miembro del canal activo. */
export async function actualizarInputCanal() {
    if (!state.vistaActual.startsWith("canal:")) return;

    const canalId = state.vistaActual.split(":")[1];
    const canal = state.canalesInfo.get(canalId);
    const soyMiembro = canal && canal.miembros.includes(state.miId);

    dom.texto.disabled = !soyMiembro;
    dom.btnEnviar.disabled = !soyMiembro;

    dom.texto.placeholder = soyMiembro ? await t("escribe-mensaje") : await t("solo-lectura");
}

/** Muestra u oculta el botón de gestión según si somos creadores del canal activo. */
export function actualizarBotonGestionar() {
    if (!state.vistaActual.startsWith("canal:")) {
        dom.btnGestionarMiembros.style.display = "none";
        return;
    }
    const canalId = state.vistaActual.split(":")[1];
    const canal = state.canalesInfo.get(canalId);
    dom.btnGestionarMiembros.style.display =
        canal && canal.creadorId === state.miId ? "inline-flex" : "none";
}

export function actualizarBadgeCanal(canalId) {
    const li = dom.listaCanales.querySelector(`li[data-id="${canalId}"]`);
    if (!li) return;
    actualizarBadgeEnLi(li, state.noLeidos[`canal:${canalId}`] || 0);
}

/** Renderiza el panel de gestión: usuarios a añadir y miembros actuales con botón de eliminar. */
export function renderizarPanelMiembros() {
    if (!state.vistaActual.startsWith("canal:")) return;
    const canalId = state.vistaActual.split(":")[1];
    const canal = state.canalesInfo.get(canalId);
    if (!canal || canal.creadorId !== state.miId) return;

    // — Sección "Añadir" (usuarios que NO son miembros aún)
    dom.listaAddMiembros.innerHTML = "";
    const noMiembros = state.usuariosConectados.filter(
        u => u.id !== state.miId && !canal.miembros.includes(u.id)
    );

    if (noMiembros.length === 0) {
        dom.listaAddMiembros.innerHTML = "<em style='opacity:.6;font-size:.85em'>Todos los usuarios ya son miembros</em>";
    } else {
        noMiembros.forEach(u => {
            const div = document.createElement("div");
            div.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:4px 0;";
            div.innerHTML = `
                <span>${u.nickname}</span>
                <button data-uid="${u.id}" class="btn-add-miembro" style="background:#4caf50;color:#fff;border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:.8em;">＋ Añadir</button>
            `;
            dom.listaAddMiembros.appendChild(div);
        });
        dom.listaAddMiembros.querySelectorAll(".btn-add-miembro").forEach(btn => {
            btn.addEventListener("click", () => {
                socketClient.send("channel-add-member", { canalId, userId: btn.dataset.uid });
            });
        });
    }

    // — Sección "Miembros actuales" (con botón de eliminar, excepto el creador)
    dom.listaMiembrosActuales.innerHTML = "";
    canal.miembros.forEach(uid => {
        const usuario = state.usuariosConectados.find(u => u.id === uid);
        const nombre = usuario
            ? usuario.nickname
            : (uid === state.miId ? `${state.miNickname} (tú)` : `[${uid.slice(1, 5)}...]`);
        const esCreador = uid === canal.creadorId;

        const div = document.createElement("div");
        div.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:4px 0;";
        div.innerHTML = `
            <span>${nombre}${esCreador ? " 👑" : ""}</span>
            ${!esCreador ? `<button data-uid="${uid}" class="btn-remove-miembro" style="background:#e53935;color:#fff;border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:.8em;">✕ Quitar</button>` : ""}
        `;
        dom.listaMiembrosActuales.appendChild(div);
    });
    dom.listaMiembrosActuales.querySelectorAll(".btn-remove-miembro").forEach(btn => {
        btn.addEventListener("click", () => {
            socketClient.send("channel-remove-member", { canalId, userId: btn.dataset.uid });
        });
    });

    // — Zona de peligro: eliminar el canal completo —
    const zonaEliminar = document.createElement("div");
    zonaEliminar.style.cssText = "border-top:1px solid #fee2e2;margin-top:10px;padding-top:10px;";
    zonaEliminar.innerHTML = `
        <p style="font-size:.75rem;color:#9ca3af;margin-bottom:6px;">Zona de peligro</p>
        <button id="btn-eliminar-canal"
            style="width:100%;background:#dc2626;color:#fff;border:none;border-radius:8px;
                   padding:7px 0;cursor:pointer;font-size:.85rem;font-weight:600;
                   display:flex;align-items:center;justify-content:center;gap:6px;">
            🗑️ Eliminar canal
        </button>
    `;
    dom.listaMiembrosActuales.appendChild(zonaEliminar);

    document.getElementById("btn-eliminar-canal").addEventListener("click", () => {
        mostrarDialogoConfirmarEliminar(canal.nombre, canalId);
    });
}
