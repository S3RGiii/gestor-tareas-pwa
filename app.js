// app.js — punto de entrada del Gestor de Tareas.
// Conecta el DOM con la lógica: IndexedDB (S22), cripto (S22), dispositivo
// (S24-25), notificaciones y Background Sync (S26) y el Service Worker (S17-21).

import {
  abrirBaseDeDatos,
  cambiosPendientes,
  guardarConfig,
  obtenerConfig,
  obtenerTareas,
  guardarTarea,
  eliminarTarea as borrarTareaDb,
} from './db.js'
import { cifrarTexto, derivarClave, descifrarTexto, generarSal } from './cripto.js'
import {
  abrirCamara,
  capturarFotograma,
  describirError,
  detenerStream,
  escucharOrientacion,
  haySensores,
  obtenerUbicacion,
  pedirPermisoSensores,
} from './dispositivo.js'
import {
  describirPermiso,
  mostrarNotificacion,
  pedirPermisoNotificaciones,
  permisoActual,
} from './notificaciones.js'
import { hayBackgroundSync, sincronizarAlVolverLaRed, vaciarBandeja, registrarCambio } from './sync.js'
import {
  anadirTarea,
  cargarTareas,
  crearTarea,
  migrarDeLocalStorage,
  quitarTarea,
  renderizarTarea,
} from './tareas.js'

// --- Referencias del DOM ----------------------------------------------------

const $ = (selector) => document.querySelector(selector)
const listaEl = $('#lista-tareas')
const formEl = $('#form-tarea')
const inputTituloEl = $('#input-titulo')
const inputPrioridadEl = $('#input-prioridad')
const contadorEl = $('#contador')
const conexionEl = $('#estado-conexion')
const estadoAdjuntoEl = $('#estado-adjunto')
const previaEl = $('#previa-adjunto')
const previaFotoEl = $('#previa-foto')
const estadoAvisosEl = $('#estado-avisos')
const estadoCifradoEl = $('#estado-cifrado')
const estadoSensoresEl = $('#estado-sensores')
const inputContrasenaEl = $('#input-contrasena')
const dlgCamara = $('#dlg-camara')
const videoEl = $('#video-camara')
const estadoCamaraEl = $('#estado-camara')
const dlgNota = $('#dlg-nota')
const notaDescifradaEl = $('#nota-descifrada')

let db
let tareas = []
let fotoPendiente = null
let ubicacionPendiente = null
let claveSesion = null // CryptoKey derivada; vive solo en memoria
let streamCamara = null
let dejarDeEscucharSensores = null

// --- Utilitarios ------------------------------------------------------------

/** Mensaje de estado reutilizable. */
function estado(elemento, texto, tono = '') {
  elemento.textContent = texto
  elemento.dataset.tono = tono
}

/** Refresca la lista completa. */
function pintarTodo() {
  listaEl.innerHTML = ''
  const ordenadas = [...tareas].sort((a, b) => a.fechaCreacion.localeCompare(b.fechaCreacion))
  ordenadas.forEach((tarea) =>
    renderizarTarea(tarea, listaEl, {
      onToggle: alternarCompletada,
      onEliminar: eliminarTarea,
      onVerNota: claveSesion ? verNota : null,
    }),
  )
  const hechas = tareas.filter((t) => t.completada).length
  contadorEl.textContent = `${tareas.length} tarea${tareas.length === 1 ? '' : 's'} · ${hechas} completada${hechas === 1 ? '' : 's'}`
}

/** Recarga desde IndexedDB y repinta. */
async function refrescar() {
  tareas = await cargarTareas(db)
  pintarTodo()
}

// --- Acciones sobre tareas --------------------------------------------------

async function alternarCompletada(id) {
  const tarea = tareas.find((t) => t.id === id)
  if (!tarea) return
  const actualizada = { ...tarea, completada: !tarea.completada, sincronizada: false }
  await guardarTarea(db, actualizada)
  await registrarCambio(db, {
    idCambio: crypto.randomUUID(),
    tipo: 'actualizar',
    tareaId: tarea.id,
    payload: { completada: actualizada.completada },
  })
  await refrescar()
}

async function eliminarTarea(id) {
  await borrarTareaDb(db, id)
  await registrarCambio(db, {
    idCambio: crypto.randomUUID(),
    tipo: 'eliminar',
    tareaId: id,
    payload: null,
  })
  await refrescar()
}

/** Muestra la nota privada descifrada. */
async function verNota(tarea) {
  if (!claveSesion || !tarea.notaPrivada) return
  try {
    const texto = await descifrarTexto(claveSesion, {
      cifrado: tarea.notaPrivada,
      iv: tarea.notaIv,
    })
    notaDescifradaEl.textContent = texto
    dlgNota.showModal()
  } catch {
    notaDescifradaEl.textContent = 'No se pudo descifrar: la contraseña no es la misma.'
    dlgNota.showModal()
  }
}

