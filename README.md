# 💬 Chat en Tiempo Real con WebSockets

## 📌 Descripción General

Aplicación de chat en tiempo real con WebSockets que permite comunicación instantánea entre múltiples usuarios, con sala pública, chats privados, canales de difusión, traducción automática y personalización visual.

Esta versión conserva el 100% de las funcionalidades del proyecto original, pero reorganiza tanto el backend como el frontend en **capas con responsabilidades únicas**, en vez de dos archivos monolíticos (`server.js` y `app.js`). El objetivo: que añadir una funcionalidad nueva, o cambiar una existente (p. ej. cambiar de LibreTranslate a otro traductor), implique tocar uno o dos archivos pequeños y predecibles, no rastrear lógica mezclada en un archivo de mil líneas.

---

## 🏗️ Arquitectura

### Backend (`src/`)

```
server.js                      ← punto de entrada: ensambla HTTP + WebSocket y arranca
src/
  config/                      ← configuración centralizada (lee variables de entorno)
  app.js                       ← app Express: middlewares, rutas API, estáticos
  routes/                      ← definición de rutas HTTP (sin lógica)
  controllers/                 ← lógica de cada endpoint HTTP (idiomas, traducción)
  services/
    translation.service.js     ← única capa que conoce LibreTranslate
  state/                        ← estado en memoria, encapsulado detrás de funciones
    clientRegistry.js            (clientes conectados)
    channelRepository.js         (canales: crear, miembros, historial)
    publicHistoryStore.js        (historial de la sala pública)
  websocket/
    index.js                     ← composition root: instancia stores y conecta todo
    broadcaster.js               ← enviar / difundir / listas a todos los clientes
    handlers/                    ← un archivo por tipo de mensaje del protocolo
      register.handler.js
      publicMessage.handler.js
      privateMessage.handler.js
      typing.handler.js
      channelCreate.handler.js
      channelMessage.handler.js
      channelAddMember.handler.js
      channelRemoveMember.handler.js
      channelDelete.handler.js
      disconnect.handler.js
  utils/                         ← id.js, time.js, limitedList.js (funciones puras)
```

**Principios aplicados:**
- **Responsabilidad única**: cada handler resuelve un solo tipo de mensaje; cada store gestiona un solo tipo de estado.
- **Inyección de dependencias explícita**: nada importa estado global a ciegas; cada handler recibe sus dependencias (`clientRegistry`, `broadcaster`, etc.) como parámetros, lo que los hace testeables de forma aislada.
- **Capas separadas**: la capa HTTP (Express) y la capa WebSocket no se conocen entre sí; ambas comparten solo `services/` y `state/`.
- **Abierto a extensión**: añadir un nuevo tipo de mensaje = crear su `handler.js` + una línea en `websocket/handlers/index.js`. No se toca nada más.

### Frontend (`public/js/`)

Sin build step: módulos ES nativos (`<script type="module">`), cargados directamente por el navegador.

```
main.js                         ← punto de entrada: conecta el socket y arranca los controladores
config/                         ← URLs del backend
core/
  socketClient.js                 (única capa que toca el WebSocket crudo)
  state.js                        (único estado mutable de la app)
services/
  translationService.js           (traducción de textos + idiomas)
  backgroundService.js            (personalización de fondo + localStorage)
ui/                                (funciones de render — no contienen lógica de red)
  dom.js, badge.js, toast.js, panelManager.js, confirmDialog.js,
  messagesView.js, usersView.js, channelsView.js, navigation.js
handlers/
  incomingMessageHandlers.js      (traduce cada mensaje entrante del servidor a una actualización de UI)
controllers/                      (conectan eventos del DOM con servicios/estado)
  loginController.js, chatController.js, channelController.js,
  backgroundController.js, sidebarController.js
```

**Principios aplicados:**
- **Un único punto de verdad para el estado** (`core/state.js`) en vez de variables globales sueltas.
- **Separación vista / controlador**: los módulos de `ui/` solo dibujan; los de `controllers/` conectan clics con servicios.
- **Sin parches sobre funciones existentes**: la detección de expulsión de un canal (antes implementada sobrescribiendo `renderizarCanales` desde fuera) ahora vive dentro de la propia función, en `channelsView.js`.

---

## 🧪 Pruebas

Se incluye una suite de integración (`test/chat.test.js`, con el test runner nativo de Node) que levanta el servidor en un puerto efímero y verifica registro, mensajes públicos/privados, creación de canales, permisos de gestión y eliminación de canal:

```bash
npm test
```

---

## 👥 Integrantes del Equipo

| Nombre | GitHub |
|--------|---------|
| Gerardo Cortez | @GeraSP11 |
| Omar Jimenez | @Omar-art32 |
| Ernesto Ramos | @netito74 |
| Salvador Sanchez | @Develuengas |
| Jose Enrique Gonzales | @tuX-2 |

---

## 🚀 Funcionalidades

- Chat en sala pública con historial.
- Chat privado entre usuarios.
- Traducción automática en tiempo real (LibreTranslate), por idioma de cada destinatario.
- Canales de difusión con creador, miembros, gestión de miembros y eliminación.
- Personalización del fondo del chat (color, degradado, URL de imagen o archivo local).
- Indicador de "está escribiendo…".
- Notificaciones toast no intrusivas (canal eliminado, expulsión de un canal).

---

## 🛠️ Tecnologías

**Frontend:** HTML5, CSS3, JavaScript (ES Modules nativos, sin build).
**Backend:** Node.js, Express, `ws` (WebSocket).
**Traducción:** LibreTranslate (autohosteado vía Docker).

---

## 🔧 Requisitos

- Node.js 18+ (se usa `fetch` nativo y el test runner integrado).
- Docker (para LibreTranslate).

---

## Instalación y ejecución

### 1. Clonar el repositorio principal

```bash
git clone https://github.com/netito74/Chat-de-WebSockets.git
cd Chat-de-WebSockets
```

### 2. Levantar LibreTranslate

```bash
git clone https://github.com/LibreTranslate/LibreTranslate.git
cd LibreTranslate
```

Editar `docker-compose.yml` con:

```yaml
services:
  libretranslate:
    image: libretranslate/libretranslate:latest
    container_name: libretranslate
    ports:
      - "5000:5000"
    environment:
      - LT_LOAD_ONLY=es,en,fr,de,it,pt
      - LT_UPDATE_MODELS=true
    volumes:
      - libretranslate_models:/home/libretranslate/.local

volumes:
  libretranslate_models:
```

```bash
docker-compose up -d
```

### 3. Configurar variables de entorno (opcional)

```bash
cp .env.example .env
# Edita .env si necesitas otro puerto, host o límite de historial
```

### 4. Instalar dependencias y ejecutar

```bash
npm install
npm start
```

### 5. Acceder a la aplicación

```
http://localhost:3000
```

---

## 📄 Licencia

Este proyecto está bajo la licencia MIT.
