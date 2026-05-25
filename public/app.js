/* ── CONEXIÓN WEBSOCKET ─────────────────────────────────────────────────── */

const host   = window.location.hostname;
const socket = new WebSocket(`ws://${host}:3000`);

/* ── ELEMENTOS DEL DOM ──────────────────────────────────────────────────── */

/* ── ELEMENTOS DEL DOM ──────────────────────────────────────────────────── */

const $ = id => document.getElementById(id);

// Elementos de Canales (Agrupados y limpios)
const btnCrearCanal         = $("btn-crear-canal");
const contenedorCrearCanal = $("contenedor-crear-canal");
const inputNombreCanal     = $("input-nombre-canal");
const btnConfirmarCrear    = $("btn-confirmar-crear");
const btnCancelarCrear     = $("btn-cancelar-crear");

// Resto de componentes de la interfaz
const modalLogin        = $("modal-login");
const nicknameInput     = $("nickname-input");
const idiomaInput       = $("idioma-input");
const btnEntrar         = $("btnEntrar");
const mensajes          = $("mensajes");
const texto             = $("texto");
const btnEnviar         = $("btnEnviar");
const listaUsuarios     = $("lista-usuarios");
const listaCanales      = $("lista-canales");
const chatTitulo        = $("chat-titulo");
const btnVolverPublico  = $("btn-volver-publico");
const indicadorTyping   = $("indicador-escribiendo");
const btnMenu           = $("btn-menu");
const barraLateral      = document.querySelector(".barra-lateral");
const zonaChatEl        = $("zona-chat");



/* ── ESTADO DE LA APLICACIÓN ────────────────────────────────────────────── */

let miNickname = "";
let miId       = "";   // asignado al hacer register (vía user-list)
let miIdioma   = "es";

// Vista activa: "publico" | "privado:<userId>" | "canal:<canalId>"
let vistaActual = "publico";

// Historiales en memoria para cambiar de vista sin perder mensajes
const historiales = {
    publico: [],      // array de mensajes
};

// No-leídos: { [vistaKey]: número }
const noLeidos = {};

// Datos de canales: Map<canalId, { id, nombre, creadorId }>
const canalesInfo = new Map();

/* ── TRADUCCIÓN DE INTERFAZ ─────────────────────────────────────────────── */

// Diccionario de textos en español que se traducen al cambiar idioma
const TEXTOS_UI = {
    "sala-publica":         "Sala Pública",
    "escribe-mensaje":      "Escribe un mensaje aquí...",
    "enviar":               "Enviar",
    "volver-publico":       "Volver a Sala Pública",
    "conectados":           "Conectados",
    "canales":              "Canales",
    "crear-canal":          "＋ Crear Canal",
    "menu-usuarios":        "Menú",
    "solo-lectura":         "Solo lectura (no eres el creador)",
    "esta-escribiendo":     "está escribiendo...",
};

// Cache para no repetir peticiones al servidor por el mismo texto
const cacheTraduccion = {};

// Traduce un texto estático de la UI al idioma indicado
async function t(clave) {
    if (miIdioma === "es") return TEXTOS_UI[clave];
    const cacheKey = `${clave}:${miIdioma}`;
    if (cacheTraduccion[cacheKey]) return cacheTraduccion[cacheKey];

    try {
        const res  = await fetch(`http://${host}:3000/api/translate-ui`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ text: TEXTOS_UI[clave], target: miIdioma }),
        });
        const data = await res.json();
        cacheTraduccion[cacheKey] = data.translatedText || TEXTOS_UI[clave];
        return cacheTraduccion[cacheKey];
    } catch {
        return TEXTOS_UI[clave];
    }
}

// Actualiza todos los textos traducibles de la interfaz a la vez
async function aplicarIdiomaUI() {
    texto.placeholder          = await t("escribe-mensaje");
    btnEnviar.textContent      = await t("enviar");
    btnVolverPublico.textContent = await t("volver-publico");
    btnCrearCanal.textContent  = await t("crear-canal");
    btnMenu.textContent        = `${await t("menu-usuarios")}`;
    $("titulo-conectados").textContent = await t("conectados");
    $("titulo-canales").textContent    = await t("canales");

    // Si estamos en la sala pública, actualiza también el título
    if (vistaActual === "publico")
        chatTitulo.textContent = await t("sala-publica");

    // Si estamos en un canal de solo lectura, actualiza el placeholder
    if (vistaActual.startsWith("canal:")) actualizarInputCanal();
}

/* ── CARGA DE IDIOMAS ───────────────────────────────────────────────────── */

