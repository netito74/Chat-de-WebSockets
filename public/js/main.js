import { socketClient } from "./core/socketClient.js"; // abre la conexión WebSocket
import { cargarIdiomas } from "./services/translationService.js";
import { registrarHandlersEntrantes } from "./handlers/incomingMessageHandlers.js";

import { inicializarLogin } from "./controllers/loginController.js";
import { inicializarChat } from "./controllers/chatController.js";
import { inicializarCanales } from "./controllers/channelController.js";
import { inicializarFondo } from "./controllers/backgroundController.js";
import { inicializarMenuMovil } from "./controllers/sidebarController.js";

// Evita el warning de "variable no usada"; el socket se conecta al importarse.
void socketClient;

registrarHandlersEntrantes();

inicializarLogin();
inicializarChat();
inicializarCanales();
inicializarFondo();
inicializarMenuMovil();

cargarIdiomas();
