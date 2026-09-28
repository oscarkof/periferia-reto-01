import { test, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { FastifyInstance } from "fastify"
import { dirProyecto } from "../src/core/rutas.ts"
import { crearAdaptadorMock, guionDemo } from "../src/llm/mock.ts"
import { crearAplicacion } from "../src/server/aplicacion.ts"
import { raizFront } from "../src/server/front.ts"
import { crearMemoria } from "../src/server/memoria.ts"
import { crearAcumulador, FIN, leerBloque, separarBloques } from "../web/sse.js"

/** Carpeta del front del proyecto. */
const WEB = path.join(dirProyecto(), "web")

const apps: FastifyInstance[] = []
const temporales: string[] = []

/** Directorio temporal, registrado para borrarlo al final. */
function temporal(prefijo: string): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), prefijo))
  temporales.push(base)
  return base
}

/** Servidor con el front real del proyecto. */
async function conFront(directorio: string = dirProyecto()): Promise<FastifyInstance> {
  const app = await crearAplicacion({
    directorio,
    adaptador: crearAdaptadorMock([]),
    prompt: "comportamiento de prueba",
    conocimiento: "conocimiento de prueba",
    memoria: crearMemoria(),
  })
  apps.push(app)
  return app
}

after(async () => {
  await Promise.all(apps.map((app) => app.close()))
  for (const base of temporales) fs.rmSync(base, { recursive: true, force: true })
})

/* ── Localización del front ───────────────────────────────────────────────── */

test("el proyecto sirve su front sin necesidad de build", () => {
  assert.equal(raizFront(dirProyecto()), WEB, "sin build se sirven los estáticos de web/")
  assert.ok(fs.existsSync(path.join(WEB, "index.html")))
})

test("si existe un build, web/dist tiene prioridad", () => {
  const base = temporal("reto01-front-dist-")
  fs.mkdirSync(path.join(base, "web", "dist"), { recursive: true })
  fs.writeFileSync(path.join(base, "web", "dist", "index.html"), "<!doctype html><p>build</p>")

  assert.equal(raizFront(base), path.join(base, "web", "dist"))
})

test("sin front, la API sigue funcionando y la raíz no existe", async () => {
  const app = await conFront(temporal("reto01-front-ausente-"))

  const raiz = await app.inject({ method: "GET", url: "/" })
  assert.equal(raiz.statusCode, 404, "sin front no hay raíz que servir")

  const salud = await app.inject({ method: "GET", url: "/api/health" })
  assert.equal(salud.statusCode, 200, "la API no depende del front")
})

/* ── Servido de los estáticos ─────────────────────────────────────────────── */

test("GET / sirve el chat, con su guion y sus estilos", async () => {
  const app = await conFront()

  const raiz = await app.inject({ method: "GET", url: "/" })
  assert.equal(raiz.statusCode, 200)
  assert.match(String(raiz.headers["content-type"]), /text\/html/)
  assert.match(raiz.body, /Registro como proveedor/)
  assert.match(raiz.body, /id="entrada"/)

  const guion = await app.inject({ method: "GET", url: "/app.js" })
  assert.equal(guion.statusCode, 200)
  assert.match(String(guion.headers["content-type"]), /javascript/)

  const parser = await app.inject({ method: "GET", url: "/sse.js" })
  assert.equal(parser.statusCode, 200)

  const estilos = await app.inject({ method: "GET", url: "/estilos.css" })
  assert.equal(estilos.statusCode, 200)
  assert.match(String(estilos.headers["content-type"]), /text\/css/)
})

test("el front no expone nada fuera de su carpeta", async () => {
  const app = await conFront()

  for (const url of ["/package.json", "/.env", "/../package.json", "/../.env", "/../../PRD.md"]) {
    const respuesta = await app.inject({ method: "GET", url })
    assert.ok(respuesta.statusCode >= 400, `${url} debía fallar y respondió ${respuesta.statusCode}`)
  }
})

