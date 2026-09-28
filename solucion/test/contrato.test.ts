import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { z } from "zod"
import { leer_solicitud, listarHerramientas } from "../src/tools/proveedor.ts"
import { ejecutarValidando, nombreHerramienta, type Herramienta } from "../src/tools/contrato.ts"
import { crearEntorno, datosDe, json, type EntornoPrueba } from "../test-utils/herramientas.ts"

let entorno: EntornoPrueba

before(() => {
  entorno = crearEntorno("prueba-contrato")
})

after(() => {
  entorno.limpiar()
})

test("el nombre de herramienta se deriva del archivo y el export (PRD §6.2)", () => {
  assert.equal(nombreHerramienta("proveedor", "leer_solicitud"), "proveedor_leer_solicitud")
  assert.equal(nombreHerramienta("proveedor", "simular_envio"), "proveedor_simular_envio")
})

test("las herramientas responden con error tipado, nunca con una excepción (HU-5 · CA5)", async () => {
  for (const entrada of listarHerramientas()) {
    // `confirmado: true` para que simular_envio llegue a comprobar el caso en vez de
    // detenerse en RN4; las demás herramientas ignoran ese campo de más.
    const respuesta = await entrada.herramienta.execute({ caso: "no-existe", confirmado: true }, entorno.ctx)
    const cuerpo = json(respuesta)
    assert.equal(cuerpo.ok, false, `${entrada.nombre} debía fallar`)
    assert.match(String(cuerpo.error), /no existe/i, `${entrada.nombre}: ${cuerpo.error}`)
  }
})

test("RN4 se evalúa antes que cualquier otra regla: sin confirmación no se toca el disco", async () => {
  const entrada = listarHerramientas().find((item) => item.nombre === "proveedor_simular_envio")
  assert.ok(entrada)

  const cuerpo = json(await entrada.herramienta.execute({ caso: "no-existe" }, entorno.ctx))
  assert.equal(cuerpo.ok, false)
  assert.match(String(cuerpo.error), /confirmaci/i, "sin confirmación la respuesta es la de RN4")
})

test("el backend valida los argumentos con zod y devuelve el error al modelo (PRD §6.2)", async () => {
  const entrada = listarHerramientas()[0]
  assert.ok(entrada)

  const sinCaso = json(await ejecutarValidando(entrada.herramienta, entrada.nombre, {}, entorno.ctx))
  assert.equal(sinCaso.ok, false)
  assert.match(String(sinCaso.error), new RegExp(entrada.nombre))
  assert.match(String(sinCaso.error), /caso/)

  const conTipoEquivocado = json(
    await ejecutarValidando(entrada.herramienta, entrada.nombre, { caso: 42 }, entorno.ctx),
  )
  assert.equal(conTipoEquivocado.ok, false, "un caso numérico no es válido")

  const correcto = json(
    await ejecutarValidando(entrada.herramienta, entrada.nombre, { caso: "co-industrias-delta" }, entorno.ctx),
  )
  assert.equal(correcto.ok, true)
})

test("el fallo de validación queda registrado para que no sea invisible", async () => {
  const entrada = listarHerramientas()[0]
  assert.ok(entrada)

  const registros: string[] = []
  await ejecutarValidando(entrada.herramienta, entrada.nombre, {}, entorno.ctx, (herramienta, error) => {
    registros.push(`${herramienta}: ${error}`)
  })

  assert.equal(registros.length, 1)
  assert.match(registros[0] ?? "", /proveedor_leer_solicitud/)
})

test("una herramienta que lanza se convierte en error legible, sin traza cruda", async () => {
  const lanza: Herramienta<z.ZodObject<{ caso: z.ZodString }>> = {
    description: "herramienta de prueba que lanza una excepción",
    args: z.object({ caso: z.string() }),
    async execute(): Promise<string> {
      throw new Error("boom secreto interno")
    },
  }

  const cuerpo = json(await ejecutarValidando(lanza, "proveedor_lanza", { caso: "x" }, entorno.ctx))
  assert.equal(cuerpo.ok, false)
  assert.match(String(cuerpo.error), /proveedor_lanza/)
  assert.ok(!String(cuerpo.error).includes("boom"), "no debe filtrar el mensaje interno")
})

test("un caso válido sigue funcionando después de los rechazos", async () => {
  const datos = datosDe(await leer_solicitud.execute({ caso: "pa-logistica-istmo" }, entorno.ctx))
  assert.equal(datos["pais"], "PA")
  assert.equal(datos["formato"], "portal")
})
