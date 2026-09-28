import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { armar_paquete, generar_formulario, simular_envio } from "../src/tools/proveedor.ts"
import { crearEntorno, datosDe, json, type EntornoPrueba } from "../test-utils/herramientas.ts"

let entorno: EntornoPrueba

before(() => {
  entorno = crearEntorno("prueba-seguridad")
})

after(() => {
  entorno.limpiar()
})

test("anti-alucinación · un mapeo alterado por el modelo NO cambia el formulario", async () => {
  // El modelo devuelve un valor "arreglado": el motor debe ignorarlo y releer el maestro.
  const mapeoAlterado = {
    caso: "co-industrias-delta",
    pais: "CO",
    campos: [
      {
        campo: "Razón social",
        estado: "lleno" as const,
        ruta_dato: "razon_social",
        valor: "Empresa Inventada S.A.S.",
        confianza: 1,
        nota: null,
      },
    ],
  }

  const datos = datosDe(
    await generar_formulario.execute({ caso: "co-industrias-delta", mapeo: mapeoAlterado }, entorno.ctx),
  )

  const advertencias = datos["advertencias"] as string[]
  assert.ok(advertencias.some((aviso) => /ignoraron/i.test(aviso)), `debe avisar del valor alterado: ${advertencias}`)

  const valorEscrito = await entorno.celda(entorno.out("co-industrias-delta", "formulario.xlsx"), "Datos Proveedor", "C3")
  assert.equal(valorEscrito, "Periferia IT Group S.A.S.", "el valor escrito sale del maestro, no del modelo")
  assert.notEqual(valorEscrito, "Empresa Inventada S.A.S.")
})

test("anti-alucinación · el mapeo recibido también se audita si omite campos del caso", async () => {
  const mapeoIncompleto = { caso: "co-industrias-delta", pais: "CO", campos: [] }
  const datos = datosDe(
    await generar_formulario.execute({ caso: "co-industrias-delta", mapeo: mapeoIncompleto }, entorno.ctx),
  )
  const advertencias = datos["advertencias"] as string[]
  assert.ok(advertencias.some((aviso) => /omitía/i.test(aviso)), `debe avisar de los campos omitidos: ${advertencias}`)
})

test("el xlsx marca en ámbar los campos que requieren confirmación humana", async () => {
  // hn-agroexport-sula pide RTN: fuera de Colombia va lleno pero por confirmar (RN1).
  datosDe(await generar_formulario.execute({ caso: "hn-agroexport-sula" }, entorno.ctx))

  const libro = await entorno.libro(entorno.out("hn-agroexport-sula", "formulario.xlsx"))
  const hoja = libro.getWorksheet("Registro")
  assert.ok(hoja, "debe existir la hoja Registro")

  const celdaRtn = hoja.getCell("B3")
  assert.equal(celdaRtn.value, "900123456")
  assert.match(String(celdaRtn.note ?? ""), /confirmaci/i)

  const relleno = celdaRtn.fill
  assert.ok(relleno && relleno.type === "pattern", "la celda debe llevar relleno de patrón")
  assert.equal(relleno.type === "pattern" ? relleno.fgColor?.argb : null, "FFF4CE")
})

test("RN2 · el borrador de correo no lleva datos bancarios", async () => {
  datosDe(await armar_paquete.execute({ caso: "co-industrias-delta" }, entorno.ctx))

  const borrador = fs.readFileSync(entorno.out("co-industrias-delta", "paquete", "borrador-correo.md"), "utf8")
  const checklist = fs.readFileSync(entorno.out("co-industrias-delta", "paquete", "checklist.md"), "utf8")

  for (const dato of ["Bancolombia", "03100012345", "COLOCOBM", "Titular de la cuenta"]) {
    assert.ok(!borrador.includes(dato), `el borrador no debe contener "${dato}" (RN2)`)
  }
  assert.match(borrador, /Los datos bancarios no se incluyen en este borrador \(RN2\)/)
  assert.ok(!checklist.includes("03100012345"), "el checklist tampoco expone el número de cuenta")
})

test("RN4 · el envío sin confirmación explícita se rechaza", async () => {
  const rechazo = json(await simular_envio.execute({ caso: "co-industrias-delta", confirmado: false }, entorno.ctx))
  assert.equal(rechazo.ok, false)
  assert.match(String(rechazo.error), /confirmaci/i)
  assert.ok(!fs.existsSync(entorno.out("co-industrias-delta", "ENVIO-SIMULADO.md")))
})

test("RN4 · con confirmación pero sin paquete armado también se rechaza", async () => {
  const rechazo = json(await simular_envio.execute({ caso: "ec-corp-andina", confirmado: true }, entorno.ctx))
  assert.equal(rechazo.ok, false)
  assert.match(String(rechazo.error), /armado/i)
})

test("RN4 · con confirmación y paquete armado escribe ENVIO-SIMULADO.md sin enviar nada", async () => {
  datosDe(await armar_paquete.execute({ caso: "ec-corp-andina" }, entorno.ctx))
  const datos = datosDe(await simular_envio.execute({ caso: "ec-corp-andina", confirmado: true }, entorno.ctx))

  assert.equal(datos["enviado"], false, "nunca se envía nada de verdad")
  assert.ok((datos["adjuntos"] as string[]).length > 0)

  const contenido = fs.readFileSync(entorno.out("ec-corp-andina", "ENVIO-SIMULADO.md"), "utf8")
  assert.match(contenido, /No se envió nada/)
  assert.match(contenido, /proveedores@corpandina-ficticia\.ec/)
  assert.match(contenido, /certificado_cumplimiento_tributario/, "debe advertir lo que bloquea la firma")
})
