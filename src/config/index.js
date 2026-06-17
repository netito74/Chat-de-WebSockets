require("dotenv").config();

const path = require("path");

/**
 * Configuración centralizada de la aplicación.
 * Todo valor es sobreescribible mediante variables de entorno,
 * lo que permite desplegar el mismo código en distintos entornos
 * (desarrollo, pruebas, producción) sin tocar el código fuente.
 */
module.exports = {
    puerto: Number(process.env.PORT) || 3000,
    host: process.env.HOST || "0.0.0.0",

    urlLibreTranslate: process.env.LIBRETRANSLATE_URL || "http://localhost:5000",

    rutaPublica: path.join(__dirname, "..", "..", "public"),

    limiteHistorial: Number(process.env.HISTORY_LIMIT) || 20,
};
