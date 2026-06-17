import { dom } from "../ui/dom.js";
import { state } from "../core/state.js";
import { socketClient } from "../core/socketClient.js";
import { t } from "../services/translationService.js";
import { cargarFondoGuardado } from "../services/backgroundService.js";
import { actualizarInputCanal } from "../ui/channelsView.js";

/** Actualiza todos los textos traducibles de la interfaz a la vez. */
async function aplicarIdiomaUI() {
    dom.texto.placeholder = await t("escribe-mensaje");
    dom.btnEnviar.textContent = await t("enviar");
    dom.btnVolverPublico.textContent = await t("volver-publico");
    dom.btnCrearCanal.textContent = await t("crear-canal");
    dom.btnMenu.textContent = `${await t("menu-usuarios")}`;
    document.getElementById("titulo-conectados").textContent = await t("conectados");
    document.getElementById("titulo-canales").textContent = await t("canales");

    if (state.vistaActual === "publico") dom.chatTitulo.textContent = await t("sala-publica");
    if (state.vistaActual.startsWith("canal:")) await actualizarInputCanal();
}

/** Conecta el botón de "Entrar" con el flujo de registro contra el servidor. */
export function inicializarLogin() {
    dom.btnEntrar.addEventListener("click", async () => {
        const nick = dom.nicknameInput.value.trim();
        if (!nick) return;

        state.miNickname = nick;
        state.miIdioma = dom.idiomaInput.value;

        dom.btnEntrar.disabled = true;
        await aplicarIdiomaUI();

        dom.modalLogin.style.display = "none";
        dom.texto.disabled = false;
        dom.btnEnviar.disabled = false;

        socketClient.send("register", { nickname: state.miNickname, lang: state.miIdioma });

        // Cargar el fondo personalizado de este usuario (ahora que el nickname está disponible).
        cargarFondoGuardado();
    });
}
