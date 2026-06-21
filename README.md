# Agora

Plataforma de mensajería en tiempo real con salas públicas, chats privados, grupos y traducción automática entre idiomas. Construida con Node.js, Socket.IO y Redis, pensada para escalar horizontalmente entre múltiples instancias.

---

## 1. Complementos implementados

### Autenticación
- Registro e inicio de sesión con usuario/contraseña.
- Contraseñas protegidas con **bcrypt** (12 rondas).
- Sesión basada en **JWT** (12h de expiración), enviada también en el handshake de Socket.IO.
- Selección de idioma preferido al registrarse (Español/Inglés), con arquitectura extensible a más idiomas.

### Chat público
- Sala "Plaza Pública" a la que se unen automáticamente todos los usuarios registrados.
- Mensajes en tiempo real con historial persistente.

### Chat privado
- Conversación 1 a 1 creada de forma automática (perezosa) al enviar el primer mensaje.
- Indicador de presencia (en línea / última conexión).
- Confirmación de entrega (✓) y lectura (✓✓) por mensaje.

### Grupos
- Crear grupo, agregar/quitar participantes, renombrar y eliminar.
- Roles **administrador** / **miembro**, con promoción automática si el admin abandona el grupo.
- Historial persistente y notificaciones en tiempo real a todos los miembros.

### Personalización visual
- Gradientes predefinidos, URL de imagen externa o imagen propia (con validación de formato y límite de tamaño).

### Traducción automática
- Cada usuario ve los mensajes en su idioma preferido; el remitente ve siempre el original.
- Arquitectura de **proveedores intercambiables**: `mock` (offline, por defecto), `google` (Google Cloud Translation) y `deepl`, configurables por variable de entorno sin tocar código.
- Caché en dos niveles (memoria + base de datos) para no traducir el mismo mensaje dos veces.
- Degradación controlada: si el proveedor de traducción falla, se muestra el texto original en vez de romper el chat.

### Reconexión y tolerancia a fallos
- Si se pierde la conexión, los mensajes escritos se guardan localmente y se reenvían automáticamente al reconectar (sin duplicados, gracias a un id idempotente por mensaje).
- Al reconectar, el cliente solo pide los mensajes que se perdió (sincronización incremental), no todo el historial.
- Apagado ordenado del servidor (cierra conexiones activamente en vez de dejarlas colgadas).

### Escalabilidad
- Soporta múltiples instancias de Node.js detrás de un balanceador (Nginx), sincronizadas en tiempo real vía **Redis Adapter** de Socket.IO.
- Presencia (usuarios en línea) calculada de forma distribuida con contadores en Redis, correcta aunque el mismo usuario tenga varias pestañas en distintos servidores.

### Seguridad
- Saneamiento de mensajes contra XSS (servidor + cliente).
- Consultas parametrizadas contra inyección SQL.
- Límite de peticiones (rate limiting) contra fuerza bruta en login/registro.
- Cabeceras de seguridad con Helmet (configurables; ver sección 3.5 para uso en red local).

---

## 2. Tecnologías utilizadas

| Capa | Tecnología |
|---|---|
| Backend | Node.js 22+, Express 4 |
| Tiempo real | Socket.IO 4, `@socket.io/redis-adapter` |
| Base de datos | `node:sqlite` (nativo de Node, sin dependencias de compilación) |
| Caché / Pub-Sub | Redis 7 (`ioredis`) |
| Autenticación | `jsonwebtoken`, `bcryptjs` |
| Validación | `zod` |
| Seguridad | `helmet`, `cors`, `express-rate-limit`, `sanitize-html` |
| Subida de archivos | `multer` |
| Frontend | JavaScript (módulos ES nativos, sin framework ni build step), CSS propio |
| Balanceo de carga | Nginx (`ip_hash`, failover) |
| Pruebas | Playwright (E2E), script propio de carga/estrés con `socket.io-client` |

---

## 3. Instrucciones de ejecución

### 3.1 Requisitos previos
- **Node.js 22 o superior**
- **Redis** (ver opciones abajo)
- **Docker** (opcional, recomendado para Redis)

### 3.2 Instalar dependencias

```bash
cd agora/backend
npm install
```

### 3.3 Configurar variables de entorno

```bash
cp .env.example .env
```

El archivo `.env` por defecto funciona para desarrollo local sin cambios.

### 3.4 Levantar Redis

**Opción recomendada — Docker:**

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

Para detener/reiniciar después:
```bash
docker stop redis
docker start redis
```

**Alternativas (si no usas Docker):**

```bash
# macOS con Homebrew
brew services start redis

# Ubuntu / Debian / WSL2
sudo apt install redis-server -y
sudo service redis-server start

# Windows nativo (sin Docker ni WSL2)
# instalar desde https://github.com/tporadowski/redis/releases
```

**Sin Redis:** si solo vas a probar con un único usuario/instancia, puedes omitir Redis poniendo en `.env`:
```env
REDIS_ENABLED=false
```

### 3.5 Iniciar el servidor

```bash
npm start
```

Deberías ver:
```
[socket.io] adaptador Redis activo (instancia node-1)
Agora [node-1] escuchando en http://localhost:3000
```

Abre **http://localhost:3000** en el navegador.

### 3.6 Acceso desde otro dispositivo en la misma red (LAN/móvil)

Por defecto, Helmet aplica cabeceras de seguridad (HSTS, CSP, etc.) pensadas para HTTPS. Al acceder por IP local en HTTP, esas cabeceras pueden hacer que el navegador intente forzar HTTPS y falle la carga de estilos/scripts. Para desarrollo/pruebas en LAN, en `backend/src/app.js` usa:

```js
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    hsts: false,
  })
);
```

> ⚠️ Esta configuración es para **desarrollo/LAN únicamente**. En producción, despliega detrás de HTTPS real (Nginx + TLS) y reactiva estas protecciones (ver `docs/ARCHITECTURE.md`, sección de seguridad).

Luego, en tu PC ejecuta `ipconfig` (Windows) o `ifconfig`/`ip a` (Linux/macOS) para obtener tu IP local (ej. `192.168.1.105`), y desde el otro dispositivo entra a `http://192.168.1.105:3000`. Si no carga, revisa el firewall:

```powershell
New-NetFirewallRule -DisplayName "Agora Node" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

### 3.7 Ejecutar con dos instancias (arquitectura distribuida)

```bash
# Terminal 1
INSTANCE_ID=node-1 PORT=3000 npm start

# Terminal 2
INSTANCE_ID=node-2 PORT=3001 npm start
```

Ambas instancias comparten estado vía Redis. Para balancearlas con Nginx, usa la configuración incluida en `nginx/agora.conf`.

---

## Estructura del proyecto

```
agora/
├── backend/       → API REST + Socket.IO
├── frontend/      → SPA en JavaScript puro
├── nginx/         → configuración de balanceo de carga
├── load-tests/    → script de prueba de carga/estrés
└── docs/          → documentación técnica completa (ARCHITECTURE.md)
```

Para el detalle de arquitectura, modelo de datos, diagramas y justificaciones técnicas, consulta `docs/ARCHITECTURE.md`.

## 👥 Integrantes del Equipo

| Nombre | GitHub |
|--------|---------|
| Gerardo Cortez | @GeraSP11 |
| Omar Jimenez | @Omar-art32 |
| Ernesto Ramos | @netito74 |
| Salvador Sanchez | @Develuengas |
| Jose Enrique Gonzales | @tuX-2 |

---

## 📄 Licencia

Este proyecto está bajo la licencia MIT.
