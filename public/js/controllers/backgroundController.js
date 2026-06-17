import { dom } from "../ui/dom.js";
import { panelManager } from "../ui/panelManager.js";
import { guardarYAplicarFondo, restaurarFondoPredeterminado } from "../services/backgroundService.js";

/** Conecta todos los controles del panel de personalización de fondo. */
export function inicializarFondo() {
    panelManager.registrar("fondo", dom.panelFondo, [dom.btnFondo]);

    dom.btnFondo.addEventListener("click", e => {
        e.stopPropagation();
        panelManager.toggle("fondo");
    });
    dom.btnCerrarPanelFondo.addEventListener("click", () => panelManager.cerrar("fondo"));

    // Color sólido — aplica en tiempo real mientras el usuario arrastra el picker.
    dom.fondoColor.addEventListener("input", () => {
        guardarYAplicarFondo({ tipo: "color", valor: dom.fondoColor.value });
    });

    // Degradado.
    dom.btnAplicarDegradado.addEventListener("click", () => {
        guardarYAplicarFondo({ tipo: "degradado", valor: dom.fondoGrad1.value, valor2: dom.fondoGrad2.value });
    });
    dom.fondoGrad1.addEventListener("input", () => {
        dom.mensajes.style.background = `linear-gradient(135deg, ${dom.fondoGrad1.value}, ${dom.fondoGrad2.value})`;
    });
    dom.fondoGrad2.addEventListener("input", () => {
        dom.mensajes.style.background = `linear-gradient(135deg, ${dom.fondoGrad1.value}, ${dom.fondoGrad2.value})`;
    });

    // URL de imagen.
    dom.btnAplicarUrl.addEventListener("click", () => {
        const url = dom.fondoUrl.value.trim();
        if (!url) return;
        guardarYAplicarFondo({ tipo: "imagen", valor: url });
    });
    dom.fondoUrl.addEventListener("keydown", e => {
        if (e.key === "Enter") dom.btnAplicarUrl.click();
    });

    // Subir imagen local — se convierte a base64.
    dom.fondoArchivo.addEventListener("change", () => {
        const file = dom.fondoArchivo.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => guardarYAplicarFondo({ tipo: "imagen", valor: e.target.result });
        reader.readAsDataURL(file);
    });

    // Restaurar fondo predeterminado.
    dom.btnRestaurarFondo.addEventListener("click", () => {
        const predeterminado = restaurarFondoPredeterminado();
        dom.fondoColor.value = predeterminado.valor;
    });
}
