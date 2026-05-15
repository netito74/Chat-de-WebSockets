const host = window.location.hostname;
const socket = new WebSocket(`ws://${host}:3000`);

// Elementos de la interfaz
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
let objetivoPrivadoId = null; 
let timeoutEscribiendo = null;

// Función puente que traduce cadenas de la UI consultando dinámicamente al backend
async function traducirTextoUI(textoOriginal, idiomaDestino) {
    if (idiomaDestino === "es") return textoOriginal; // Si el idioma elegido es español, no consume API
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

// Intercepta los componentes estáticos y los traduce en caliente según la respuesta del Docker
async function aplicarIdiomaInterfazDinamico(codigoLang) {
    if (!objetivoPrivadoId) {
        chatTitulo.textContent = await traducirTextoUI("Sala Pública", codigoLang);
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

// Consultar la API para renderizar los idiomas que tiene activos tu contenedor Docker
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
        console.error("No se pudieron obtener los idiomas de LibreTranslate:", error);
        idiomaInput.innerHTML = `
            <option value="es" selected>Español (es)</option>
            <option value="en">Inglés (en)</option>
        `;
    }
}

// Inicializar la carga automatizada
cargarIdiomasDesdeServidor();

// Manejo del Login inicial con bloqueo asíncrono controlado
btnEntrar.addEventListener("click", async () => {
    const nickname = nicknameInput.value.trim();
    const idiomaSeleccionado = idiomaInput.value;
    
    if (nickname !== "") {
        miNickname = nickname;
        miIdioma = idiomaSeleccionado; 
        
        btnEntrar.disabled = true; // Evita doble clic mientras se procesa la traducción de la pantalla
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

// Recepción y enrutamiento de eventos desde el Servidor
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
        case "history":
            data.history.forEach(msg => agregarMensajeDOM(msg.from, msg.text, msg.time, "publico"));
            break;

        case "system":
            agregarAlertaSistemaDOM(data.text);
            break;

        case "user-list":
            renderizarListaUsuarios(data.users);
            break;

        case "public":
            agregarMensajeDOM(data.from, data.text, data.time, "publico");
            break;

        case "private":
            agregarMensajeDOM(data.from, data.text, data.time, "privado");
            break;

        case "typing":
            if (data.isTyping) {
                traducirTextoUI("está escribiendo...", miIdioma).then(textoTraducido => {
                    indicadorEscribiendo.textContent = `${data.from} ${textoTraducido}`;
                });
            } else {
                indicadorEscribiendo.textContent = "";
            }
            break;
    }
};

// Enviar Mensajes (Públicos o Privados)
function procesarEnvio() {
    const mensaje = texto.value.trim();
    if (mensaje === "") return;

    if (objetivoPrivadoId) {
        socket.send(JSON.stringify({ type: "private", to: objetivoPrivadoId, text: mensaje }));
    } else {
        socket.send(JSON.stringify({ type: "public", text: mensaje }));
    }

    texto.value = "";
    notificarEscritura(false);
}

btnEnviar.addEventListener("click", procesarEnvio);
texto.addEventListener("keypress", (e) => { if (e.key === "Enter") procesarEnvio(); });

// Capturar evento de teclado para el Indicador "Escribiendo..."
texto.addEventListener("input", () => {
    notificarEscritura(true);
    clearTimeout(timeoutEscribiendo);
    timeoutEscribiendo = setTimeout(() => {
        notificarEscritura(false);
    }, 1500);
});

function notificarEscritura(estado) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "typing", isTyping: estado }));
    }
}

// Renderizar la lista de usuarios en la barra lateral
function renderizarListaUsuarios(usuarios) {
    listaUsuarios.innerHTML = "";
    usuarios.forEach(user => {
        const li = document.createElement("li");
        li.textContent = user.nickname;
        li.dataset.id = user.id;
        
        if (user.nickname === miNickname) {
            li.classList.add("usuario-propio");
            li.textContent += " (Tú)";
        } else {
            li.classList.add("usuario-clicable");
            li.addEventListener("click", () => activarChatPrivado(user));
        }
        listaUsuarios.appendChild(li);
    });
}

function activarChatPrivado(usuario) {
    objetivoPrivadoId = user.id;
    chatTitulo.textContent = `Chat Privado con: ${usuario.nickname}`;
    chatTitulo.style.color = "#d32f2f";
    btnVolverPublico.classList.remove("oculto");
    barraLateral.classList.remove("activo"); 
}

// Botón de regresar a la sala común con traducción dinámica
btnVolverPublico.addEventListener("click", async () => {
    objetivoPrivadoId = null;
    chatTitulo.textContent = await traducirTextoUI("Sala Pública", miIdioma);
    chatTitulo.style.color = "#333";
    btnVolverPublico.classList.add("oculto");
});

// Renderizadores de elementos visuales en el DOM con auto-scroll
function agregarMensajeDOM(remitente, textoMsg, hora, claseTipo) {
    const div = document.createElement("div");
    div.classList.add("mensaje", claseTipo);
    
    const spanInfo = document.createElement("span");
    spanInfo.classList.add("info-mensaje");
    spanInfo.textContent = `[${hora}] ${remitente}: `;

    const spanTexto = document.createElement("span");
    spanTexto.textContent = textoMsg;

    div.appendChild(spanInfo);
    div.appendChild(spanTexto);
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
}

function agregarAlertaSistemaDOM(textoMsg) {
    const div = document.createElement("div");
    div.classList.add("mensaje-sistema");
    div.textContent = textoMsg;
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
}

// Control responsivo de menú flotante móvil
btnMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    barraLateral.classList.toggle("activo");
});

document.addEventListener("click", (e) => {
    if (!barraLateral.contains(e.target) && e.target !== btnMenu) {
        barraLateral.classList.remove("activo");
    }
});
