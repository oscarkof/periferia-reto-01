/**
 * Contexto compartido por las herramientas del proveedor.
 *
 * Aquí vive lo que las cinco herramientas necesitan por igual: resolver el
 * escritor a partir de `ctx.directory` (PRD §6.2), cargar de una vez el caso y
 * el repositorio, registrar la ejecución (RN5 · CA4) y auditar el mapeo que el
 * modelo devuelve.
 */
import path from "node:path"
import { z } from "zod"
import { cargarCaso } from "../core/casos.ts"
import { crearEscritor, type Escritor } from "../core/escritor.ts"
import { cargarGlosario, cargarIndiceSoportes, cargarMaestro } from "../core/fixtures.ts"
import { construirGlosario, type Glosario } from "../core/glosario.ts"
import { registrar } from "../core/log.ts"
import { fechaEjecucion } from "../core/soportes.ts"
import type {
  CampoMapeado,
  CasoLeido,
  Mapeo,
  Resultado,
  SoporteIndexado,
} from "../core/tipos.ts"
import { exito, fallo, type ContextoHerramienta } from "./contrato.ts"

/** Esquema de un campo ya mapeado, para volver a validar lo que envía el modelo. */
export const esquemaCampoMapeado = z.object({
  campo: z.string().describe("Etiqueta tal como la escribe el cliente"),
  estado: z.enum(["lleno", "faltante", "requiere_confirmacion"]),
  ruta_dato: z.string().nullable(),
  valor: z.unknown(),
  confianza: z.number(),
  nota: z.string().nullable(),
})

/** Esquema del mapeo que `mapear_campos` devuelve y `generar_formulario` recibe. */
export const esquemaMapeo = z.object({
  caso: z.string(),
  pais: z.string(),
  campos: z.array(esquemaCampoMapeado),
})

/** Todo lo que hace falta para operar sobre un caso. */
export interface ContextoCaso {
  leido: CasoLeido
  maestro: unknown
  glosario: Glosario
  indexados: SoporteIndexado[]
  fecha: string
}

/** Escritor de la ejecución: sale de `ctx.directory`, nunca de una ruta absoluta. */
export function escritorDe(ctx: ContextoHerramienta): Escritor {
  return crearEscritor(path.join(ctx.directory, "out"))
}

/** Carga el caso, el maestro, el glosario, el índice de soportes y la fecha. */
export function cargarTodo(caso: string): Resultado<ContextoCaso> {
  const leido = cargarCaso(caso)
  if (!leido.ok) return leido

  const maestro = cargarMaestro()
  if (!maestro.ok) return maestro

  const glosario = cargarGlosario()
  if (!glosario.ok) return glosario

  const indexados = cargarIndiceSoportes()
  if (!indexados.ok) return indexados

  return {
    ok: true,
    data: {
      leido: leido.data,
      maestro: maestro.data,
      glosario: construirGlosario(glosario.data),
      indexados: indexados.data,
      fecha: fechaEjecucion(),
    },
  }
}

/**
 * Ejecuta la acción de una herramienta, la registra y devuelve la respuesta del
 * contrato. Centraliza CA4 (toda llamada queda en el log) y CA5 (los errores
 * vuelven como `{ ok: false, error }`, la sesión no muere).
 */
export async function conRegistro<T extends object>(
  nombre: string,
  ctx: ContextoHerramienta,
  caso: string | null,
  accion: () => Promise<Resultado<T>> | Resultado<T>,
  resumir: (data: T) => string,
): Promise<string> {
  const escritor = escritorDe(ctx)
  const resultado = await accion()
  const resumen = resultado.ok ? resumir(resultado.data) : resultado.error
  const registro = registrar(escritor, {
    caso,
    herramienta: nombre,
    ok: resultado.ok,
    resumen,
    sesion: ctx.sessionId,
  })

  if (!resultado.ok) return fallo(resultado.error)
  if (registro.ok) return exito(resultado.data)
  return exito({ ...resultado.data, advertencias: [`no se pudo escribir el log de la ejecución: ${registro.error}`] })
}

/** Compara el mapeo que devolvió el modelo con el que el motor recalcula. */
function compararValor(recibido: unknown, real: unknown): boolean {
  return JSON.stringify(recibido) === JSON.stringify(real)
}

/** Vista mínima de un mapeo recibido del modelo: solo lo que se audita. */
export interface MapeoRecibido {
  campos: { campo: string; valor?: unknown }[]
}

/**
 * Audita el mapeo recibido frente al autoritativo.
 *
 * Es la salvaguarda anti-alucinación del PRD: el modelo puede devolver un mapeo
 * con valores "arreglados" y el motor **no los usa**. En lugar de confiar en él
 * se relee el maestro y se avisa de la discrepancia.
 */
export function auditarMapeo(recibido: MapeoRecibido | undefined, autoritativo: Mapeo): string[] {
  if (recibido === undefined) return []

  const porEtiqueta = new Map<string, CampoMapeado>(autoritativo.campos.map((campo) => [campo.campo, campo]))
  const alterados: string[] = []
  const desconocidos: string[] = []

  for (const campo of recibido.campos) {
    const real = porEtiqueta.get(campo.campo)
    if (real === undefined) {
      desconocidos.push(campo.campo)
      continue
    }
    if (!compararValor(campo.valor, real.valor)) alterados.push(campo.campo)
  }

  const omitidos = autoritativo.campos
    .filter((campo) => !recibido.campos.some((enviado) => enviado.campo === campo.campo))
    .map((campo) => campo.campo)

  const avisos: string[] = []
  if (alterados.length > 0) {
    avisos.push(
      `se ignoraron ${alterados.length} valor(es) del mapeo recibido que no coinciden con el repositorio maestro (${alterados.join(", ")}): los valores se releen siempre del maestro`,
    )
  }
  if (desconocidos.length > 0) {
    avisos.push(`el mapeo recibido traía campos que no están en la plantilla del caso (${desconocidos.join(", ")})`)
  }
  if (omitidos.length > 0) {
    avisos.push(`el mapeo recibido omitía campos del caso (${omitidos.join(", ")})`)
  }
  return avisos
}
