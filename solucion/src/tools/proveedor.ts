/**
 * Herramientas del agente de registro como proveedor (PRD §6.2).
 *
 * El nombre que ve el modelo es `<archivo>_<export>`, así que los cinco exports
 * de este archivo se llaman como el contrato: `proveedor_leer_solicitud`,
 * `proveedor_mapear_campos`, `proveedor_generar_formulario`,
 * `proveedor_armar_paquete` y `proveedor_simular_envio`.
 *
 * Dos decisiones de diseño que conviene tener presentes:
 *
 *  1. **Los valores se releen siempre del maestro.** `generar_formulario` acepta
 *     el mapeo que devolvió el modelo, pero no se fía de él: recalcula el mapeo
 *     con el motor determinista y avisa de cualquier discrepancia. Así un valor
 *     "arreglado" por el modelo no llega nunca al formulario.
 *  2. **Ninguna herramienta lanza.** Devuelven string JSON con
 *     `{ ok: true, data }` o `{ ok: false, error }`, y toda ejecución deja
 *     registro en `out/<caso>/log.jsonl` y `out/log.jsonl` (RN5 · CA4).
 */
import { z } from "zod"
import { mapearCampos } from "../core/mapeo.ts"
import { evaluarSoportes } from "../core/soportes.ts"
import { nombreHerramienta, type Herramienta } from "./contrato.ts"
import { auditarMapeo, cargarTodo, conRegistro, escritorDe, esquemaMapeo } from "./contexto.ts"
import { generarFormulario, nombreArchivoFormulario } from "./formulario.ts"
import { armarPaquete } from "./paquete.ts"
import { textoEnvioSimulado } from "./paquete-textos.ts"
import { resumenMapeo } from "./valores.ts"

const ARCHIVO = "proveedor"

/** Argumento compartido: el nombre del caso. */
const argsCaso = z.object({
  caso: z.string().min(1).describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
})

/** 1 · Leer la solicitud (P0 · HU-1). */
export const leer_solicitud: Herramienta<typeof argsCaso> = {
  description:
    "Lee el correo y la plantilla de un caso y devuelve el país, el cliente, el formato de salida, la lista de campos que pide el cliente y los soportes que exige.",
  args: argsCaso,
  async execute(args, ctx) {
    return conRegistro(
      nombreHerramienta(ARCHIVO, "leer_solicitud"),
      ctx,
      args.caso,
      () => {
        const cargado = cargarTodo(args.caso)
        if (!cargado.ok) return cargado
        const { leido, fecha } = cargado.data
        return {
          ok: true,
          data: {
            caso: leido.caso,
            pais: leido.solicitud.pais,
            cliente: leido.solicitud.cliente,
            formato: leido.solicitud.formato,
            campos: leido.campos,
            soportes: leido.soportes_exigidos,
            ambiguos: leido.ambiguos,
            total_campos: leido.campos.length,
            fecha_ejecucion: fecha,
          },
        }
      },
      (data) => `${data.caso}: ${data.pais}/${data.formato}, ${data.total_campos} campos, ${data.soportes.length} soportes`,
    )
  },
}

/** 2 · Mapear campos contra el maestro (P0 · HU-2). */
export const mapear_campos: Herramienta<z.ZodObject<{ caso: z.ZodString; campos: z.ZodArray<z.ZodString> }>> = {
  description:
    "Cruza cada etiqueta pedida con el repositorio maestro usando el glosario y devuelve los campos llenos, los que faltan y los que requieren confirmación humana. Nunca inventa valores.",
  args: z.object({
    caso: z.string().min(1).describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
    campos: z
      .array(z.string().min(1))
      .min(1)
      .describe("Etiquetas tal como las escribe el cliente, en el orden de la plantilla"),
  }),
  async execute(args, ctx) {
    return conRegistro(
      nombreHerramienta(ARCHIVO, "mapear_campos"),
      ctx,
      args.caso,
      () => {
        const cargado = cargarTodo(args.caso)
        if (!cargado.ok) return cargado
        const { leido, maestro, glosario } = cargado.data
        const mapeo = mapearCampos({
          caso: leido.caso,
          pais: leido.solicitud.pais,
          campos: args.campos,
          maestro,
          glosario,
        })
        return {
          ok: true,
          data: {
            caso: mapeo.caso,
            pais: mapeo.pais,
            llenos: mapeo.llenos,
            faltantes: mapeo.faltantes,
            requiere_confirmacion: mapeo.requiere_confirmacion,
            total: mapeo.campos.length,
            resumen: resumenMapeo(mapeo),
          },
        }
      },
      (data) => `${data.caso}: ${data.resumen}`,
    )
  },
}

