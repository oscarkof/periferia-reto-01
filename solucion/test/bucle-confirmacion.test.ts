import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { crearSesion, type Sesion } from "../src/agent/sesion.ts"
import { AVISO_SIN_CONFIRMACION } from "../src/agent/paso.ts"
import type { PasoMock } from "../src/llm/mock.ts"
import { CASO_PRUEBA, eventosDe, turno, type TurnoEjecutado } from "../test-utils/bucle.ts"
import { crearEntorno, type EntornoPrueba } from "../test-utils/herramientas.ts"

let entorno: EntornoPrueba

before(() => {
  entorno = crearEntorno("confirmacion")
})

after(() => {
  entorno.limpiar()
})

/** Guion que arma el paquete y luego intenta el envío pidiendo confirmado=true. */
const GUION_QUE_SE_ADELANTA: PasoMock[] = [
  { llamadas: [{ nombre: "proveedor_armar_paquete", argumentos: { caso: CASO_PRUEBA } }] },
  {
    llamadas: [
      { nombre: "proveedor_simular_envio", argumentos: { caso: CASO_PRUEBA, confirmado: true } },
    ],
  },
  { texto: "El paquete está listo. ¿Confirmas el envío?" },
]

test("RN4 · el modelo no puede autorizarse: se fuerza confirmado=false", async () => {
  const resultado = await turno(entorno, GUION_QUE_SE_ADELANTA, `procesa el caso ${CASO_PRUEBA}`, crearSesion("s-rn4-1"))

  const avisos = eventosDe("aviso", resultado.eventos).filter(
    (evento) => evento.tipo === "aviso" && evento.texto === AVISO_SIN_CONFIRMACION,
  )
  assert.equal(avisos.length, 1, "debe avisarse del intento sin confirmación")

  const rechazo = eventosDe("resultado", resultado.eventos).find(
    (evento) => evento.tipo === "resultado" && !evento.ok && /proveedor_simular_envio/.test(evento.nombre),
  )
  assert.ok(rechazo, "la herramienta debe negarse a enviar")
  if (rechazo?.tipo === "resultado") assert.match(rechazo.resumen, /confirmaci/i)

  assert.equal(resultado.needsConfirmation, true, "el turno debe cerrar pidiendo confirmación")
  assert.ok(!fs.existsSync(entorno.out(CASO_PRUEBA, "ENVIO-SIMULADO.md")), "no debe generarse el envío")
})

test("RN4 · la confirmación del usuario en el turno siguiente autoriza la acción", async () => {
  const sesion = crearSesion("s-rn4-2")
  await turno(entorno, GUION_QUE_SE_ADELANTA, `procesa el caso ${CASO_PRUEBA}`, sesion)

  assert.ok(sesion.pendiente, "el turno anterior debía dejar una acción pendiente")
  assert.match(sesion.pendiente.descripcion, /simular el envío/)

  const guionConfirmado: PasoMock[] = [
    { llamadas: [{ nombre: "proveedor_simular_envio", argumentos: { caso: CASO_PRUEBA, confirmado: false } }] },
    { texto: "Envío simulado. Nada se envió de verdad." },
  ]
  const segundo: TurnoEjecutado = await turno(entorno, guionConfirmado, "sí, envía", sesion)

  const exitos = eventosDe("resultado", segundo.eventos).filter(
    (evento) => evento.tipo === "resultado" && evento.ok && /simular_envio/.test(evento.nombre),
  )
  assert.equal(exitos.length, 1, "con confirmación, la herramienta debe aceptar")

  assert.equal(segundo.needsConfirmation, false, "ya no queda nada pendiente")
  assert.equal(sesion.pendiente, null)

  const ruta = entorno.out(CASO_PRUEBA, "ENVIO-SIMULADO.md")
  assert.ok(fs.existsSync(ruta), "debe quedar la constancia del envío simulado")
  assert.match(fs.readFileSync(ruta, "utf8"), /No se envió nada/)
})

test("RN4 · un rechazo explícito descarta la acción pendiente", async () => {
  const sesion: Sesion = crearSesion("s-rn4-3")
  await turno(entorno, GUION_QUE_SE_ADELANTA, `procesa el caso ${CASO_PRUEBA}`, sesion)
  assert.ok(sesion.pendiente)

  // Otras pruebas ya pudieron dejar un ENVIO-SIMULADO.md: lo borramos para poder
  // afirmar que este turno NO crea uno nuevo, sin depender del orden de ejecución.
  const envio = entorno.out(CASO_PRUEBA, "ENVIO-SIMULADO.md")
  fs.rmSync(envio, { force: true })

  const resultado = await turno(entorno, [{ texto: "Entendido, no envío nada." }], "no, espera", sesion)

  assert.equal(sesion.pendiente, null, "el pendiente debe descartarse")
  const avisos = eventosDe("aviso", resultado.eventos)
  assert.ok(
    avisos.some((evento) => evento.tipo === "aviso" && /descartó la acción pendiente/.test(evento.texto)),
    "debe avisarse del descarte",
  )
  assert.ok(!fs.existsSync(envio), "un rechazo no debe generar la constancia de envío")
})

