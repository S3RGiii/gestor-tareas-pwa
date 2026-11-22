// db.js — IndexedDB del Gestor de Tareas (Sesión 22).
// Sustituye a localStorage: almacenamiento estructurado, versionado y con
// índices. Incluye la bandeja de salida (outbox) de la Sesión 26.

const NOMBRE_DB = 'gestor-tareas'
const VERSION_DB = 2

/** Abre (o crea / migra) la base. Stores e índices solo se tocan aquí. */
export function abrirBaseDeDatos() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(NOMBRE_DB, VERSION_DB)

    peticion.onupgradeneeded = (evento) => {
      const db = evento.target.result
      const tx = evento.target.transaction
      const version = evento.oldVersion // 0 si la base no existía

      if (version < 1) {
        const tareas = db.createObjectStore('tareas', { keyPath: 'id' })
        tareas.createIndex('porPrioridad', 'prioridad', { unique: false })
        tareas.createIndex('porFecha', 'fechaCreacion', { unique: false })
        db.createObjectStore('config', { keyPath: 'clave' })
      }

      if (version < 2) {
        // v2 (Sesión 26): bandeja de salida para Background Sync. Sin perder
        // las tareas guardadas; un usuario nuevo salta directo a la v2.
        const pendientes = db.createObjectStore('outbox', { keyPath: 'idCambio' })
        pendientes.createIndex('porEstado', 'estado', { unique: false })
        tx.objectStore('tareas').createIndex('porSincronizar', 'sincronizada', {
          unique: false,
        })
      }
    }

    peticion.onsuccess = (evento) => resolve(evento.target.result)
    peticion.onerror = (evento) => reject(evento.target.error)
  })
}

/** Envuelve un IDBRequest en Promise (IndexedDB es basada en eventos). */
function envolver(peticion, tx) {
  return new Promise((resolve, reject) => {
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
    if (tx) tx.onabort = () => reject(tx.error)
  })
}

// --- Tareas -----------------------------------------------------------------

/** Guarda una tarea nueva. Falla si la clave ya existe. */
export function agregarTarea(db, tarea) {
  const tx = db.transaction('tareas', 'readwrite')
  return envolver(tx.objectStore('tareas').add(tarea), tx)
}

/** Inserta o actualiza (put, sin fallar si existe). */
export function guardarTarea(db, tarea) {
  const tx = db.transaction('tareas', 'readwrite')
  return envolver(tx.objectStore('tareas').put(tarea), tx)
}

/** Recupera todas las tareas. */
export function obtenerTareas(db) {
  const tx = db.transaction('tareas', 'readonly')
  return envolver(tx.objectStore('tareas').getAll(), tx)
}

/** Elimina una tarea por su id. */
export function eliminarTarea(db, id) {
  const tx = db.transaction('tareas', 'readwrite')
  return envolver(tx.objectStore('tareas').delete(id), tx)
}

/** Cuenta las tareas sin traerlas. */
export function contarTareas(db) {
  const tx = db.transaction('tareas', 'readonly')
  return envolver(tx.objectStore('tareas').count(), tx)
}

/** Recorre el índice de prioridad con un cursor. */
export function tareasPorPrioridad(db, prioridad) {
  return new Promise((resolve, reject) => {
    const resultado = []
    const tx = db.transaction('tareas', 'readonly')
    const indice = tx.objectStore('tareas').index('porPrioridad')
    const cursor = indice.openCursor(IDBKeyRange.only(prioridad))

    cursor.onsuccess = (evento) => {
      const c = evento.target.result
      if (c) {
        resultado.push(c.value)
        c.continue()
      } else {
        resolve(resultado)
      }
    }
    cursor.onerror = () => reject(cursor.error)
  })
}

// --- Configuración (sal del cifrado) ---------------------------------------

export function guardarConfig(db, clave, valor) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('config', 'readwrite')
    const peticion = tx.objectStore('config').put({ clave, valor })
    peticion.onsuccess = () => resolve()
    peticion.onerror = () => reject(peticion.error)
  })
}

export function obtenerConfig(db, clave) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('config', 'readonly')
    const peticion = tx.objectStore('config').get(clave)
    peticion.onsuccess = () =>
      resolve(peticion.result ? peticion.result.valor : undefined)
    peticion.onerror = () => reject(peticion.error)
  })
}

// --- Bandeja de salida (Sesión 26) -----------------------------------------

/**
 * Apunta un cambio pendiente de enviar. El idCambio (UUID por cambio, no por
 * tarea) evita duplicados si la respuesta del servidor se pierde después de
 * guardar: reenviar el mismo cambio es inofensivo.
 */
export function encolarCambio(db, cambio) {
  const tx = db.transaction('outbox', 'readwrite')
  return envolver(
    tx.objectStore('outbox').put({
      estado: 'pendiente',
      intentos: 0,
      fecha: new Date().toISOString(),
      ...cambio,
    }),
    tx,
  )
}

/** Devuelve los cambios pendientes, del más viejo al más nuevo. */
export function cambiosPendientes(db) {
  const tx = db.transaction('outbox', 'readonly')
  const indice = tx.objectStore('outbox').index('porEstado')
  return envolver(indice.getAll(IDBKeyRange.only('pendiente')), tx)
}

/** Marca un cambio como enviado (no se borra: sirve de registro). */
export function marcarCambioEnviado(db, idCambio) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite')
    const store = tx.objectStore('outbox')
    const peticion = store.get(idCambio)
    peticion.onsuccess = () => {
      const cambio = peticion.result
      if (!cambio) return resolve()
      cambio.estado = 'enviado'
      const put = store.put(cambio)
      put.onsuccess = () => resolve()
      put.onerror = () => reject(put.error)
    }
    peticion.onerror = () => reject(peticion.error)
  })
}
