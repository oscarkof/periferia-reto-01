/**
 * Formulario Excel (P0 · HU-3).
 *
 * Escribe cada etiqueta y su valor **exactamente** en la hoja y la celda que
 * indica `plantilla-celdas.json`. Los campos que necesitan confirmación humana
 * se escriben con fondo ámbar y un comentario con el motivo, para que la
 * analista los vea sin abrir el checklist.
 *
 * Determinismo (PRD §8): las fechas del libro se fijan, así que dos ejecuciones
 * producen exactamente el mismo archivo.
 */
import ExcelJS from "exceljs"
import type { Escritor } from "../core/escritor.ts"
import type { CeldaPlantilla, Resultado } from "../core/tipos.ts"

/** Fecha fija de metadatos: el archivo debe ser idéntico entre ejecuciones. */
const FECHA_FIJA = new Date("2026-01-01T00:00:00.000Z")

/** Color de fondo para las celdas que exigen confirmación humana. */
const FONDO_PENDIENTE = "FFF4CE"

/**
 * Genera `out/<caso>/formulario.xlsx` a partir de la plantilla de celdas.
 * `valores` mapea etiqueta → texto; `pendientes` mapea etiqueta → motivo.
 */
export async function escribirXlsx(
  escritor: Escritor,
  caso: string,
  celdas: CeldaPlantilla[],
  valores: Map<string, string>,
  pendientes: Map<string, string>,
): Promise<Resultado<string>> {
  const libro = new ExcelJS.Workbook()
  libro.created = FECHA_FIJA
  libro.modified = FECHA_FIJA
  libro.creator = "Agente de registro de proveedores"

  for (const celda of celdas) {
    const hoja = libro.getWorksheet(celda.hoja) ?? libro.addWorksheet(celda.hoja)

    const celdaEtiqueta = hoja.getCell(celda.celda_etiqueta)
    celdaEtiqueta.value = celda.etiqueta
    celdaEtiqueta.font = { bold: true }

    const celdaValor = hoja.getCell(celda.celda_valor)
    celdaValor.value = valores.get(celda.etiqueta) ?? ""

    const motivo = pendientes.get(celda.etiqueta)
    if (motivo !== undefined) {
      celdaValor.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FONDO_PENDIENTE } }
      celdaValor.note = `Requiere confirmación: ${motivo}`
    }
    celdaValor.alignment = { wrapText: true, vertical: "middle" }
  }

  let datos: Buffer
  try {
    datos = Buffer.from(await libro.xlsx.writeBuffer())
  } catch {
    return { ok: false, error: `no se pudo generar el formulario Excel del caso "${caso}"` }
  }

  return escritor.bytes(datos, caso, "formulario.xlsx")
}
