const host = window.location.hostname;
const socket = new WebSocket(`ws://${host}:3000`);

// Elementos de la interfaz (Ventana única)
const modalLogin = document.getElementById("modal-login");
const nicknameInput = document.getElementById("nickname-input");
const idiomaInput = document.getElementById("idioma-input");
const btnEntrar = document.getElementById("btnEntrar");

const mensajes = document.getElementById("mensajes");
const texto = document.getElementById("texto");
const btnEnviar = document.getElementById("btnEnviar");
const listaUsuarios = document.getElementById("lista-usuarios");
const chatTitulo = document.getElementById("chat-titulo");
const btnVolverPublico = document.getElementById("btn-volver-publico");
const indicadorEscribiendo = document.getElementById("indicador-escribiendo");
const btnMenu = document.getElementById("btn-menu");
const barraLateral = document.querySelector(".barra-lateral");

// Estado de la aplicación cliente
let miNickname = "";
let miIdioma = "es";
let chatActual = "publico"; // "publico" o el ID del usuario privado
let objetivoPrivado = null; // { id, nickname }
let timeoutEscribiendo = null;

// Historiales en memoria para cambiar de chat sin perder datos
const historialPublico = [];
const historialPrivado = {}; // { userId: [{from, text, time}] }
const noLeidos = {}; // { userId: count }

// ─── TRADUCCIÓN ──────────────────────────────────────────────────────────────

async function traducirTextoUI(textoOriginal, idiomaDestino) {
    if (idiomaDestino === "es") return textoOriginal;
    try {
        const response = await fetch(`http://${host}:3000/api/translate-ui`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: textoOriginal, target: idiomaDestino })
        });
        const data = await response.json();
        return data.translatedText || textoOriginal;
    } catch (error) {
        console.error("Fallo al traducir texto de interfaz:", error);
        return textoOriginal;
    }
}

async function aplicarIdiomaInterfazDinamico(codigoLang) {
    if (chatActual === "publico") {
        chatTitulo.textContent = await traducirTextoUI("Sala Pública", codigoLang);
    } else if (objetivoPrivado) {
        chatTitulo.textContent = `💬 ${objetivoPrivado.nickname}`;
    }
    texto.placeholder = await traducirTextoUI("Escribe un mensaje aquí...", codigoLang);
    btnEnviar.textContent = await traducirTextoUI("Enviar", codigoLang);
    btnVolverPublico.textContent = await traducirTextoUI("Volver a Sala Pública", codigoLang);

    const textoUsuarios = await traducirTextoUI("Usuarios", codigoLang);
    btnMenu.textContent = `👥 ${textoUsuarios}`;

    const sidebarTitle = document.querySelector(".barra-lateral h3");
    if (sidebarTitle) {
        sidebarTitle.textContent = await traducirTextoUI("Conectados", codigoLang);
    }
}

async function cargarIdiomasDesdeServidor() {
    try {
        const response = await fetch(`http://${host}:3000/api/languages`);
        const idiomas = await response.json();
        idiomaInput.innerHTML = "";
        idiomas.forEach(idioma => {
            const option = document.createElement("option");
            option.value = idioma.code;
            option.textContent = idioma.name.charAt(0).toUpperCase() + idioma.name.slice(1);
            if (idioma.code === "es") option.selected = true;
            idiomaInput.appendChild(option);
        });
    } catch (error) {
        console.error("No se pudieron obtener los idiomas:", error);
        idiomaInput.innerHTML = `
            <option value="es" selected>Español (es)</option>
            <option value="en">Inglés (en)</option>
        `;
    }
}

cargarIdiomasDesdeServidor();

// ─── LOGIN ────────────────────────────────────────────────────────────────────

btnEntrar.addEventListener("click", async () => {
    const nickname = nicknameInput.value.trim();
    const idiomaSeleccionado = idiomaInput.value;

    if (nickname !== "") {
        miNickname = nickname;
        miIdioma = idiomaSeleccionado;

        btnEntrar.disabled = true;
        await aplicarIdiomaInterfazDinamico(miIdioma);

        modalLogin.style.display = "none";
        texto.disabled = false;
        btnEnviar.disabled = false;

        socket.send(JSON.stringify({
            type: "register",
            nickname: miNickname,
            lang: miIdioma
        }));
    }
});

// ─── RECEPCIÓN DE MENSAJES ────────────────────────────────────────────────────

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
        case "history":
            data.history.forEach(msg => {
                historialPublico.push(msg);
                if (chatActual === "publico") {
                    agregarMensajeDOM(msg.from, msg.text, msg.time);
                }
            });
            break;

        case "system":
            if (chatActual === "publico") {
                agregarAlertaSistemaDOM(data.text);
            }
            break;

        case "user-list":
            renderizarListaUsuarios(data.users);
            break;

        case "public":
            historialPublico.push(data);
            if (chatActual === "publico") {
                agregarMensajeDOM(data.from, data.text, data.time);
            }
            break;

        case "private":
            recibirMensajePrivado(data);
            break;

        case "typing":
            if (chatActual === "publico" && !data.isPrivate) {
                manejarIndicadorEscribiendo(data);
            } else if (chatActual === data.fromId && data.isPrivate) {
                manejarIndicadorEscribiendo(data);
            }
            break;
    }
};