/* ── Contrato entre el HTML y el guion ────────────────────────────────────── */

test("cada selector que usa app.js existe en index.html", () => {
  const html = fs.readFileSync(path.join(WEB, "index.html"), "utf8")
  const guion = fs.readFileSync(path.join(WEB, "app.js"), "utf8")

  const ids = [...guion.matchAll(/querySelector\("#([a-zA-Z0-9_-]+)"\)/g)].map((coincidencia) => coincidencia[1] ?? "")
  assert.ok(ids.length >= 10, `se esperaban varios selectores y se leyeron ${ids.length}`)

  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `la interfaz no tiene el elemento #${id} que usa app.js`)
  }
})

test("el HTML carga el guion y los estilos, y el guion importa el parser", () => {
  const html = fs.readFileSync(path.join(WEB, "index.html"), "utf8")
  assert.match(html, /<script type="module" src="\.\/app\.js">/)
  assert.match(html, /href="\.\/estilos\.css"/)

  const guion = fs.readFileSync(path.join(WEB, "app.js"), "utf8")
  assert.match(guion, /from "\.\/sse\.js"/)
})

test("el CSS neutraliza `hidden` aunque la clase fije su propio display", () => {
  const html = fs.readFileSync(path.join(WEB, "index.html"), "utf8")
  const css = fs.readFileSync(path.join(WEB, "estilos.css"), "utf8")

  // Elementos que el HTML marca como ocultos y que el guion muestra cuando toca.
  const ocultos = [...html.matchAll(/<[^>]+class="([^"]+)"[^>]*\bhidden\b/g)].map((coincidencia) => coincidencia[1] ?? "")
  assert.ok(ocultos.length >= 2, `se esperaban elementos con \`hidden\` y se leyeron ${ocultos.length}`)

  // Una regla del autor pesa más que `[hidden] { display: none }` del navegador,
  // así que si una de estas clases fija display, la regla propia es obligatoria.
  const conDisplayPropio = ocultos.flatMap((clase) => clase.split(/\s+/)).filter((clase) => {
    const regla = new RegExp(`\\.${clase}\\s*\\{[^}]*display:`)
    return regla.test(css)
  })
  assert.ok(
    conDisplayPropio.length > 0,
    `el test solo aporta si alguna clase fija display; revisa el HTML: ${ocultos.join(", ")}`,
  )

  assert.match(
    css,
    /\[hidden\]\s*\{[^}]*display:\s*none/,
    "sin `[hidden] { display: none }` un elemento oculto con display propio se ve igual (la banda de confirmación aparecía desde el arranque)",
  )
})

/* ── Parser del stream SSE ────────────────────────────────────────────────── */

test("SSE · separa los bloques completos y conserva el resto incompleto", () => {
  const { bloques, resto } = separarBloques('data: {"tipo":"inicio"}\n\ndata: {"tipo":"fi')

  assert.deepEqual(bloques, ['data: {"tipo":"inicio"}'])
  assert.equal(resto, 'data: {"tipo":"fi')
})

test("SSE · interpreta JSON, la marca de cierre y lo que no es un evento", () => {
  assert.deepEqual(leerBloque('data: {"tipo":"fin","needsConfirmation":true}'), {
    tipo: "fin",
    needsConfirmation: true,
  })
  assert.equal(leerBloque("data: [DONE]"), FIN)
  assert.equal(leerBloque("data: no-es-json"), null, "un JSON roto no debe romper la lectura")
  assert.equal(leerBloque(": un comentario"), null)
  assert.equal(leerBloque('data: {"sin":"tipo"}'), null, "sin `tipo` no es un evento del ciclo")
})

test("SSE · un evento partido en trozos se entrega completo y una sola vez", () => {
  const acumulador = crearAcumulador()

  assert.deepEqual(acumulador.empujar('data: {"tipo":"llamada","nom'), [], "todavía no hay evento completo")
  assert.deepEqual(acumulador.empujar('bre":"proveedor_armar_paquete"}\n\n'), [
    { tipo: "llamada", nombre: "proveedor_armar_paquete" },
  ])
})

