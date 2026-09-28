/**
 * Resolución de rutas y confinamiento de escritura.
 *
 * Regla de oro (PRD §6.2 · §8): las herramientas resuelven SIEMPRE rutas
 * relativas a una raíz, nunca absolutas. Además, como el nombre del caso lo
 * propone el modelo en los argumentos de la herramienta, se valida antes de
 * tocar el disco: defensa en profundidad frente a `../`.
 *
 * Este módulo no escribe en disco: solo consulta existencia para localizar la
 * raíz del proyecto.
 */
import fs from "node:fs"
import path from "node:path"
import type { Resultado } from "./tipos.ts"

/** Nombre de carpeta de caso admitido: letras, dígitos, guion y guion bajo. */
const CASO_VALIDO = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const CASO_MAX = 64

/** Ruta del directorio donde vive esta aplicación (`solucion/`). */
export function dirAplicacion(): string {
  // src/core/rutas.ts -> sube dos niveles.
  return path.resolve(import.meta.dirname, "..", "..")
}

/**
 * Raíz del proyecto: se sube desde `solucion/` buscando el `package.json`.
 * Si no aparece, se devuelve `dirAplicacion()`.
 */
export function dirProyecto(): string {
  let actual = dirAplicacion()
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(actual, "package.json"))) return actual
    const padre = path.dirname(actual)
    if (padre === actual) break
    actual = padre
  }
  return dirAplicacion()
}

/**
 * Carpeta de fixtures: por defecto `../fixtures/reto-01` respecto a `solucion/`
 * (el repo del reto mantiene los fixtures en su sitio, sin copiarlos).
 * `FIXTURES_DIR` permite apuntar a otra ubicación sin tocar código.
 */
export function dirFixtures(): string {
  const override = process.env["FIXTURES_DIR"]
  if (override !== undefined && override.trim() !== "") return path.resolve(override)
  return path.resolve(dirProyecto(), "..", "fixtures", "reto-01")
}

/** Carpeta de casos: `fixtures/reto-01/casos/`. */
export function dirCasos(): string {
  return path.join(dirFixtures(), "casos")
}

/** Carpeta de salida: `out/` dentro de la aplicación. */
export function dirOut(): string {
  return path.join(dirProyecto(), "out")
}

/** Valida el nombre de caso recibido en los argumentos de una herramienta. */
export function validarNombreCaso(caso: string): Resultado<string> {
  const limpio = caso.trim()
  if (limpio === "") return { ok: false, error: "el nombre del caso está vacío" }
  if (limpio.length > CASO_MAX) {
    return { ok: false, error: `el nombre del caso supera ${CASO_MAX} caracteres` }
  }
  if (!CASO_VALIDO.test(limpio)) {
    return {
      ok: false,
      error: `nombre de caso inválido "${caso}": solo se admiten letras, dígitos, guion y guion bajo`,
    }
  }
  return { ok: true, data: limpio }
}

/**
 * Une `partes` a `base` y verifica que el resultado NO se salga de `base`.
 * Es la única forma admitida de construir rutas dinámicas.
 */
export function resolverDentro(base: string, ...partes: string[]): Resultado<string> {
  const raiz = path.resolve(base)
  const destino = path.resolve(raiz, ...partes)
  if (destino !== raiz && !destino.startsWith(raiz + path.sep)) {
    return { ok: false, error: `ruta fuera del directorio permitido: ${partes.join("/")}` }
  }
  return { ok: true, data: destino }
}

/** Ruta de la carpeta de un caso, ya validada y confinada a `casos/`. */
export function dirCaso(caso: string): Resultado<string> {
  const nombre = validarNombreCaso(caso)
  if (!nombre.ok) return nombre
  return resolverDentro(dirCasos(), nombre.data)
}
