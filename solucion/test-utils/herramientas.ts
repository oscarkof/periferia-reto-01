/**
 * Utilidades para probar las herramientas del agente.
 *
 * Cada prueba monta un directorio temporal que hace de raíz del proyecto: así
 * `ctx.directory` apunta ahí, el `out/` real no se toca y queda demostrado que
 * las rutas salen del contexto.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import ExcelJS from "exceljs"
import type { ContextoHerramienta } from "../src/tools/contrato.ts"

/** Respuesta del contrato de herramientas. */
export interface Respuesta {
  ok: boolean
  data?: Record<string, unknown>
  error?: string
}

/** Parsea la respuesta JSON del contrato. */
export function json(texto: string): Respuesta {
  return JSON.parse(texto) as Respuesta
}

/** Parsea y exige éxito: devuelve los datos o falla la prueba con el error real. */
export function datosDe(texto: string): Record<string, unknown> {
  const respuesta = json(texto)
  assert.equal(respuesta.ok, true, `se esperaba ok y llegó: ${respuesta.error ?? "(sin error)"}`)
  return respuesta.data ?? {}
}

/** Entorno temporal de pruebas. */
export interface EntornoPrueba {
  /** Contexto para las herramientas: escribe en el directorio temporal. */
  ctx: ContextoHerramienta
  /** Ruta dentro del `out/` temporal. */
  out: (...partes: string[]) => string
  /** Valor de una celda de un xlsx generado. */
  celda: (ruta: string, hoja: string, referencia: string) => Promise<unknown>
  /** Copia defensiva del archivo Excel, para inspeccionar estilos. */
  libro: (ruta: string) => Promise<ExcelJS.Workbook>
  /** Borra el directorio temporal. */
  limpiar: () => void
}

/** Crea un entorno temporal aislado para una prueba. */
export function crearEntorno(sesion = "prueba"): EntornoPrueba {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "reto01-herramientas-"))

  const abrirLibro = async (ruta: string): Promise<ExcelJS.Workbook> => {
    const libro = new ExcelJS.Workbook()
    await libro.xlsx.readFile(ruta)
    return libro
  }

  return {
    ctx: { directory: base, sessionId: sesion },
    out: (...partes) => path.join(base, "out", ...partes),
    async celda(ruta, hoja, referencia) {
      const libro = await abrirLibro(ruta)
      return libro.getWorksheet(hoja)?.getCell(referencia).value ?? null
    },
    libro: abrirLibro,
    limpiar: () => fs.rmSync(base, { recursive: true, force: true }),
  }
}
