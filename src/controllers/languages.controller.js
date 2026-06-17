const translationService = require("../services/translation.service");

/** GET /api/languages → lista de idiomas que soporta el traductor. */
async function obtenerIdiomas(req, res) {
    try {
        const idiomas = await translationService.obtenerIdiomas();
        res.json(idiomas);
    } catch {
        res.status(500).json({ error: "No se pudieron obtener los idiomas" });
    }
}

module.exports = { obtenerIdiomas };
