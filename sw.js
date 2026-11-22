// sw.js — Service Worker del Gestor de Tareas.
// Sesiones 17-21: registro y ciclo de vida, cacheo de rutas, gestión de
// versiones y las cinco estrategias de caché aplicadas por tipo de recurso.

const VERSION = 'v3'
const CACHE_SHELL = `gestor-shell-${VERSION}`
const CACHE_ESTATICOS = `gestor-estaticos-${VERSION}`
const CACHE_DATOS = `gestor-datos-${VERSION}`

// Shell: lo mínimo para que la app abra sin conexión.
const SHELL = [
  './',
  './index.html',
  './app.js',
  './tareas.js',
  './db.js',
  './cripto.js',
  './dispositivo.js',
  './notificaciones.js',
  './sync.js',
  './css/estilos.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
]

// --- Ciclo de vida (Sesión 17) ----------------------------------------------

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    // Limpieza de versiones anteriores (Sesión 19): solo sobrevive VERSION.
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((clave) => clave.startsWith('gestor-') && !clave.endsWith(VERSION))
            .map((clave) => caches.delete(clave)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// --- Estrategias de caché (Sesiones 20 y 21) --------------------------------

/** Cache First: sirve del caché y solo va a la red si falta. */
async function cacheFirst(peticion, cacheNombre) {
  const cache = await caches.open(cacheNombre)
  const guardada = await cache.match(peticion)
  if (guardada) return guardada
  const respuesta = await fetch(peticion)
  if (respuesta.ok) cache.put(peticion, respuesta.clone())
  return respuesta
}

/** Network First: intenta la red y guarda copia; si falla, usa el caché. */
async function networkFirst(peticion, cacheNombre) {
  const cache = await caches.open(cacheNombre)
  try {
    const respuesta = await fetch(peticion)
    if (respuesta.ok) cache.put(peticion, respuesta.clone())
    return respuesta
  } catch {
    const guardada = await cache.match(peticion)
    if (guardada) return guardada
    throw new Error('sin-red-y-sin-cache')
  }
}

/** Stale While Revalidate: responde del caché y actualiza en segundo plano. */
async function staleWhileRevalidate(peticion, cacheNombre) {
  const cache = await caches.open(cacheNombre)
  const guardada = await cache.match(peticion)
  const red = fetch(peticion)
    .then((respuesta) => {
      if (respuesta.ok) cache.put(peticion, respuesta.clone())
      return respuesta
    })
    .catch(() => null)
  return guardada || (await red) || new Response('', { status: 504 })
}

/** Network Only: sin caché (reservado para lo que nunca debe servirse viejo). */
function networkOnly(peticion) {
  return fetch(peticion)
}

// --- Enrutado por tipo de recurso (Sesión 21) -------------------------------

self.addEventListener('fetch', (evento) => {
  const { request } = evento
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navegación: Network First con respaldo del shell cacheado.
  if (request.mode === 'navigate') {
    evento.respondWith(
      networkFirst(request, CACHE_SHELL).catch(() => caches.match('./index.html')),
    )
    return
  }

  // Estáticos (CSS, JS, iconos): Cache First.
  if (/\.(css|js|png|svg|woff2?)$/.test(url.pathname)) {
    evento.respondWith(cacheFirst(request, CACHE_ESTATICOS))
    return
  }

  // Datos (JSON de la API o del propio sitio): Stale While Revalidate.
  if (url.pathname.endsWith('.json') || url.pathname.startsWith('/api/')) {
    evento.respondWith(staleWhileRevalidate(request, CACHE_DATOS))
    return
  }

  // El resto: red, sin tocar caché.
  evento.respondWith(networkOnly(request))
})

// --- Sincronización en segundo plano (Sesión 26) ----------------------------

self.addEventListener('sync', (evento) => {
  if (evento.tag !== 'sincronizar-tareas') return
  evento.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({ includeUncontrolled: true })
      for (const cliente of clientes) cliente.postMessage({ tipo: 'sync-solicitado' })
    })(),
  )
})

// --- Notificaciones (Sesión 26) ---------------------------------------------

self.addEventListener('push', (evento) => {
  let datos = { titulo: 'Gestor de Tareas', cuerpo: 'Tienes tareas pendientes', url: './' }
  if (evento.data) {
    try {
      datos = { ...datos, ...evento.data.json() }
    } catch {
      datos.cuerpo = evento.data.text()
    }
  }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      // Un tag reemplaza la notificación anterior en vez de apilarla.
      tag: 'gestor-tareas',
      data: { url: datos.url },
    }),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = evento.notification.data?.url || './'
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientes) => {
      for (const cliente of clientes) {
        if ('focus' in cliente) {
          cliente.navigate(destino)
          return cliente.focus()
        }
      }
      return self.clients.openWindow(destino)
    }),
  )
})
