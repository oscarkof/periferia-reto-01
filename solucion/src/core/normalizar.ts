/**
 * Normalización de etiquetas y similitud de texto.
 *
 * Es la base de la resolución de sinónimos del glosario (HU-2). Funciones puras,
 * sin dependencias: se prueban en aislamiento.
 */

/**
 * Forma canónica de una etiqueta: minúsculas, sin diacríticos, sin puntuación y
 * con espacios colapsados.
 *
 * Se conservan `.`, `/` y `-` porque aparecen en etiquetas reales de cliente
 * ("Departamento / Provincia", "Código CIIU").
 */
export function normalizar(etiqueta: string): string {
  return etiqueta
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Distancia de Levenshtein con dos filas (memoria O(min(a, b))). */
export function distancia(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let anterior: number[] = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const fila: number[] = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      const arriba = (anterior[j] ?? 0) + 1
      const izquierda = (fila[j - 1] ?? 0) + 1
      const diagonal = (anterior[j - 1] ?? 0) + costo
      fila[j] = Math.min(arriba, izquierda, diagonal)
    }
    anterior = fila
  }
  return anterior[b.length] ?? 0
}

/** Similitud normalizada 0..1 derivada de la distancia de Levenshtein. */
export function similitud(a: string, b: string): number {
  const mayor = Math.max(a.length, b.length)
  if (mayor === 0) return 1
  return 1 - distancia(a, b) / mayor
}
