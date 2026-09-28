/**
 * Ejecución de las llamadas a herramientas de una respuesta del modelo.
 *
 * Aquí viven las dos reglas que el PRD no deja en manos del prompt:
 *   · **CA2**: la herramienta es la única fuente de valores (el mapeo que
 *     devuelva el modelo se audita dentro de la propia herramienta);
 *   · **CA3 · RN4**: el valor de `confirmado` lo impone este código a partir del
 *     mensaje del usuario, nunca el modelo.
 */
import { ejecutarValidando, type ContextoHerramienta, type HerramientaGenerica } from "../tools/contrato.ts"
import type { LlamadaHerramienta } from "../llm/adapter.ts"
import { interpretarRespuestaHerramienta, resumirRespuesta, type EventoTurno } from "./eventos.ts"
import type { AccionPendiente, Sesion } from "./sesion.ts"

/** Herramienta cuyo uso está gobernado por la confirmación humana. */
export const HERRAMIENTA_ENVIO = "proveedor_simular_envio"

/** Aviso cuando el modelo intenta saltarse RN4. */
export const AVISO_SIN_CONFIRMACION =
  "el modelo intentó ejecutar el envío sin confirmación previa del usuario: se forzó confirmado=false (RN4)"

export interface OpcionesPaso {
  sesion: Sesion
  llamadas: LlamadaHerramienta[]
  indice: Map<string, HerramientaGenerica>
  nombresDisponibles: string[]
  contexto: ContextoHerramienta
  pendientePrevio: AccionPendiente | null
  /** ¿El mensaje del usuario en este turno es una confirmación explícita? */
  confirma: boolean
  /** Escritor de eventos del turno. */
  emitir: (evento: EventoTurno) => void
}

/**
 * Ejecuta todas las llamadas y devuelve cuántas se intentaron.
 * Los resultados se añaden al historial de la sesión (CA4).
 */
export async function ejecutarLlamadas(opciones: OpcionesPaso): Promise<number> {
  const { sesion, llamadas, indice, nombresDisponibles, contexto, pendientePrevio, confirma, emitir } = opciones
  let ejecutadas = 0

  for (const llamada of llamadas) {
    ejecutadas += 1
    const implementacion = indice.get(llamada.nombre)

    if (implementacion === undefined) {
      const error = `herramienta desconocida "${llamada.nombre}". Disponibles: ${nombresDisponibles.join(", ")}`
      emitir({ tipo: "resultado", nombre: llamada.nombre, ok: false, resumen: error })
      sesion.mensajes.push({ rol: "tool", contenido: JSON.stringify({ ok: false, error }), idLlamada: llamada.id })
      continue
    }

    let argumentos = llamada.argumentos
    let autorizada = false

    if (llamada.nombre === HERRAMIENTA_ENVIO) {
      const casoDeLaLlamada = String(argumentos["caso"] ?? "")
      const esLaPendiente =
        pendientePrevio !== null &&
        pendientePrevio.herramienta === llamada.nombre &&
        String(pendientePrevio.argumentos["caso"] ?? "") === casoDeLaLlamada

      autorizada = confirma && (pendientePrevio === null || esLaPendiente)
      if (argumentos["confirmado"] === true && !autorizada) {
        emitir({ tipo: "aviso", texto: AVISO_SIN_CONFIRMACION })
      }
      // El ciclo impone el valor: el modelo no puede autorizarse a sí mismo.
      argumentos = { ...argumentos, confirmado: autorizada }
    }

    emitir({ tipo: "llamada", nombre: llamada.nombre, argumentos })
    const salida = await ejecutarValidando(implementacion, llamada.nombre, argumentos, contexto)
    const interpretada = interpretarRespuestaHerramienta(salida)
    emitir({
      tipo: "resultado",
      nombre: llamada.nombre,
      ok: interpretada.ok,
      resumen: resumirRespuesta(interpretada),
    })
    sesion.mensajes.push({ rol: "tool", contenido: salida, idLlamada: llamada.id })

    if (llamada.nombre !== HERRAMIENTA_ENVIO) continue

    if (!interpretada.ok && /confirmaci/i.test(interpretada.error ?? "")) {
      // Queda esperando un "sí" explícito en el turno siguiente (CA3).
      sesion.pendiente = {
        herramienta: llamada.nombre,
        argumentos: { ...argumentos, confirmado: true },
        descripcion: `simular el envío del caso "${String(argumentos["caso"] ?? "?")}"`,
      }
    } else if (interpretada.ok) {
      sesion.pendiente = null
    }
  }

  return ejecutadas
}
