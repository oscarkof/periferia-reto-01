/**
 * Reglas de negocio por país (PRD §7.3 · RN1).
 *
 * "El identificador tributario se traduce por país: CO → NIT, EC → RUC,
 * PE → RUC, PA → RUC, HN → RTN. Periferia solo tiene NIT colombiano; para otros
 * países el campo se llena con el NIT y se marca `requiere_confirmacion` con la
 * nota 'identificador extranjero'."
 */
import { normalizar } from "./normalizar.ts"
import type { Pais } from "./tipos.ts"

/** Países que atiende el proceso, en el orden del PRD. */
export const PAISES: readonly Pais[] = ["CO", "EC", "PE", "PA", "HN"]

/** Nombre local del identificador tributario en cada país. */
export const IDENTIFICADOR_TRIBUTARIO: Record<Pais, string> = {
  CO: "NIT",
  EC: "RUC",
  PE: "RUC",
  PA: "RUC",
  HN: "RTN",
}

/**
 * Etiquetas genéricas que el glosario mapea a `nit` pero que NO identifican un
 * campo concreto: exigen confirmación porque cada país las llama distinto.
 * Se comparan ya normalizadas.
 */
export const ETIQUETAS_TRIBUTARIAS_GENERICAS: readonly string[] = [
  "identificacion tributaria",
  "numero de identificacion fiscal",
  "identificacion fiscal",
]

/** Clave del maestro que guarda el identificador tributario de Periferia. */
export const CLAVE_IDENTIFICADOR_TRIBUTARIO = "nit"

/** ¿El valor es uno de los países soportados? */
export function esPais(valor: string): valor is Pais {
  return (PAISES as readonly string[]).includes(valor)
}

/** Cómo se llama el identificador tributario en `pais` (para explicarlo al usuario). */
export function nombreIdentificadorTributario(pais: Pais): string {
  return IDENTIFICADOR_TRIBUTARIO[pais]
}

/** ¿La etiqueta es una denominación genérica del identificador tributario? */
export function esEtiquetaTributariaGenerica(etiqueta: string): boolean {
  return ETIQUETAS_TRIBUTARIAS_GENERICAS.includes(normalizar(etiqueta))
}

/**
 * RN1: Periferia solo tiene NIT colombiano. En cualquier otro país, un campo que
 * apunte a `nit` es un identificador extranjero y hay que confirmarlo.
 */
export function esIdentificadorTributarioExtranjero(pais: Pais, clave: string): boolean {
  return clave === CLAVE_IDENTIFICADOR_TRIBUTARIO && pais !== "CO"
}
