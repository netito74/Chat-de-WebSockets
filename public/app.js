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

    // Cargar el fondo personalizado de este usuario (ahora que miNickname está disponible)
    cargarFondoGuardado();
});

/* ── RECEPCIÓN DE MENSAJES WS ───────────────────────────────────────────── */
socket.onmessage = async ({ data }) => { 
    const msg = JSON.parse(data);

    const handlers = {
        history:          async () => await recibirHistorial(msg),
        system:           () => recibirSistema(msg),
        "user-list":      () => renderizarUsuarios(msg.users),
        "channel-list":   () => renderizarCanales(msg.channels),
        "channel-deleted":() => recibirCanalEliminado(msg),
        public:           async () => await recibirPublico(msg),
        private:          async () => await recibirPrivado(msg),
        "channel-msg":    async () => await recibirMensajeCanal(msg),
        typing:           () => recibirTyping(msg),
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



// Canal eliminado por su creador: limpia estado local y redirige si es necesario
async function recibirCanalEliminado({ canalId, nombre }) {
    const key = `canal:${canalId}`;

    // Si el usuario estaba dentro del canal eliminado → redirigir
    if (vistaActual === key) {
        await irASalaPublica();
        mostrarToast(`El canal «${nombre}» fue eliminado`, "warn", 5000);
    }

    // Limpiar estado local independientemente de dónde estuviera el usuario
    canalesInfo.delete(canalId);
    delete historiales[key];
    delete noLeidos[key];
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

    // Si estamos viendo un canal, actualizar botón y panel de miembros
    actualizarBotonGestionar();
    if (!panelMiembros.classList.contains("oculto")) {
        renderizarPanelMiembros();
    }
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
    actualizarBotonGestionar();
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
    await irASalaPublica();
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

const fondoKeyUsuario = () => `chat_fondo_config_${miNickname || "default"}`;
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
        localStorage.setItem(fondoKeyUsuario(), JSON.stringify(config));
    } catch (_) { /* cuota superada — se aplica sin guardar */ }
    aplicarFondo(config);
}

// Carga el fondo guardado — llamar DESPUÉS de que miNickname esté seteado
function cargarFondoGuardado() {
    try {
        const raw = localStorage.getItem(fondoKeyUsuario());
        const config = raw ? JSON.parse(raw) : FONDO_DEFAULT;
        aplicarFondo(config);
        if (config.tipo === "color")     fondoColor.value  = config.valor;
        if (config.tipo === "degradado") { fondoGrad1.value = config.valor; fondoGrad2.value = config.valor2; }
    } catch (_) {
        aplicarFondo(FONDO_DEFAULT);
    }
}

// Delegado al PanelManager (definido al final del archivo)
btnFondo.addEventListener("click", (e) => { e.stopPropagation(); PanelManager.toggle("fondo"); });
btnCerrarPanelFondo.addEventListener("click", () => PanelManager.cerrar("fondo"));

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
    localStorage.removeItem(fondoKeyUsuario());
    aplicarFondo(FONDO_DEFAULT);
});

// NO se llama cargarFondoGuardado() aquí — se llama tras el login para usar el nick correcto

/* ── GESTIÓN DE MIEMBROS (solo creador del canal) ─────────────────────── */

const btnGestionarMiembros    = $("btn-gestionar-miembros");
const panelMiembros           = $("panel-miembros");
const btnCerrarPanelMiembros  = $("btn-cerrar-panel-miembros");
const listaAddMiembros        = $("lista-add-miembros");
const listaMiembrosActuales   = $("lista-miembros-actuales");

// Muestra u oculta el botón de gestión según si somos creadores del canal activo
function actualizarBotonGestionar() {
    if (!vistaActual.startsWith("canal:")) {
        btnGestionarMiembros.style.display = "none";
        return;
    }
    const canalId = vistaActual.split(":")[1];
    const canal   = canalesInfo.get(canalId);
    btnGestionarMiembros.style.display =
        canal && canal.creadorId === miId ? "inline-flex" : "none";
}