test("SSE · un turno real se lee en orden y cierra con [DONE]", () => {
  const stream = [
    'data: {"tipo":"inicio","sessionId":"s-1"}\n\n',
    'data: {"tipo":"llamada","nombre":"proveedor_leer_solicitud","argumentos":{"caso":"x"}}\n\n',
    'data: {"tipo":"resultado","nombre":"proveedor_leer_solicitud","ok":true,"resumen":"ok"}\n\n',
    'data: {"tipo":"fin","texto":"listo","needsConfirmation":true,"llamadas":1,"iteraciones":2}\n\n',
    "data: [DONE]\n\n",
  ].join("")

  const acumulador = crearAcumulador()
  const eventos = [...acumulador.empujar(stream.slice(0, 45)), ...acumulador.empujar(stream.slice(45))]
  const tipos = eventos.map((evento) => (evento === FIN ? "DONE" : (evento?.tipo ?? "?")))

  assert.deepEqual(tipos, ["inicio", "llamada", "resultado", "fin", "DONE"])
  assert.equal(acumulador.resto, "", "no debe quedar nada a medias")
})

/** Evento del stream tal como lo entrega el parser del front (el `.js` no trae tipos). */
interface EventoStream {
  tipo: string
  [clave: string]: unknown
}

/** Eventos del stream, ya sin la marca de cierre `[DONE]`. */
function eventosDeStream(cuerpo: string): EventoStream[] {
  const crudos = crearAcumulador().empujar(cuerpo) as (EventoStream | string)[]
  const eventos: EventoStream[] = []
  for (const crudo of crudos) {
    if (typeof crudo !== "string") eventos.push(crudo)
  }
  return eventos
}

test("el stream que emite el backend trae lo que el front necesita pintar", async () => {
  const app = await crearAplicacion({
    directorio: temporal("reto01-front-contrato-"),
    adaptador: crearAdaptadorMock(guionDemo("co-industrias-delta")),
    prompt: "comportamiento de prueba",
    conocimiento: "conocimiento de prueba",
    memoria: crearMemoria(),
  })
  apps.push(app)

  const respuesta = await app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { sessionId: "web-contrato", message: "procesa el caso co-industrias-delta" },
  })

  assert.equal(respuesta.statusCode, 200)
  assert.match(String(respuesta.headers["content-type"]), /text\/event-stream/)
  assert.ok(respuesta.body.includes("data: [DONE]"), "el stream cierra con [DONE]")

  const eventos = eventosDeStream(respuesta.body)

  const inicio = eventos.find((evento) => evento.tipo === "inicio")
  assert.equal(inicio?.["sessionId"], "web-contrato", "el front aprende el identificador en `inicio`")

  const llamadas = eventos.filter((evento) => evento.tipo === "llamada")
  assert.ok(llamadas.length >= 2, `se esperaban las llamadas del guion y llegaron ${llamadas.length}`)
  for (const llamada of llamadas) {
    assert.equal(typeof llamada["nombre"], "string", "la tarjeta necesita el nombre de la herramienta")
    assert.ok(llamada["argumentos"] !== undefined, "la tarjeta muestra los argumentos")
  }

  const resultados = eventos.filter((evento) => evento.tipo === "resultado")
  assert.equal(resultados.length, llamadas.length, "cada llamada tiene su resultado")
  assert.ok(
    resultados.every((evento) => typeof evento["resumen"] === "string" && evento["resumen"] !== ""),
    "el resultado trae un resumen legible para la tarjeta",
  )

  const fin = eventos.find((evento) => evento.tipo === "fin")
  assert.equal(typeof fin?.["texto"], "string", "el texto final es lo que se pinta como respuesta")
  assert.equal(fin?.["needsConfirmation"], true, "armar el paquete deja el envío pendiente: el front debe resaltarlo")
})
