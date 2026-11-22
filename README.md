# Gestor de Tareas — Electiva PWA

PWA de gestión de tareas construida a lo largo de los Bloques 1 a 3.

**Electiva - PWA · UPTC**
Sergio Nicolas Ruiz Pinzon — 202212598

---

## Estado

| Bloque | Sesiones | Qué aporta | Estado |
| --- | --- | --- | --- |
| 1 · JavaScript | 1-8 | Variables, arreglos, objetos, funciones, DOM, promesas, módulos | Completo |
| 2 · TypeScript | 9-14 | Tipado del dominio (`referencia-typescript/`) | Completo |
| 3 · PWA | 16 | Manifest e iconos | Completo |
| 3 · PWA | 17-21 | Service Worker, estrategias de caché, versiones | Completo |
| 3 · PWA | 22 | IndexedDB + Web Crypto | Completo |
| 3 · PWA | 24 | Cámara, micrófono y ubicación | Completo |
| 3 · PWA | 25 | Sensores de movimiento | Completo |
| 3 · PWA | 26 | Notificaciones, Background Sync y bandeja de salida | Completo |

---

## Cómo ejecutar

No abras `index.html` con `file://`: los módulos ES y el manifest necesitan un
servidor local.

```bash
npx serve .
# o
python -m http.server 8080
```

Abre `http://localhost:3000` (o `http://localhost:8080`).

La cámara, el micrófono y la geolocalización exigen `https` o `localhost`.

---

## Qué se puede verificar en DevTools

| Qué | Dónde mirarlo |
| --- | --- |
| Service Worker activo | Application → Service Workers (`activated`) |
| Cachés versionados | Application → Cache Storage (`gestor-shell-v3`, `gestor-estaticos-v3`, `gestor-datos-v3`) |
| Funciona sin conexión | Network → Offline y recarga: la app abre con las tareas guardadas |
| IndexedDB | Application → IndexedDB → `gestor-tareas` v2 (`tareas`, `config`, `outbox`) |
| Nota cifrada | En `tareas`, el campo `notaPrivada` es un `ArrayBuffer` ilegible |
| Bandeja de salida | Store `outbox`: cada cambio queda `pendiente` hasta que se envía |
| Manifest | Application → Manifest, sin errores |

---

## Arquitectura

```text
.
├─ index.html            # shell de la app y paneles de cada sesión
├─ app.js                # orquestación: DOM ↔ módulos
├─ tareas.js             # modelo, render y migración desde localStorage
├─ db.js                 # IndexedDB v2: tareas, config y outbox
├─ cripto.js             # PBKDF2-SHA-256 + AES-GCM
├─ dispositivo.js        # cámara, micrófono, ubicación y sensores
├─ notificaciones.js     # Notification API vía Service Worker
├─ sync.js               # Background Sync y plan B con el evento online
├─ sw.js                 # Service Worker: caché, sync, push y notificationclick
├─ manifest.json         # PWA, rutas relativas para servir en subruta
├─ css/estilos.css
├─ icons/                # 192 any, 512 any, 512 maskable
└─ referencia-typescript/versión tipada del dominio (Bloques 1-2)
```

### Decisiones que vale la pena poder defender

- **IndexedDB en vez de localStorage**: almacenamiento estructurado, versionado y con
  índices; `localStorage` es síncrono y solo guarda texto. La migración se hace una
  vez y borra la clave vieja (`migrarDeLocalStorage`).
- **La versión de la base sube cuando cambia el esquema**, no cuando cambian los
  datos: v2 añade `outbox` y el índice `porSincronizar` sin perder las tareas.
- **La contraseña nunca se guarda**: PBKDF2 deriva una clave con la sal guardada y
  la clave vive solo en memoria (`claveSesion`).
- **El permiso de avisos se pide dentro de un clic**, nunca al cargar: si el usuario
  dice `denied` ya no se puede volver a preguntar desde la página.
- **La acción nunca depende de la red**: escribir una tarea solo toca IndexedDB y
  encola un cambio; el envío ocurre cuando haya red.
- **`idCambio` por cambio, no por tarea**: si la respuesta del servidor se pierde
  justo después de guardar, reenviar el mismo `idCambio` es inofensivo.
- **Background Sync solo existe en Chromium**: para Safari y Firefox hay plan B con
  el evento `online`.

---

## Limitaciones

- No hay servidor real: `/api/tareas` no existe, así que los cambios quedan
  `pendiente` a propósito y se puede observar el reintento.
- **No se probó el push real**: para eso hacen falta claves VAPID y un servicio de
  push. Las notificaciones que se ven son locales, desde el Service Worker.
- El sensor de orientación requiere un dispositivo con giroscopio; en escritorio no
  hay lecturas (el botón lo informa).
- Lighthouse no se ejecutó sobre este proyecto.

---

*Electiva - PWA · Facultad de Ingeniería · UPTC*
