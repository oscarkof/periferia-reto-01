/**
 * Soportes exigidos, vencimientos y veredicto de firma (PRD §7.3 · RN3).
 *
 * "Un soporte vencido bloquea `listo_para_firma`. Un soporte exigido ausente lo
 * bloquea. Un campo `faltante` **no** lo bloquea, pero aparece en el checklist."
 *
 * Módulo puro: recibe el índice de soportes ya cargado.
 */
import type { Bloqueo, ChecklistSoportes, SoporteEvaluado, SoporteIndexado } from "./tipos.ts"

/** Motivos de bloqueo, para que el consumidor no dependa del texto. */
export const MOTIVO_AUSENTE = "soporte_ausente"
export const MOTIVO_VENCIDO = "soporte_vencido"

/**
 * Fecha de ejecución (la que decide vencimientos).
 * Se puede fijar con `FECHA_EJECUCION=YYYY-MM-DD` para que las pruebas sean
 * reproducibles; por defecto usa la fecha local del equipo.
 */
export function fechaEjecucion(ahora: Date = new Date()): string {
  const override = process.env["FECHA_EJECUCION"]
  if (override !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(override.trim())) return override.trim()

  const y = ahora.getFullYear()
  const m = String(ahora.getMonth() + 1).padStart(2, "0")
  const d = String(ahora.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * ¿El soporte está vencido en `fecha`? `vigencia_hasta === null` significa que
 * el soporte no vence (p. ej. el RUT). Las fechas ISO `YYYY-MM-DD` se comparan
 * correctamente como texto.
 */
export function estaVencido(vigenciaHasta: string | null, fecha: string): boolean {
  if (vigenciaHasta === null) return false
  return vigenciaHasta < fecha
}

/** Evalúa un soporte exigido contra el índice del repositorio. */
export function evaluarSoporte(tipo: string, indexados: SoporteIndexado[], fecha: string): SoporteEvaluado {
  const encontrado = indexados.find((s) => s.tipo === tipo)
  if (encontrado === undefined) {
    return { tipo, estado: "ausente", archivo: null, vigencia_hasta: null, pais_emisor: null, descripcion: null }
  }
  return {
    tipo,
    estado: estaVencido(encontrado.vigencia_hasta, fecha) ? "vencido" : "presente",
    archivo: encontrado.archivo,
    vigencia_hasta: encontrado.vigencia_hasta,
    pais_emisor: encontrado.pais_emisor,
    descripcion: encontrado.descripcion,
  }
}

/** Datos necesarios para armar el checklist de un caso. */
export interface EntradaChecklist {
  caso: string
  exigidos: string[]
  indexados: SoporteIndexado[]
  fecha: string
}

/**
 * Arma el checklist de soportes y decide si el paquete puede pasar a firma.
 * Un campo `faltante` del formulario no entra aquí: eso es otro checklist.
 */
export function evaluarSoportes(entrada: EntradaChecklist): ChecklistSoportes {
  const soportes = entrada.exigidos.map((tipo) => evaluarSoporte(tipo, entrada.indexados, entrada.fecha))

  const presentes = soportes.filter((s) => s.estado === "presente").map((s) => s.tipo)
  const ausentes = soportes.filter((s) => s.estado === "ausente").map((s) => s.tipo)
  const vencidos = soportes.filter((s) => s.estado === "vencido").map((s) => s.tipo)

  const bloqueos: Bloqueo[] = []
  for (const soporte of soportes) {
    if (soporte.estado === "ausente") {
      bloqueos.push({ motivo: MOTIVO_AUSENTE, detalle: `falta el soporte "${soporte.tipo}" en el repositorio` })
    }
    if (soporte.estado === "vencido") {
      bloqueos.push({
        motivo: MOTIVO_VENCIDO,
        detalle: `"${soporte.tipo}" venció el ${soporte.vigencia_hasta ?? "?"} (fecha de ejecución ${entrada.fecha})`,
      })
    }
  }

  return {
    caso: entrada.caso,
    soportes,
    presentes,
    ausentes,
    vencidos,
    listo_para_firma: bloqueos.length === 0,
    bloqueos,
  }
}
