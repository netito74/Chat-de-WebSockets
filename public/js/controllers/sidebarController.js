import { dom } from "../ui/dom.js";

/** Conecta el botón que muestra/oculta la barra lateral en móvil. */
export function inicializarMenuMovil() {
    dom.btnMenu.addEventListener("click", () => dom.barraLateral.classList.toggle("activo"));
}
