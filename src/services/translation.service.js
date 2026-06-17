const config = require("../config");

/**
 * Servicio de traducción. Es la ÚNICA capa que conoce la existencia de
 * LibreTranslate: si en el futuro se cambia de proveedor (Google Translate,
 * DeepL, etc.) solo este archivo necesita modificarse.
 */

/** Consulta los idiomas disponibles en el servidor de traducción. */
async function obtenerIdiomas() {
    const res = await fetch(`${config.urlLibreTranslate}/languages`);
    if (!res.ok) throw new Error(`LibreTranslate respondió ${res.status}`);
    return res.json();
}

/**
 * Traduce `texto` del idioma `origen` al `destino`.
 * Si falla la llamada, devuelve el texto original para no romper el flujo
 * del chat (degradación elegante en lugar de propagar el error).
 */
async function traducir(texto, origen, destino) {
    if (origen !== "auto" && origen === destino) return texto;

    try {
        const res = await fetch(`${config.urlLibreTranslate}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q: texto, source: origen, target: destino, format: "text" }),
        });
        if (!res.ok) return texto;
        const datos = await res.json();
        return datos.translatedText || texto;
    } catch (err) {
        console.error("Error LibreTranslate:", err.message);
        return texto;
    }
}

module.exports = { obtenerIdiomas, traducir };
