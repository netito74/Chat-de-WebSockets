# Agora — Documentación Técnica Completa

## 1. Arquitectura General del Sistema

```
Clientes (navegador)
       │  HTTPS / WSS
       ▼
┌─────────────────────────────────────────────────────┐
│  Nginx  (ip_hash sticky sessions, failover L7)      │
│  puerto 8080 → upstream :3000 y :3001               │
└─────────────────┬───────────────────┬───────────────┘
                  │                   │
          ┌───────▼──────┐   ┌────────▼─────┐
          │  Node-1      │   │  Node-2      │
          │  Express +   │   │  Express +   │
          │  Socket.IO   │   │  Socket.IO   │
          │  :3000       │   │  :3001       │
          └───────┬──────┘   └────────┬─────┘
                  │                   │
          ┌───────▼───────────────────▼─────┐
          │  Redis 7  (Pub/Sub + Adapter)   │
          │  • Sincronización de eventos    │
          │  • Contadores de presencia      │
          └─────────────┬───────────────────┘
                        │
          ┌─────────────▼───────────────────┐
          │  SQLite (WAL, busy_timeout=5s)  │
          │  Archivo compartido en disco    │
          └─────────────────────────────────┘
```

**Flujo de un mensaje en tiempo real:**
1. El cliente envía `message:send` vía WebSocket al nodo que le corresponde (sticky session).
2. El nodo persiste en SQLite, calcula traducciones, emite `io.to(room).emit('message:new')`.
3. El adaptador Redis serializa el emit y lo publica en el canal Pub/Sub.
4. Todos los nodos suscritos reciben la publicación y reenvían a sus sockets locales en esa sala.
5. Los clientes reciben el evento con el cuerpo ya traducido a su idioma preferido.

---

## 2. Diseño de Base de Datos

### Modelo relacional (SQLite)

```
users
  id INTEGER PK AUTO
  username TEXT UNIQUE NOT NULL
  password_hash TEXT NOT NULL         ← bcrypt, 12 rondas
  preferred_lang TEXT DEFAULT 'es'
  avatar_color TEXT
  is_online INTEGER DEFAULT 0
  last_seen_at TEXT
  created_at TEXT

conversations
  id TEXT PK                          ← 'public' | 'priv_<a>_<b>' | 'grp_<uuid>'
  type TEXT CHECK('public','private','group')
  name TEXT                           ← solo grupos
  created_by INTEGER → users.id
  created_at TEXT

conversation_members
  conversation_id TEXT → conversations.id  ON DELETE CASCADE
  user_id INTEGER → users.id               ON DELETE CASCADE
  role TEXT CHECK('admin','member')
  joined_at TEXT
  last_read_at TEXT
  PK (conversation_id, user_id)

messages
  id INTEGER PK AUTO
  client_msg_id TEXT UNIQUE           ← idempotencia
  conversation_id TEXT → conversations.id  ON DELETE CASCADE
  sender_id INTEGER → users.id
  content TEXT NOT NULL               ← saneado con sanitize-html
  source_lang TEXT NOT NULL
  status TEXT CHECK('sent','delivered','read')
  created_at TEXT
  INDEX (conversation_id, created_at)

message_translations
  message_id INTEGER → messages.id  ON DELETE CASCADE
  target_lang TEXT
  translated_text TEXT
  PK (message_id, target_lang)        ← caché persistente de traducciones

user_backgrounds
  user_id INTEGER PK → users.id
  bg_type TEXT CHECK('gradient','url','upload')
  bg_value TEXT
  updated_at TEXT
```

### Decisiones de diseño

- **`conversations.id` como clave natural:** el id `priv_<a>_<b>` es determinístico, lo que permite al cliente frontend crear la sala virtual antes de que el primer mensaje persista en DB, sin una ronda extra de "crear conversación". Ambos usuarios derivan el mismo id de forma independiente.
- **`client_msg_id` para idempotencia:** el cliente genera un UUID antes de enviar. Si pierde conexión y reenvía al reconectar, el servidor devuelve la fila ya existente en lugar de duplicarla.
- **`busy_timeout = 5000ms`:** SQLite usa un único escritor (WAL permite lectores concurrentes). Con dos nodos Node compartiendo el archivo, las escrituras concurrentes se reintentan hasta 5 s antes de fallar. Para cargas de escritura alta en producción se recomienda migrar a PostgreSQL.
- **Fecha de creación vs. fecha de sincronización:** se usa la fecha de creación original (`created_at` puesto por el servidor al recibir el mensaje, no por el cliente). Esto es más consistente y verificable, aunque implica que un mensaje escrito offline aparecerá con la hora en que llegó al servidor, no la hora local del cliente. Esa hora se muestra al usuario como "enviando..." hasta la confirmación.