function manejarIndicadorEscribiendo(data) {
    if (data.isTyping) {
        traducirTextoUI("está escribiendo...", miIdioma).then(textoTraducido => {
            indicadorEscribiendo.textContent = `${data.from} ${textoTraducido}`;
        });
    } else {
        indicadorEscribiendo.textContent = "";
    }
}

// ─── GESTIÓN DE CHATS (UNIFICADO) ─────────────────────────────────────────────

function recibirMensajePrivado(data) {
    const otroId = (data.fromId === socket.id || data.from === miNickname) ? data.toId : data.fromId;
    if (!otroId) return;

    if (!historialPrivado[otroId]) historialPrivado[otroId] = [];
    historialPrivado[otroId].push({ from: data.from, text: data.text, time: data.time });

    if (chatActual === otroId) {
        agregarMensajeDOM(data.from, data.text, data.time);
    } else {
        if (!noLeidos[otroId]) noLeidos[otroId] = 0;
        noLeidos[otroId]++;
        actualizarBadgeUsuario(otroId);
    }
}

function cambiarChatAPrivado(usuario) {
    chatActual = usuario.id;
    objetivoPrivado = { id: usuario.id, nickname: usuario.nickname };

    noLeidos[usuario.id] = 0;
    actualizarBadgeUsuario(usuario.id);

    chatTitulo.textContent = `💬 ${usuario.nickname}`;
    btnVolverPublico.style.display = "block"; 
    mensajes.innerHTML = "";
    indicadorEscribiendo.textContent = "";

    if (historialPrivado[usuario.id]) {
        historialPrivado[usuario.id].forEach(msg => {
            agregarMensajeDOM(msg.from, msg.text, msg.time);
        });
    }

    texto.focus();
    barraLateral.classList.remove("activo");
}

btnVolverPublico.addEventListener("click", () => {
    chatActual = "publico";
    objetivoPrivado = null;

    chatTitulo.textContent = "Sala Pública";
    btnVolverPublico.style.display = "none"; 
    mensajes.innerHTML = "";
    indicadorEscribiendo.textContent = "";

    historialPublico.forEach(msg => {
        agregarMensajeDOM(msg.from, msg.text, msg.time);
    });

    texto.focus();
});

// ─── ENVÍO DE MENSAJES ────────────────────────────────────────────────────────

function enviarMensaje() {
    const mensajeTexto = texto.value.trim();
    if (!mensajeTexto) return;

    if (chatActual === "publico") {
        socket.send(JSON.stringify({
            type: "public",
            text: mensajeTexto
        }));
    } else if (objetivoPrivado) {
        socket.send(JSON.stringify({
            type: "private",
            to: objetivoPrivado.id,
            text: mensajeTexto
        }));

        if (!historialPrivado[objetivoPrivado.id]) historialPrivado[objetivoPrivado.id] = [];
        const ahora = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        historialPrivado[objetivoPrivado.id].push({ from: miNickname, text: mensajeTexto, time: ahora });
        agregarMensajeDOM(miNickname, mensajeTexto, ahora);
    }

    texto.value = "";
    texto.focus();
}

btnEnviar.addEventListener("click", enviarMensaje);
texto.addEventListener("keydown", (e) => {
    if (e.key === "Enter") enviarMensaje();
});

// ─── RENDERS Y DOM AUXILIARES ─────────────────────────────────────────────────

function agregarMensajeDOM(from, text, time) {
    const div = document.createElement("div");
    div.classList.add("mensaje");
    if (from === miNickname) div.classList.add("mio");

    div.innerHTML = `<strong>${from}</strong> <span>${time}</span><p>${text}</p>`;
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
}

function agregarAlertaSistemaDOM(text) {
    const div = document.createElement("div");
    div.classList.add("mensaje", "sistema");
    div.innerHTML = `<em>${text}</em>`;
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
}

function renderizarListaUsuarios(usuarios) {
    listaUsuarios.innerHTML = "";
    usuarios.forEach(u => {
        if (u.nickname === miNickname) return; // No listarte a ti mismo

        const li = document.createElement("li");
        li.dataset.id = u.id;
        li.style.cursor = "pointer";
        
        const count = noLeidos[u.id] || 0;
        const badgeHtml = count > 0 ? `<span class="badge-usuario" style="background:red;color:white;padding:2px 6px;border-radius:50%;font-size:0.8rem;margin-left:8px;">${count}</span>` : "";

        li.innerHTML = `👤 ${u.nickname} ${badgeHtml}`;
        
        // Al dar clic, cambia el chat central al privado de este usuario
        li.addEventListener("click", () => cambiarChatAPrivado(u));
        listaUsuarios.appendChild(li);
    });
}

function actualizarBadgeUsuario(userId) {
    const li = listaUsuarios.querySelector(`li[data-id="${userId}"]`);
    if (!li) return;
    
    const count = noLeidos[userId] || 0;
    let badge = li.querySelector(".badge-usuario");
    
    if (count > 0) {
        if (!badge) {
            badge = document.createElement("span");
            badge.classList.add("badge-usuario");
            badge.style.cssText = "background:red;color:white;padding:2px 6px;border-radius:50%;font-size:0.8rem;margin-left:8px;";
            li.appendChild(badge);
        }
        badge.textContent = count;
    } else if (badge) {
        badge.remove();
    }
}

// Menú Móvil
if (btnMenu) {
    btnMenu.addEventListener("click", () => {
        barraLateral.classList.toggle("activo");
    });
}
