/** Añade o quita el badge de notificación de un <li> según `count`. */
export function actualizarBadgeEnLi(li, count) {
    let badge = li.querySelector(".badge-usuario");
    if (count > 0) {
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "badge-usuario";
            li.appendChild(badge);
        }
        badge.textContent = count;
    } else if (badge) {
        badge.remove();
    }
}
