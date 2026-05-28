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
const listaMiembros = $("lista-miembros");
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
let usuariosConectados = [];
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

    listaCanales.innerHTML = "";

    channels.forEach(c => {

        // SOLO SI PERTENECE AL GRUPO
        if (!c.miembros.includes(miId)) return;

        canalesInfo.set(c.id, c);

        const li = document.createElement("li");

        li.dataset.id = c.id;

        const esMiCanal = c.creadorId === miId;

        const badge = noLeidos[`canal:${c.id}`] || 0;

        const badgeHtml =
            badge > 0
                ? `<span class="badge-usuario">${badge}</span>`
                : "";

        li.innerHTML = `
            ${esMiCanal ? "(👑)" : "(👥)"}
            ${c.nombre}
            ${badgeHtml}
        `;

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
    const soyMiembro = canal && canal.miembros.includes(miId);

    texto.disabled = !soyMiembro;
    btnEnviar.disabled = !soyMiembro;

    texto.placeholder = soyMiembro
        ? await t("escribe-mensaje")
        : await t("solo-lectura");
}

// Mostrar el input al hacer clic
btnCrearCanal.addEventListener("click", () => {

    contenedorCrearCanal.style.display = "block";
    inputNombreCanal.focus();

    // fuerza actualización SIEMPRE
    renderizarSeleccionUsuarios(usuariosConectados);
});
// Función única para cerrar y limpiar
const cerrarCanal = () => { inputNombreCanal.value = ""; contenedorCrearCanal.style.display = "none"; };

// Cancelar
btnCancelarCrear.addEventListener("click", cerrarCanal);

// Confirmar y enviar
btnConfirmarCrear.addEventListener("click", () => {

    const nombre = inputNombreCanal.value.trim();

    if (!nombre) return;

    const miembros = [
        ...listaMiembros.querySelectorAll("input:checked")
    ].map(input => input.value);

    socket.send(JSON.stringify({
        type: "channel-create",
        nombre,
        miembros
    }));

    cerrarCanal();
});


/* ── USUARIOS ───────────────────────────────────────────────────────────── */

// Renderiza la lista lateral de usuarios conectados (sin mostrarse a sí mismo)
function renderizarUsuarios(users) {

    // 1. Detectar ID primero (ANTES de todo)
    if (!miId) {
        const yo = users.find(u => u.nickname === miNickname);
        if (yo) miId = yo.id;
    }

    usuariosConectados = users;

    // 2. Ahora sí renderiza todo
    renderizarSeleccionUsuarios(users);

    listaUsuarios.innerHTML = "";

    users.forEach(u => {
        if (u.nickname === miNickname) return;

        const li = document.createElement("li");
        li.dataset.id = u.id;

        const badge = noLeidos[`privado:${u.id}`] || 0;
        const badgeHtml = badge > 0
            ? `<span class="badge-usuario">${badge}</span>`
            : "";

        li.innerHTML = `${u.nickname} ${badgeHtml}`;
        li.addEventListener("click", () => abrirPrivado(u));

        listaUsuarios.appendChild(li);
    });
}

function renderizarSeleccionUsuarios(users) {

    if (!listaMiembros) return;

    listaMiembros.innerHTML = "";

    users.forEach(u => {

        // no mostrarme a mí mismo
        if (u.nickname === miNickname) return;

        const div = document.createElement("div");

        div.className = "miembro-item";

        div.innerHTML = `
            <label class="miembro-label">
                <input type="checkbox" value="${u.id}">
                <span>${u.nickname}</span>
            </label>
        `;

        listaMiembros.appendChild(div);
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
    div.innerHTML = `<strong>${from}</strong> <p>${text}</p> <span>${time}</span>`;
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

/* ── PERSONALIZACIÓN DE FONDO ──────────────────────────────────────────── */

const btnFondo           = $("btn-fondo");
const panelFondo         = $("panel-fondo");
const btnCerrarPanelFondo = $("btn-cerrar-panel-fondo");
const fondoColor         = $("fondo-color");
const fondoGrad1         = $("fondo-grad-1");
const fondoGrad2         = $("fondo-grad-2");
const btnAplicarDegradado = $("btn-aplicar-degradado");
const fondoUrl           = $("fondo-url");
const btnAplicarUrl      = $("btn-aplicar-url");
const fondoArchivo       = $("fondo-archivo");
const btnRestaurarFondo  = $("btn-restaurar-fondo");
const cajaMensajes       = $("mensajes");

const FONDO_KEY = "chat_fondo_config";
const FONDO_DEFAULT = { tipo: "color", valor: "#f4f6f8" };

// Aplica la configuración de fondo al contenedor de mensajes
function aplicarFondo(config) {
    cajaMensajes.style.backgroundImage = "";
    cajaMensajes.style.backgroundSize  = "";
    cajaMensajes.style.backgroundPosition = "";
    cajaMensajes.style.backgroundRepeat = "";

    if (config.tipo === "color") {
        cajaMensajes.style.background = config.valor;
    } else if (config.tipo === "degradado") {
        cajaMensajes.style.background = `linear-gradient(135deg, ${config.valor}, ${config.valor2})`;
    } else if (config.tipo === "imagen") {
        cajaMensajes.style.background = "#f4f6f8";
        cajaMensajes.style.backgroundImage = `url("${config.valor}")`;
        cajaMensajes.style.backgroundSize = "cover";
        cajaMensajes.style.backgroundPosition = "center";
        cajaMensajes.style.backgroundRepeat = "no-repeat";
    }
}

// Guarda y aplica una configuración
function guardarYAplicarFondo(config) {
    try {
        // Las imágenes en base64 pueden ser muy grandes para localStorage;
        // se guardan igual pero solo si el navegador lo permite.
        localStorage.setItem(FONDO_KEY, JSON.stringify(config));
    } catch (_) { /* cuota superada — se aplica sin guardar */ }
    aplicarFondo(config);
}

// Carga el fondo guardado al iniciar
function cargarFondoGuardado() {
    try {
        const raw = localStorage.getItem(FONDO_KEY);
        const config = raw ? JSON.parse(raw) : FONDO_DEFAULT;
        aplicarFondo(config);
        // Sincronizar los controles visuales
        if (config.tipo === "color")     fondoColor.value  = config.valor;
        if (config.tipo === "degradado") { fondoGrad1.value = config.valor; fondoGrad2.value = config.valor2; }
    } catch (_) {
        aplicarFondo(FONDO_DEFAULT);
    }
}

// Abrir/cerrar panel
btnFondo.addEventListener("click", (e) => {
    e.stopPropagation();
    panelFondo.classList.toggle("oculto");
});

btnCerrarPanelFondo.addEventListener("click", () => {
    panelFondo.classList.add("oculto");
});

// Cerrar al hacer clic fuera
document.addEventListener("click", (e) => {
    if (!panelFondo.contains(e.target) && e.target !== btnFondo) {
        panelFondo.classList.add("oculto");
    }
});

// Color sólido — aplica en tiempo real mientras el usuario arrastra el picker
fondoColor.addEventListener("input", () => {
    guardarYAplicarFondo({ tipo: "color", valor: fondoColor.value });
});

// Degradado
btnAplicarDegradado.addEventListener("click", () => {
    guardarYAplicarFondo({ tipo: "degradado", valor: fondoGrad1.value, valor2: fondoGrad2.value });
});

// También actualiza el preview del degradado en tiempo real
fondoGrad1.addEventListener("input", () => {
    cajaMensajes.style.background = `linear-gradient(135deg, ${fondoGrad1.value}, ${fondoGrad2.value})`;
});
fondoGrad2.addEventListener("input", () => {
    cajaMensajes.style.background = `linear-gradient(135deg, ${fondoGrad1.value}, ${fondoGrad2.value})`;
});

// URL de imagen
btnAplicarUrl.addEventListener("click", () => {
    const url = fondoUrl.value.trim();
    if (!url) return;
    guardarYAplicarFondo({ tipo: "imagen", valor: url });
});

fondoUrl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnAplicarUrl.click();
});

// Subir imagen local — convierte a base64
fondoArchivo.addEventListener("change", () => {
    const file = fondoArchivo.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        guardarYAplicarFondo({ tipo: "imagen", valor: e.target.result });
    };
    reader.readAsDataURL(file);
});

// Restaurar fondo predeterminado
btnRestaurarFondo.addEventListener("click", () => {
    fondoColor.value = FONDO_DEFAULT.valor;
    localStorage.removeItem(FONDO_KEY);
    aplicarFondo(FONDO_DEFAULT);
});

// Inicializar al cargar la página
cargarFondoGuardado();
