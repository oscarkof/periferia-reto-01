/**
 * Confirmación humana (PRD §6.3 · CA3 y §7.3 · RN4).
 *
 * La regla es dura: una acción externa solo se ejecuta si el usuario la confirmó
 * **en el turno inmediatamente anterior**. Esta detección vive en código, no en
 * el prompt, para que el modelo no pueda saltársela escribiendo "el usuario ya
 * confirmó".
 *
 * Es deliberadamente conservadora: ante la duda, **no** hay confirmación.
 */
import { normalizar } from "../core/normalizar.ts"

/** Respuestas que cuentan como confirmación explícita. */
const AFIRMATIVAS: readonly string[] = [
  "si",
  "sí",
  "ok",
  "okay",
  "dale",
  "confirmo",
  "confirmado",
  "confirmada",
  "envia",
  "envialo",
  "adelante",
  "procede",
  "hazlo",
  "de acuerdo",
  "correcto",
  "yes",
  "simula el envio",
]

/**
 * Palabras que **desactivan** la confirmación: si aparecen, el usuario está
 * pidiendo tiempo, corrigiendo o negando, aunque empiece con "sí".
 */
const PALABRAS_DE_FRENO: readonly string[] = [
  "no",
  "todavia",
  "aun",
  "antes",
  "espera",
  "esperate",
  "cancela",
  "cancelar",
  "detente",
  "mejor",
  "para",
  "revisa",
  "faltan",
  "falta",
]

/** Normaliza la respuesta del usuario para compararla. */
export function normalizarRespuesta(texto: string): string {
  return normalizar(texto)
}

/** ¿El usuario negó o pidió esperar? */
export function esNegacion(texto: string): boolean {
  const limpio = normalizarRespuesta(texto)
  if (limpio === "") return false
  return limpio
    .split(" ")
    .some((palabra) => PALABRAS_DE_FRENO.includes(palabra))
}

/**
 * ¿El mensaje del usuario es una confirmación explícita para continuar?
 * Devuelve `false` si hay cualquier palabra de freno.
 */
export function esConfirmacionExplicita(texto: string): boolean {
  const limpio = normalizarRespuesta(texto)
  if (limpio === "") return false

  const alguno = AFIRMATIVAS.some((frase) => limpio === frase || limpio.startsWith(`${frase} `))
  if (!alguno) return false

  return !esNegacion(texto)
}

/** ¿La respuesta es un "no" claro a la acción pendiente? */
export function esRechazo(texto: string): boolean {
  const limpio = normalizarRespuesta(texto)
  if (limpio === "") return false
  if (["no", "no gracias", "cancela", "cancelar", "detente"].includes(limpio)) return true
  return limpio.startsWith("no ") && esNegacion(texto)
}