test("RN4 · la confirmación solo autoriza el caso que quedó pendiente", async () => {
  const sesion = crearSesion("s-rn4-4")
  await turno(entorno, GUION_QUE_SE_ADELANTA, `procesa el caso ${CASO_PRUEBA}`, sesion)
  assert.equal(sesion.pendiente?.argumentos["caso"], CASO_PRUEBA)

  // El usuario confirma, pero el modelo intenta enviar OTRO caso.
  const otro: PasoMock[] = [
    { llamadas: [{ nombre: "proveedor_simular_envio", argumentos: { caso: "pa-logistica-istmo", confirmado: true } }] },
    { texto: "Aviso: no puedo enviar un caso distinto al pendiente." },
  ]
  const resultado = await turno(entorno, otro, "sí, envía", sesion)

  const avisos = eventosDe("aviso", resultado.eventos).filter(
    (evento) => evento.tipo === "aviso" && evento.texto === AVISO_SIN_CONFIRMACION,
  )
  assert.equal(avisos.length, 1, "debe forzarse confirmado=false para otro caso")
  assert.ok(!fs.existsSync(entorno.out("pa-logistica-istmo", "ENVIO-SIMULADO.md")))
})

test("RN4 · armar el paquete deja el envío pendiente sin que el modelo lo intente", async () => {
  const sesion = crearSesion("s-rn4-5")
  const guionNormal: PasoMock[] = [
    { llamadas: [{ nombre: "proveedor_armar_paquete", argumentos: { caso: CASO_PRUEBA } }] },
    { texto: "El paquete está armado. ¿Confirmas el envío?" },
  ]

  const resultado = await turno(entorno, guionNormal, `procesa el caso ${CASO_PRUEBA}`, sesion)

  assert.equal(resultado.needsConfirmation, true, "el turno debe cerrar pidiendo confirmación")
  assert.ok(sesion.pendiente, "el envío queda pendiente aunque nadie lo haya intentado")
  assert.equal(sesion.pendiente.herramienta, "proveedor_simular_envio")
  assert.equal(sesion.pendiente.argumentos["caso"], CASO_PRUEBA, "el pendiente apunta al paquete armado")
  assert.match(sesion.pendiente.descripcion, /simular el envío/)

  const fin = eventosDe("fin", resultado.eventos)[0]
  assert.ok(fin?.tipo === "fin")
  assert.equal(fin.needsConfirmation, true, "el estado viaja en el evento de fin, que es lo que ve el front")
})

test("RN4 · el 'sí' del turno siguiente autoriza el envío del paquete recién armado", async () => {
  const sesion = crearSesion("s-rn4-6")
  const guionNormal: PasoMock[] = [
    { llamadas: [{ nombre: "proveedor_armar_paquete", argumentos: { caso: CASO_PRUEBA } }] },
    { texto: "El paquete está armado. ¿Confirmas el envío?" },
  ]
  await turno(entorno, guionNormal, `procesa el caso ${CASO_PRUEBA}`, sesion)

  // Otras pruebas pudieron dejar la constancia: la borramos para poder afirmar que
  // este turno la crea, sin depender del orden de ejecución.
  const envio = entorno.out(CASO_PRUEBA, "ENVIO-SIMULADO.md")
  fs.rmSync(envio, { force: true })

  const guionConfirmado: PasoMock[] = [
    { llamadas: [{ nombre: "proveedor_simular_envio", argumentos: { caso: CASO_PRUEBA, confirmado: false } }] },
    { texto: "Envío simulado. Nada se envió de verdad." },
  ]
  const segundo = await turno(entorno, guionConfirmado, "sí, envía", sesion)

  const avisos = eventosDe("aviso", segundo.eventos).filter(
    (evento) => evento.tipo === "aviso" && evento.texto === AVISO_SIN_CONFIRMACION,
  )
  assert.equal(avisos.length, 0, "la confirmación era válida para ese caso: no debe haber aviso")
  assert.equal(segundo.needsConfirmation, false, "ya no queda nada pendiente")
  assert.equal(sesion.pendiente, null)
  assert.ok(fs.existsSync(envio), "la confirmación debe autorizar el envío del caso pendiente")
})
