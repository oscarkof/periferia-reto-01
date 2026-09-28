/**
 * Utilidades compartidas por las pruebas.
 *
 * Vive en `test-utils/` y no en `test/` a propósito: el runner de Node trata
 * como archivo de prueba TODO lo que esté dentro de un directorio `test/`, y
 * este módulo no contiene pruebas.
 */
import assert from "node:assert/strict"
import { cargarCaso } from "../src/core/casos.ts"
import { cargarGlosario, cargarMaestro } from "../src/core/fixtures.ts"
import { construirGlosario, type Glosario } from "../src/core/glosario.ts"
import type { CasoLeido, Resultado } from "../src/core/tipos.ts"

/** Desempaqueta un `Resultado` o falla la prueba con el error real. */
export function exigir<T>(resultado: Resultado<T>): T {
  assert.ok(resultado.ok, resultado.ok ? "" : `resultado inesperado: ${resultado.error}`)
  return resultado.data
}

/** Contexto del motor: maestro + glosario ya indexado. */
export interface ContextoPrueba {
  maestro: unknown
  glosario: Glosario
}

export function cargarContexto(): ContextoPrueba {
  return {
    maestro: exigir(cargarMaestro()),
    glosario: construirGlosario(exigir(cargarGlosario())),
  }
}

/** Caso de fixtures ya cargado, más el contexto del motor. */
export interface CasoDePrueba extends ContextoPrueba {
  leido: CasoLeido
}

export function cargarCasoDePrueba(caso: string): CasoDePrueba {
  return { ...cargarContexto(), leido: exigir(cargarCaso(caso)) }
}
