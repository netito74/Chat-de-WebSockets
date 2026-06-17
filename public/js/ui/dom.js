export const $ = id => document.getElementById(id);

export const dom = {
    // Login
    modalLogin: $("modal-login"),
    nicknameInput: $("nickname-input"),
    idiomaInput: $("idioma-input"),
    btnEntrar: $("btnEntrar"),

    // Chat principal
    mensajes: $("mensajes"),
    texto: $("texto"),
    btnEnviar: $("btnEnviar"),
    chatTitulo: $("chat-titulo"),
    btnVolverPublico: $("btn-volver-publico"),
    indicadorTyping: $("indicador-escribiendo"),

    // Barra lateral / menú
    listaUsuarios: $("lista-usuarios"),
    listaCanales: $("lista-canales"),
    btnMenu: $("btn-menu"),
    barraLateral: document.querySelector(".barra-lateral"),
    zonaChat: $("zona-chat"),

    // Crear canal
    btnCrearCanal: $("btn-crear-canal"),
    contenedorCrearCanal: $("contenedor-crear-canal"),
    inputNombreCanal: $("input-nombre-canal"),
    btnConfirmarCrear: $("btn-confirmar-crear"),
    btnCancelarCrear: $("btn-cancelar-crear"),
    listaMiembros: $("lista-miembros"),

    // Personalización de fondo
    btnFondo: $("btn-fondo"),
    panelFondo: $("panel-fondo"),
    btnCerrarPanelFondo: $("btn-cerrar-panel-fondo"),
    fondoColor: $("fondo-color"),
    fondoGrad1: $("fondo-grad-1"),
    fondoGrad2: $("fondo-grad-2"),
    btnAplicarDegradado: $("btn-aplicar-degradado"),
    fondoUrl: $("fondo-url"),
    btnAplicarUrl: $("btn-aplicar-url"),
    fondoArchivo: $("fondo-archivo"),
    btnRestaurarFondo: $("btn-restaurar-fondo"),

    // Gestión de miembros de un canal
    btnGestionarMiembros: $("btn-gestionar-miembros"),
    panelMiembros: $("panel-miembros"),
    btnCerrarPanelMiembros: $("btn-cerrar-panel-miembros"),
    listaAddMiembros: $("lista-add-miembros"),
    listaMiembrosActuales: $("lista-miembros-actuales"),
};
