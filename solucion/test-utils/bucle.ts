/**
 * Utilidades para probar el ciclo del agente con el adaptador de guion.
 *
 * `turno()` monta un turno completo contra el `out/` temporal del entorno, con
 * el prompt y el conocimiento reducidos a texto de prueba: lo que se prueba es
 * el bucle, no el contenido de esos archivos.
 */
import { ejecutarTurno } from "../src/agent/loop.ts"
import { crearSesion, type Sesion } from "../src/agent/sesion.ts"
import type { EventoTurno } from "../src/agent/eventos.ts"
import { crearAdaptadorMock, type PasoMock } from "../src/llm/mock.ts"
import type { EntornoPrueba } from "./herramientas.ts"

/** Caso de fixtures usado en las pruebas del bucle. */
export const CASO_PRUEBA = "co-industrias-delta"

/** Resultado de un turno, ya interpretado. */
export interface TurnoEjecutado {
  ok: boolean
  texto: string
  needsConfirmation: boolean
  eventos: EventoTurno[]
  sesion: Sesion
}

/** Ejecuta un turno con el guion dado. */
export async function turno(
  entorno: EntornoPrueba,
  guion: PasoMock[],
  mensaje: string,
  sesion: Sesion = crearSesion("s-prueba"),
  maxIteraciones?: number,
): Promise<TurnoEjecutado> {
  const eventos: EventoTurno[] = []
  const resultado = await ejecutarTurno({
    directorio: entorno.ctx.directory,
    sesion,
    mensajeUsuario: mensaje,
    adaptador: crearAdaptadorMock(guion),
    prompt: "comportamiento de prueba",
    conocimiento: "conocimiento de prueba",
    ...(maxIteraciones === undefined ? {} : { maxIteraciones }),
    emitir: (evento) => eventos.push(evento),
  })

  return {
    ok: resultado.ok,
    texto: resultado.ok ? resultado.data.texto : resultado.error,
    needsConfirmation: resultado.ok ? resultado.data.needsConfirmation : false,
    eventos,
    sesion,
  }
}

/** Eventos de un tipo concreto, ya estrechados para poder leer sus campos. */
export function eventosDe(tipo: EventoTurno["tipo"], eventos: EventoTurno[]): EventoTurno[] {
  return eventos.filter((evento) => evento.tipo === tipo)
}
