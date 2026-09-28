import { test } from "node:test"
import assert from "node:assert/strict"
import { mapearCampo, mapearCampos } from "../src/core/mapeo.ts"
import { cargarCasoDePrueba, cargarContexto } from "../test-utils/ayuda.ts"

test("RN1 · en Colombia el NIT se llena sin confirmación", () => {
  const { leido, maestro, glosario } = cargarCasoDePrueba("co-industrias-delta")
  const mapeo = mapearCampos({ caso: leido.caso, pais: leido.solicitud.pais, campos: leido.campos, maestro, glosario })
  const nit = mapeo.campos.find((c) => c.campo === "NIT")
  assert.ok(nit, "debe existir el campo NIT")
  assert.equal(nit.estado, "lleno")
  assert.equal(nit.ruta_dato, "nit")
  assert.equal(nit.valor, "900123456")
  assert.equal(nit.nota, null)
})

test("RN1 · fuera de Colombia el identificador va lleno pero exige confirmación", () => {
  const casos: [string, string][] = [
    ["ec-corp-andina", "RUC"],
    ["pa-logistica-istmo", "RUC"],
    ["hn-agroexport-sula", "RTN"],
  ]
  for (const [caso, etiqueta] of casos) {
    const { leido, maestro, glosario } = cargarCasoDePrueba(caso)
    const mapeo = mapearCampos({ caso, pais: leido.solicitud.pais, campos: leido.campos, maestro, glosario })
    const campo = mapeo.campos.find((c) => c.campo === etiqueta)
    assert.ok(campo, `${caso}: debe existir el campo ${etiqueta}`)
    assert.equal(campo.estado, "requiere_confirmacion", `${caso}: ${etiqueta}`)
    assert.equal(campo.valor, "900123456", `${caso}: ${etiqueta} debe llevar el NIT de Periferia`)
    assert.match(String(campo.nota), /identificador extranjero/i)
  }
})

test("campos sin fuente quedan faltantes, nunca inventados", () => {
  const { leido, maestro, glosario } = cargarCasoDePrueba("hn-agroexport-sula")
  const mapeo = mapearCampos({ caso: leido.caso, pais: leido.solicitud.pais, campos: leido.campos, maestro, glosario })
  const referencias = mapeo.campos.find((c) => c.campo === "Referencias comerciales")
  assert.ok(referencias, "debe existir el campo de referencias")
  assert.equal(referencias.estado, "faltante")
  assert.equal(referencias.valor, null)
})

test("un campo que el glosario conoce pero el maestro no tiene queda faltante", () => {
  const { maestro, glosario } = cargarContexto()
  assert.ok(maestro, "el maestro real se carga")

  // "Contacto financiero" está en el glosario; con un maestro sin ese dato debe
  // quedar faltante. Es la garantía central: sin fuente, no hay valor.
  const conMaestro = mapearCampo({ pais: "CO", maestro, glosario }, "Contacto financiero")
  assert.equal(conMaestro.estado, "lleno")
  assert.equal(conMaestro.valor, "Camila Ortiz Vélez")

  const sinMaestro = mapearCampo({ pais: "CO", maestro: {}, glosario }, "Contacto financiero")
  assert.equal(sinMaestro.estado, "faltante")
  assert.equal(sinMaestro.valor, null)
  assert.equal(sinMaestro.ruta_dato, null)
})

test("RN2 · los datos bancarios solo aparecen si la plantilla los pide", () => {
  const pide = cargarCasoDePrueba("co-industrias-delta")
  const conBanco = mapearCampos({
    caso: pide.leido.caso,
    pais: pide.leido.solicitud.pais,
    campos: pide.leido.campos,
    maestro: pide.maestro,
    glosario: pide.glosario,
  })
  assert.ok(
    conBanco.campos.some((c) => c.ruta_dato?.startsWith("banco.")),
    "co-industrias-delta sí pide datos bancarios",
  )

  const noPide = cargarCasoDePrueba("hn-agroexport-sula")
  const sinBanco = mapearCampos({
    caso: noPide.leido.caso,
    pais: noPide.leido.solicitud.pais,
    campos: noPide.leido.campos,
    maestro: noPide.maestro,
    glosario: noPide.glosario,
  })
  assert.equal(
    sinBanco.campos.filter((c) => c.ruta_dato?.startsWith("banco.")).length,
    0,
    "hn-agroexport-sula no pide datos bancarios y no deben aparecer",
  )
})

test("etiqueta tributaria genérica: se confirma y se propone el equivalente local", () => {
  const { maestro, glosario } = cargarContexto()
  const campo = mapearCampo({ pais: "EC", maestro, glosario }, "Identificación tributaria")
  assert.equal(campo.estado, "requiere_confirmacion")
  assert.equal(campo.valor, "900123456")
  assert.match(String(campo.nota), /RUC/)

  const otro = mapearCampo({ pais: "CO", maestro, glosario }, "Número de identificación fiscal")
  assert.equal(otro.estado, "requiere_confirmacion")
  assert.match(String(otro.nota), /NIT/)
})

test("mapeo aproximado: un casi-acierto exige confirmación en lugar de darse por lleno", () => {
  const { maestro, glosario } = cargarContexto()
  // El cliente se comió la preposición "de".
  const campo = mapearCampo({ pais: "CO", maestro, glosario }, "Dígito Verificación")
  assert.equal(campo.estado, "requiere_confirmacion")
  assert.equal(campo.ruta_dato, "digito_verificacion")
  assert.equal(campo.confianza, 0.7)
  assert.match(String(campo.nota), /confianza/i)
})

test("una etiqueta desconocida no se mapea a nada", () => {
  const { maestro, glosario } = cargarContexto()
  const campo = mapearCampo({ pais: "CO", maestro, glosario }, "Cantidad de bicicletas")
  assert.equal(campo.estado, "faltante")
  assert.equal(campo.ruta_dato, null)
  assert.equal(campo.valor, null)
})

test("el país se propaga a todo el mapeo", () => {
  const { leido, maestro, glosario } = cargarCasoDePrueba("pa-logistica-istmo")
  const mapeo = mapearCampos({ caso: leido.caso, pais: leido.solicitud.pais, campos: leido.campos, maestro, glosario })
  assert.equal(mapeo.pais, "PA")
  assert.equal(mapeo.caso, "pa-logistica-istmo")
})
