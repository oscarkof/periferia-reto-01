import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import type { FastifyInstance } from "fastify"
import { crearAplicacion } from "../src/server/aplicacion.ts"
import { crearMemoria } from "../src/server/memoria.ts"
import { crearAdaptadorMock, type PasoMock } from "../src/llm/mock.ts"
import { NOMBRES } from "../src/tools/proveedor.ts"
import { crearEntorno, type EntornoPrueba } from "../test-utils/herramientas.ts"

let entorno: EntornoPrueba
const apps: FastifyInstance[] = []

/** Guion que reproduce un ciclo completo del agente. */
const GUION: PasoMock[] = [
  { llamadas: [{ nombre: "proveedor_leer_solicitud", argumentos: { caso: "co-industrias-delta" } }] },
  { llamadas: [{ nombre: "proveedor_armar_paquete", argumentos: { caso: "co-industrias-delta" } }] },
  { texto: "Paquete armado. ¿Quieres que simule el envío?" },
]

/**
 * Cada prueba crea su aplicación con un guion fresco: el adaptador de guion es
 * estado, y compartirlo entre pruebas las haría depender del orden de ejecución.
 */
async function apiConGuion(guion: PasoMock[] = GUION): Promise<FastifyInstance> {
  const app = await crearAplicacion({
    directorio: entorno.ctx.directory,
    adaptador: crearAdaptadorMock(guion),
    prompt: "comportamiento de prueba",
    conocimiento: "conocimiento de prueba",
    memoria: crearMemoria(),
  })
  apps.push(app)
  return app
}

before(() => {
  entorno = crearEntorno("api")
})

after(async () => {
  await Promise.all(apps.map((app) => app.close()))
  entorno.limpiar()
})

test("GET /api/health informa proveedor y modelo sin exponer claves", async () => {
  const app = await apiConGuion()
  const respuesta = await app.inject({ method: "GET", url: "/api/health" })
  assert.equal(respuesta.statusCode, 200)

  const cuerpo = respuesta.json() as Record<string, unknown>
  assert.equal(cuerpo["ok"], true)
  assert.equal(cuerpo["provider"], "mock")
  assert.deepEqual(cuerpo["herramientas"], NOMBRES)

  const texto = respuesta.body.toLowerCase()
  for (const prohibido of ["apikey", "api_key", "token", "secret", "authorization"]) {
    assert.ok(!texto.includes(prohibido), `la respuesta no debe mencionar ${prohibido}`)
  }
})

test("POST /api/chat responde con la estructura del PRD", async () => {
  const app = await apiConGuion()
  const respuesta = await app.inject({
    method: "POST",
    url: "/api/chat?json=1",
    payload: { sessionId: "api-1", message: "procesa el caso co-industrias-delta" },
  })

  assert.equal(respuesta.statusCode, 200)
  const cuerpo = respuesta.json() as Record<string, unknown>
  assert.equal(cuerpo["ok"], true)
  assert.equal(cuerpo["sessionId"], "api-1")
  assert.match(String(cuerpo["reply"]), /Paquete armado/)
  assert.equal(cuerpo["needsConfirmation"], false)

  const llamadas = cuerpo["toolCalls"] as { nombre?: string }[]
  assert.equal(llamadas.length, 2)
  assert.equal(llamadas[0]?.nombre, "proveedor_leer_solicitud")
})

test("GET /api/sessions/:id devuelve el historial completo", async () => {
  const app = await apiConGuion()
  await app.inject({
    method: "POST",
    url: "/api/chat?json=1",
    payload: { sessionId: "api-2", message: "procesa el caso co-industrias-delta" },
  })

  const respuesta = await app.inject({ method: "GET", url: "/api/sessions/api-2" })
  assert.equal(respuesta.statusCode, 200)
  const cuerpo = respuesta.json() as { ok: boolean; data: { mensajes: unknown[]; turnos: number } }
  assert.equal(cuerpo.ok, true)
  assert.ok(cuerpo.data.mensajes.length >= 4, `se esperaban >= 4 mensajes y llegaron ${cuerpo.data.mensajes.length}`)
  assert.equal(cuerpo.data.turnos, 1)
})

test("las rutas de sesión y de chat validan sus entradas", async () => {
  const app = await apiConGuion()

  const sesionInvalida = await app.inject({ method: "GET", url: "/api/sessions/no%20valido" })
  assert.equal(sesionInvalida.statusCode, 400)

  const sinMensaje = await app.inject({ method: "POST", url: "/api/chat", payload: { sessionId: "api-3" } })
  assert.equal(sinMensaje.statusCode, 400)
  assert.match(String((sinMensaje.json() as { error: string }).error), /mensaje/)

  const idInvalido = await app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { sessionId: "mal id!", message: "hola" },
  })
  assert.equal(idInvalido.statusCode, 400)
})

test("GET /api/files sirve lo generado y bloquea el resto", async () => {
  const app = await apiConGuion()
  await app.inject({
    method: "POST",
    url: "/api/chat?json=1",
    payload: { sessionId: "api-4", message: "procesa el caso co-industrias-delta" },
  })

  const xlsx = await app.inject({ method: "GET", url: "/api/files/co-industrias-delta/formulario.xlsx" })
  assert.equal(xlsx.statusCode, 200)
  assert.match(String(xlsx.headers["content-type"]), /spreadsheetml/)

  const checklist = await app.inject({ method: "GET", url: "/api/files/co-industrias-delta/paquete/checklist.md" })
  assert.equal(checklist.statusCode, 200)
  assert.match(checklist.body, /listo_para_firma/)

  for (const url of [
    "/api/files/../package.json",
    "/api/files/./../../etc/hosts",
    "/api/files/co-industrias-delta/no-existe.txt",
  ]) {
    const respuesta = await app.inject({ method: "GET", url })
    assert.ok(respuesta.statusCode >= 400, `${url} debía fallar`)
  }
})

test("el chat por defecto responde con un stream SSE de eventos", async () => {
  const app = await apiConGuion()
  const respuesta = await app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { sessionId: "api-5", message: "procesa el caso co-industrias-delta" },
  })

  assert.equal(respuesta.statusCode, 200)
  assert.match(String(respuesta.headers["content-type"]), /text\/event-stream/)
  assert.match(respuesta.body, /"tipo":"inicio"/)
  assert.match(respuesta.body, /"tipo":"llamada"/)
  assert.match(respuesta.body, /"tipo":"resultado"/)
  assert.match(respuesta.body, /"tipo":"fin"/)
  assert.match(respuesta.body, /\[DONE\]/)
})
