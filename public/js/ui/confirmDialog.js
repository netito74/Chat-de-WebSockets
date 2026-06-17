import { socketClient } from "../core/socketClient.js";
import { panelManager } from "./panelManager.js";

/**
 * Muestra un diálogo de confirmación centrado en pantalla, sobre un
 * overlay semitransparente. Se destruye al confirmar o cancelar — nunca
 * usa alert(). Al confirmar, envía la orden de borrado al servidor.
 */
export function mostrarDialogoConfirmarEliminar(nombreCanal, canalId) {
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

    overlay.addEventListener("click", e => { if (e.target === overlay) cerrarDialogo(); });

    const onKeyDown = e => {
        if (e.key === "Escape") {
            cerrarDialogo();
            document.removeEventListener("keydown", onKeyDown);
        }
    };
    document.addEventListener("keydown", onKeyDown);

    document.getElementById("dialogo-btn-si").addEventListener("click", () => {
        socketClient.send("channel-delete", { canalId });
        panelManager.cerrar("miembros");
        cerrarDialogo();
    });
}