async function cargarIdiomas() {
    try {
        const res     = await fetch(`http://${host}:3000/api/languages`);
        const idiomas = await res.json();
        idiomaInput.innerHTML = "";
        idiomas.forEach(lang => {
            const opt = document.createElement("option");
            opt.value       = lang.code;
            opt.textContent = lang.name.charAt(0).toUpperCase() + lang.name.slice(1);
            if (lang.code === "es") opt.selected = true;
            idiomaInput.appendChild(opt);
        });
    } catch {
        // Fallback si LibreTranslate no responde al cargar
        idiomaInput.innerHTML = `
            <option value="es" selected>Español</option>
            <option value="en">English</option>
            <option value="fr">Français</option>
        `;
    }
}

cargarIdiomas();

/* ── LOGIN ──────────────────────────────────────────────────────────────── */

btnEntrar.addEventListener("click", async () => {
    const nick = nicknameInput.value.trim();
    if (!nick) return;

    miNickname = nick;
    miIdioma   = idiomaInput.value;

    btnEntrar.disabled = true;
    await aplicarIdiomaUI();

    modalLogin.style.display = "none";
    texto.disabled           = false;
    btnEnviar.disabled       = false;

    socket.send(JSON.stringify({ type: "register", nickname: miNickname, lang: miIdioma }));
});

/* ── RECEPCIÓN DE MENSAJES WS ───────────────────────────────────────────── */
socket.onmessage = async ({ data }) => { 
    const msg = JSON.parse(data);

    const handlers = {
        // CORRECCIÓN: Ahora el historial también espera su traducción
        history:       async () => await recibirHistorial(msg),
        system:        () => recibirSistema(msg),
        "user-list":   () => renderizarUsuarios(msg.users),
        "channel-list":() => renderizarCanales(msg.channels),
        public:        async () => await recibirPublico(msg),
        private:       async () => await recibirPrivado(msg), 
        "channel-msg": async () => await recibirMensajeCanal(msg), 
        typing:        () => recibirTyping(msg),
    };

    if (handlers[msg.type]) await handlers[msg.type](); 
};



// Historial inicial de la sala pública al conectarse (Traducido)
async function recibirHistorial({ history }) {
    // Traduce todos los mensajes viejos en paralelo
    const historialTraducido = await Promise.all(
        history.map(async (msg) => {
            const textoTraducido = await traducirTextoDinamico(msg.text, miIdioma);
            return { ...msg, text: textoTraducido };
        })
    );

    // Guarda e inserta cada mensaje ya traducido en la pantalla
    historialTraducido.forEach(msg => {
        historiales.publico.push(msg);
        if (vistaActual === "publico") {
            agregarMensaje(msg.from, msg.text, msg.time);
        }
    });
}

function recibirSistema({ text }) {
    if (vistaActual === "publico") agregarSistema(text);
}

async function recibirPublico(msg) {
    const textoTraducido = await traducirTextoDinamico(msg.text, miIdioma);
    const mensajeConTraduccion = { ...msg, text: textoTraducido };

    historiales.publico.push(mensajeConTraduccion);
    if (vistaActual === "publico") {
        agregarMensaje(mensajeConTraduccion.from, mensajeConTraduccion.text, mensajeConTraduccion.time);
    }
}


// Mensaje privado: traduce, guarda en historial y muestra badge si no está activa esa vista
async function recibirPrivado(msg) {
    const key = `privado:${msg.fromId}`;
    if (!historiales[key]) historiales[key] = [];

    // 1. Traducir el mensaje privado al idioma configurado por el usuario
    const textoTraducido = await traducirTextoDinamico(msg.text, miIdioma);
    msg.text = textoTraducido;

    // 2. Guardar el mensaje traducido en el historial
    historiales[key].push(msg);

    if (vistaActual === key) {
        agregarMensaje(msg.from, msg.text, msg.time);
    } else {
        noLeidos[key] = (noLeidos[key] || 0) + 1;
        actualizarBadgeUsuario(msg.fromId);
    }
}


// Mensaje de canal: guarda en historial y muestra badge si no es la vista activa
// Modifica la función de canales para que sea ASYNC
async function recibirMensajeCanal(msg) {
    const key = `canal:${msg.canalId}`;
    if (!historiales[key]) historiales[key] = [];

    // Traducir el contenido del mensaje al idioma del usuario actual (miIdioma)
    const textoTraducido = await traducirTextoDinamico(msg.text, miIdioma);
    
    // Reemplazamos el texto original por el traducido para este cliente
    const mensajeConTraduccion = { ...msg, text: textoTraducido };

    historiales[key].push(mensajeConTraduccion);

    if (vistaActual === key) {
        agregarMensaje(mensajeConTraduccion.from, mensajeConTraduccion.text, mensajeConTraduccion.time);
    } else {
        noLeidos[key] = (noLeidos[key] || 0) + 1;
        actualizarBadgeCanal(msg.canalId);
    }
}



