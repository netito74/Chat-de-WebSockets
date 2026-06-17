const translationService = require("../services/translation.service");

/** POST /api/translate-ui → traduce un texto estático de la interfaz. */
async function traducirUi(req, res) {
    try {
        const { text, target } = req.body;
        const translatedText = await translationService.traducir(text, "es", target);
        res.json({ translatedText });
    } catch {
        res.status(500).json({ error: "Error de traducción" });
    }
}

module.exports = { traducirUi };
