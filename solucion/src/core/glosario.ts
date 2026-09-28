/**
 * Glosario de etiquetas de cliente → clave del maestro (HU-2).
 *
 * El glosario (`fixtures/reto-01/glosario-campos.json`) es la traducción formal
 * de los sinónimos que usan los clientes. Aquí se indexa por etiqueta
 * normalizada y se consulta en dos pasos:
 *
 *   1. **exacto** (tras normalizar) → confianza 1.0;
 *   2. **difuso** (similitud alta) → confianza 0.7, por debajo de 0.8, así que
 *      el campo queda `requiere_confirmacion`.
 *
 * Si ninguno acierta, se devuelve `null` y el campo será `faltante`: el motor
 * NUNCA adivina una clave (PRD HU-2, "el agente nunca inventa un valor").
 */
import { normalizar, similitud } from "./normalizar.ts"

/** Confianza de un acierto exacto por glosario. */
export const CONFIANZA_EXACTA = 1
/** Confianza de un acierto difuso (HU-2: < 0.8 exige confirmación humana). */
export const CONFIANZA_DIFUSA = 0.7
/**
 * Umbral de similitud para aceptar un acierto difuso. Es deliberadamente alto:
 * el glosario ya cubre los sinónimos reales, así que un "casi acierto" es
 * sospechoso. Ante la duda preferimos `faltante` antes que un valor equivocado.
 */
export const UMBRAL_DIFUSO = 0.85

/** Acierto del glosario para una etiqueta. */
export interface AciertoGlosario {
  /** Clave del maestro a la que apunta la etiqueta. */
  clave: string
  confianza: number
  tipo: "exacto" | "difuso"
}

/** Glosario indexado y listo para consultar. */
export interface Glosario {
  /** Etiqueta normalizada → clave del maestro. */
  indice: Map<string, string>
  /** Entradas normalizadas, para el acierto difuso. */
  entradas: { normalizada: string; clave: string }[]
}

/** Construye el índice del glosario a partir del JSON de fixtures. */
export function construirGlosario(bruto: Record<string, string>): Glosario {
  const indice = new Map<string, string>()
  const entradas: { normalizada: string; clave: string }[] = []
  for (const [etiqueta, clave] of Object.entries(bruto)) {
    const n = normalizar(etiqueta)
    if (n === "") continue
    if (!indice.has(n)) {
      indice.set(n, clave)
      entradas.push({ normalizada: n, clave })
    }
  }
  return { indice, entradas }
}

/**
 * Busca una etiqueta en el glosario. Primero exacto; si no, difuso.
 * Devuelve `null` cuando no hay ninguna fuente fiable.
 */
export function buscarEnGlosario(glosario: Glosario, etiqueta: string): AciertoGlosario | null {
  const n = normalizar(etiqueta)
  if (n === "") return null

  const exacto = glosario.indice.get(n)
  if (exacto !== undefined) return { clave: exacto, confianza: CONFIANZA_EXACTA, tipo: "exacto" }

  let mejor: { clave: string; valor: number } | null = null
  for (const entrada of glosario.entradas) {
    const valor = similitud(n, entrada.normalizada)
    if (mejor === null || valor > mejor.valor) mejor = { clave: entrada.clave, valor }
  }
  if (mejor !== null && mejor.valor >= UMBRAL_DIFUSO) {
    return { clave: mejor.clave, confianza: CONFIANZA_DIFUSA, tipo: "difuso" }
  }
  return null
}
