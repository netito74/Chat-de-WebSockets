import { dom } from "../ui/dom.js";
import { state } from "../core/state.js";

const FONDO_DEFAULT = { tipo: "color", valor: "#f4f6f8" };

const fondoKeyUsuario = () => `chat_fondo_config_${state.miNickname || "default"}`;

/** Aplica visualmente una configuración de fondo al contenedor de mensajes. */
export function aplicarFondo(config) {
    dom.mensajes.style.backgroundImage = "";
    dom.mensajes.style.backgroundSize = "";
    dom.mensajes.style.backgroundPosition = "";
    dom.mensajes.style.backgroundRepeat = "";

    if (config.tipo === "color") {
        dom.mensajes.style.background = config.valor;
    } else if (config.tipo === "degradado") {
        dom.mensajes.style.background = `linear-gradient(135deg, ${config.valor}, ${config.valor2})`;
    } else if (config.tipo === "imagen") {
        dom.mensajes.style.background = "#f4f6f8";
        dom.mensajes.style.backgroundImage = `url("${config.valor}")`;
        dom.mensajes.style.backgroundSize = "cover";
        dom.mensajes.style.backgroundPosition = "center";
        dom.mensajes.style.backgroundRepeat = "no-repeat";
    }
}

/** Guarda la configuración en localStorage (por usuario) y la aplica. */
export function guardarYAplicarFondo(config) {
    try {
        localStorage.setItem(fondoKeyUsuario(), JSON.stringify(config));
    } catch (_) {
        // Cuota superada — se aplica igual, simplemente no se persiste.
    }
    aplicarFondo(config);
}

/** Restaura el fondo predeterminado y borra la preferencia guardada. */
export function restaurarFondoPredeterminado() {
    localStorage.removeItem(fondoKeyUsuario());
    aplicarFondo(FONDO_DEFAULT);
    return FONDO_DEFAULT;
}

/** Carga el fondo guardado — debe llamarse DESPUÉS de fijar `state.miNickname`. */
export function cargarFondoGuardado() {
    try {
        const raw = localStorage.getItem(fondoKeyUsuario());
        const config = raw ? JSON.parse(raw) : FONDO_DEFAULT;
        aplicarFondo(config);

        if (config.tipo === "color") dom.fondoColor.value = config.valor;
        if (config.tipo === "degradado") {
            dom.fondoGrad1.value = config.valor;
            dom.fondoGrad2.value = config.valor2;
        }
    } catch (_) {
        aplicarFondo(FONDO_DEFAULT);
    }
}

export { FONDO_DEFAULT };