// Renderiza el panel: usuarios a añadir y miembros actuales con botón de eliminar
function renderizarPanelMiembros() {
    if (!vistaActual.startsWith("canal:")) return;
    const canalId = vistaActual.split(":")[1];
    const canal   = canalesInfo.get(canalId);
    if (!canal || canal.creadorId !== miId) return;

    // — Sección "Añadir" (usuarios que NO son miembros aún)
    listaAddMiembros.innerHTML = "";
    const noMiembros = usuariosConectados.filter(
        u => u.id !== miId && !canal.miembros.includes(u.id)
    );
    if (noMiembros.length === 0) {
        listaAddMiembros.innerHTML = "<em style='opacity:.6;font-size:.85em'>Todos los usuarios ya son miembros</em>";
    } else {
        noMiembros.forEach(u => {
            const div = document.createElement("div");
            div.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:4px 0;";
            div.innerHTML = `
                <span>${u.nickname}</span>
                <button data-uid="${u.id}" class="btn-add-miembro" style="background:#4caf50;color:#fff;border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:.8em;">＋ Añadir</button>
            `;
            listaAddMiembros.appendChild(div);
        });
        listaAddMiembros.querySelectorAll(".btn-add-miembro").forEach(btn => {
            btn.addEventListener("click", () => {
                socket.send(JSON.stringify({
                    type: "channel-add-member",
                    canalId,
                    userId: btn.dataset.uid,
                }));
            });
        });
    }

    // — Sección "Miembros actuales" (con botón de eliminar, excepto el creador)
    listaMiembrosActuales.innerHTML = "";
    canal.miembros.forEach(uid => {
        const usuario = usuariosConectados.find(u => u.id === uid);
        const nombre  = usuario ? usuario.nickname : (uid === miId ? miNickname + " (tú)" : `[${uid.slice(1,5)}...]`);
        const esCreador = uid === canal.creadorId;

        const div = document.createElement("div");
        div.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:4px 0;";
        div.innerHTML = `
            <span>${nombre}${esCreador ? " 👑" : ""}</span>
            ${!esCreador ? `<button data-uid="${uid}" class="btn-remove-miembro" style="background:#e53935;color:#fff;border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:.8em;">✕ Quitar</button>` : ""}
        `;
        listaMiembrosActuales.appendChild(div);
    });
    listaMiembrosActuales.querySelectorAll(".btn-remove-miembro").forEach(btn => {
        btn.addEventListener("click", () => {
            socket.send(JSON.stringify({
                type: "channel-remove-member",
                canalId,
                userId: btn.dataset.uid,
            }));
        });
    });

    // — Zona de peligro: eliminar el canal completo —
    const zonaEliminar = document.createElement("div");
    zonaEliminar.style.cssText = "border-top:1px solid #fee2e2;margin-top:10px;padding-top:10px;";
    zonaEliminar.innerHTML = `
        <p style="font-size:.75rem;color:#9ca3af;margin-bottom:6px;">Zona de peligro</p>
        <button id="btn-eliminar-canal"
            style="width:100%;background:#dc2626;color:#fff;border:none;border-radius:8px;
                   padding:7px 0;cursor:pointer;font-size:.85rem;font-weight:600;
                   display:flex;align-items:center;justify-content:center;gap:6px;">
            🗑️ Eliminar canal
        </button>
    `;
    listaMiembrosActuales.appendChild(zonaEliminar);

    document.getElementById("btn-eliminar-canal").addEventListener("click", () => {
        mostrarDialogoConfirmarEliminar(canal.nombre, canalId);
    });
}

/**
 * Muestra un diálogo de confirmación centrado en pantalla.
 * Se monta sobre un overlay oscuro semi-transparente para máxima visibilidad.
 * Se destruye al confirmar o cancelar — nunca usa alert().
 */
