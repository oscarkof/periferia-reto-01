/**
 * El front del chat, ejecutado de verdad.
 *
 * Hasta F4 ninguna prueba lanzaba `web/app.js`: se probaban el HTML, el CSS y el
 * parser SSE, pero no el guion que los une. Así llegó a la pantalla un
 * `limpiarAviso()` sin definir con la suite entera en verde, y con él un "enviar no
 * hace nada" que desde fuera parecía un front colgado.
 *
 * Aquí el front se carga en un contexto con DOM falso (`test-utils/front.ts`) y su
 * `fetch` se conecta al backend real con `app.inject()`, así que lo que se recorre
 * es el camino completo: arranque, stream SSE troceado, tarjetas de herramienta,
 * confirmación, clic de Enviar y fallos.
 */
import { test, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { FastifyInstance } from "fastify"
import { dirProyecto } from "../src/core/rutas.ts"
import { crearAdaptadorMock, guionDemo } from "../src/llm/mock.ts"
import { crearAplicacion } from "../src/server/aplicacion.ts"
import { crearMemoria } from "../src/server/memoria.ts"
import { cargarFront, conClase, type Front, type Nodo } from "../test-utils/front.ts"

/** Carpeta del front del proyecto. */
const WEB = path.join(dirProyecto(), "web")

const apps: FastifyInstance[] = []
const temporales: string[] = []

after(async () => {
  for (const app of apps) await app.close()
  for (const carpeta of temporales) fs.rmSync(carpeta, { recursive: true, force: true })
})

/** Servidor con el guion de demostración, en su propio directorio de salida. */
async function montar(): Promise<FastifyInstance> {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), "reto01-front-vivo-"))
  temporales.push(directorio)

  const app = await crearAplicacion({
    directorio,
    adaptador: crearAdaptadorMock(guionDemo("co-industrias-delta")),
    prompt: "comportamiento de prueba",
    conocimiento: "conocimiento de prueba",
    memoria: crearMemoria(),
  })
  apps.push(app)
  return app
}

/** El único nodo con esa clase, o falla diciendo cuántos hay. */
function soloUno(nodos: Nodo[], que: string): Nodo {
  assert.equal(nodos.length, 1, `se esperaba un solo ${que} y hay ${nodos.length}`)
  const nodo = nodos[0]
  if (nodo === undefined) throw new Error(`no se pintó ${que}`)
  return nodo
}

/** Cuerpo JSON de la última petición al chat. */
function cuerpoDelChat(front: Front): { sessionId?: string; message?: string } {
  const peticiones = front.peticiones.filter((peticion) => peticion.url === "/api/chat")
  const ultima = peticiones[peticiones.length - 1]
  assert.ok(ultima !== undefined, "el front no llegó a pedir un turno al backend")
  return JSON.parse(ultima.cuerpo) as { sessionId?: string; message?: string }
}

/* ── Arranque ─────────────────────────────────────────────────────────────── */

test("el front arranca contra el backend y pinta cabecera, casos y ejemplos", async () => {
  const front = await cargarFront(await montar())
  await front.listo()

  assert.match(front.nodo("#estado-servidor").textContent, /·/, "la cabecera muestra proveedor y modelo")
  assert.ok(front.nodo("#casos").children.length > 0, "los casos del repositorio maestro se listan")
  assert.equal(front.nodo("#sugerencias").children.length, 3, "los tres ejemplos de mensaje")
  assert.equal(front.nodo("#entrada").value, "", "el campo de entrada empieza vacío")
  assert.equal(front.nodo("#pensando").hidden, true, "el indicador de trabajo empieza oculto")
  assert.equal(front.nodo("#confirmacion").hidden, true, "y la banda de confirmación también")

  assert.ok(
    front.consola.some((linea) => linea.includes("app.js cargado")),
    `la consola debe decir qué versión se cargó: ${front.consola.join(" | ")}`,
  )
})

/* ── Un turno completo ────────────────────────────────────────────────────── */

