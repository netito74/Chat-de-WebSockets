const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const server = http.createServer(async (req, res) => {
    
    // Endpoint 1: Transferir los idiomas instalados en Docker al navegador
    if (req.url === "/api/languages") {
        try {
            const response = await fetch("http://localhost:5000/languages");
            const data = await response.json();
            
            res.writeHead(200, { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            });
            return res.end(JSON.stringify(data));
        } catch (error) {
            console.error("Error consultando idiomas en Docker:", error.message);
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Error consultando los modelos de LibreTranslate" }));
        }
    }

    // Endpoint 2: Traducir textos individuales de la interfaz local (i18n dinámica)
    if (req.url === "/api/translate-ui" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => { body += chunk.toString(); });
        req.on("end", async () => {
            try {
                const parsedBody = JSON.parse(body);
                
                const response = await fetch("http://localhost:5000/translate", {
                    method: "POST",
                    body: JSON.stringify({
                        q: parsedBody.text,
                        source: "es", // Los textos base en el HTML están escritos en español
                        target: parsedBody.target,
                        format: "text"
                    }),
                    headers: { "Content-Type": "application/json" }
                });

                const data = await response.json();
                res.writeHead(200, { 
                    "Content-Type": "application/json", 
                    "Access-Control-Allow-Origin": "*" 
                });
                res.end(JSON.stringify({ translatedText: data.translatedText }));
            } catch (error) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Error en traducción dinámica de UI" }));
            }
        });
        return;
    }

    // Enrutador de archivos estáticos nativo para el cliente web
    let filePath = "./public/index.html";
    if (req.url !== "/") {
        filePath = "./public" + req.url;
    }
    const ext = path.extname(filePath);
    let contentType = "text/html";

    switch (ext) {
        case ".css": contentType = "text/css"; break;
        case ".js": contentType = "application/javascript"; break;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end("Archivo no encontrado");
        } else {
            res.writeHead(200, { "Content-Type": contentType });
            res.end(content, "utf-8");
        }
    });
});

const wss = new WebSocket.Server({ server });

// Estructuras de datos globales con soporte para idioma seleccionado
const clientsMap = new Map(); // Guarda: ws -> { id: String, nickname: String, lang: String }
let messageHistory = [];     

// Función auxiliar asíncrona para la mensajería en tiempo real usando LibreTranslate
async function traducirTexto(texto, idiomaDestino) {
    try {
        const response = await fetch("http://localhost:5000/translate", {
            method: "POST",
            body: JSON.stringify({
                q: texto,
                source: "auto", // Identifica automáticamente el idioma del emisor
                target: idiomaDestino,
                format: "text"
            }),
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) return texto;
        const data = await response.json();
        return data.translatedText;
    } catch (error) {
        console.error("Error de comunicación con LibreTranslate:", error.message);
        return texto; 
    }
}

function sendUserList() {
    const users = Array.from(clientsMap.values()).map(u => ({ id: u.id, nickname: u.nickname }));
    const payload = JSON.stringify({ type: "user-list", users });
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

function broadcastSistema(textoMsg) {
    const payload = JSON.stringify({ type: "system", text: textoMsg });
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

wss.on("connection", (ws) => {
    const clientId = "_" + Math.random().toString(36).substr(2, 9);
    clientsMap.set(ws, { id: clientId, nickname: "Anónimo", lang: "es" });

    ws.on("message", async (message) => {
        try {
            const data = JSON.parse(message.toString());
            const clientInfo = clientsMap.get(ws);

            switch (data.type) {
                case "register":
                    clientInfo.nickname = data.nickname;
                    clientInfo.lang = data.lang || "es";
                    
                    ws.send(JSON.stringify({ type: "history", history: messageHistory }));
                    broadcastSistema(`${clientInfo.nickname} se ha unido al chat.`);
                    sendUserList();
                    break;

                case "public":
                    const horaPublico = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    const pubMsgOriginal = {
                        type: "public",
                        from: clientInfo.nickname,
                        text: data.text,
                        time: horaPublico
                    };
                    messageHistory.push(pubMsgOriginal);
                    if (messageHistory.length > 20) messageHistory.shift();

                    wss.clients.forEach(async (client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            const destinoInfo = clientsMap.get(client);
                            const textoTraducido = await traducirTexto(data.text, destinoInfo.lang);

                            client.send(JSON.stringify({
                                type: "public",
                                from: clientInfo.nickname,
                                text: textoTraducido,
                                time: horaPublico
                            }));
                        }
                    });
                    break;

                case "private":
                    const horaPrivado = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    wss.clients.forEach(async (client) => {
                        const info = clientsMap.get(client);
                        if (client.readyState === WebSocket.OPEN && (info.id === data.to || info.id === clientInfo.id)) {
                            const textoTraducido = await traducirTexto(data.text, info.lang);

                            client.send(JSON.stringify({
                                type: "private",
                                from: clientInfo.nickname,
                                text: textoTraducido,
                                time: horaPrivado
                            }));
                        }
                    });
                    break;

                case "typing":
                    wss.clients.forEach((client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: "typing",
                                from: clientInfo.nickname,
                                isTyping: data.isTyping
                            }));
                        }
                    });
                    break;
            }
        } catch (err) {
            console.error("Error procesando mensaje:", err);
        }
    });

    ws.on("close", () => {
        const clientInfo = clientsMap.get(ws);
        if (clientInfo) {
            broadcastSistema(`${clientInfo.nickname} ha salido del chat.`);
            clientsMap.delete(ws);
            sendUserList();
        }
    });
});

server.listen(3000, "0.0.0.0", () => {
    console.log("Servidor escuchando en red local en el puerto 3000");
});
