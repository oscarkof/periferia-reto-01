/**
 * Acceso al repositorio maestro (PRD §7.2).
 *
 * Módulo puro: recibe el maestro ya cargado y resuelve rutas con punto
 * (`banco.swift`, `representante_legal.identificacion`). No conoce el disco ni
 * el modelo. Es la pieza que garantiza que un valor solo puede salir de aquí.
 */

/** Ausencia de dato: `undefined`, `null` o cadena vacía. */
export function ausente(valor: unknown): boolean {
  if (valor === undefined || valor === null) return true
  if (typeof valor === "string" && valor.trim() === "") return true
  return false
}

/**
 * Valor del maestro en la ruta indicada, o `null` si la ruta no existe o el
 * valor está vacío. Nunca lanza: el motor no debe romperse por un maestro
 * incompleto.
 */
export function leerRuta(maestro: unknown, ruta: string): unknown {
  if (ruta.trim() === "") return null

  let actual: unknown = maestro
  for (const parte of ruta.split(".")) {
    if (actual === null || typeof actual !== "object") return null
    if (!Object.hasOwn(actual, parte)) return null
    actual = (actual as Record<string, unknown>)[parte]
  }
  return ausente(actual) ? null : actual
}

/** ¿La ruta existe y tiene un valor utilizable? */
export function existeRuta(maestro: unknown, ruta: string): boolean {
  return leerRuta(maestro, ruta) !== null
}

/** Representación legible de un valor para reportes y plantillas. */
export function comoTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ""
  if (typeof valor === "string") return valor
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor)
  return JSON.stringify(valor)
}
