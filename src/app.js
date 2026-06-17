const express = require("express");
const config = require("./config");
const languagesRoutes = require("./routes/languages.routes");
const translateRoutes = require("./routes/translate.routes");

/**
 * Construye la app Express. Se exporta como función (factory) en vez de
 * una instancia ya creada para poder instanciar varias apps de forma
 * aislada en tests, sin estado compartido entre ellos.
 */
function crearApp() {
    const app = express();

    app.use(express.json());

    // Mismo comportamiento CORS abierto que tenía el servidor original.
    app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        next();
    });

    app.use("/api/languages", languagesRoutes);
    app.use("/api/translate-ui", translateRoutes);

    // Archivos estáticos del cliente (HTML, CSS, JS).
    app.use(express.static(config.rutaPublica));

    return app;
}

module.exports = { crearApp };
