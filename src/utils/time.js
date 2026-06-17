/** Devuelve la hora actual formateada como "HH:MM" para mostrarla en los mensajes. */
function horaActual() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

module.exports = { horaActual };
