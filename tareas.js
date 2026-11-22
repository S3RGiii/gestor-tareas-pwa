// tareas.js — lógica del Gestor de Tareas.
// Bloques 1 y 2 (Sesiones 3-14): objetos, funciones, DOM y asincronía.
// Bloque 3 (Sesión 22): la persistencia pasa de localStorage a IndexedDB.

import {
  agregarTarea,
  eliminarTarea as borrarDeDb,
  guardarTarea,
  obtenerTareas,
} from './db.js'

const CLAVE_LOCALSTORAGE_VIEJA = 'electiva-pwa-tareas'

/**
 * @typedef {"baja"|"media"|"alta"} Prioridad
 * @typedef {{ id: string, titulo: string, prioridad: Prioridad, completada: boolean,
 *             fechaCreacion: string, notaPrivada: ArrayBuffer|null, notaIv: Uint8Array|null,
 *             foto?: Blob|null, ubicacion?: object|null, sincronizada: boolean }} Tarea
 */

/** Crea una tarea nueva (Sesión 3: objetos; Sesión 4: parámetros por defecto). */
export const crearTarea = (titulo, prioridad = 'media') => ({
  id: crypto.randomUUID(),
  titulo,
  prioridad,
  completada: false,
  fechaCreacion: new Date().toISOString(),
  notaPrivada: null,
  notaIv: null,
  foto: null,
  ubicacion: null,
  sincronizada: false,
})

/** Crea el <li> de una tarea y lo agrega al contenedor (Sesión 6: DOM). */
export const renderizarTarea = (tarea, contenedor, acciones) => {
  const { onToggle, onEliminar, onVerNota } = acciones
  const li = document.createElement('li')
  li.className = `tarea tarea--${tarea.prioridad}` + (tarea.completada ? ' tarea--completada' : '')
  li.dataset.id = tarea.id

  const check = document.createElement('input')
  check.type = 'checkbox'
  check.checked = tarea.completada
  check.setAttribute('aria-label', `Marcar «${tarea.titulo}» como completada`)
  check.addEventListener('change', () => onToggle(tarea.id))

  const texto = document.createElement('span')
  texto.className = 'tarea-texto'
  texto.textContent = tarea.titulo

  li.append(check, texto)

  // Marca visual de lo que aún no se envió al servidor.
  if (!tarea.sincronizada) {
    const pendiente = document.createElement('span')
    pendiente.className = 'tarea-pendiente'
    pendiente.textContent = 'pendiente'
    pendiente.title = 'Guardada en el dispositivo; se enviará al recuperar la conexión.'
    li.append(pendiente)
  }

  if (tarea.foto || tarea.ubicacion) {
    const adjunto = document.createElement('span')
    adjunto.className = 'tarea-adjunto'
    adjunto.textContent = [tarea.foto ? '📷' : '', tarea.ubicacion ? '📍' : ''].join('')
    adjunto.title = [tarea.foto ? 'Con foto' : '', tarea.ubicacion ? 'Con ubicación' : '']
      .filter(Boolean)
      .join(' · ')
    li.append(adjunto)
  }

  if (tarea.notaPrivada && onVerNota) {
    const nota = document.createElement('button')
    nota.type = 'button'
    nota.className = 'btn-nota'
    nota.textContent = '🔒 Nota'
    nota.addEventListener('click', () => onVerNota(tarea))
    li.append(nota)
  }

  const borrar = document.createElement('button')
  borrar.type = 'button'
  borrar.textContent = 'Eliminar'
  borrar.className = 'btn-eliminar'
  borrar.addEventListener('click', () => onEliminar(tarea.id))
  li.append(borrar)

  contenedor.append(li)
}

/** Carga las tareas desde IndexedDB. */
export const cargarTareas = (db) => obtenerTareas(db)

/** Añade una tarea a la base. */
export const anadirTarea = (db, tarea) => agregarTarea(db, tarea)

/** Guarda (inserta o actualiza) una tarea. */
export const persistirTarea = (db, tarea) => guardarTarea(db, tarea)

/** Elimina una tarea. */
export const quitarTarea = (db, id) => borrarDeDb(db, id)

/**
 * Migración desde localStorage (lo que usaba el Bloque 2).
 * Se ejecuta una sola vez y deja la clave vieja borrada para no repetir.
 */
export async function migrarDeLocalStorage(db) {
  let crudas
  try {
    crudas = JSON.parse(localStorage.getItem(CLAVE_LOCALSTORAGE_VIEJA) || '[]')
  } catch {
    crudas = []
  }
  if (!Array.isArray(crudas) || crudas.length === 0) return 0

  let migradas = 0
  for (const cruda of crudas) {
    try {
      await agregarTarea(db, {
        notaPrivada: null,
        notaIv: null,
        foto: null,
        ubicacion: null,
        sincronizada: false,
        ...cruda,
      })
      migradas++
    } catch {
      // Id duplicado: ya estaba migrada, se ignora.
    }
  }
  localStorage.removeItem(CLAVE_LOCALSTORAGE_VIEJA)
  return migradas
}
