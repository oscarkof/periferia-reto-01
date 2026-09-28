/**
 * Registro de ejecuciones (PRD §7.3 · RN5 y §6.3 · CA4).
 *
 * Toda llamada a herramienta deja rastro en dos sitios:
 *   · `out/<caso>/log.jsonl` — por caso, para auditar un registro concreto;
 *   · `out/log.jsonl`        — global, para ver la sesión completa.
 *
 * El registro nunca lanza: si no se puede escribir, se devuelve el error y la
 * herramienta decide (no se pierde el resultado del usuario por un fallo de log).
 */
import type { Escritor } from "./escritor.ts"
import type { Resultado } from "./tipos.ts"

/**
 * Formato de una línea de log.
 * RN5 fija `{ ts, herramienta, ok, resumen }`; se añade `sesion` para poder
 * reconstruir una conversación completa a partir del log global (campo aditivo).
 */
export interface EntradaLog {
  ts: string
  herramienta: string
  ok: boolean
  resumen: string
  sesion: string
}

/** Petición de registro: qué se ejecutó y cómo terminó. */
export interface PeticionLog {
  /** `null` cuando aún no se conoce el caso (p. ej. argumentos inválidos). */
  caso: string | null
  herramienta: string
  ok: boolean
  resumen: string
  sesion: string
}

/** Línea JSON de una entrada (sin salto final). */
export function serializarEntrada(entrada: EntradaLog): string {
  return JSON.stringify(entrada)
}

/**
 * Registra una ejecución en el log del caso y en el global.
 * `caso === null` escribe solo el global (p. ej. errores antes de saber el caso).
 */
export function registrar(escritor: Escritor, peticion: PeticionLog): Resultado<string[]> {
  const entrada: EntradaLog = {
    ts: marcaTiempo(),
    herramienta: peticion.herramienta,
    ok: peticion.ok,
    resumen: recortar(peticion.resumen),
    sesion: peticion.sesion,
  }
  const linea = serializarEntrada(entrada)

  const escritos: string[] = []
  const global = escritor.anexar(linea, "log.jsonl")
  if (!global.ok) return global
  escritos.push(global.data)

  if (peticion.caso !== null) {
    const porCaso = escritor.anexar(linea, peticion.caso, "log.jsonl")
    if (!porCaso.ok) return porCaso
    escritos.push(porCaso.data)
  }

  return { ok: true, data: escritos }
}

/** Marca de tiempo ISO de una entrada de log. */
export function marcaTiempo(ahora: Date = new Date()): string {
  return ahora.toISOString()
}

/** Los resúmenes del log se recortan para que el archivo no crezca sin control. */
function recortar(texto: string, limite = 500): string {
  const limpio = texto.replace(/\s+/g, " ").trim()
  return limpio.length <= limite ? limpio : `${limpio.slice(0, limite - 1)}…`
}