---

## 3. Diagrama de Componentes

```
┌──────────────────────────────────────────────────────┐
│  Frontend (Vanilla JS, módulos ES)                   │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐  │
│  │ main.js │ │ state.js │ │ socket.js │ │ api.js │  │
│  │ boot +  │ │ localStorage│ │ io()     │ │fetch() │  │
│  │ wiring  │ │ + in-mem  │ │ reconect  │ │ JWT    │  │
│  └────┬────┘ └──────────┘ └─────┬─────┘ └────────┘  │
│       │ UI/                     │ WS                  │
│  ┌────▼──────────────────────────▼──────────────────┐ │
│  │  ui/  (auth, sidebar, chatWindow, groupModal,    │ │
│  │        backgroundModal, toast)                   │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
           │ HTTPS REST + WebSocket
┌──────────▼──────────────────────────────────────────┐
│  Backend (Node.js / Express)                        │
│  ┌──────────────────────────────────────────────┐   │
│  │  app.js  ← helmet, cors, rate-limit, routes  │   │
│  ├──────────────────────────────────────────────┤   │
│  │  routes/  auth · users · groups · uploads ·  │   │
│  │           backgrounds                         │   │
│  ├──────────────────────────────────────────────┤   │
│  │  sockets/  authMiddleware · handlers/         │   │
│  │             chat · sync · presence            │   │
│  ├──────────────────────────────────────────────┤   │
│  │  services/ auth · user · conversation ·       │   │
│  │            message · translation · presence   │   │
│  │  services/providers/ mock · google · deepl    │   │
│  ├──────────────────────────────────────────────┤   │
│  │  middleware/ auth · errorHandler · rateLimit  │   │
│  ├──────────────────────────────────────────────┤   │
│  │  db/  db.js (node:sqlite)  redisClient.js     │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 4. Diagrama de Despliegue

```
                    Internet
                        │
              ┌─────────▼────────┐
              │   Nginx (443)    │  TLS termination
              │   ip_hash lb     │  (cert: Let's Encrypt / ACM)
              └──────┬──────┬───┘
                     │      │
           ┌─────────▼┐  ┌──▼──────────┐
           │ Node-1   │  │ Node-2      │  (podría ser:
           │ :3000    │  │ :3001       │   Docker, PM2, systemd)
           └──────────┘  └─────────────┘
                  │             │
           ┌──────▼─────────────▼──────┐
           │  Redis  :6379             │  (managed: ElastiCache / Upstash
           │  Pub/Sub + presence       │   para producción HA)
           └───────────────────────────┘
                  │
           ┌──────▼────────────────────┐
           │  SQLite (WAL)             │  → en producción: PostgreSQL
           │  /data/agora.sqlite       │    (RDS, Supabase, etc.)
           └───────────────────────────┘
                  │
           ┌──────▼────────────────────┐
           │  uploads/                 │  → en producción: S3 / GCS
           │  backgrounds, avatars     │
           └───────────────────────────┘
```

---

## 5. Flujo de Autenticación

```
Cliente                         Servidor (REST)           DB
  │                                    │                   │
  │── POST /api/auth/register ────────►│                   │
  │   {username, password, lang}       │                   │
  │                                    │── bcrypt.hash() ──►│
  │                                    │── INSERT users ───►│
  │◄── {token (JWT), user} ───────────│                   │
  │                                    │                   │
  │  localStorage.setItem(token)       │                   │
  │                                    │                   │
  │── io({auth:{token}}) ─────────────►│ (WS handshake)   │
  │   (WebSocket upgrade)              │── jwt.verify() ──►│
  │                                    │── findById() ─────►│
  │◄── connected ─────────────────────│                   │
  │                                    │                   │
  │  Sesión: token en localStorage     │                   │
  │  Se restaura al recargar la página │                   │
```

**Decisión técnica — JWT vs sesiones de servidor:**  
Se usa JWT stateless porque el cluster multi-nodo no tiene memoria compartida (cada solicitud puede llegar a cualquier instancia). Verificar un JWT es O(1) criptográfico, sin viaje a Redis ni DB. El token expira en 12 h; se pide reautenticación en el siguiente login.

---

## 6. Estrategia de Traducción Automática

### Arquitectura de proveedores intercambiables

```
translationService.js
  ├── providers/mockProvider.js    (dev/demo, sin red)
  ├── providers/googleProvider.js  (producción recomendada)
  └── providers/deeplProvider.js   (alternativa)
```

Cambia el proveedor con `TRANSLATION_PROVIDER=google` sin modificar ningún otro archivo.

### Cache en dos niveles

| Nivel       | Implementación              | Alcance                | TTL          |
|-------------|-----------------------------|------------------------|--------------|
| L1 (rápido) | LRU en memoria del proceso  | Por instancia Node     | 1 h (config) |
| L2 (durable)| Tabla `message_translations`| Todo el cluster        | Permanente   |

**Flujo de caché:**
1. ¿Está en LRU? → devuelve inmediatamente.  
2. ¿Está en SQLite? → carga en LRU y devuelve.  
3. Llama al proveedor externo → guarda en SQLite y LRU.  
4. Si el proveedor falla → devuelve texto original con nota `[traducción no disponible]` (degradación controlada).

---

## 7. Estrategia de Reconexión y Sincronización

### Al reconectar

```
Cliente                        Servidor
  │                               │
  │── io() (reconexión) ─────────►│
  │                               │── handleConnect(): vuelve a unir
  │                               │   socket a las salas del usuario
  │                               │
  │── sync:request ──────────────►│
  │   [{conversationId, lastId}]  │
  │                               │── messageService.since(conv, lastId)
  │◄── sync:response ─────────────│
  │   [{conv, messages:[...]}]    │   (solo mensajes nuevos = delta)
  │                               │
  │  Aplica delta al estado local │
  │  Reenvía outbox pendiente     │── message:send (clientMsgId único)
  │                               │   (idempotente: no se duplica)
```

### Mensajes escritos offline (outbox)

- Se guardan en `localStorage` con el mismo `clientMsgId` UUID.
- Al reconectar, `flushOutbox()` los reenvía automáticamente.
- El servidor usa `client_msg_id UNIQUE` para ignorar duplicados.
- La hora mostrada es la asignada por el servidor al recibir (no la hora local offline), garantizando orden consistente en todos los clientes.

---

## 8. Escalabilidad y Concurrencia

### Cuellos de botella documentados

| Recurso              | Límite observado            | Mitigación                                    |
|----------------------|-----------------------------|-----------------------------------------------|
| SQLite (escrituras)  | ~10-20 escrituras/s concurrentes | `busy_timeout=5s`, WAL; migrar a Postgres en prod |
| CPU (1 núcleo sandbox)| ~20% por instancia a 100 VUs | Escalar horizontalmente (más instancias Node) |
| Memoria              | ~142 MB/instancia a 100 VUs  | Aceptable; escalar si supera 512 MB          |
| Redis Pub/Sub        | No observado como cuello de botella | Redis Cluster para >10k msg/s                |

### Resultados de la prueba de carga (2 nodos, 1 CPU sandbox)

| Usuarios | Mensajes ACK | P50 (ms) | P90 (ms) | P99 (ms) | CPU max | Mem max |
|----------|-------------|----------|----------|----------|---------|---------|
| 20       | 108         | 13       | 32       | 74       | 20%     | 126 MB  |
| 50       | 288         | 11       | 20       | 46       | 20%     | 131 MB  |
| 100      | 574         | 12       | 25       | 102      | 19%     | 141 MB  |
| 115*     | 682         | 12       | 24       | 43       | 19%     | 142 MB  |
| 115*     | 698         | 11       | 23       | 45       | 19%     | 142 MB  |

_*Limitado a 115 por 429 en registro (rate-limit por IP en sandbox monoproceso)._  
_En producción con múltiples IPs, el límite de registro es transparente._

**Punto de degradación:** no se observó degradación hasta 115 usuarios concurrentes en un sandbox de 1 CPU. La latencia P50 se mantiene ≤13 ms. En un servidor de producción con 4+ núcleos y PostgreSQL, el umbral esperado supera los 1000 usuarios concurrentes por instancia.

---

## 9. Seguridad

| Amenaza             | Mitigación implementada                                                        |
|---------------------|--------------------------------------------------------------------------------|
| XSS                 | `sanitize-html` en servidor + `textContent` en cliente (nunca `innerHTML`)     |
| CSRF                | API stateless (JWT); no hay cookies de sesión                                  |
| SQL Injection       | Consultas parametrizadas (`prepare().run()`); nunca interpolación en SQL        |
| Fuerza bruta        | `express-rate-limit` (10 req/min/IP en auth); bcrypt con 12 rondas             |
| Contraseñas         | bcrypt (12 rondas, ~300 ms/hash, resistente a GPU)                             |
| Secuestro de sesión | JWT con expiración de 12 h; `httpOnly` en producción vía proxy                 |
| Upload malicioso    | Whitelist de MIME types; `multer` con límite de tamaño configurable            |
| Cabeceras HTTP      | `helmet` con CSP estricta                                                      |
| Cifrado en tránsito | TLS 1.2+ (HTTPS/WSS) terminado en Nginx                                        |

**E2EE:** El cifrado extremo a extremo (E2EE) no está implementado porque requeriría que el servidor entregue mensajes cifrados que no puede leer para aplicar la traducción automática (requerimiento contradictorio). La mitigación alternativa es TLS en tránsito + cifrado en reposo del volumen de datos del servidor.

---

## 10. Estructura de Carpetas

```
agora/
├── backend/
│   ├── src/
│   │   ├── server.js              ← entrypoint HTTP + Socket.IO
│   │   ├── app.js                 ← Express, middleware, rutas
│   │   ├── config/index.js        ← configuración desde env
│   │   ├── db/
│   │   │   ├── schema.sql         ← DDL completo
│   │   │   ├── db.js              ← node:sqlite singleton
│   │   │   └── redisClient.js     ← ioredis factory
│   │   ├── middleware/
│   │   │   ├── auth.js            ← requireAuth (JWT)
│   │   │   ├── errorHandler.js    ← centralized errors
│   │   │   └── rateLimit.js       ← express-rate-limit
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── users.routes.js    ← conversaciones + historial
│   │   │   ├── groups.routes.js   ← CRUD grupos
│   │   │   ├── uploads.routes.js  ← imágenes de fondo
│   │   │   └── backgrounds.routes.js
│   │   ├── services/
│   │   │   ├── authService.js
│   │   │   ├── userService.js
│   │   │   ├── conversationService.js
│   │   │   ├── messageService.js  ← sanitize-html, idempotencia
│   │   │   ├── translationService.js ← cache L1+L2
│   │   │   ├── presenceService.js ← contadores Redis
│   │   │   └── providers/
│   │   │       ├── mockProvider.js
│   │   │       ├── googleProvider.js
│   │   │       └── deeplProvider.js
│   │   ├── sockets/
│   │   │   ├── index.js           ← Socket.IO + Redis adapter
│   │   │   ├── authMiddleware.js
│   │   │   └── handlers/
│   │   │       ├── chat.js        ← message:send, ack, typing
│   │   │       ├── sync.js        ← reconexión delta
│   │   │       └── presence.js    ← connect/disconnect
│   │   └── utils/
│   │       ├── jwt.js
│   │       └── validators.js      ← Zod schemas
│   ├── uploads/backgrounds/
│   ├── data/agora.sqlite
│   ├── .env.example
│   └── package.json
├── frontend/public/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── main.js                ← bootstrap + wiring
│       ├── state.js               ← localStorage + in-memory
│       ├── api.js                 ← fetch() wrapper con JWT
│       ├── socket.js              ← io() + sync + outbox
│       └── ui/
│           ├── auth.js
│           ├── sidebar.js
│           ├── chatWindow.js      ← renderizado XSS-safe
│           ├── groupModal.js
│           ├── backgroundModal.js
│           └── toast.js
├── nginx/agora.conf
├── load-tests/
│   ├── socket_load_test.js
│   └── results.json
└── docs/
    └── ARCHITECTURE.md  (este archivo)
```

---

## 11. Guía de Despliegue en Producción

### Variables de entorno críticas

```bash
NODE_ENV=production
JWT_SECRET=<cadena aleatoria >= 64 chars>
REDIS_URL=redis://:password@host:6379
DB_FILE=/data/agora.sqlite            # reemplazar por Postgres en prod
TRANSLATION_PROVIDER=google           # o deepl
GOOGLE_TRANSLATE_API_KEY=AIza...
RATE_LIMIT_AUTH_MAX=10               # mantener bajo en producción
CORS_ORIGIN=https://tudominio.com
PORT=3000
INSTANCE_ID=node-1
```

### Pasos

1. `npm install --omit=dev` en `backend/`.
2. Copiar `backend/.env.example` a `.env` y rellenar valores.
3. Iniciar Redis (managed recomendado: AWS ElastiCache, Upstash).
4. Copiar los archivos de `frontend/public/` al directorio raíz servido por Nginx.
5. Iniciar `N` instancias Node con `INSTANCE_ID=node-{i}` y `PORT=300{i}`.
6. Configurar Nginx con `upstream` apuntando a las `N` instancias.
7. Configurar TLS con Let's Encrypt / ACM.

### Para alta disponibilidad real

- Usa un volumen de red compartido (NFS, EFS) para `uploads/` y el archivo SQLite, **o bien** migra a PostgreSQL y S3.
- Habilita `redis-sentinel` o Redis Cluster para que Redis no sea un SPoF.
- Configura health-checks en el load balancer apuntando a `GET /api/health`.
