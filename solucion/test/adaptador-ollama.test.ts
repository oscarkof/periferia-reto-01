import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { z } from "zod"
import { definirHerramienta, type Mensaje } from "../src/llm/adapter.ts"
import { NUM_CTX_OLLAMA, crearAdaptadorOllama, leerThink } from "../src/llm/ollama.ts"
import { levantarOllamaFalso, type OllamaFalso } from "../test-utils/ollama-falso.ts"

let falso: OllamaFalso

before(async () => {
  falso = await levantarOllamaFalso()
})

after(async () => {
  await falso.cerrar()
})

/** Herramienta de ejemplo: el JSON Schema se deriva de zod. */
const HERRAMIENTA = definirHerramienta(
  "proveedor_leer_solicitud",
  "Lee un caso",
  z.object({ caso: z.string().min(1).describe("nombre del caso") }),
)

const MENSAJES: Mensaje[] = [
  { rol: "system", contenido: "sistema" },
  { rol: "user", contenido: "lee el caso" },
]

test("la petición pide una ventana de contexto mayor que la de Ollama por defecto", async () => {
  falso.programar([{ cuerpo: { message: { content: "listo" } } }])
  await crearAdaptadorOllama({ base: falso.url }).enviar(MENSAJES, [HERRAMIENTA])

  const peticion = falso.peticiones.at(-1) ?? {}
  const opciones = peticion["options"] as Record<string, unknown>
  assert.equal(opciones["num_ctx"], NUM_CTX_OLLAMA, "el valor por defecto de Ollama (4096) no alcanza")
  assert.equal(peticion["stream"], false)
  assert.equal(peticion["model"], "qwen3:4b-instruct")

  const herramientas = peticion["tools"] as { function: { parameters: Record<string, unknown> } }[]
  assert.equal(herramientas.length, 1)
  const parametros = herramientas[0]?.function.parameters as Record<string, unknown>
  assert.equal(parametros["type"], "object")
  assert.deepEqual(parametros["required"], ["caso"])
  assert.equal(parametros["additionalProperties"], false, "el modelo no debe inventar argumentos")
})

test("`think` NO viaja salvo que se pida: los modelos que no razonan rechazan el campo", async () => {
  const previo = process.env["OLLAMA_THINK"]
  delete process.env["OLLAMA_THINK"]
  try {
    falso.programar([{ cuerpo: { message: { content: "ok" } } }])
    await crearAdaptadorOllama({ base: falso.url }).enviar(MENSAJES, [HERRAMIENTA])

    assert.equal("think" in (falso.peticiones.at(-1) ?? {}), false)
  } finally {
    if (previo !== undefined) process.env["OLLAMA_THINK"] = previo
  }
})

test("OLLAMA_THINK se traduce a lo que espera la API", () => {
  assert.equal(leerThink(undefined), undefined)
  assert.equal(leerThink("   "), undefined)
  assert.equal(leerThink("false"), false)
  assert.equal(leerThink(" TRUE "), true)
  assert.equal(leerThink("medium"), "medium")
  assert.equal(leerThink("muchísimo"), undefined, "un valor no reconocido se ignora, no viaja")
})

test("con el razonamiento apagado por entorno, el campo sí viaja", async () => {
  const previo = process.env["OLLAMA_THINK"]
  process.env["OLLAMA_THINK"] = "false"
  try {
    falso.programar([{ cuerpo: { message: { content: "ok" } } }])
    await crearAdaptadorOllama({ base: falso.url }).enviar(MENSAJES, [HERRAMIENTA])

    assert.equal((falso.peticiones.at(-1) ?? {})["think"], false)
  } finally {
    if (previo === undefined) delete process.env["OLLAMA_THINK"]
    else process.env["OLLAMA_THINK"] = previo
  }
})

