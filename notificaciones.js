// notificaciones.js — Notification API (Sesión 26).
// Regla: el permiso se pide dentro de un clic y con contexto. `denied` es
// casi definitivo y la app debe funcionar igual sin permiso.

/** Pide permiso. Solo se debe llamar desde el manejador de un clic. */
export async function pedirPermisoNotificaciones() {
  if (!('Notification' in window)) return 'no-soportado'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

/** Texto de estado para la UI, según el permiso actual. */
export function describirPermiso(permiso) {
  switch (permiso) {
    case 'granted':
      return 'Avisos activados.'
    case 'denied':
      return 'Avisos bloqueados. Actívalos en el candado del navegador; desde la página ya no se puede preguntar.'
    case 'no-soportado':
      return 'Este navegador no admite notificaciones.'
    default:
      return 'Aún no diste permiso para los avisos.'
  }
}

/**
 * Muestra una notificación local a través del Service Worker.
 * Se usa `registration.showNotification` y no `new Notification()` porque
 * este último lanza TypeError en Chrome para Android.
 */
export async function mostrarNotificacion(titulo, cuerpo, url = './') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  const registro = await navigator.serviceWorker?.ready
  if (!registro) return false
  await registro.showNotification(titulo, {
    body: cuerpo,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'gestor-tareas',
    data: { url },
  })
  return true
}

/** Pide permiso solo si tiene sentido hacerlo ahora. */
export function permisoActual() {
  if (!('Notification' in window)) return 'no-soportado'
  return Notification.permission
}
