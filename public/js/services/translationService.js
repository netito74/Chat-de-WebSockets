import { API_BASE } from "../config/index.js";
import { dom } from "../ui/dom.js";
import { state } from "../core/state.js";

/** Diccionario de textos en español que se traducen al cambiar de idioma. */
export const TEXTOS_UI = {
    "sala-publica": "Sala Pública",
    "escribe-mensaje": "Escribe un mensaje aquí...",
    "enviar": "Enviar",
    "volver-publico": "Volver a Sala Pública",
    "conectados": "Conectados",
    "canales": "Canales",
    "crear-canal": "＋ Crear Canal",
    "menu-usuarios": "Menú",
    "solo-lectura": "Solo lectura (no eres el creador)",
    "esta-escribiendo": "está escribiendo...",
};

// Caché para no repetir peticiones al servidor por el mismo texto.
const cacheTraduccion = {};

/** Traduce un texto estático de la UI (identificado por `clave`) al idioma activo. */
export async function t(clave) {
    if (state.miIdioma === "es") return TEXTOS_UI[clave];

    const cacheKey = `${clave}:${state.miIdioma}`;
    if (cacheTraduccion[cacheKey]) return cacheTraduccion[cacheKey];

    try {
        const res = await fetch(`${API_BASE}/api/translate-ui`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: TEXTOS_UI[clave], target: state.miIdioma }),
        });
        const data = await res.json();
        cacheTraduccion[cacheKey] = data.translatedText || TEXTOS_UI[clave];
        return cacheTraduccion[cacheKey];
    } catch {
        return TEXTOS_UI[clave];
    }
}

/** Traduce un mensaje dinámico (texto escrito por un usuario) al idioma indicado. */
export async function traducirTextoDinamico(texto, idiomaDestino) {
    if (idiomaDestino === "es") return texto;

    try {
        const res = await fetch(`${API_BASE}/api/translate-ui`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: texto, target: idiomaDestino }),
        });
        const data = await res.json();
        return data.translatedText || texto;
    } catch {
        return texto;
    }
}

/** Carga la lista de idiomas soportados en el <select> de idioma del login. */
export async function cargarIdiomas() {
    try {
        const res = await fetch(`${API_BASE}/api/languages`);
        const idiomas = await res.json();
        dom.idiomaInput.innerHTML = "";
        idiomas.forEach(lang => {
            const opt = document.createElement("option");
            opt.value = lang.code;
            opt.textContent = lang.name.charAt(0).toUpperCase() + lang.name.slice(1);
            if (lang.code === "es") opt.selected = true;
            dom.idiomaInput.appendChild(opt);
        });
    } catch {
        // Fallback si LibreTranslate no responde al cargar.
        dom.idiomaInput.innerHTML = `
            <option value="es" selected>Español</option>
            <option value="en">English</option>
            <option value="fr">Français</option>
        `;
    }
}
