import { $ } from "./dom.js";

const COLORES = {
    info: { bg: "#1B2A4A", icon: "ℹ️" },
    warn: { bg: "#B45309", icon: "⚠️" },
    error: { bg: "#B91C1C", icon: "🚫" },
};

/** Muestra un toast no intrusivo en la zona de chat, autodestruible. */
export function mostrarToast(mensaje, tipo = "info", duracion = 4000) {
    const { bg, icon } = COLORES[tipo] ?? COLORES.info;

    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    Object.assign(toast.style, {
        position: "absolute",
        top: "12px",
        left: "50%",
        transform: "translateX(-50%) translateY(-8px)",
        background: bg,
        color: "#fff",
        padding: "10px 18px",
        borderRadius: "10px",
        fontSize: "0.85rem",
        fontWeight: "500",
        boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
        zIndex: "200",
        whiteSpace: "nowrap",
        opacity: "0",
        transition: "opacity 220ms ease, transform 220ms ease",
        pointerEvents: "none",
    });

    toast.textContent = `${icon}  ${mensaje}`;

    const contenedor = $("zona-chat") ?? document.body;
    contenedor.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translateX(-50%) translateY(0)";
        });
    });

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(-8px)";
        toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, duracion);
}
