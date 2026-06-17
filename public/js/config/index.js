// Configuración del frontend. Centraliza el host/puerto para que ningún
// otro módulo tenga que construir URLs "a mano".
const host = window.location.hostname;
const puerto = window.location.port || 3000;

export const WS_URL = `ws://${host}:${puerto}`;
export const API_BASE = `http://${host}:${puerto}`;