/** 3 · Generar el formulario en el formato pedido (P0 xlsx · P1 pdf · P2 portal). */
export const generar_formulario: Herramienta<
  z.ZodObject<{ caso: z.ZodString; mapeo: z.ZodOptional<typeof esquemaMapeo> }>
> = {
  description:
    "Genera el formulario del caso en el formato que pidió el cliente (Excel, PDF o, si pide un portal web, la hoja de valores lista para copiar) y devuelve la ruta del archivo.",
  args: z.object({
    caso: z.string().min(1).describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
    mapeo: esquemaMapeo
      .optional()
      .describe(
        "Mapeo devuelto por proveedor_mapear_campos. Es opcional a propósito: los valores se releen siempre del repositorio maestro, así que un mapeo alterado no cambia el formulario.",
      ),
  }),
  async execute(args, ctx) {
    return conRegistro(
      nombreHerramienta(ARCHIVO, "generar_formulario"),
      ctx,
      args.caso,
      async () => {
        const cargado = cargarTodo(args.caso)
        if (!cargado.ok) return cargado
        const { leido, maestro, glosario } = cargado.data

        // El mapeo autoritativo lo produce el motor, no el modelo.
        const autoritativo = mapearCampos({
          caso: leido.caso,
          pais: leido.solicitud.pais,
          campos: leido.campos,
          maestro,
          glosario,
        })
        const advertencias = auditarMapeo(args.mapeo, autoritativo)

        const generado = await generarFormulario(escritorDe(ctx), leido, autoritativo)
        if (!generado.ok) return generado
        return { ok: true, data: { ...generado.data, advertencias } }
      },
      (data) => `${data.formato} generado en ${data.ruta}`,
    )
  },
}

/** 4 · Armar el paquete para firma (P0 · HU-4). */
export const armar_paquete: Herramienta<typeof argsCaso> = {
  description:
    "Genera el formulario si hace falta y arma el paquete para firma en out/<caso>/paquete/: formulario, copias de los soportes exigidos, checklist.md y borrador-correo.md. Devuelve si está listo para firma y qué lo bloquea.",
  args: argsCaso,
  async execute(args, ctx) {
    return conRegistro(
      nombreHerramienta(ARCHIVO, "armar_paquete"),
      ctx,
      args.caso,
      async () => {
        const cargado = cargarTodo(args.caso)
        if (!cargado.ok) return cargado
        const { leido, maestro, glosario, indexados, fecha } = cargado.data

        const mapeo = mapearCampos({
          caso: leido.caso,
          pais: leido.solicitud.pais,
          campos: leido.campos,
          maestro,
          glosario,
        })

        const escritor = escritorDe(ctx)
        const formulario = await generarFormulario(escritor, leido, mapeo)
        if (!formulario.ok) return formulario

        const checklist = evaluarSoportes({
          caso: leido.caso,
          exigidos: leido.soportes_exigidos,
          indexados,
          fecha,
        })

        const paquete = await armarPaquete(escritor, leido, mapeo, checklist, formulario.data.archivo)
        if (!paquete.ok) return paquete

        return {
          ok: true,
          data: {
            ...paquete.data,
            fecha_ejecucion: fecha,
            formulario_soportado: formulario.data.soportado,
            nota_formulario: formulario.data.nota,
            resumen_mapeo: resumenMapeo(mapeo),
          },
        }
      },
      (data) =>
        `${data.ruta}: ${data.archivos.length} archivos, listo_para_firma=${data.listo_para_firma}`,
    )
  },
}

/** Argumentos del envío simulado: exige confirmación explícita (RN4). */
const argsEnvio = z.object({
  caso: z.string().min(1).describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
  confirmado: z
    .boolean()
    .describe(
      "true SOLO si el usuario confirmó explícitamente el envío en el turno inmediatamente anterior. Con false, la herramienta se niega y explica por qué.",
    ),
})

