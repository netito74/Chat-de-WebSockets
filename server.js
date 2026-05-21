const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PUERTO = 3000;
const HOST = "0.0.0.0";

const URL_LIBRE_TRANSLATE = "http://localhost:5000";
const RUTA_PUBLICA = "./public";
const LIMITE_HISTORIAL = 20;

const clientes = new Map();
const historialMensajes = [];

const TIPOS_CONTENIDO = {
    ".css": "text/css",
    ".js": "application/javascript",
    ".html": "text/html"
};

/* =========================
   FUNCIONES AUXILIARES HTTP
========================= */

function responderJson(respuesta, codigo, datos) {
    respuesta.writeHead(codigo, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    });

    respuesta.end(JSON.stringify(datos));
}

function obtenerContenidoTipo(rutaArchivo) {
    const extension = path.extname(rutaArchivo);
    return TIPOS_CONTENIDO[extension] || "text/html";
}

function leerCuerpoPeticion(peticion) {
    return new Promise((resolver, rechazar) => {
        let cuerpo = "";

        peticion.on("data", fragmento => {
            cuerpo += fragmento.toString();
        });

        peticion.on("end", () => {
            try {
                resolver(JSON.parse(cuerpo));
            } catch (error) {
                rechazar(error);
            }
        });
    });
}

/* =========================
   FUNCIONES DE TRADUCCIÓN
========================= */

async function obtenerIdiomas() {
    const respuesta = await fetch(`${URL_LIBRE_TRANSLATE}/languages`);
    return respuesta.json();
}

