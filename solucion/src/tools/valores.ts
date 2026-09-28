/**
 * Traducción de un mapeo a lo que las plantillas necesitan escribir.
 *
 * Los tres formatos de salida comparten esta vista: `etiqueta → texto`. Así el
 * mismo mapeo alimenta xlsx, pdf y portal sin que cada escritor reinterprete los
 * estados por su cuenta.
 *
 * Solo se escribe lo que tiene valor: un campo `faltante` deja la celda vacía.
 * Un campo `requiere_confirmacion` **sí** se escribe (RN1: "el campo se llena con
 * el NIT y se marca requiere_confirmacion") y además se señala visualmente.
 */
import { comoTexto } from "../core/maestro.ts"
import type { CampoMapeado, Mapeo } from "../core/tipos.ts"

/** Etiqueta → texto del valor, para todo campo con valor disponible. */
export function valoresPorEtiqueta(mapeo: Mapeo): Map<string, string> {
  const valores = new Map<string, string>()
  for (const campo of mapeo.campos) {
    if (campo.valor === null) continue
    valores.set(campo.campo, comoTexto(campo.valor))
  }
  return valores
}

/** Etiqueta → motivo, para los campos que necesitan revisión humana. */
export function pendientesPorEtiqueta(mapeo: Mapeo): Map<string, string> {
  const pendientes = new Map<string, string>()
  for (const campo of mapeo.requiere_confirmacion) {
    pendientes.set(campo.campo, campo.nota ?? "requiere confirmación")
  }
  return pendientes
}

/** Etiquetas de los campos sin fuente en el maestro. */
export function etiquetasFaltantes(mapeo: Mapeo): string[] {
  return mapeo.faltantes.map((campo) => campo.campo)
}

/** Resumen corto de un mapeo, para logs y respuestas de herramienta. */
export function resumenMapeo(mapeo: Mapeo): string {
  return `${mapeo.llenos.length} llenos, ${mapeo.requiere_confirmacion.length} por confirmar, ${mapeo.faltantes.length} faltantes`
}

/** ¿El campo lleva valor? (lleno o por confirmar, nunca faltante). */
export function tieneValor(campo: CampoMapeado): boolean {
  return campo.valor !== null
}
