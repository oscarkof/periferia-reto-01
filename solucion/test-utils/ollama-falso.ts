/**
 * Servidor que imita `/api/chat` de Ollama para probar el adaptador sin depender
 * de que el modelo esté descargado o el servicio levantado.
 *
 * Guarda cada petición recibida, así que las pruebas pueden afirmar qué se envió
 * (por ejemplo, la ventana de contexto `num_ctx`).
 */
import http from "node:http"

/** Respuesta programada para la siguiente petición. */
export interface RespuestaProgramada {
  codigo?: number
  cuerpo: unknown
}

/** Ollama de mentira. */
export interface OllamaFalso {
  /** URL base para pasar al adaptador. */
  url: string
  /** Programa las respuestas a devolver, en orden. */
  programar: (respuestas: RespuestaProgramada[]) => void
  /** Peticiones recibidas, ya parseadas. */
  peticiones: Record<string, unknown>[]
  cerrar: () => Promise<void>
}

/** Levanta el servidor falso en un puerto libre. */
export async function levantarOllamaFalso(): Promise<OllamaFalso> {
  let cola: RespuestaProgramada[] = []
  const peticiones: Record<string, unknown>[] = []

  const servidor = http.createServer((peticion, respuesta) => {
    let crudo = ""
    peticion.on("data", (trozo) => {
      crudo += String(trozo)
    })
    peticion.on("end", () => {
      peticiones.push(JSON.parse(crudo) as Record<string, unknown>)
      const siguiente = cola.shift() ?? { cuerpo: { error: "sin respuesta programada" }, codigo: 500 }
      respuesta.writeHead(siguiente.codigo ?? 200, { "content-type": "application/json" })
      respuesta.end(JSON.stringify(siguiente.cuerpo))
    })
  })

  await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", () => listo()))
  const direccion = servidor.address()
  const puerto = typeof direccion === "object" && direccion !== null ? direccion.port : 0

  return {
    url: `http://127.0.0.1:${puerto}`,
    programar: (respuestas) => {
      cola = respuestas
    },
    peticiones,
    cerrar: () => new Promise<void>((listo) => servidor.close(() => listo())),
  }
}