test("normaliza argumentos cuando Ollama los manda como OBJETO (hallazgo del smoke test)", async () => {
  falso.programar([
    {
      cuerpo: {
        message: {
          content: "",
          tool_calls: [
            { function: { name: "proveedor_leer_solicitud", arguments: { caso: "ec-corp-andina" } } },
          ],
        },
        prompt_eval_count: 100,
        eval_count: 20,
      },
    },
  ])

  const respuesta = await crearAdaptadorOllama({ base: falso.url }).enviar(MENSAJES, [HERRAMIENTA])
  assert.equal(respuesta.ok, true)
  if (!respuesta.ok) return

  assert.equal(respuesta.data.texto, null, "sin texto no se inventa un vacío")
  assert.equal(respuesta.data.llamadas.length, 1)
  assert.equal(respuesta.data.llamadas[0]?.nombre, "proveedor_leer_solicitud")
  assert.deepEqual(respuesta.data.llamadas[0]?.argumentos, { caso: "ec-corp-andina" })
  assert.equal(respuesta.data.llamadas[0]?.id, "llamada-1")
  assert.deepEqual(respuesta.data.uso, { entrada: 100, salida: 20 })
})

test("también acepta argumentos como STRING JSON (otros proveedores lo hacen así)", async () => {
  falso.programar([
    {
      cuerpo: {
        message: {
          tool_calls: [{ function: { name: "proveedor_leer_solicitud", arguments: '{"caso":"hn-agroexport-sula"}' } }],
        },
      },
    },
  ])

  const respuesta = await crearAdaptadorOllama({ base: falso.url }).enviar(MENSAJES, [HERRAMIENTA])
  assert.equal(respuesta.ok, true)
  if (respuesta.ok) assert.deepEqual(respuesta.data.llamadas[0]?.argumentos, { caso: "hn-agroexport-sula" })
})

test("un texto sin herramientas es una respuesta final válida", async () => {
  falso.programar([{ cuerpo: { message: { content: "  Todo listo.  " } } }])

  const respuesta = await crearAdaptadorOllama({ base: falso.url }).enviar(MENSAJES, [HERRAMIENTA])
  assert.equal(respuesta.ok, true)
  if (respuesta.ok) {
    assert.equal(respuesta.data.texto, "Todo listo.")
    assert.equal(respuesta.data.llamadas.length, 0)
  }
})

test("el error del servidor se cuenta con su código y sin romper el ciclo", async () => {
  falso.programar([{ codigo: 400, cuerpo: { error: "request exceeds the available context size" } }])

  const respuesta = await crearAdaptadorOllama({ base: falso.url }).enviar(MENSAJES, [HERRAMIENTA])
  assert.equal(respuesta.ok, false)
  if (!respuesta.ok) {
    assert.match(respuesta.error, /400/)
    assert.match(respuesta.error, /context size/)
  }
})

test("un proveedor apagado devuelve un error legible, no una excepción", async () => {
  const respuesta = await crearAdaptadorOllama({ base: "http://127.0.0.1:1", timeoutMs: 2000 }).enviar(
    MENSAJES,
    [HERRAMIENTA],
  )
  assert.equal(respuesta.ok, false)
  if (!respuesta.ok) assert.match(respuesta.error, /no se pudo contactar el proveedor ollama/)
})

test("el historial viaja en orden, con el mensaje de sistema primero", async () => {
  falso.programar([{ cuerpo: { message: { content: "ok" } } }])
  await crearAdaptadorOllama({ base: falso.url }).enviar(
    [
      { rol: "system", contenido: "sistema" },
      { rol: "user", contenido: "primero" },
      { rol: "assistant", contenido: "", llamadas: [{ id: "llamada-1", nombre: "x", argumentos: { a: 1 } }] },
      { rol: "tool", contenido: '{"ok":true}', idLlamada: "llamada-1" },
      { rol: "user", contenido: "segundo" },
    ],
    [HERRAMIENTA],
  )

  const mensajes = (falso.peticiones.at(-1)?.["messages"] ?? []) as { role: string }[]
  assert.deepEqual(
    mensajes.map((mensaje) => mensaje.role),
    ["system", "user", "assistant", "tool", "user"],
  )
})