// Traduce un mensaje dinámico en tiempo real usando tu API existente
async function traducirTextoDinamico(texto, idiomaDestino) {
    if (idiomaDestino === "es") return texto; // Si el destino es español, se queda igual (o el idioma base)
    
    try {
        const res = await fetch(`http://${host}:3000/api/translate-ui`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: texto, target: idiomaDestino }),
        });
        const data = await res.json();
        return data.translatedText || texto;
    } catch {
        return texto; // Fallback si falla el servidor de traducción
    }
}


// Indicador "está escribiendo": solo se muestra en la vista correspondiente
function recibirTyping(msg) {
    if (vistaActual !== "publico") return;
    if (msg.isTyping) {
        t("esta-escribiendo").then(txt => {
            indicadorTyping.textContent = `${msg.from} ${txt}`;
        });
    } else {
        indicadorTyping.textContent = "";
    }
}

/* ── CANALES ────────────────────────────────────────────────────────────── */

// Actualiza el mapa local de canales y redibuja la lista en la barra lateral
function renderizarCanales(channels) {
    canalesInfo.clear();
    channels.forEach(c => canalesInfo.set(c.id, c));

    listaCanales.innerHTML = "";
    channels.forEach(c => {
        const li = document.createElement("li");
        li.dataset.id = c.id;

        const esMiCanal = c.creadorId === miId;
        const badge     = noLeidos[`canal:${c.id}`] || 0;
        const badgeHtml = badge > 0 ? `<span class="badge-usuario">${badge}</span>` : "";

        // Icono de corona para el creador, antena para los demás
        li.innerHTML = `${esMiCanal ? "(D)" : "(C)"} ${c.nombre} ${badgeHtml}`;
        li.addEventListener("click", () => abrirCanal(c.id));
        listaCanales.appendChild(li);
    });
}

// Cambia la vista al canal indicado y carga su historial
function abrirCanal(canalId) {
    const key = `canal:${canalId}`;
    vistaActual = key;

    const canal = canalesInfo.get(canalId);
    chatTitulo.textContent = `${canal.nombre}`;
    btnVolverPublico.style.display = "block";
    mensajes.innerHTML = "";
    indicadorTyping.textContent = "";

    // Muestra historial del canal si ya hay mensajes previos
    (historiales[key] || []).forEach(msg => agregarMensaje(msg.from, msg.text, msg.time));

    // Limpia badge del canal
    noLeidos[key] = 0;
    actualizarBadgeCanal(canalId);

    actualizarInputCanal();
    barraLateral.classList.remove("activo");
    texto.focus();
}

// Habilita o deshabilita el input según si el usuario es creador del canal activo
async function actualizarInputCanal() {
    if (!vistaActual.startsWith("canal:")) return;

    const canalId = vistaActual.split(":")[1];
    const canal   = canalesInfo.get(canalId);
    const esMio   = canal && canal.creadorId === miId;

    texto.disabled    = !esMio;
    btnEnviar.disabled = !esMio;
    texto.placeholder = esMio
        ? await t("escribe-mensaje")
        : await t("solo-lectura");
}

// Mostrar el input al hacer clic
btnCrearCanal.addEventListener("click", () => { contenedorCrearCanal.style.display = "block"; inputNombreCanal.focus(); });

// Función única para cerrar y limpiar
const cerrarCanal = () => { inputNombreCanal.value = ""; contenedorCrearCanal.style.display = "none"; };

// Cancelar
btnCancelarCrear.addEventListener("click", cerrarCanal);

// Confirmar y enviar
btnConfirmarCrear.addEventListener("click", () => {
    const nombre = inputNombreCanal.value.trim();
    if (!nombre) return;
    socket.send(JSON.stringify({ type: "channel-create", nombre }));
    cerrarCanal();
});


/* ── USUARIOS ───────────────────────────────────────────────────────────── */

// Renderiza la lista lateral de usuarios conectados (sin mostrarse a sí mismo)
function renderizarUsuarios(users) {
    // Detecta el propio ID al recibirlo la primera vez
    if (!miId) {
        const yo = users.find(u => u.nickname === miNickname);
        if (yo) miId = yo.id;
    }

    listaUsuarios.innerHTML = "";
    users.forEach(u => {
        if (u.nickname === miNickname) return;

        const li    = document.createElement("li");
        li.dataset.id = u.id;
        const badge = noLeidos[`privado:${u.id}`] || 0;
        const badgeHtml = badge > 0 ? `<span class="badge-usuario">${badge}</span>` : "";

        li.innerHTML = `${u.nickname} ${badgeHtml}`;
        li.addEventListener("click", () => abrirPrivado(u));
        listaUsuarios.appendChild(li);
    });
}

