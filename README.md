# 💬 Proyecto Chat en Tiempo Real con WebSockets

## 📌 Descripción General

Este proyecto consiste en una aplicación de chat en tiempo real desarrollada utilizando WebSockets, permitiendo la comunicación instantánea entre múltiples usuarios.  

La aplicación incluye funcionalidades avanzadas como:

- Chat en sala pública.
- Chat privado entre usuarios.
- Traductor en tiempo real.
- Canales de difusión.
- Personalización del fondo del chat con colores o imágenes.

---

# 👥 Integrantes del Equipo

| Nombre | GitHub |
|--------|---------|
| Gerardo Cortez | @GeraSP11 |
| Omar Jimenez | @Omar-art32 |
| Ernesto Ramos | @netito74 |
| Salvador Sanchez | @Develuengas |
| Jose Enrique Gonzales | @tuX-2 |

---

# 🚀 Funcionalidades Implementadas

## 🏠 Chat en Sala
Permite que múltiples usuarios se conecten y participen en una conversacion grupal en tiempo real.

### Características:
- Mensajes instantáneos.
- Lista de usuarios conectados.
- Historial de mensajes.

---

## 🔒 Chat Privado
Los usuarios pueden enviar mensajes directos entre dos personas sin que otros usuarios puedan visualizarlos.

### Características:
- Comunicación uno a uno.
- Notificaciones privadas.
- Historial independiente.

---

## 🌎 Traductor en Tiempo Real
Integra traducción automática de mensajes para facilitar la comunicación entre usuarios de diferentes idiomas.

### Características:
- Traducción automática al idioma seleccionado.
- Soporte para múltiples idiomas.
- Actualización en tiempo real.

---

## 📢 Canales de Difusión
Permite enviar mensajes masivos a múltiples usuarios simultáneamente.

### Características:
- Difusión global.
- Envío de anuncios.
- Comunicación administrativa.

---

## 🎨 Personalización del Chat
Los usuarios pueden modificar la apariencia del chat.

### Opciones:
- Cambio de color del fondo.
- Fondos personalizados mediante imágenes.

---

# 🛠️ Tecnologías Utilizadas

## Frontend
- HTML5
- CSS3
- JavaScript

## Backend
- Node.js
- Socket.IO

## Herramientas Adicionales
- Git & GitHub
- LibreTranslate: Herramienta de código libre para la generaciòn de un traductor autohosteado. (https://github.com/LibreTranslate/LibreTranslate.git)
- Docker

---

# 🔧 Requsitos 🪛
- node.js
- Docker
- LibreTranslate

---

## Instalación y ejecución

### 1. Clonar el repositorio principal

```bash
git clone https://github.com/netito74/Chat-de-WebSockets.git
cd Chat-de-WebSockets
```

### 2. Clonar la librería auxiliar

```bash
git clone https://github.com/LibreTranslate/LibreTranslate.git
```

### 3. Modificar archivo de configuración de la librería

Editar el archivo correspondiente de la librería auxiliar:

```bash
nano libreria-auxiliar/ruta/del/archivo.ext
```

Realizar los cambios necesarios y guardar el archivo.

### 4. Ejecutar la librería auxiliar

```bash
cd LibreTranslate
npm install
npm run dev
```

Mantener este proceso en ejecución.

### 5. Ejecutar el proyecto principal

Abrir otra terminal y ejecutar:

```bash
cd proyecto
npm install
npm run dev
```

### 6. Acceder a la aplicación

Una vez iniciado el proyecto, acceder desde el navegador a:

```bash
http://localhost:3000
```

# 📸 Evidencias de Funcionamiento

## 🖼️ Capturas de Pantalla


---

# 📄 Licencia

Este proyecto está bajo la licencia MIT.
