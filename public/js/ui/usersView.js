import { dom } from "./dom.js";
import { state, historialDe } from "../core/state.js";
import { actualizarBadgeEnLi } from "./badge.js";
import { agregarMensaje } from "./messagesView.js";
import { TEXTOS_UI } from "../services/translationService.js";

/** Renderiza la lista lateral de usuarios conectados (sin mostrarse a sí mismo). */
export function renderizarUsuarios(users) {
    // Detectar nuestro propio id la primera vez que llega la lista.
    if (!state.miId) {
        const yo = users.find(u => u.nickname === state.miNickname);
        if (yo) state.miId = yo.id;
    }

    state.usuariosConectados = users;
    renderizarSeleccionUsuarios(users);

    dom.listaUsuarios.innerHTML = "";

    users.forEach(u => {
        if (u.nickname === state.miNickname) return;

        const li = document.createElement("li");
        li.dataset.id = u.id;

        const badge = state.noLeidos[`privado:${u.id}`] || 0;
        const badgeHtml = badge > 0 ? `<span class="badge-usuario">${badge}</span>` : "";

        li.innerHTML = `${u.nickname} ${badgeHtml}`;
        li.addEventListener("click", () => abrirPrivado(u));

        dom.listaUsuarios.appendChild(li);
    });
}

/** Renderiza los checkboxes de selección de usuarios al crear un canal. */
export function renderizarSeleccionUsuarios(users) {
    if (!dom.listaMiembros) return;

    dom.listaMiembros.innerHTML = "";

    users.forEach(u => {
        if (u.nickname === state.miNickname) return;

        const div = document.createElement("div");
        div.className = "miembro-item";
        div.innerHTML = `
            <label class="miembro-label">
                <input type="checkbox" value="${u.id}">
                <span>${u.nickname}</span>
            </label>
        `;
        dom.listaMiembros.appendChild(div);
    });
}

/** Cambia la vista al chat privado con el usuario indicado. */
export function abrirPrivado(usuario) {
    const key = `privado:${usuario.id}`;
    state.vistaActual = key;

    dom.chatTitulo.textContent = `${usuario.nickname}`;
    dom.btnVolverPublico.style.display = "block";
    dom.mensajes.innerHTML = "";
    dom.indicadorTyping.textContent = "";
    dom.texto.disabled = false;
    dom.btnEnviar.disabled = false;
    dom.texto.placeholder = TEXTOS_UI["escribe-mensaje"]; // no requiere traducción aquí

    state.noLeidos[key] = 0;
    actualizarBadgeUsuario(usuario.id);
    historialDe(key).forEach(msg => agregarMensaje(msg.from, msg.text, msg.time));

    dom.barraLateral.classList.remove("activo");
    dom.texto.focus();
}

export function actualizarBadgeUsuario(userId) {
    const li = dom.listaUsuarios.querySelector(`li[data-id="${userId}"]`);
    if (!li) return;
    actualizarBadgeEnLi(li, state.noLeidos[`privado:${userId}`] || 0);
}
