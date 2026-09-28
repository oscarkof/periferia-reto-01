import { test } from "node:test"
import assert from "node:assert/strict"
import { cargarCaso, listarCasos } from "../src/core/casos.ts"
import { detectarAmbiguos, interpretarCampos, interpretarCeldas, interpretarSolicitud } from "../src/core/plantillas.ts"
import { exigir } from "../test-utils/ayuda.ts"

test("HU-1 · listarCasos devuelve los cuatro casos de fixtures, ordenados", () => {
  assert.deepEqual(exigir(listarCasos()), [
    "co-industrias-delta",
    "ec-corp-andina",
    "hn-agroexport-sula",
    "pa-logistica-istmo",
  ])
})

/** Lo que declara cada caso: país, formato y número de campos pedidos. */
const CASOS: Record<string, { pais: string; formato: string; campos: number }> = {
  "co-industrias-delta": { pais: "CO", formato: "xlsx", campos: 17 },
  "hn-agroexport-sula": { pais: "HN", formato: "xlsx", campos: 11 },
  "ec-corp-andina": { pais: "EC", formato: "pdf", campos: 15 },
  "pa-logistica-istmo": { pais: "PA", formato: "portal", campos: 9 },
}

for (const [caso, esperado] of Object.entries(CASOS)) {
  test(`HU-1 · ${caso} se lee con país, formato y campos coherentes`, () => {
    const leido = exigir(cargarCaso(caso))

    assert.equal(leido.caso, caso)
    assert.equal(leido.solicitud.id, caso)
    assert.equal(leido.solicitud.pais, esperado.pais)
    assert.equal(leido.solicitud.formato, esperado.formato)
    assert.equal(leido.campos.length, esperado.campos)
    assert.ok(leido.solicitud.cliente.length > 0, "el cliente debe estar identificado")
    assert.ok(leido.soportes_exigidos.length > 0, "el caso debe exigir soportes")

    // La plantilla que manda depende del formato declarado.
    if (esperado.formato === "xlsx") {
      assert.equal(leido.plantilla_celdas.length, esperado.campos)
      assert.equal(leido.plantilla_campos.length, 0)
      for (const celda of leido.plantilla_celdas) {
        assert.ok(celda.hoja.length > 0 && celda.celda_valor.length > 0)
      }
    } else {
      assert.equal(leido.plantilla_campos.length, esperado.campos)
      assert.equal(leido.plantilla_celdas.length, 0)
    }

    // Los campos pedidos son exactamente las etiquetas de la plantilla.
    const esperadas =
      esperado.formato === "xlsx"
        ? leido.plantilla_celdas.map((c) => c.etiqueta)
        : leido.plantilla_campos.map((c) => c.etiqueta)
    assert.deepEqual(leido.campos, esperadas)
  })
}

test("HU-1 · ninguna etiqueta de los fixtures es ambigua, pero el detector las reconoce", () => {
  for (const caso of Object.keys(CASOS)) {
    const leido = exigir(cargarCaso(caso))
    assert.deepEqual(leido.ambiguos, [], `${caso}: no debería haber etiquetas ambiguas`)
  }

  const ambiguos = detectarAmbiguos(["Identificación tributaria", "Razón social"], "EC")
  assert.equal(ambiguos.length, 1)
  assert.equal(ambiguos[0]?.etiqueta, "Identificación tributaria")
  assert.equal(ambiguos[0]?.equivalente_local, "RUC")
  assert.match(ambiguos[0]?.nota ?? "", /RUC/)
})

test("HU-5 · un caso inexistente o un nombre inválido dan error legible, sin lanzar", () => {
  assert.doesNotThrow(() => cargarCaso("no-existe"))

  const inexistente = cargarCaso("no-existe")
  assert.equal(inexistente.ok, false)
  if (!inexistente.ok) assert.match(inexistente.error, /no existe/i)

  const casos: [string, RegExp][] = [
    ["", /vacío/i],
    ["../reto-02", /inválido/i],
    ["a/b", /inválido/i],
    ["..", /inválido/i],
    ["con espacio", /inválido/i],
    ["x".repeat(65), /caracteres/i],
  ]
  for (const [nombre, patron] of casos) {
    const resultado = cargarCaso(nombre)
    assert.equal(resultado.ok, false, `"${nombre}" debía fallar`)
    if (!resultado.ok) assert.match(resultado.error, patron, `mensaje para "${nombre}": ${resultado.error}`)
  }
})

test("HU-5 · una solicitud incompleta se explica campo por campo", () => {
  const resultado = interpretarSolicitud({ id: "x", pais: "CO" }, "caso-raro")
  assert.equal(resultado.ok, false)
  if (!resultado.ok) {
    assert.match(resultado.error, /caso-raro\/solicitud\.json/)
    assert.match(resultado.error, /de/)
    assert.match(resultado.error, /cliente/)
  }
})

test("HU-5 · país y formato no soportados se rechazan con el valor recibido", () => {
  const base = {
    id: "x",
    de: "a@b.c",
    asunto: "a",
    fecha: "2026-01-01",
    pais: "CO",
    cliente: "C",
    formato: "xlsx",
    cuerpo: "cuerpo",
    adjuntos: [],
  }

  const paisMalo = interpretarSolicitud({ ...base, pais: "MX" }, "caso-raro")
  assert.equal(paisMalo.ok, false)
  if (!paisMalo.ok) assert.match(paisMalo.error, /MX/)

  const formatoMalo = interpretarSolicitud({ ...base, formato: "docx" }, "caso-raro")
  assert.equal(formatoMalo.ok, false)
  if (!formatoMalo.ok) assert.match(formatoMalo.error, /docx/)
})

test("HU-5 · plantillas corruptas no rompen el proceso", () => {
  const noEsArreglo = interpretarCeldas({}, "caso-raro")
  assert.equal(noEsArreglo.ok, false)

  const filaIncompleta = interpretarCeldas([{ hoja: "H", etiqueta: "Razón social" }], "caso-raro")
  assert.equal(filaIncompleta.ok, false)
  if (!filaIncompleta.ok) assert.match(filaIncompleta.error, /celda_valor/)

  const camposMalos = interpretarCampos([{ obligatorio: true }], "caso-raro")
  assert.equal(camposMalos.ok, false)
  if (!camposMalos.ok) assert.match(camposMalos.error, /etiqueta/)
})
