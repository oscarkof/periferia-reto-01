/**
 * Ejecución de los casos de fixtures SIN modelo de lenguaje (PRD §6.6).
 *
 * `demo.ts` usa este módulo para recorrer todos los casos llamando directamente
 * a las herramientas y devolver un resumen estable (sin timestamps) que permita
 * comprobar el determinismo comparando dos ejecuciones.
 *
 * Vive aparte de `demo.ts` para que el punto de entrada sea solo el CLI.
 */
import path from "node:path"
import { dirProyecto } from "../core/rutas.ts"
import type { ContextoHerramienta } from "../tools/contrato.ts"
import {
  armar_paquete,
  generar_formulario,
  leer_solicitud,
  mapear_campos,
  simular_envio,
} from "../tools/proveedor.ts"

/** Respuesta del contrato, tal como la devuelven las herramientas. */
interface Respuesta {
  ok: boolean
  data?: Record<string, unknown>
  error?: string
}

/** Lo que el demo necesita leer de cada herramienta (tipado, sin `any`). */
interface DatosSolicitud {
  caso: string
  pais: string
  cliente: string
  formato: string
  campos: string[]
  soportes: string[]
}
interface DatosMapeo {
  resumen: string
  llenos: { campo: string }[]
  requiere_confirmacion: { campo: string; nota: string | null }[]
  faltantes: { campo: string }[]
}
interface DatosFormulario {
  formato: string
  soportado: boolean
  archivo: string
  ruta: string
  nota: string | null
  advertencias: string[]
}
interface DatosPaquete {
  ruta: string
  listo_para_firma: boolean
  archivos: string[]
  checklist: { presentes: string[]; ausentes: string[]; vencidos: string[]; bloqueos: string[] }
}
interface DatosEnvio {
  ruta: string
  enviado: boolean
  adjuntos: string[]
}

/** Contexto de las herramientas para la ejecución del demo. */
export function contextoDemo(): ContextoHerramienta {
  return { directory: dirProyecto(), sessionId: "demo" }
}

/** Parsea la respuesta del contrato sin exigir éxito (para comprobar rechazos). */
export function parsear(json: string): Respuesta {
  return JSON.parse(json) as Respuesta
}

/** Parsea la respuesta del contrato y lanza con mensaje claro si es error. */
export function interpretar(json: string, herramienta: string): Respuesta {
  const respuesta = parsear(json)
  if (!respuesta.ok) throw new Error(`${herramienta} falló: ${respuesta.error ?? "sin detalle"}`)
  return respuesta
}

/** `interpretar` + datos ya tipados. */
export function datos<T>(json: string, herramienta: string): T {
  return interpretar(json, herramienta).data as T
}

/** Ruta relativa al proyecto: el resumen no debe depender de la máquina. */
export function relativa(ruta: string): string {
  return path.relative(dirProyecto(), ruta)
}

/** Resumen estable (sin timestamps) de un caso, para `out/resumen.json`. */
export interface ResumenCaso {
  caso: string
  pais: string
  formato: string
  campos: { total: number; llenos: number; por_confirmar: number; faltantes: number }
  por_confirmar: string[]
  faltantes: string[]
  soportes: { presentes: string[]; ausentes: string[]; vencidos: string[] }
  listo_para_firma: boolean
  bloqueos: string[]
  archivos: string[]
  archivo_formulario: string
  envio_rechazado_sin_confirmacion: boolean
  envio_simulado: string | null
}

/**
 * Recorre el ciclo completo de un caso llamando a las herramientas una por una.
 *
 * Incluye una **comprobación activa de RN4**: `simular_envio` debe negarse con
 * `confirmado: false`. Si aceptara el envío, el demo falla en vez de ocultarlo.
 */
export async function procesarCaso(caso: string, conEnvio: boolean): Promise<ResumenCaso> {
  const ctx = contextoDemo()

  const solicitud = datos<DatosSolicitud>(await leer_solicitud.execute({ caso }, ctx), "proveedor_leer_solicitud")
  const mapeo = datos<DatosMapeo>(
    await mapear_campos.execute({ caso, campos: solicitud.campos }, ctx),
    "proveedor_mapear_campos",
  )
  const formulario = datos<DatosFormulario>(
    await generar_formulario.execute({ caso }, ctx),
    "proveedor_generar_formulario",
  )
  const paquete = datos<DatosPaquete>(await armar_paquete.execute({ caso }, ctx), "proveedor_armar_paquete")

  // RN4: sin confirmación explícita el envío DEBE negarse, y explicando por qué.
  const sinConfirmar = parsear(await simular_envio.execute({ caso, confirmado: false }, ctx))
  if (sinConfirmar.ok) {
    throw new Error("simular_envio aceptó un envío sin confirmación explícita: RN4 está roto")
  }
  if (!/confirmaci/i.test(sinConfirmar.error ?? "")) {
    throw new Error(`simular_envio rechazó el envío pero sin explicar la causa: ${sinConfirmar.error ?? "(sin error)"}`)
  }

  let envioSimulado: string | null = null
  if (conEnvio) {
    const envio = datos<DatosEnvio>(
      await simular_envio.execute({ caso, confirmado: true }, ctx),
      "proveedor_simular_envio",
    )
    envioSimulado = relativa(envio.ruta)
  }

  return {
    caso,
    pais: solicitud.pais,
    formato: solicitud.formato,
    campos: {
      total: mapeo.llenos.length + mapeo.requiere_confirmacion.length + mapeo.faltantes.length,
      llenos: mapeo.llenos.length,
      por_confirmar: mapeo.requiere_confirmacion.length,
      faltantes: mapeo.faltantes.length,
    },
    por_confirmar: mapeo.requiere_confirmacion.map((campo) => campo.campo),
    faltantes: mapeo.faltantes.map((campo) => campo.campo),
    soportes: {
      presentes: paquete.checklist.presentes,
      ausentes: paquete.checklist.ausentes,
      vencidos: paquete.checklist.vencidos,
    },
    listo_para_firma: paquete.listo_para_firma,
    bloqueos: paquete.checklist.bloqueos,
    archivos: paquete.archivos,
    archivo_formulario: relativa(path.join(formulario.ruta, "..", formulario.archivo)),
    envio_rechazado_sin_confirmacion: true,
    envio_simulado: envioSimulado,
  }
}
