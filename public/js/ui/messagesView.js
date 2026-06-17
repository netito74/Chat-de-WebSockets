import { dom } from "./dom.js";
import { state } from "../core/state.js";

/** Agrega un globo de mensaje a la ventana principal. */
export function agregarMensaje(from, text, time) {
    const div = document.createElement("div");
    div.classList.add("mensaje");
    if (from === state.miNickname) div.classList.add("mio");
    div.innerHTML = `<strong>${from}</strong> <p>${text}</p> <span>${time}</span>`;
    dom.mensajes.appendChild(div);
    dom.mensajes.scrollTop = dom.mensajes.scrollHeight;
}

/** Agrega un aviso de sistema (entradas/salidas). */
export function agregarSistema(text) {
    const div = document.createElement("div");
    div.classList.add("mensaje", "sistema");
    div.innerHTML = `<em>${text}</em>`;
    dom.mensajes.appendChild(div);
    dom.mensajes.scrollTop = dom.mensajes.scrollHeight;
}
