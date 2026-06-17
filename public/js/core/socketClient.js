import { WS_URL } from "../config/index.js";

/**
 * Encapsula la conexión WebSocket cruda. El resto de la app nunca llama
 * a `new WebSocket` ni a `JSON.parse/stringify` directamente: solo usa
 * `send(type, payload)` y `on(type, handler)`. Esto permite, por ejemplo,
 * sustituir el transporte en tests sin tocar ningún otro módulo.
 */
function crearSocketClient() {
    const socket = new WebSocket(WS_URL);
    const suscriptores = {};

    socket.onmessage = async ({ data }) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch {
            return;
        }
        const handler = suscriptores[msg.type];
        if (handler) await handler(msg);
    };

    /** Envía un mensaje tipado al servidor. */
    function send(type, payload = {}) {
        socket.send(JSON.stringify({ type, ...payload }));
    }

    /** Registra el manejador para un tipo de mensaje entrante (solo uno por tipo). */
    function on(type, handler) {
        suscriptores[type] = handler;
    }

    return { send, on, raw: socket };
}

export const socketClient = crearSocketClient();
