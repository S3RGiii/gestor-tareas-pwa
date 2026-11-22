// cripto.js — Web Crypto API (Sesión 22).
// PBKDF2-SHA-256 deriva una clave de la contraseña del usuario y AES-GCM
// cifra la nota privada. La contraseña nunca se guarda: la clave derivada
// vive solo en memoria mientras la pestaña está abierta.

const ITERACIONES = 100_000
const SAL_BYTES = 16
const IV_BYTES = 12

/** Genera una sal aleatoria nueva (una sola vez por instalación). */
export function generarSal() {
  return crypto.getRandomValues(new Uint8Array(SAL_BYTES))
}

/**
 * Deriva una clave AES-GCM de 256 bits a partir de la contraseña.
 * PBKDF2 hace lento el ataque por fuerza bruta.
 */
export async function derivarClave(contrasena, sal) {
  const codificada = new TextEncoder().encode(contrasena)
  const base = await crypto.subtle.importKey('raw', codificada, 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: ITERACIONES, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Cifra un texto. Devuelve el criptograma y el IV (necesario para descifrar). */
export async function cifrarTexto(clave, texto) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const datos = new TextEncoder().encode(texto)
  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, datos)
  return { cifrado, iv }
}

/** Descifra un criptograma con su IV. Lanza si la clave no es la correcta. */
export async function descifrarTexto(clave, { cifrado, iv }) {
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, clave, cifrado)
  return new TextDecoder().decode(plano)
}