test("un turno completo se pinta sin errores: turnos, herramientas, archivos y confirmación", async () => {
  const front = await cargarFront(await montar())
  await front.listo()

  await front.llamar("enviar", "Procesa el caso «co-industrias-delta» y arma el paquete para firma.")

  const conversacion = front.nodo("#conversacion")
  assert.equal(conClase(conversacion, "turno").length, 2, "el turno del usuario y el del agente")

  const usuario = soloUno(conClase(conversacion, "turno--usuario"), "turno del usuario")
  assert.match(usuario.textContent, /co-industrias-delta/, "el mensaje queda en el historial")

  const agente = soloUno(conClase(conversacion, "turno--agente"), "turno del agente")
  assert.ok(agente.textContent.length > 0, "el agente deja su respuesta escrita")

  const tarjetas = conClase(agente, "llamada")
  assert.ok(tarjetas.length >= 2, `el guion llama a varias herramientas y se pintaron ${tarjetas.length}`)
  for (const tarjeta of tarjetas) {
    const texto = tarjeta.textContent
    assert.match(texto, /proveedor_/, "la tarjeta muestra el nombre de la herramienta (CA4)")
    assert.match(texto, /(ok|falló) · /, "y el resumen de su resultado")
  }
  assert.ok(tarjetas.every((tarjeta) => tarjeta.clases.has("llamada--ok")), "todas fueron bien")

  const enlaces = front.nodo("#archivos")
    .descendientes()
    .filter((nodo) => nodo.etiqueta === "a")
  assert.ok(enlaces.length >= 1, "los archivos generados quedan para descargar")
  for (const enlace of enlaces) assert.match(enlace.href, /^\/api\/files\//)

  assert.equal(front.nodo("#confirmacion").hidden, false, "el paquete deja la confirmación pendiente (CA3)")
  assert.match(
    front.nodo("#confirmacion-detalle").textContent,
    /env[íi]o|proveedor/,
    "la banda dice qué acción quedó pendiente",
  )

  assert.equal(front.nodo("#pensando").hidden, true, "el indicador se apaga al terminar")
  assert.equal(front.nodo("#aviso").textContent, "", "no hubo ningún error que mostrar")
  assert.match(front.nodo("#dato-turnos").textContent, /^\d+$/, "el panel lateral cuenta los turnos")

  const cuerpo = cuerpoDelChat(front)
  assert.equal(front.nodo("#dato-sesion").textContent, cuerpo.sessionId, "el panel muestra la sesión del turno")
})

/* ── El envío, que es donde el front se quedaba mudo ──────────────────────── */

test("el clic en Enviar arranca el turno aunque el navegador no dispare el submit", async () => {
  const front = await cargarFront(await montar())
  await front.listo()

  front.nodo("#entrada").value = "¿Qué casos puedes procesar?"
  front.documento.disparar("click", { preventDefault: () => {}, target: front.nodo("#boton-enviar") })

  await front.esperar(
    () =>
      conClase(front.nodo("#conversacion"), "turno").length >= 2 &&
      front.nodo("#pensando").hidden === true,
  )

  const deChat = front.peticiones.filter((peticion) => peticion.url === "/api/chat")
  assert.equal(deChat.length, 1, "un clic manda exactamente un mensaje")
  assert.equal(cuerpoDelChat(front).message, "¿Qué casos puedes procesar?")
  assert.equal(typeof cuerpoDelChat(front).sessionId, "string")
  assert.ok(
    front.consola.some((linea) => linea.includes("[front] enviando")),
    `la consola avisa del envío: ${front.consola.join(" | ")}`,
  )
})

test("un mensaje vacío avisa sin llamar al backend y el aviso se limpia al empezar el turno siguiente", async () => {
  const front = await cargarFront(await montar())
  await front.listo()

  await front.llamar("enviar", "   ")
  assert.match(front.nodo("#aviso").textContent, /Escribe un mensaje antes de enviar/)
  assert.equal(front.peticiones.filter((peticion) => peticion.url === "/api/chat").length, 0)

  // Empezar un turno limpia el aviso anterior: si `limpiarAviso` no existe, aquí revienta.
  await front.llamar("enviar", "¿Qué casos puedes procesar?")
  assert.equal(front.nodo("#aviso").textContent, "", "el aviso anterior no se queda encima del turno nuevo")
  assert.equal(front.nodo("#aviso").hidden, true)
  assert.equal(conClase(front.nodo("#conversacion"), "turno").length, 2, "y el turno se pinta igual")
})

/* ── Fallos ───────────────────────────────────────────────────────────────── */

test("si el backend no responde, el fallo se ve en pantalla y el turno queda marcado", async () => {
  const front = await cargarFront(await montar())
  await front.listo()

  front.contexto.fetch = () => Promise.reject(new Error("sin conexión con el backend"))

  await front.llamar("enviar", "hola")

  const agente = soloUno(conClase(front.nodo("#conversacion"), "turno--agente"), "turno del agente")
  assert.ok(agente.clases.has("turno--error"), "el turno que falló queda marcado en rojo")
  assert.match(agente.textContent, /No pude completar el turno: sin conexión con el backend/)
  assert.match(front.nodo("#aviso").textContent, /No pude completar el turno: sin conexión con el backend/)
  assert.equal(front.nodo("#pensando").hidden, true, "el indicador se apaga aunque el turno falle")
})

/* ── Saber qué versión estás mirando ──────────────────────────────────────── */

test("la versión del pie, la de la consola y la del cache-busting son la misma", () => {
  const html = fs.readFileSync(path.join(WEB, "index.html"), "utf8")
  const guion = fs.readFileSync(path.join(WEB, "app.js"), "utf8")

  const version = /\?v=(\d+)/.exec(html)?.[1]
  assert.ok(version !== undefined, "el HTML debe cache-bustear el guion con `?v=`")
  assert.match(html, new RegExp(`interfaz v${version}`), "el pie debe decir la versión que se sirve")
  assert.match(guion, new RegExp(`cargado · v${version}`), "y la consola la misma")
})