/** 5 · Simular el envío (P1 · HU-4 · RN4). */
export const simular_envio: Herramienta<typeof argsEnvio> = {
  description:
    "Simula el envío del paquete escribiendo out/<caso>/ENVIO-SIMULADO.md. No envía nada real: exige que el usuario haya confirmado explícitamente el envío en el turno anterior y que el paquete ya esté armado.",
  args: argsEnvio,
  async execute(args, ctx) {
    return conRegistro(
      nombreHerramienta(ARCHIVO, "simular_envio"),
      ctx,
      args.caso,
      () => {
        if (!args.confirmado) {
          return {
            ok: false,
            error: `requiere confirmación explícita: el usuario todavía no confirmó el envío del caso "${args.caso}"`,
          }
        }

        const cargado = cargarTodo(args.caso)
        if (!cargado.ok) return cargado
        const { leido, indexados, fecha } = cargado.data
        const escritor = escritorDe(ctx)

        if (!escritor.existe(leido.caso, "paquete", "checklist.md")) {
          return {
            ok: false,
            error: `el paquete del caso "${leido.caso}" aún no está armado: llama antes a proveedor_armar_paquete`,
          }
        }

        const checklist = evaluarSoportes({
          caso: leido.caso,
          exigidos: leido.soportes_exigidos,
          indexados,
          fecha,
        })
        const adjuntos = [
          nombreArchivoFormulario(leido.solicitud.formato),
          "checklist.md",
          "borrador-correo.md",
          ...checklist.soportes
            .filter((soporte) => soporte.archivo !== null)
            .map((soporte) => `soportes/${soporte.archivo ?? ""}`),
        ]
        const carpeta = escritor.ruta(leido.caso, "paquete")
        if (!carpeta.ok) return carpeta

        const escrito = escritor.texto(
          textoEnvioSimulado(leido, checklist, carpeta.data, adjuntos),
          leido.caso,
          "ENVIO-SIMULADO.md",
        )
        if (!escrito.ok) return escrito

        return {
          ok: true,
          data: {
            ruta: escrito.data,
            enviado: false,
            adjuntos,
            listo_para_firma: checklist.listo_para_firma,
            fecha_ejecucion: fecha,
          },
        }
      },
      (data) => `envío simulado en ${data.ruta}: ${data.adjuntos.length} adjuntos, nada se envió`,
    )
  },
}

/** Las cinco herramientas del reto, indexadas por su nombre de export. */
export const HERRAMIENTAS = {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} as const

/** Nombre visible por el modelo (`<archivo>_<export>`). */
export type NombreHerramienta = `proveedor_${keyof typeof HERRAMIENTAS}`

/** Los cinco nombres, en el orden del contrato del PRD. */
export const NOMBRES: NombreHerramienta[] = [
  nombreHerramienta(ARCHIVO, "leer_solicitud"),
  nombreHerramienta(ARCHIVO, "mapear_campos"),
  nombreHerramienta(ARCHIVO, "generar_formulario"),
  nombreHerramienta(ARCHIVO, "armar_paquete"),
  nombreHerramienta(ARCHIVO, "simular_envio"),
]

/** Vista genérica que usa el backend para ejecutar cualquier herramienta (F3). */
export type HerramientaGenerica = Herramienta<z.ZodTypeAny>

/**
 * Reinterpreta una herramienta concreta como la vista genérica.
 * Es el único punto del módulo donde hace falta una aserción de tipo: los cinco
 * esquemas son distintos y el backend los trata de forma uniforme.
 */
function comoGenerica<Esquema extends z.ZodTypeAny>(herramienta: Herramienta<Esquema>): HerramientaGenerica {
  return herramienta as HerramientaGenerica
}

/** Herramientas con su nombre visible, para el backend y para `demo.ts`. */
export function listarHerramientas(): { nombre: NombreHerramienta; herramienta: HerramientaGenerica }[] {
  return [
    { nombre: nombreHerramienta(ARCHIVO, "leer_solicitud"), herramienta: comoGenerica(leer_solicitud) },
    { nombre: nombreHerramienta(ARCHIVO, "mapear_campos"), herramienta: comoGenerica(mapear_campos) },
    { nombre: nombreHerramienta(ARCHIVO, "generar_formulario"), herramienta: comoGenerica(generar_formulario) },
    { nombre: nombreHerramienta(ARCHIVO, "armar_paquete"), herramienta: comoGenerica(armar_paquete) },
    { nombre: nombreHerramienta(ARCHIVO, "simular_envio"), herramienta: comoGenerica(simular_envio) },
  ]
}
