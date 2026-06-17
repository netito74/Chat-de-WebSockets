const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const WebSocket = require("ws");

const { crearApp } = require("../src/app");
const { adjuntarWebSocketServer } = require("../src/websocket");

/** Levanta una instancia completa (HTTP + WS) en un puerto efímero. */
function levantarServidorDePrueba() {
    return new Promise(resolve => {
        const servidor = http.createServer(crearApp());
        adjuntarWebSocketServer(servidor, { limiteHistorial: 20 });
        servidor.listen(0, "127.0.0.1", () => {
            const { port } = servidor.address();
            resolve({ servidor, url: `ws://127.0.0.1:${port}` });
        });
    });
}

function conectar(url) {
    return new Promise(resolve => {
        const ws = new WebSocket(url);
        const recibidos = [];
        ws.on("message", raw => recibidos.push(JSON.parse(raw.toString())));
        ws.on("open", () => resolve({ ws, recibidos }));
    });
}

const enviar = (cliente, type, payload = {}) => cliente.ws.send(JSON.stringify({ type, ...payload }));
const esperar = ms => new Promise(r => setTimeout(r, ms));
const ultimoDeTipo = (cliente, type) => [...cliente.recibidos].reverse().find(m => m.type === type);

test("flujo completo de chat: registro, mensajes, canales y permisos", async t => {
    const { servidor, url } = await levantarServidorDePrueba();
    t.after(() => servidor.close());

    const ana = await conectar(url);
    const beto = await conectar(url);

    enviar(ana, "register", { nickname: "Ana", lang: "es" });
    enviar(beto, "register", { nickname: "Beto", lang: "es" });
    await esperar(150);

    await t.test("la lista de usuarios incluye a ambos clientes", () => {
        const lista = ultimoDeTipo(ana, "user-list");
        assert.equal(lista.users.length, 2);
    });

    const idAna = ultimoDeTipo(ana, "user-list").users.find(u => u.nickname === "Ana").id;
    const idBeto = ultimoDeTipo(ana, "user-list").users.find(u => u.nickname === "Beto").id;

    await t.test("un mensaje público llega a todos los conectados", async () => {
        enviar(ana, "public", { text: "Hola a todos" });
        await esperar(150);
        const recibido = ultimoDeTipo(beto, "public");
        assert.equal(recibido.from, "Ana");
        assert.equal(recibido.text, "Hola a todos");
    });

    await t.test("un mensaje privado llega al destinatario correcto", async () => {
        enviar(ana, "private", { to: idBeto, text: "secreto" });
        await esperar(150);
        const recibido = ultimoDeTipo(beto, "private");
        assert.equal(recibido.text, "secreto");
        assert.equal(recibido.fromId, idAna);
    });

    let canalId;
    await t.test("crear un canal registra al creador y a los miembros iniciales", async () => {
        enviar(ana, "channel-create", { nombre: "General", miembros: [idBeto] });
        await esperar(150);
        const canal = ultimoDeTipo(ana, "channel-list").channels.find(c => c.nombre === "General");
        assert.ok(canal);
        assert.equal(canal.creadorId, idAna);
        assert.ok(canal.miembros.includes(idBeto));
        canalId = canal.id;
    });

    await t.test("un mensaje de canal llega a sus miembros", async () => {
        enviar(ana, "channel-msg", { canalId, text: "bienvenidos" });
        await esperar(150);
        const recibido = ultimoDeTipo(beto, "channel-msg");
        assert.equal(recibido.canalId, canalId);
        assert.equal(recibido.text, "bienvenidos");
    });

    await t.test("un miembro que no es el creador no puede eliminar miembros", async () => {
        enviar(beto, "channel-remove-member", { canalId, userId: idAna });
        await esperar(100);
        const canal = ultimoDeTipo(ana, "channel-list").channels.find(c => c.id === canalId);
        assert.ok(canal.miembros.includes(idAna));
    });

    await t.test("el creador puede eliminar miembros", async () => {
        enviar(ana, "channel-remove-member", { canalId, userId: idBeto });
        await esperar(150);
        const listaParaBeto = ultimoDeTipo(beto, "channel-list");
        const canalParaBeto = listaParaBeto.channels.find(c => c.id === canalId);
        assert.ok(!canalParaBeto || !canalParaBeto.miembros.includes(idBeto));
    });

    await t.test("el creador puede eliminar el canal completo", async () => {
        enviar(ana, "channel-delete", { canalId });
        await esperar(150);
        const eliminado = ultimoDeTipo(ana, "channel-deleted");
        assert.equal(eliminado.canalId, canalId);
    });

    ana.ws.close();
    beto.ws.close();
});
