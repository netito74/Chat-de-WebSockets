const http = require("http");
const fs   = require("fs");
const path = require("path");
const WebSocket = require("ws");

/* ── CONFIGURACIÓN ──────────────────────────────────────────────────────── */

const PUERTO           = 3000;
const HOST             = "0.0.0.0";
const URL_LIBRE_TRANSLATE = "http://localhost:5000";
const RUTA_PUBLICA     = "./public";
const LIMITE_HISTORIAL = 20;

const TIPOS_CONTENIDO = {
    ".css":  "text/css",
    ".js":   "application/javascript",
    ".html": "text/html",
};

/* ── ESTADO DEL SERVIDOR ────────────────────────────────────────────────── */

// Map<WebSocket, { id, nickname, lang }>
const clientes = new Map();

// Map<canalId, { id, nombre, creadorId, historial: [] }>
// Map<canalId, { id, nombre, creadorId, miembros: [], historial: [] }>
const canales = new Map();


// Historial de la sala pública (últimos N mensajes)
const historialPublico = [];

/* ── UTILIDADES HTTP ────────────────────────────────────────────────────── */

// Envía respuesta JSON con código de estado
function responderJson(res, codigo, datos) {
    res.writeHead(codigo, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(datos));
}

// Parsea el body de la petición como JSON
function leerCuerpo(req) {
    return new Promise((ok, fail) => {
        let raw = "";
        req.on("data", chunk => (raw += chunk.toString()));
        req.on("end", () => {
            try { ok(JSON.parse(raw)); }
            catch (e) { fail(e); }
        });
    });
}

/* ── TRADUCCIÓN (LibreTranslate) ────────────────────────────────────────── */

// Consulta los idiomas disponibles al servidor LibreTranslate
async function obtenerIdiomas() {
    const res = await fetch(`${URL_LIBRE_TRANSLATE}/languages`);
    return res.json();
}

