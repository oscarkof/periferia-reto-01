/**
 * Carga del repositorio maestro, el glosario y el índice de soportes
 * (PRD §7.2). Todo con errores tipados: nunca lanza.
 */
import path from "node:path"
import { esDirectorio, esObjeto, leerJson } from "./io.ts"
import { dirFixtures } from "./rutas.ts"
import type { Resultado, SoporteIndexado } from "./tipos.ts"

/** Ruta de un archivo dentro de `fixtures/reto-01/`. */
export function rutaFixtures(...partes: string[]): string {
  return path.join(dirFixtures(), ...partes)
}

/**
 * ¿La carpeta de fixtures está donde se espera?
 * El repo del reto mantiene los fixtures fuera de la aplicación (`../fixtures`),
 * así que este chequeo da un error claro si alguien mueve `solucion/` de sitio.
 */
export function verificarFixtures(): Resultado<string> {
  const base = dirFixtures()
  if (!esDirectorio(base)) {
    return {
      ok: false,
      error: `no se encontró la carpeta de fixtures en ${base}. Ajusta FIXTURES_DIR o mantén solucion/ junto a fixtures/`,
    }
  }
  return { ok: true, data: base }
}

/** Repositorio maestro de Periferia (`repositorio/maestro.json`). */
export function cargarMaestro(): Resultado<unknown> {
  const base = verificarFixtures()
  if (!base.ok) return base

  const json = leerJson<unknown>(rutaFixtures("repositorio", "maestro.json"))
  if (!json.ok) return json
  if (!esObjeto(json.data)) {
    return { ok: false, error: "maestro.json no tiene la forma esperada: se esperaba un objeto en snake_case" }
  }
  return { ok: true, data: json.data }
}

/** Glosario etiqueta de cliente → clave del maestro (`glosario-campos.json`). */
export function cargarGlosario(): Resultado<Record<string, string>> {
  const base = verificarFixtures()
  if (!base.ok) return base

  const json = leerJson<unknown>(rutaFixtures("glosario-campos.json"))
  if (!json.ok) return json
  if (!esObjeto(json.data)) {
    return { ok: false, error: "glosario-campos.json no tiene la forma esperada: se esperaba un objeto" }
  }

  const glosario: Record<string, string> = {}
  for (const [etiqueta, clave] of Object.entries(json.data)) {
    if (typeof clave !== "string" || clave.trim() === "") {
      return { ok: false, error: `glosario-campos.json: la etiqueta "${etiqueta}" no apunta a una clave válida` }
    }
    glosario[etiqueta] = clave
  }
  return { ok: true, data: glosario }
}

/**
 * Índice de soportes (`repositorio/soportes/index.json`).
 * Se exige `tipo` y `archivo`; los demás campos se normalizan con valores por
 * defecto para no romper el proceso por un índice incompleto.
 */
export function cargarIndiceSoportes(): Resultado<SoporteIndexado[]> {
  const base = verificarFixtures()
  if (!base.ok) return base

  const json = leerJson<unknown>(rutaFixtures("repositorio", "soportes", "index.json"))
  if (!json.ok) return json
  if (!Array.isArray(json.data)) {
    return { ok: false, error: "soportes/index.json no tiene la forma esperada: se esperaba un arreglo" }
  }

  const soportes: SoporteIndexado[] = []
  for (const entrada of json.data) {
    if (!esObjeto(entrada)) {
      return { ok: false, error: "soportes/index.json contiene una entrada que no es un objeto" }
    }
    const tipo = entrada["tipo"]
    const archivo = entrada["archivo"]
    if (typeof tipo !== "string" || tipo.trim() === "" || typeof archivo !== "string" || archivo.trim() === "") {
      return { ok: false, error: "soportes/index.json: cada entrada necesita `tipo` y `archivo`" }
    }
    const vigencia = entrada["vigencia_hasta"]
    const emisor = entrada["pais_emisor"]
    const descripcion = entrada["descripcion"]
    soportes.push({
      tipo,
      archivo,
      vigencia_hasta: typeof vigencia === "string" && vigencia.trim() !== "" ? vigencia : null,
      pais_emisor: typeof emisor === "string" ? emisor : "",
      descripcion: typeof descripcion === "string" ? descripcion : "",
    })
  }
  return { ok: true, data: soportes }
}