// Cambia la vista al chat privado con el usuario indicado
function abrirPrivado(usuario) {
    const key = `privado:${usuario.id}`;
    vistaActual = key;

    chatTitulo.textContent    = `${usuario.nickname}`;
    btnVolverPublico.style.display = "block";
    mensajes.innerHTML        = "";
    indicadorTyping.textContent = "";
    texto.disabled            = false;
    btnEnviar.disabled        = false;
    texto.placeholder         = TEXTOS_UI["escribe-mensaje"]; // no requiere traducción aquí

    // Limpia badge y muestra historial acumulado
    noLeidos[key] = 0;
    actualizarBadgeUsuario(usuario.id);
    (historiales[key] || []).forEach(msg => agregarMensaje(msg.from, msg.text, msg.time));

    barraLateral.classList.remove("activo");
    texto.focus();
}

function actualizarBadgeUsuario(userId) {
    const li = listaUsuarios.querySelector(`li[data-id="${userId}"]`);
    if (!li) return;
    actualizarBadgeEnLi(li, noLeidos[`privado:${userId}`] || 0);
}

function actualizarBadgeCanal(canalId) {
    const li = listaCanales.querySelector(`li[data-id="${canalId}"]`);
    if (!li) return;
    actualizarBadgeEnLi(li, noLeidos[`canal:${canalId}`] || 0);
}

// Añade o quita el badge de notificación de un <li>
function actualizarBadgeEnLi(li, count) {
    let badge = li.querySelector(".badge-usuario");
    if (count > 0) {
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "badge-usuario";
            li.appendChild(badge);
        }
        badge.textContent = count;
    } else if (badge) {
        badge.remove();
    }
}

/* ── VOLVER A SALA PÚBLICA ──────────────────────────────────────────────── */

btnVolverPublico.addEventListener("click", async () => {
    vistaActual = "publico";
    chatTitulo.textContent         = await t("sala-publica");
    btnVolverPublico.style.display = "none";
    mensajes.innerHTML             = "";
    indicadorTyping.textContent    = "";
    texto.disabled                 = false;
    btnEnviar.disabled             = false;
    texto.placeholder              = await t("escribe-mensaje");

    historiales.publico.forEach(msg => agregarMensaje(msg.from, msg.text, msg.time));
    texto.focus();
});

/* ── ENVÍO DE MENSAJES ──────────────────────────────────────────────────── */

// Despacha el mensaje al tipo correcto según la vista activa
function enviarMensaje() {
    const contenido = texto.value.trim();
    if (!contenido) return;

    if (vistaActual === "publico") {
        socket.send(JSON.stringify({ type: "public", text: contenido }));

    } else if (vistaActual.startsWith("privado:")) {
        const toId = vistaActual.split(":")[1];
        socket.send(JSON.stringify({ type: "private", to: toId, text: contenido }));

        // El remitente ve su propio mensaje de inmediato (sin round-trip)
        const key = `privado:${toId}`;
        const hora = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        if (!historiales[key]) historiales[key] = [];
        historiales[key].push({ from: miNickname, text: contenido, time: hora });
        agregarMensaje(miNickname, contenido, hora);

    } else if (vistaActual.startsWith("canal:")) {
        const canalId = vistaActual.split(":")[1];
        socket.send(JSON.stringify({ type: "channel-msg", canalId, text: contenido }));
    }

    texto.value = "";
    texto.focus();
}

btnEnviar.addEventListener("click", enviarMensaje);
texto.addEventListener("keydown", e => { if (e.key === "Enter") enviarMensaje(); });

// Indicador de escritura solo activo en sala pública
let timerTyping = null;
texto.addEventListener("input", () => {
    if (vistaActual !== "publico") return;
    socket.send(JSON.stringify({ type: "typing", isTyping: true }));
    clearTimeout(timerTyping);
    timerTyping = setTimeout(() => {
        socket.send(JSON.stringify({ type: "typing", isTyping: false }));
    }, 1500);
});

/* ── RENDER DOM ─────────────────────────────────────────────────────────── */

// Agrega un globo de mensaje a la ventana principal
function agregarMensaje(from, text, time) {
    const div = document.createElement("div");
    div.classList.add("mensaje");
    if (from === miNickname) div.classList.add("mio");
    div.innerHTML = `<strong>${from}</strong> <span>${time}</span><p>${text}</p>`;
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
}

// Agrega un aviso de sistema (entradas/salidas)
function agregarSistema(text) {
    const div = document.createElement("div");
    div.classList.add("mensaje", "sistema");
    div.innerHTML = `<em>${text}</em>`;
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
}

/* ── MENÚ MÓVIL ─────────────────────────────────────────────────────────── */

btnMenu.addEventListener("click", () => barraLateral.classList.toggle("activo"));
