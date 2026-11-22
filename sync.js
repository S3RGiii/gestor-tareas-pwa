// sync.js — Background Sync con bandeja de salida (Sesión 26).
// La acción del usuario nunca depende de la red: el cambio se guarda local y
// se encola. Si hay red, se envía; si no, se reintenta cuando vuelva.
//
// Soportado solo en Chromium (Chrome, Edge). En Safari y Firefox se usa el
// plan B: intentar enviar al recuperar el evento `online`.

import { cambiosPendientes, encolarCambio, marcarCambioEnviado } from './db.js'

export const ETIQUETA_SYNC = 'sincronizar-tareas'

/** ¿Este navegador tiene Background Sync? */
export function hayBackgroundSync() {
  return 'serviceWorker' in navigator && 'SyncManager' in window
}

/**
 * Encola un cambio y pide al navegador que lo sincronice.
 * Devuelve 'en-colа' | 'sincronizado' | 'pendiente'.
 */
export async function registrarCambio(db, cambio) {
  await encolarCambio(db, cambio)
  if (!hayBackgroundSync()) return 'pendiente'

  try {
    const registro = await navigator.serviceWorker.ready
    await registro.sync.register(ETIQUETA_SYNC)
    return 'en-cola'
  } catch {
    // Sin red o sin permiso para registrar el sync: queda pendiente.
    return 'pendiente'
  }
}

/**
 * Intenta vaciar la bandeja de salida ahora mismo.
 * `enviar` recibe un cambio y debe resolver si el servidor lo aceptó.
 * Devuelve cuántos se enviaron.
 */
export async function vaciarBandeja(db, enviar) {
  const pendientes = await cambiosPendientes(db)
  let enviados = 0

  for (const cambio of pendientes) {
    try {
      await enviar(cambio)
      await marcarCambioEnviado(db, cambio.idCambio)
      enviados++
    } catch {
      // Si uno falla, se detiene: mantener el orden evita estados raros.
      break
    }
  }
  return enviados
}

/**
 * Plan B: escucha el evento `online` y vacía la bandeja.
 * Devuelve la función para dejar de escuchar.
 */
export function sincronizarAlVolverLaRed(db, enviar) {
  const manejador = async () => {
    const enviados = await vaciarBandeja(db, enviar)
    if (enviados > 0) {
      window.dispatchEvent(new CustomEvent('tareas-sincronizadas', { detail: { enviados } }))
    }
  }
  window.addEventListener('online', manejador)
  return () => window.removeEventListener('online', manejador)
}