// --- Alta de tareas ---------------------------------------------------------

formEl.addEventListener('submit', async (evento) => {
  evento.preventDefault()
  const titulo = inputTituloEl.value.trim()
  if (!titulo) return

  const tarea = crearTarea(titulo, inputPrioridadEl.value)
  tarea.foto = fotoPendiente
  tarea.ubicacion = ubicacionPendiente

  // Si hay clave, la nota (el título) va cifrada como demostración de la S22.
  if (claveSesion) {
    const { cifrado, iv } = await cifrarTexto(claveSesion, `Nota de «${titulo}»`)
    tarea.notaPrivada = cifrado
    tarea.notaIv = iv
  }

  await anadirTarea(db, tarea)
  await registrarCambio(db, {
    idCambio: crypto.randomUUID(),
    tipo: 'crear',
    tareaId: tarea.id,
    payload: { titulo: tarea.titulo, prioridad: tarea.prioridad },
  })

  fotoPendiente = null
  ubicacionPendiente = null
  limpiarAdjuntos()
  formEl.reset()
  await refrescar()
})

function limpiarAdjuntos() {
  previaEl.classList.add('oculto')
  previaFotoEl.removeAttribute('src')
  estadoAdjuntoEl.textContent = ''
}

// --- Sesión 24: cámara y ubicación -----------------------------------------

$('#btn-foto').addEventListener('click', async () => {
  try {
    estadoCamaraEl.textContent = 'Pidiendo permiso de cámara…'
    streamCamara = await abrirCamara('user')
    videoEl.srcObject = streamCamara
    await videoEl.play().catch(() => {})
    estadoCamaraEl.textContent = ''
    dlgCamara.showModal()
  } catch (error) {
    estadoAdjuntoEl.textContent = describirError(error)
  }
})

$('#btn-capturar').addEventListener('click', async () => {
  try {
    fotoPendiente = await capturarFotograma(videoEl)
    const url = URL.createObjectURL(fotoPendiente)
    previaFotoEl.src = url
    previaEl.classList.remove('oculto')
    estadoAdjuntoEl.textContent = 'Foto lista para adjuntar.'
    cerrarCamara()
  } catch (error) {
    estadoCamaraEl.textContent = describirError(error)
  }
})

$('#btn-cerrar-camara').addEventListener('click', cerrarCamara)

function cerrarCamara() {
  detenerStream(streamCamara)
  streamCamara = null
  videoEl.srcObject = null
  if (dlgCamara.open) dlgCamara.close()
}

$('#btn-quitar-foto').addEventListener('click', () => {
  fotoPendiente = null
  limpiarAdjuntos()
})

$('#btn-ubicacion').addEventListener('click', async () => {
  try {
    estadoAdjuntoEl.textContent = 'Obteniendo ubicación…'
    ubicacionPendiente = await obtenerUbicacion()
    estadoAdjuntoEl.textContent = `Ubicación lista (±${Math.round(ubicacionPendiente.precision)} m).`
  } catch (error) {
    estadoAdjuntoEl.textContent = describirError(error)
  }
})

// --- Sesión 22: cifrado -----------------------------------------------------

$('#btn-cifrado').addEventListener('click', async () => {
  const contrasena = inputContrasenaEl.value
  if (contrasena.length < 8) {
    estado(estadoCifradoEl, 'Usa al menos 8 caracteres.', 'error')
    return
  }
  try {
    let sal = await obtenerConfig(db, 'salCifrado')
    if (!sal) {
      sal = generarSal()
      await guardarConfig(db, 'salCifrado', sal)
    }
    claveSesion = await derivarClave(contrasena, sal)
    estado(estadoCifradoEl, 'Cifrado listo: las notas nuevas se guardan cifradas. No se guarda la contraseña.', 'ok')
    inputContrasenaEl.value = ''
    await refrescar()
  } catch (error) {
    estado(estadoCifradoEl, `No se pudo preparar el cifrado (${error.name}).`, 'error')
  }
})

$('#btn-cerrar-nota').addEventListener('click', () => dlgNota.close())

// --- Sesión 26: avisos y sincronización ------------------------------------

estadoAvisosEl.textContent = describirPermiso(permisoActual())

$('#btn-avisos').addEventListener('click', async () => {
  const permiso = await pedirPermisoNotificaciones()
  estadoAvisosEl.textContent = describirPermiso(permiso)
  if (permiso === 'granted') {
    await mostrarNotificacion('Avisos activados', 'Te avisaremos cuando queden tareas pendientes.')
    // La app funciona igual sin permiso: los avisos son un añadido.
  }
})

