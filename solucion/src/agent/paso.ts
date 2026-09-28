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

/**
 * Herramienta que deja el paquete armado para firma.
 *
 * Cuando termina bien, el turno cierra con `proveedor_simular_envio` como acción
 * **pendiente**: es el paso natural después de armar el paquete y es lo que
 * permite que `needsConfirmation` y el front reflejen que falta un "sí". La
 * decisión sale del **resultado de la herramienta**, nunca del texto del modelo
 * (CA2), así que no depende de que el modelo se acuerde de preguntar.
 */
export const HERRAMIENTA_PAQUETE = "proveedor_armar_paquete"

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
  /** Caso cuyo paquete quedó armado en este turno. */
  let casoArmado: string | null = null
  /** ¿Se simuló el envío en este turno? Si sí, ya no queda nada que confirmar. */
  let envioSimulado = false

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
    const casoDeLaLlamada = String(argumentos["caso"] ?? "")

    if (llamada.nombre === HERRAMIENTA_ENVIO) {
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

    if (llamada.nombre !== HERRAMIENTA_ENVIO) {
      // El paquete recién armado es el candidato natural a envío simulado.
      if (llamada.nombre === HERRAMIENTA_PAQUETE && interpretada.ok) casoArmado = casoDeLaLlamada
      continue
    }

    if (!interpretada.ok && /confirmaci/i.test(interpretada.error ?? "")) {
      // Queda esperando un "sí" explícito en el turno siguiente (CA3).
      sesion.pendiente = {
        herramienta: llamada.nombre,
        argumentos: { ...argumentos, confirmado: true },
        descripcion: `simular el envío del caso "${casoDeLaLlamada}"`,
      }
    } else if (interpretada.ok) {
      envioSimulado = true
      sesion.pendiente = null
    }
  }

  // El turno cierra con el envío del último paquete armado como acción pendiente,
  // salvo que ya se haya simulado en este mismo turno. Se decide aquí y no dentro
  // del bucle para que el orden en que el modelo pida las herramientas no cambie
  // el resultado. Si el modelo no armó ningún paquete, se respeta lo que haya
  // dejado el intento de envío rechazado.
  if (casoArmado !== null && !envioSimulado) {
    sesion.pendiente = {
      herramienta: HERRAMIENTA_ENVIO,
      argumentos: { caso: casoArmado, confirmado: true },
      descripcion: `simular el envío del caso "${casoArmado}"`,
    }
  }

  return ejecutadas
}
