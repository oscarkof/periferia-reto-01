/**
 * Formulario PDF (P1 · HU-3).
 *
 * El PRD acepta un PDF **generado** (no un AcroForm rellenado) siempre que
 * reproduzca todos los campos con etiqueta y valor, en el orden de
 * `plantilla-campos.json`.
 *
 * Determinismo: `CreationDate` y `ModDate` se fijan, así que el archivo es
 * idéntico entre ejecuciones consecutivas.
 */
import PDFDocument from "pdfkit"
import type { Escritor } from "../core/escritor.ts"
import type { CampoPlantilla, Resultado } from "../core/tipos.ts"

const FECHA_FIJA = new Date("2026-01-01T00:00:00.000Z")
const MARGEN = 50
const ANCHO_ETIQUETA = 190
const ANCHO_VALOR = 280
const ALTO_LINEA = 16

/** Valor que se imprime cuando el campo no tiene dato en el maestro. */
const SIN_DATO = "—"

/** Genera `out/<caso>/formulario.pdf` respetando el orden de la plantilla. */
export async function escribirPdf(
  escritor: Escritor,
  caso: string,
  campos: CampoPlantilla[],
  valores: Map<string, string>,
  pendientes: Map<string, string>,
): Promise<Resultado<string>> {
  const documento = new PDFDocument({
    size: "A4",
    margin: MARGEN,
    info: {
      Title: `Formulario de registro de proveedor · ${caso}`,
      Author: "Agente de registro de proveedores",
      CreationDate: FECHA_FIJA,
      ModDate: FECHA_FIJA,
    },
  })
  // Refuerzo: algunas versiones de pdfkit ignoran `info` de las opciones.
  documento.info["CreationDate"] = FECHA_FIJA
  documento.info["ModDate"] = FECHA_FIJA

  const partes: Buffer[] = []
  documento.on("data", (trozo: Buffer) => partes.push(trozo))
  const terminado = new Promise<void>((resolver) => documento.on("end", () => resolver()))

  try {
    documento.font("Helvetica-Bold").fontSize(15).text("Formulario de registro de proveedor", MARGEN, MARGEN)
    documento.font("Helvetica").fontSize(9).fillColor("#555555").text(`Caso: ${caso}`, MARGEN, MARGEN + 20)
    documento.fillColor("#000000")
    documento.moveDown(2)

    let y = documento.y
    for (const campo of campos) {
      const motivo = pendientes.get(campo.etiqueta)
      const tieneValor = valores.has(campo.etiqueta)
      const valor = tieneValor ? (valores.get(campo.etiqueta) ?? "") : SIN_DATO

      const etiqueta = campo.obligatorio ? `${campo.etiqueta} *` : campo.etiqueta
      const alto = Math.max(
        documento.heightOfString(etiqueta, { width: ANCHO_ETIQUETA }),
        documento.heightOfString(valor, { width: ANCHO_VALOR }),
        ALTO_LINEA,
      )

      documento.font("Helvetica-Bold").fontSize(10).fillColor("#000000")
      documento.text(etiqueta, MARGEN, y, { width: ANCHO_ETIQUETA })

      if (motivo !== undefined) {
        documento.font("Helvetica-Oblique").fontSize(10).fillColor("#8A6100")
      } else {
        documento.font("Helvetica").fontSize(10).fillColor(tieneValor ? "#000000" : "#888888")
      }
      documento.text(valor, MARGEN + ANCHO_ETIQUETA + 10, y, { width: ANCHO_VALOR })

      y += alto + 6
      if (y > documento.page.height - MARGEN - 60) {
        documento.addPage()
        y = MARGEN
      }
    }

    documento.fillColor("#000000")
    documento.font("Helvetica").fontSize(8)
    documento.text(
      "* campo marcado como obligatorio por el cliente. En ámbar, los valores que requieren confirmación humana antes de firmar; con “—”, los que no existen en el repositorio maestro.",
      MARGEN,
      Math.min(y + 12, documento.page.height - MARGEN - 30),
      { width: documento.page.width - MARGEN * 2 },
    )

    documento.end()
    await terminado
  } catch {
    return { ok: false, error: `no se pudo generar el formulario PDF del caso "${caso}"` }
  }

  return escritor.bytes(Buffer.concat(partes), caso, "formulario.pdf")
}
