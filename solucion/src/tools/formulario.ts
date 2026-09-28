/**
 * Generación del formulario en el formato que pidió el cliente (HU-3).
 *
 * Lo comparten dos herramientas: `proveedor_generar_formulario` (cuando el
 * usuario pide solo el formulario) y `proveedor_armar_paquete` (que necesita el
 * formulario dentro del paquete). Al vivir en un solo sitio, no hay dos formas
 * distintas de rellenar el mismo formulario.
 */
import type { Escritor } from "../core/escritor.ts"
import type { CasoLeido, Formato, Mapeo, Resultado } from "../core/tipos.ts"
import { escribirPdf } from "./formato-pdf.ts"
import { escribirValoresPortal } from "./formato-portal.ts"
import { escribirXlsx } from "./formato-xlsx.ts"
import { pendientesPorEtiqueta, valoresPorEtiqueta } from "./valores.ts"

/** Lo que produce la generación de un formulario. */
export interface FormularioGenerado {
  /** Formato declarado por la solicitud. */
  formato: Formato
  /** ¿El proceso sabe generar este formato? El portal NO se automatiza. */
  soportado: boolean
  /** Nombre del archivo dentro de `out/<caso>/`. */
  archivo: string
  /** Ruta absoluta del archivo generado. */
  ruta: string
  /** Explicación cuando el formato no está soportado. */
  nota: string | null
}

/** Nombre del archivo de formulario según el formato. */
export function nombreArchivoFormulario(formato: Formato): string {
  if (formato === "xlsx") return "formulario.xlsx"
  if (formato === "pdf") return "formulario.pdf"
  return "valores-portal.md"
}

/**
 * Escribe el formulario del caso en `out/<caso>/`.
 * Es idempotente: llamarlo dos veces sobrescribe el mismo archivo.
 */
export async function generarFormulario(
  escritor: Escritor,
  leido: CasoLeido,
  mapeo: Mapeo,
): Promise<Resultado<FormularioGenerado>> {
  const valores = valoresPorEtiqueta(mapeo)
  const pendientes = pendientesPorEtiqueta(mapeo)
  const formato = leido.solicitud.formato

  if (formato === "xlsx") {
    const escrito = await escribirXlsx(escritor, leido.caso, leido.plantilla_celdas, valores, pendientes)
    if (!escrito.ok) return escrito
    return {
      ok: true,
      data: { formato, soportado: true, archivo: "formulario.xlsx", ruta: escrito.data, nota: null },
    }
  }

  if (formato === "pdf") {
    const escrito = await escribirPdf(escritor, leido.caso, leido.plantilla_campos, valores, pendientes)
    if (!escrito.ok) return escrito
    return {
      ok: true,
      data: { formato, soportado: true, archivo: "formulario.pdf", ruta: escrito.data, nota: null },
    }
  }

  // Formato `portal`: no se implementa el llenado (P2 · HU-3).
  const escrito = escribirValoresPortal(escritor, leido.caso, leido.plantilla_campos, valores, pendientes)
  if (!escrito.ok) return escrito
  return {
    ok: true,
    data: {
      formato,
      soportado: false,
      archivo: "valores-portal.md",
      ruta: escrito.data,
      nota: `formato no soportado: el cliente pide cargar los datos en un portal web (${leido.solicitud.cliente}); se dejaron los valores listos para copiar`,
    },
  }
}