/** Envío simulado: aquí iría el POST al servidor real. */
async function enviarCambio(cambio) {
  const respuesta = await fetch('/api/tareas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cambio),
  })
  if (!respuesta.ok) throw new Error(`El servidor respondió ${respuesta.status}`)
}

$('#btn-sync').addEventListener('click', async () => {
  const pendientes = await cambiosPendientes(db)
  if (pendientes.length === 0) {
    estado(estadoAvisosEl, 'No hay cambios pendientes.', 'ok')
    return
  }
  const enviados = await vaciarBandeja(db, enviarCambio)
  estado(
    estadoAvisosEl,
    enviados === pendientes.length
      ? `${enviados} cambio(s) enviados.`
      : `${enviados} de ${pendientes.length} enviados; el resto sigue pendiente porque no hay servidor.`,
    enviados ? 'ok' : 'error',
  )
  await refrescar()
})

// --- Sesión 25: sensores ----------------------------------------------------

$('#btn-sensores').addEventListener('click', async () => {
  if (dejarDeEscucharSensores) {
    dejarDeEscucharSensores()
    dejarDeEscucharSensores = null
    estadoSensoresEl.textContent = 'Sensor desactivado.'
    $('#btn-calibrar').disabled = true
    return
  }
  if (!haySensores()) {
    estado(estadoSensoresEl, 'Este equipo no tiene sensores de orientación.', 'error')
    return
  }
  const permitido = await pedirPermisoSensores()
  if (!permitido) {
    estado(estadoSensoresEl, 'Permiso de sensores denegado.', 'error')
    return
  }
  dejarDeEscucharSensores = escucharOrientacion((lectura) => {
    estadoSensoresEl.textContent =
      `α ${lectura.alpha.toFixed(0)}° · β ${lectura.beta.toFixed(0)}° · γ ${lectura.gamma.toFixed(0)}°` +
      ` · giro relativo ${lectura.deltaAlpha.toFixed(0)}°`
  })
  $('#btn-calibrar').disabled = false
  estado(estadoSensoresEl, 'Leyendo el sensor…', 'ok')
})

$('#btn-calibrar').addEventListener('click', () => {
  estado(estadoSensoresEl, 'Calibrado: la postura actual es el cero.', 'ok')
})

// --- Conexión (Sesión 41 del Atlas, aquí mínimo) ---------------------------

function actualizarConexion() {
  const enLinea = navigator.onLine
  conexionEl.textContent = enLinea ? 'En línea' : 'Sin conexión'
  conexionEl.className = `pildora pildora--${enLinea ? 'online' : 'offline'}`
}
window.addEventListener('online', actualizarConexion)
window.addEventListener('offline', actualizarConexion)

// --- Service Worker (Sesiones 17-21) ---------------------------------------

async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  try {
    const registro = await navigator.serviceWorker.register('./sw.js')
    // Las actualizaciones se aplican solas: skipWaiting + clientsClaim.
    registro.addEventListener('updatefound', () => {
      const nuevo = registro.installing
      nuevo?.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
          estado(estadoAvisosEl, 'Hay una versión nueva; recarga para aplicarla.', 'ok')
        }
      })
    })
  } catch (error) {
    console.warn('No se pudo registrar el Service Worker:', error)
  }
}

// --- Arranque ---------------------------------------------------------------

async function iniciar() {
  actualizarConexion()
  await registrarServiceWorker()

  db = await abrirBaseDeDatos()
  const migradas = await migrarDeLocalStorage(db)
  if (migradas > 0) {
    estado(estadoAvisosEl, `Se migraron ${migradas} tarea(s) de localStorage a IndexedDB.`, 'ok')
  }

  await refrescar()

  // Si la base está vacía, una tarea de bienvenida (como en el Bloque 2).
  if (tareas.length === 0) {
    await anadirTarea(db, crearTarea('Aprender el Bloque 3: PWA', 'alta'))
    await refrescar()
  }

  // Plan B de sincronización para navegadores sin Background Sync.
  sincronizarAlVolverLaRed(db, enviarCambio)

  estado(
    estadoAvisosEl,
    hayBackgroundSync()
      ? 'Background Sync disponible en este navegador.'
      : 'Sin Background Sync (Safari/Firefox): se reintenta al volver la red.',
  )
}

iniciar().catch((error) => {
  console.error('Fallo al arrancar:', error)
  listaEl.innerHTML = `<li class="tarea">No se pudo iniciar la aplicación: ${error.message}</li>`
})