function mostrarDialogoConfirmarEliminar(nombreCanal, canalId) {
    // Evitar duplicados
    if (document.getElementById("dialogo-confirmar-eliminar")) return;

    const overlay = document.createElement("div");
    overlay.id = "dialogo-confirmar-eliminar";
    overlay.style.cssText = `
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999;
        animation: fadeInOverlay 150ms ease;
    `;

    overlay.innerHTML = `
        <div style="
            background: #fff;
            border-radius: 16px;
            padding: 28px 24px 20px;
            width: 320px;
            max-width: 90vw;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            animation: slideUpDialog 180ms ease;
            text-align: center;
        ">
            <div style="font-size: 2.2rem; margin-bottom: 12px;">🗑️</div>
            <h3 style="margin:0 0 8px;font-size:1rem;color:#111827;">¿Eliminar canal?</h3>
            <p style="font-size:.85rem;color:#6b7280;margin:0 0 20px;line-height:1.5;">
                Vas a eliminar <strong>«${nombreCanal}»</strong> para todos sus miembros.<br>
                Esta acción no se puede deshacer.
            </p>
            <div style="display:flex;gap:10px;">
                <button id="dialogo-btn-no"
                    style="flex:1;padding:10px 0;border:1.5px solid #e5e7eb;background:#fff;
                           color:#374151;border-radius:10px;cursor:pointer;font-size:.9rem;font-weight:500;">
                    Cancelar
                </button>
                <button id="dialogo-btn-si"
                    style="flex:1;padding:10px 0;border:none;background:#dc2626;
                           color:#fff;border-radius:10px;cursor:pointer;font-size:.9rem;font-weight:600;">
                    Sí, eliminar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Añadir keyframes si no existen aún
    if (!document.getElementById("dialogo-keyframes")) {
        const style = document.createElement("style");
        style.id = "dialogo-keyframes";
        style.textContent = `
            @keyframes fadeInOverlay { from { opacity:0 } to { opacity:1 } }
            @keyframes slideUpDialog { from { transform:translateY(12px);opacity:0 } to { transform:translateY(0);opacity:1 } }
        `;
        document.head.appendChild(style);
    }

    const cerrarDialogo = () => overlay.remove();

    document.getElementById("dialogo-btn-no").addEventListener("click", cerrarDialogo);

    // Clic en el overlay oscuro también cancela
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrarDialogo(); });

    // Escape también cancela
    const onKeyDown = (e) => { if (e.key === "Escape") { cerrarDialogo(); document.removeEventListener("keydown", onKeyDown); } };
    document.addEventListener("keydown", onKeyDown);

    document.getElementById("dialogo-btn-si").addEventListener("click", () => {
        socket.send(JSON.stringify({ type: "channel-delete", canalId }));
        PanelManager.cerrar("miembros");
        cerrarDialogo();
    });
}

btnGestionarMiembros.addEventListener("click", (e) => {
    e.stopPropagation();
    renderizarPanelMiembros();
    PanelManager.toggle("miembros");
});

btnCerrarPanelMiembros.addEventListener("click", () => PanelManager.cerrar("miembros"));

/* ── PANEL MANAGER — control exclusivo de paneles flotantes ──────────────
 *
 *  Gestiona un único panel abierto a la vez (tipo acordeón exclusivo).
 *  Registro: { id → { panel: HTMLElement, triggers: HTMLElement[] } }
 *  Al abrir uno, cierra todos los demás antes de aplicar toggle.
 *  Un listener global en document cierra cualquier panel abierto al hacer
 *  clic fuera — reemplaza los tres document.addEventListener dispersos.
 * ──────────────────────────────────────────────────────────────────────── */

const PanelManager = (() => {
    // Registro interno: id → { panel, triggers }
    const _registro = {};

    /** Registra un panel junto con los elementos que lo activan */
    function registrar(id, panel, triggers = []) {
        _registro[id] = { panel, triggers };
    }

    /** Devuelve true si el panel indicado está actualmente visible */
    function estaAbierto(id) {
        return _registro[id] && !_registro[id].panel.classList.contains("oculto");
    }

    /** Cierra un panel concreto */
    function cerrar(id) {
        if (_registro[id]) _registro[id].panel.classList.add("oculto");
    }

    /** Cierra todos los paneles registrados */
    function cerrarTodos() {
        Object.keys(_registro).forEach(cerrar);
    }

    /**
     * Toggle exclusivo: si el panel objetivo estaba abierto lo cierra;
     * si estaba cerrado, primero cierra todos los demás y luego lo abre.
     */
    function toggle(id) {
        if (estaAbierto(id)) {
            cerrar(id);
        } else {
            cerrarTodos();
            if (_registro[id]) _registro[id].panel.classList.remove("oculto");
        }
    }

    /**
     * Listener global de cierre al clic fuera.
     * Ignora el clic si el target está dentro de un panel registrado
     * o es uno de sus triggers.
     */
    document.addEventListener("click", (e) => {
        Object.entries(_registro).forEach(([id, { panel, triggers }]) => {
            const dentroDePabel   = panel.contains(e.target);
            const esUnTrigger     = triggers.some(t => t === e.target || t.contains(e.target));
            if (!dentroDePabel && !esUnTrigger) cerrar(id);
        });
    });

    return { registrar, toggle, cerrar, cerrarTodos, estaAbierto };
})();

// — Registrar los dos paneles con sus botones de disparo —
PanelManager.registrar("fondo",    panelFondo,    [btnFondo]);
PanelManager.registrar("miembros", panelMiembros, [btnGestionarMiembros]);


/* ── TOAST — notificaciones no intrusivas ────────────────────────────────
 *
 *  Inserta un elemento toast en #zona-chat con animación CSS.
 *  Se autodestruye tras `duracion` ms.
 *  Tipos: "info" | "warn" | "error"
 * ──────────────────────────────────────────────────────────────────────── */

function mostrarToast(mensaje, tipo = "info", duracion = 4000) {
    const COLORES = {
        info:  { bg: "#1B2A4A", icon: "ℹ️" },
        warn:  { bg: "#B45309", icon: "⚠️" },
        error: { bg: "#B91C1C", icon: "🚫" },
    };
    const { bg, icon } = COLORES[tipo] ?? COLORES.info;

    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    Object.assign(toast.style, {
        position:     "absolute",
        top:          "12px",
        left:         "50%",
        transform:    "translateX(-50%) translateY(-8px)",
        background:   bg,
        color:        "#fff",
        padding:      "10px 18px",
        borderRadius: "10px",
        fontSize:     "0.85rem",
        fontWeight:   "500",
        boxShadow:    "0 4px 16px rgba(0,0,0,0.22)",
        zIndex:       "200",
        whiteSpace:   "nowrap",
        opacity:      "0",
        transition:   "opacity 220ms ease, transform 220ms ease",
        pointerEvents:"none",
    });

    toast.textContent = `${icon}  ${mensaje}`;

    // El contenedor relativo donde se ancla el toast
    const contenedor = $("zona-chat") ?? document.body;
    contenedor.appendChild(toast);

    // Entrada (siguiente frame para que la transición se dispare)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.opacity   = "1";
            toast.style.transform = "translateX(-50%) translateY(0)";
        });
    });

    // Salida y limpieza
    setTimeout(() => {
        toast.style.opacity   = "0";
        toast.style.transform = "translateX(-50%) translateY(-8px)";
        toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, duracion);
}


/* ── DETECCIÓN DE EXPULSIÓN Y REDIRECCIÓN AUTOMÁTICA ─────────────────────
 *
 *  Cada vez que el servidor emite "channel-list" se comprueba si el usuario
 *  estaba activo en un canal que ya no aparece en su lista de membresía.
 *  Si es así → se cierra limpiamente la vista del canal y se redirige a la
 *  Sala Pública mostrando un toast de aviso, sin ningún alert() bloqueante.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Punto de integración: reemplaza el `renderizarCanales` original añadiendo
 * la lógica de detección de expulsión antes del renderizado.
 * Se llama cada vez que llega un "channel-list" desde el servidor.
 */
const _renderizarCanalesOriginal = renderizarCanales;

// Sobrescribimos renderizarCanales para añadir la detección de expulsión
// sin tocar el cuerpo de la función original.
// eslint-disable-next-line no-global-assign
renderizarCanales = function(channels) {
    // ── Detección de expulsión ──────────────────────────────────────────
    if (vistaActual.startsWith("canal:") && miId) {
        const canalActivoId = vistaActual.split(":")[1];

        // El usuario ha sido expulsado si el canal activo:
        //   a) ya no existe en la nueva lista, O
        //   b) existe pero el usuario ya no figura entre sus miembros
        const siguePerteneciendo = channels.some(
            c => c.id === canalActivoId && c.miembros.includes(miId)
        );

        if (!siguePerteneciendo) {
            // Nombre del canal para el mensaje (tomado del estado local previo)
            const nombreCanal = canalesInfo.get(canalActivoId)?.nombre ?? "ese canal";

            // Redirigir a sala pública de forma limpia (misma lógica que el botón)
            irASalaPublica();

            // Notificación sutil, sin bloquear la UI
            mostrarToast(`Ya no eres miembro de «${nombreCanal}»`, "warn", 5000);

            // Limpiar historial local del canal para liberar memoria
            delete historiales[`canal:${canalActivoId}`];
            delete noLeidos[`canal:${canalActivoId}`];
        }
    }

    // ── Delegación al renderizado original ─────────────────────────────
    _renderizarCanalesOriginal(channels);
};


/* ── irASalaPublica — helper de navegación reutilizable ──────────────────
 *
 *  Centraliza toda la lógica de "volver a sala pública" en un único lugar.
 *  Utilizado por el botón de volver, la detección de expulsión, y cualquier
 *  otra ruta que necesite resetear la vista principal.
 * ──────────────────────────────────────────────────────────────────────── */

async function irASalaPublica() {
    vistaActual = "publico";

    // Resetear UI del chat principal
    chatTitulo.textContent         = await t("sala-publica");
    btnVolverPublico.style.display = "none";
    mensajes.innerHTML             = "";
    indicadorTyping.textContent    = "";
    texto.disabled                 = false;
    btnEnviar.disabled             = false;
    texto.placeholder              = await t("escribe-mensaje");
    texto.value                    = "";

    // Cerrar paneles flotantes y ocultar botón de gestión
    PanelManager.cerrarTodos();
    btnGestionarMiembros.style.display = "none";

    // Recargar historial público
    historiales.publico.forEach(msg => agregarMensaje(msg.from, msg.text, msg.time));
}
