import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { ejecutarTurno, MAX_ITERACIONES } from "../src/agent/loop.ts"
import { cargarSesion, crearSesion } from "../src/agent/sesion.ts"
import type { EventoTurno } from "../src/agent/eventos.ts"
import { crearAdaptadorMock, type PasoMock } from "../src/llm/mock.ts"
import { CASO_PRUEBA, eventosDe, turno } from "../test-utils/bucle.ts"
import { crearEntorno, type EntornoPrueba } from "../test-utils/herramientas.ts"

let entorno: EntornoPrueba

before(() => {
  entorno = crearEntorno("bucle")
})

after(() => {
  entorno.limpiar()
})

test("el tope de iteraciones por defecto es el del PRD (CA1)", () => {
  assert.equal(MAX_ITERACIONES, 25)
})

test("ciclo completo: el modelo pide herramientas y cierra con texto", async () => {
  const guion: PasoMock[] = [
    { llamadas: [{ nombre: "proveedor_leer_solicitud", argumentos: { caso: CASO_PRUEBA } }] },
    { llamadas: [{ nombre: "proveedor_armar_paquete", argumentos: { caso: CASO_PRUEBA } }] },
    { texto: "Listo, el paquete está armado. ¿Quieres que simule el envío?" },
  ]

  const resultado = await turno(entorno, guion, `procesa el caso ${CASO_PRUEBA}`)

  assert.equal(resultado.ok, true)
  assert.match(resultado.texto, /paquete está armado/)
  assert.equal(resultado.needsConfirmation, false)

  assert.equal(eventosDe("llamada", resultado.eventos).length, 2, "deben quedar registradas las llamadas (CA4)")

  const resultados = eventosDe("resultado", resultado.eventos)
  assert.equal(resultados.length, 2)
  assert.ok(resultados.every((evento) => evento.tipo === "resultado" && evento.ok))

  const fin = eventosDe("fin", resultado.eventos)[0]
  assert.ok(fin?.tipo === "fin")
  assert.equal(fin.llamadas, 2)
})

test("el resultado de la herramienta llega al modelo en la siguiente vuelta", async () => {
  const adaptador = crearAdaptadorMock([
    { llamadas: [{ nombre: "proveedor_leer_solicitud", argumentos: { caso: CASO_PRUEBA } }] },
    { texto: "hecho" },
  ])

  await ejecutarTurno({
    directorio: entorno.ctx.directory,
    sesion: crearSesion("s-historial"),
    mensajeUsuario: "lee el caso",
    adaptador,
    prompt: "p",
    conocimiento: "c",
  })

  const segundoEnvio = adaptador.historiales[1] ?? []
  const mensajesHerramienta = segundoEnvio.filter((mensaje) => mensaje.rol === "tool")
  assert.equal(mensajesHerramienta.length, 1, "el resultado debe viajar como mensaje de herramienta")
  assert.match(mensajesHerramienta[0]?.contenido ?? "", /"ok":true/)
  assert.equal(adaptador.herramientasVistas.length, 5, "el modelo ve las cinco herramientas")
})

test("CA1 · al alcanzar el tope se responde con lo que hay, sin morir", async () => {
  const guion: PasoMock[] = Array.from({ length: 10 }, () => ({
    llamadas: [{ nombre: "proveedor_leer_solicitud", argumentos: { caso: CASO_PRUEBA } }],
  }))

  const resultado = await turno(entorno, guion, "sigue", crearSesion("s-tope"), 3)

  assert.equal(resultado.ok, true)
  assert.match(resultado.texto, /tope de 3 iteraciones/)
  assert.ok(eventosDe("aviso", resultado.eventos).length >= 1)
})

test("una herramienta inventada por el modelo no tumba la sesión", async () => {
  const guion: PasoMock[] = [
    { llamadas: [{ nombre: "proveedor_firmar_contrato", argumentos: {} }] },
    { texto: "Corrijo: usaré las herramientas disponibles." },
  ]

  const resultado = await turno(entorno, guion, "haz lo que puedas", crearSesion("s-inventada"))

  assert.equal(resultado.ok, true)
  const fallos = eventosDe("resultado", resultado.eventos).filter((evento) => evento.tipo === "resultado" && !evento.ok)
  assert.equal(fallos.length, 1, "debe registrarse el intento fallido")
  const fallo = fallos[0]
  if (fallo?.tipo === "resultado") assert.match(fallo.resumen, /herramienta desconocida/)
})

test("un error del proveedor se cuenta y la sesión sigue viva (CA5)", async () => {
  const adaptadorRoto = {
    proveedor: "roto",
    modelo: "roto",
    async enviar() {
      return { ok: false as const, error: "sin conexión con el modelo" }
    },
  }

  const eventos: EventoTurno[] = []
  const resultado = await ejecutarTurno({
    directorio: entorno.ctx.directory,
    sesion: crearSesion("s-error"),
    mensajeUsuario: "hola",
    adaptador: adaptadorRoto,
    prompt: "p",
    conocimiento: "c",
    emitir: (evento) => eventos.push(evento),
  })

  assert.equal(resultado.ok, false)
  const errores = eventosDe("error", eventos)
  assert.equal(errores.length, 1)
  const error = errores[0]
  if (error?.tipo === "error") assert.match(error.texto, /No pude hablar con el modelo/)

  // La sesión quedó guardada, así que el siguiente turno puede reintentarse.
  assert.equal(cargarSesion(entorno.ctx.directory, "s-error").ok, true)
})

test("la sesión se persiste en out/sessions/<id>.json", async () => {
  await turno(entorno, [{ texto: "hola" }], "buenas", crearSesion("s-persistida"))

  const guardada = cargarSesion(entorno.ctx.directory, "s-persistida")
  assert.equal(guardada.ok, true)
  if (guardada.ok) {
    assert.equal(guardada.data.mensajes.length, 2, "mensaje del usuario y respuesta")
    assert.equal(guardada.data.turnos, 1)
  }
  assert.ok(fs.existsSync(entorno.out("sessions", "s-persistida.json")))
})
