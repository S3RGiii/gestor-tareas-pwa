// dispositivo.js — APIs de dispositivo del Gestor de Tareas.
// Sesión 24: cámara, micrófono y ubicación con permisos explícitos.
// Sesión 25: sensores de movimiento (orientación e inclinación).

const ERRORES = {
  NotAllowedError: 'Bloqueaste el permiso. Puedes recuperarlo en el candado de la barra de direcciones.',
  NotFoundError: 'No se encontró el dispositivo (cámara, micrófono o GPS).',
  NotReadableError: 'El dispositivo está siendo usado por otra aplicación.',
  OverconstrainedError: 'La cámara pedida no existe en este equipo.',
  SecurityError: 'La API exige HTTPS o localhost.',
}

/** Convierte un error de permisos en un mensaje que el usuario entienda. */
export function describirError(error) {
  return ERRORES[error?.name] || `No se pudo acceder al dispositivo (${error?.name || 'error desconocido'}).`
}

/** Pide la cámara y devuelve el stream. `facing` permite la trasera en móvil. */
export async function abrirCamara(facing = 'user') {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('SecurityError')
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
}

/** Pide el micrófono por separado (Sesión 24: audio solo si se pide). */
export async function abrirMicrofono() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('SecurityError')
  return navigator.mediaDevices.getUserMedia({ audio: true })
}

/** Corta todas las pistas de un stream. */
export function detenerStream(stream) {
  stream?.getTracks().forEach((pista) => pista.stop())
}

/** Captura un fotograma del video como Blob PNG. */
export function capturarFotograma(video) {
  const lienzo = document.createElement('canvas')
  lienzo.width = video.videoWidth
  lienzo.height = video.videoHeight
  lienzo.getContext('2d').drawImage(video, 0, 0)
  return new Promise((resolve) => lienzo.toBlob(resolve, 'image/png'))
}

/** Ubicación puntual. `highAccuracy` gasta más batería: úsalo con criterio. */
export function obtenerUbicacion({ highAccuracy = false, timeout = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('NotFoundError'))
    navigator.geolocation.getCurrentPosition(
      (posicion) =>
        resolve({
          lat: posicion.coords.latitude,
          lon: posicion.coords.longitude,
          precision: posicion.coords.accuracy,
          momento: new Date().toISOString(),
        }),
      (error) => reject(error),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 60_000 },
    )
  })
}

// --- Sensores de movimiento (Sesión 25) ------------------------------------

/**
 * iOS exige pedir permiso dentro de un gesto del usuario; el resto de
 * navegadores lo concede sin preguntar. Devuelve true si hay acceso.
 */
export async function pedirPermisoSensores() {
  const DOE = window.DeviceOrientationEvent
  if (!DOE) return false
  if (typeof DOE.requestPermission === 'function') {
    try {
      return (await DOE.requestPermission()) === 'granted'
    } catch {
      return false
    }
  }
  return true
}

/**
 * Escucha la orientación. Llama a `onLectura` con alpha/beta/gamma y el
 * delta respecto a la calibración. Devuelve la función para dejar de escuchar.
 */
export function escucharOrientacion(onLectura) {
  let base = null
  const manejador = (evento) => {
    const { alpha, beta, gamma } = evento
    if (alpha == null) return
    if (!base) base = { alpha, beta, gamma }
    onLectura({
      alpha,
      beta,
      gamma,
      // Rotación relativa: así la postura inicial del usuario es el cero.
      deltaAlpha: normalizarAngulo(alpha - base.alpha),
      deltaBeta: beta - base.beta,
      deltaGamma: gamma - base.gamma,
    })
  }
  window.addEventListener('deviceorientation', manejador, true)
  return () => window.removeEventListener('deviceorientation', manejador, true)
}

/** Recalibra: la postura actual pasa a ser el cero. */
export function crearCalibrador() {
  let base = null
  return {
    reiniciar() {
      base = null
    },
    leer(evento) {
      if (!base) base = { alpha: evento.alpha, beta: evento.beta, gamma: evento.gamma }
      return base
    },
  }
}

/** Lleva un ángulo al rango (-180, 180] para que no salte al pasar por 360. */
function normalizarAngulo(grados) {
  let a = grados % 360
  if (a > 180) a -= 360
  if (a <= -180) a += 360
  return a
}

/** Comprueba si el equipo tiene giroscopio real (no solo el evento). */
export function haySensores() {
  return 'DeviceOrientationEvent' in window && 'DeviceMotionEvent' in window
}
