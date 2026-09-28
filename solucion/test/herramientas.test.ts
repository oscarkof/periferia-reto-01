import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import {
  NOMBRES,
  armar_paquete,
  generar_formulario,
  leer_solicitud,
  listarHerramientas,
  mapear_campos,
} from "../src/tools/proveedor.ts"
import { crearEntorno, datosDe, type EntornoPrueba } from "../test-utils/herramientas.ts"

let entorno: EntornoPrueba

before(() => {
  entorno = crearEntorno()
})

after(() => {
  entorno.limpiar()
})

test("las cinco herramientas tienen el nombre exacto del contrato del PRD", () => {
  assert.deepEqual(NOMBRES, [
    "proveedor_leer_solicitud",
    "proveedor_mapear_campos",
    "proveedor_generar_formulario",
    "proveedor_armar_paquete",
    "proveedor_simular_envio",
  ])
  assert.deepEqual(
    listarHerramientas().map((entrada) => entrada.nombre),
    NOMBRES,
    "el registro expone los mismos nombres que el contrato",
  )
  for (const entrada of listarHerramientas()) {
    assert.ok(entrada.herramienta.description.length > 40, `${entrada.nombre} necesita descripción útil`)
    assert.equal(typeof entrada.herramienta.execute, "function")
  }
})

test("leer_solicitud devuelve país, cliente, formato, campos y soportes (HU-1)", async () => {
  const datos = datosDe(await leer_solicitud.execute({ caso: "co-industrias-delta" }, entorno.ctx))
  assert.equal(datos["pais"], "CO")
  assert.equal(datos["cliente"], "Industrias Delta S.A.S.")
  assert.equal(datos["formato"], "xlsx")
  assert.equal((datos["campos"] as string[]).length, 17)
  assert.equal((datos["soportes"] as string[]).length, 4)
  assert.match(String(datos["fecha_ejecucion"]), /^\d{4}-\d{2}-\d{2}$/)
})

test("mapear_campos separa llenos, por confirmar y faltantes (HU-2)", async () => {
  const solicitud = datosDe(await leer_solicitud.execute({ caso: "hn-agroexport-sula" }, entorno.ctx))
  const campos = solicitud["campos"] as string[]
  const datos = datosDe(await mapear_campos.execute({ caso: "hn-agroexport-sula", campos }, entorno.ctx))

  assert.equal((datos["llenos"] as unknown[]).length, 9)
  assert.equal((datos["requiere_confirmacion"] as unknown[]).length, 1)
  assert.equal((datos["faltantes"] as unknown[]).length, 1)
  assert.equal(datos["total"], 11)
  assert.match(String(datos["resumen"]), /9 llenos/)
})

test("generar_formulario escribe el xlsx en las celdas exactas de la plantilla", async () => {
  const datos = datosDe(await generar_formulario.execute({ caso: "co-industrias-delta" }, entorno.ctx))
  assert.equal(datos["formato"], "xlsx")
  assert.equal(datos["soportado"], true)
  assert.equal(datos["archivo"], "formulario.xlsx")

  const ruta = entorno.out("co-industrias-delta", "formulario.xlsx")
  assert.ok(fs.existsSync(ruta), "el archivo debe existir en out/<caso>/")
  assert.equal(await entorno.celda(ruta, "Datos Proveedor", "B3"), "Razón social")
  assert.equal(await entorno.celda(ruta, "Datos Proveedor", "C3"), "Periferia IT Group S.A.S.")
  assert.equal(await entorno.celda(ruta, "Datos Proveedor", "C4"), "900123456")
  assert.equal(await entorno.celda(ruta, "Datos Bancarios", "C5"), "03100012345")
})

test("un formato portal no se genera: deja los valores listos para copiar (P2 · HU-3)", async () => {
  const datos = datosDe(await generar_formulario.execute({ caso: "pa-logistica-istmo" }, entorno.ctx))
  assert.equal(datos["soportado"], false, "el portal no está soportado")
  assert.equal(datos["archivo"], "valores-portal.md")
  assert.match(String(datos["nota"]), /no soportado/i)

  const ruta = entorno.out("pa-logistica-istmo", "valores-portal.md")
  assert.ok(fs.existsSync(ruta))
  const contenido = fs.readFileSync(ruta, "utf8")
  assert.match(contenido, /Nombre o razón social del proveedor/)
  assert.match(contenido, /Periferia IT Group S\.A\.S\./)
  assert.match(contenido, /confirmar/i, "el RUC debe quedar marcado para revisión humana")
  assert.match(contenido, /no se automatiza/i)
})

test("armar_paquete reúne formulario, soportes, checklist y borrador (HU-4)", async () => {
  const datos = datosDe(await armar_paquete.execute({ caso: "co-industrias-delta" }, entorno.ctx))
  assert.equal(datos["listo_para_firma"], true)

  const archivos = datos["archivos"] as string[]
  const carpeta = entorno.out("co-industrias-delta", "paquete")
  for (const esperado of ["checklist.md", "borrador-correo.md", "formulario.xlsx"]) {
    assert.ok(archivos.includes(esperado), `el paquete debe incluir ${esperado}`)
    assert.ok(fs.existsSync(`${carpeta}/${esperado}`), `falta ${esperado} en el paquete`)
  }
  assert.ok(
    fs.existsSync(`${carpeta}/soportes/rut-2026.txt`),
    "debe copiar los soportes exigidos que existen en el repositorio",
  )
})