async function traducirTexto(texto, idiomaOrigen, idiomaDestino) {
    try {
        const respuesta = await fetch(`${URL_LIBRE_TRANSLATE}/translate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                q: texto,
                source: idiomaOrigen,
                target: idiomaDestino,
                format: "text"
            })
        });

        if (!respuesta.ok) {
            return texto;
        }

        const datos = await respuesta.json();
        return datos.translatedText;
    } catch (error) {
        console.error("Error de comunicación con LibreTranslate:", error.message);
        return texto;
    }
}

/* =========================
   ENDPOINTS API
========================= */

async function manejarIdiomas(respuesta) {
    try {
        const idiomas = await obtenerIdiomas();
        responderJson(respuesta, 200, idiomas);
    } catch (error) {
        console.error("Error consultando idiomas:", error.message);

        responderJson(respuesta, 500, {
            error: "Error consultando los modelos de LibreTranslate"
        });
    }
}

async function manejarTraduccionUI(peticion, respuesta) {
    try {
        const cuerpo = await leerCuerpoPeticion(peticion);

        const textoTraducido = await traducirTexto(
            cuerpo.text,
            "es",
            cuerpo.target
        );

        responderJson(respuesta, 200, {
            translatedText: textoTraducido
        });
    } catch (error) {
        responderJson(respuesta, 500, {
            error: "Error en traducción dinámica de UI"
        });
    }
}

/* =========================
   ARCHIVOS ESTÁTICOS
========================= */

function servirArchivoEstatico(peticion, respuesta) {
    const rutaArchivo =
        peticion.url === "/"
            ? `${RUTA_PUBLICA}/index.html`
            : `${RUTA_PUBLICA}${peticion.url}`;

    const tipoContenido = obtenerContenidoTipo(rutaArchivo);

    fs.readFile(rutaArchivo, (error, contenido) => {
        if (error) {
            respuesta.writeHead(404);
            return respuesta.end("Archivo no encontrado");
        }

        respuesta.writeHead(200, {
            "Content-Type": tipoContenido
        });

        respuesta.end(contenido, "utf-8");
    });
}

/* =========================
   SERVIDOR HTTP
========================= */

const servidor = http.createServer(async (peticion, respuesta) => {
    if (peticion.url === "/api/languages") {
        return manejarIdiomas(respuesta);
    }

    if (
        peticion.url === "/api/translate-ui" &&
        peticion.method === "POST"
    ) {
        return manejarTraduccionUI(peticion, respuesta);
    }

    servirArchivoEstatico(peticion, respuesta);
});

/* =========================
   WEBSOCKET
========================= */

const servidorWebSocket = new WebSocket.Server({
    server: servidor
});

function generarIdCliente() {
    return `_${Math.random().toString(36).substring(2, 11)}`;
}

function enviarACliente(cliente, datos) {
    if (cliente.readyState === WebSocket.OPEN) {
        cliente.send(JSON.stringify(datos));
    }
}

function enviarListaUsuarios() {
    const usuarios = Array.from(clientes.values()).map(usuario => ({
        id: usuario.id,
        nickname: usuario.nickname
    }));

    const payload = {
        type: "user-list",
        users: usuarios
    };

    servidorWebSocket.clients.forEach(cliente => {
        enviarACliente(cliente, payload);
    });
}

function enviarMensajeSistema(texto) {
    const payload = {
        type: "system",
        text: texto
    };

    servidorWebSocket.clients.forEach(cliente => {
        enviarACliente(cliente, payload);
    });
}

function guardarMensajeHistorial(mensaje) {
    historialMensajes.push(mensaje);

    if (historialMensajes.length > LIMITE_HISTORIAL) {
        historialMensajes.shift();
    }
}

/* =========================
   EVENTOS WEBSOCKET
========================= */

servidorWebSocket.on("connection", websocket => {
    const idCliente = generarIdCliente();

    clientes.set(websocket, {
        id: idCliente,
        nickname: "Anónimo",
        lang: "es"
    });

    websocket.on("message", async mensaje => {
        try {
            const datos = JSON.parse(mensaje.toString());
            const clienteActual = clientes.get(websocket);

            switch (datos.type) {
                case "register":
                    await manejarRegistro(websocket, clienteActual, datos);
                    break;

                case "public":
                    await manejarMensajePublico(clienteActual, datos);
                    break;

                case "private":
                    await manejarMensajePrivado(clienteActual, datos);
                    break;

                case "typing":
                    manejarEscribiendo(websocket, clienteActual, datos);
                    break;
            }
        } catch (error) {
            console.error("Error procesando mensaje:", error);
        }
    });

    websocket.on("close", () => {
        manejarDesconexion(websocket);
    });
});

/* =========================
   MANEJADORES WEBSOCKET
========================= */

async function manejarRegistro(websocket, clienteActual, datos) {
    clienteActual.nickname = datos.nickname;
    clienteActual.lang = datos.lang || "es";

    enviarACliente(websocket, {
        type: "history",
        history: historialMensajes
    });

    enviarMensajeSistema(
        `${clienteActual.nickname} se ha unido al chat.`
    );

    enviarListaUsuarios();
}

async function manejarMensajePublico(clienteActual, datos) {
    const hora = obtenerHoraActual();

    const mensajeOriginal = {
        type: "public",
        from: clienteActual.nickname,
        text: datos.text,
        time: hora
    };

    guardarMensajeHistorial(mensajeOriginal);

    servidorWebSocket.clients.forEach(async cliente => {
        const infoDestino = clientes.get(cliente);

        const textoTraducido = await traducirTexto(
            datos.text,
            "auto",
            infoDestino.lang
        );

        enviarACliente(cliente, {
            type: "public",
            from: clienteActual.nickname,
            text: textoTraducido,
            time: hora
        });
    });
}

async function manejarMensajePrivado(clienteActual, datos) {
    const hora = obtenerHoraActual();

    servidorWebSocket.clients.forEach(async cliente => {
        const infoDestino = clientes.get(cliente);

        const esDestinatario =
            infoDestino.id === datos.to ||
            infoDestino.id === clienteActual.id;

        if (!esDestinatario) {
            return;
        }

        const textoTraducido = await traducirTexto(
            datos.text,
            "auto",
            infoDestino.lang
        );

        enviarACliente(cliente, {
            type: "private",
            from: clienteActual.nickname,
            fromId: clienteActual.id,
            text: textoTraducido,
            time: hora
        });
    });
}

function manejarEscribiendo(websocketActual, clienteActual, datos) {
    servidorWebSocket.clients.forEach(cliente => {
        const esOtroCliente = cliente !== websocketActual;

        if (!esOtroCliente) {
            return;
        }

        enviarACliente(cliente, {
            type: "typing",
            from: clienteActual.nickname,
            isTyping: datos.isTyping
        });
    });
}

function manejarDesconexion(websocket) {
    const cliente = clientes.get(websocket);

    if (!cliente) {
        return;
    }

    enviarMensajeSistema(
        `${cliente.nickname} ha salido del chat.`
    );

    clientes.delete(websocket);

    enviarListaUsuarios();
}

/* =========================
   UTILIDADES
========================= */

function obtenerHoraActual() {
    return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}

/* =========================
   INICIAR SERVIDOR
========================= */

servidor.listen(PUERTO, HOST, () => {
    console.log(
        `Servidor escuchando en red local en el puerto ${PUERTO}`
    );
});