// Traduce `texto` del idioma origen al destino.
// Devuelve el texto original si falla para no romper el flujo.
async function traducir(texto, origen, destino) {
    // Evita llamada innecesaria si el destino es el mismo idioma
    if (origen !== "auto" && origen === destino) return texto;

    try {
        const res = await fetch(`${URL_LIBRE_TRANSLATE}/translate`, {
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

/* ── SERVIDOR HTTP ──────────────────────────────────────────────────────── */

const servidor = http.createServer(async (req, res) => {
    // GET /api/languages → lista de idiomas disponibles
    if (req.url === "/api/languages") {
        try {
            return responderJson(res, 200, await obtenerIdiomas());
        } catch {
            return responderJson(res, 500, { error: "No se pudieron obtener los idiomas" });
        }
    }

    // POST /api/translate-ui → traduce textos estáticos de la interfaz
    if (req.url === "/api/translate-ui" && req.method === "POST") {
        try {
            const { text, target } = await leerCuerpo(req);
            return responderJson(res, 200, {
                translatedText: await traducir(text, "es", target),
            });
        } catch {
            return responderJson(res, 500, { error: "Error de traducción" });
        }
    }

    // Archivos estáticos (HTML, CSS, JS del cliente)
    const ruta = req.url === "/" ? `${RUTA_PUBLICA}/index.html` : `${RUTA_PUBLICA}${req.url}`;
    const tipo = TIPOS_CONTENIDO[path.extname(ruta)] || "text/html";
    fs.readFile(ruta, (err, contenido) => {
        if (err) { res.writeHead(404); return res.end("No encontrado"); }
        res.writeHead(200, { "Content-Type": tipo });
        res.end(contenido, "utf-8");
    });
});

/* ── WEBSOCKET ──────────────────────────────────────────────────────────── */

const wss = new WebSocket.Server({ server: servidor });

// ID único de 9 caracteres para cada cliente/canal
const generarId = () => `_${Math.random().toString(36).substring(2, 11)}`;

// Envía datos JSON a un WebSocket solo si está abierto
function enviar(ws, datos) {
    if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify(datos));
}

// Envía el mismo payload a todos los clientes conectados
function broadcast(payload) {
    wss.clients.forEach(ws => enviar(ws, payload));
}

// Envía la lista actualizada de usuarios a todos
function emitirListaUsuarios() {
    const users = Array.from(clientes.values()).map(c => ({
        id: c.id, nickname: c.nickname,
    }));
    broadcast({ type: "user-list", users });
}

// Envía la lista completa de canales a todos
function emitirListaCanales() {

    const lista = Array.from(canales.values()).map(c => ({
        id: c.id,
        nombre: c.nombre,
        creadorId: c.creadorId,
        miembros: c.miembros
    }));

    broadcast({
        type: "channel-list",
        channels: lista
    });
}

// Guarda mensaje en el historial y descarta el más antiguo si excede el límite
function guardarEnHistorial(historial, mensaje) {
    historial.push(mensaje);
    if (historial.length > LIMITE_HISTORIAL) historial.shift();
}

/* ── CONEXIÓN ───────────────────────────────────────────────────────────── */

wss.on("connection", ws => {
    const id = generarId();
    clientes.set(ws, { id, nickname: "Anónimo", lang: "es" });

    ws.on("message", async raw => {
        try {
            const datos  = JSON.parse(raw.toString());
            const cliente = clientes.get(ws);

            // Despacha cada tipo de mensaje a su manejador
            const handlers = {
                register:        () => manejarRegistro(ws, cliente, datos),
                public:          () => manejarPublico(cliente, datos),
                private:         () => manejarPrivado(cliente, datos),
                typing:          () => manejarTyping(ws, cliente, datos),
                "channel-create": () => manejarCrearCanal(ws, cliente, datos),
                "channel-msg":   () => manejarMensajeCanal(cliente, datos),
            };

            if (handlers[datos.type]) await handlers[datos.type]();
        } catch (err) {
            console.error("Error procesando mensaje WS:", err);
        }
    });

    ws.on("close", () => manejarDesconexion(ws));
});

/* ── MANEJADORES ────────────────────────────────────────────────────────── */

// Registro inicial: guarda nickname/idioma, envía historial y listas
async function manejarRegistro(ws, cliente, datos) {
    cliente.nickname = datos.nickname;
    cliente.lang     = datos.lang || "es";

    // Envía historial público al nuevo cliente
    enviar(ws, { type: "history", history: historialPublico });

    // Envía lista de canales existentes para que pueda unirse
    const lista = Array.from(canales.values()).map(c => ({
        id: c.id,
        nombre: c.nombre,
        creadorId: c.creadorId,
        miembros: c.miembros
    }));
    enviar(ws, { type: "channel-list", channels: lista });

    broadcast({ type: "system", text: `${cliente.nickname} se ha unido al chat.` });
    emitirListaUsuarios();
}

// Mensaje público: se traduce al idioma de cada receptor
async function manejarPublico(clienteOrigen, datos) {
    const hora = horaActual();
    guardarEnHistorial(historialPublico, {
        type: "public", from: clienteOrigen.nickname, text: datos.text, time: hora,
    });

    // Traduce el texto individualmente para cada cliente conectado
    wss.clients.forEach(async ws => {
        const dest = clientes.get(ws);
        const texto = await traducir(datos.text, "auto", dest.lang);
        enviar(ws, { type: "public", from: clienteOrigen.nickname, text: texto, time: hora });
    });
}

// Mensaje privado: solo llega al remitente y al destinatario
async function manejarPrivado(clienteOrigen, datos) {
    const hora = horaActual();

    wss.clients.forEach(async ws => {
        const dest = clientes.get(ws);
        const esParte = dest.id === datos.to || dest.id === clienteOrigen.id;
        if (!esParte) return;

        const texto = await traducir(datos.text, "auto", dest.lang);
        enviar(ws, {
            type: "private",
            from: clienteOrigen.nickname,
            fromId: clienteOrigen.id,
            text: texto,
            time: hora,
        });
    });
}

// Indicador de "está escribiendo…": se reenvía a los demás
function manejarTyping(wsOrigen, clienteOrigen, datos) {
    wss.clients.forEach(ws => {
        if (ws !== wsOrigen)
            enviar(ws, { type: "typing", from: clienteOrigen.nickname, isTyping: datos.isTyping });
    });
}

// Crear canal: el cliente queda registrado como creador
function manejarCrearCanal(ws, cliente, datos) {

    const id = generarId();

    const miembros = [
        cliente.id,
        ...(datos.miembros || [])
    ];

    canales.set(id, {
        id,
        nombre: datos.nombre.trim(),
        creadorId: cliente.id,
        miembros,
        historial: [],
    });

    console.log(`Canal "${datos.nombre}" creado por ${cliente.nickname}`);

    emitirListaCanales();
}

// Mensaje de canal: solo el creador puede enviarlo; se traduce para cada receptor
async function manejarMensajeCanal(clienteOrigen, datos) {
    const canal = canales.get(datos.canalId);
    if (!canal) return;


    const hora = horaActual();
    guardarEnHistorial(canal.historial, {
        type: "channel-msg", canalId: canal.id,
        from: clienteOrigen.nickname, text: datos.text, time: hora,
    });

    // Transmite a todos con traducción personalizada
    wss.clients.forEach(async ws => {
        const dest  = clientes.get(ws);
        if (!canal.miembros.includes(dest.id)) return;

        const texto = await traducir(datos.text, "auto", dest.lang);
        enviar(ws, {
            type: "channel-msg", canalId: canal.id,
            from: clienteOrigen.nickname, text: texto, time: hora,
        });
    });
}

// Desconexión: limpia el cliente y notifica a los demás
function manejarDesconexion(ws) {
    const cliente = clientes.get(ws);
    if (!cliente) return;

    broadcast({ type: "system", text: `${cliente.nickname} ha salido del chat.` });
    clientes.delete(ws);
    emitirListaUsuarios();
}

/* ── UTILIDADES ─────────────────────────────────────────────────────────── */

function horaActual() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ── ARRANQUE ───────────────────────────────────────────────────────────── */

servidor.listen(PUERTO, HOST, () => {
    console.log(`Servidor escuchando en http://${HOST}:${PUERTO}`);
});
