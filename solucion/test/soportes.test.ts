import { test } from "node:test"
import assert from "node:assert/strict"
import { evaluarSoporte, evaluarSoportes, estaVencido, fechaEjecucion } from "../src/core/soportes.ts"
import { cargarIndiceSoportes } from "../src/core/fixtures.ts"
import { cargarCaso } from "../src/core/casos.ts"
import { exigir } from "../test-utils/ayuda.ts"

/** Fecha de ejecución fijada: las pruebas deben ser reproducibles en el tiempo. */
const FECHA = "2026-09-28"

test("estaVencido: null nunca vence y las fechas ISO se comparan bien", () => {
  assert.equal(estaVencido(null, FECHA), false, "el RUT no vence")
  assert.equal(estaVencido("2026-08-31", FECHA), true, "venció antes de la ejecución")
  assert.equal(estaVencido("2026-09-28", FECHA), false, "vence hoy: todavía sirve")
  assert.equal(estaVencido("2026-09-30", FECHA), false, "vence después")
  assert.equal(estaVencido("2027-03-31", FECHA), false)
})

test("fechaEjecucion usa la fecha local y respeta FECHA_EJECUCION", () => {
  process.env["FECHA_EJECUCION"] = "2026-01-02"
  assert.equal(fechaEjecucion(), "2026-01-02")

  process.env["FECHA_EJECUCION"] = "no-es-una-fecha"
  assert.match(fechaEjecucion(new Date(2026, 8, 28)), /^2026-09-28$/)

  delete process.env["FECHA_EJECUCION"]
  assert.match(fechaEjecucion(), /^\d{4}-\d{2}-\d{2}$/)
})

test("un soporte ausente del índice se reporta como ausente", () => {
  const indexados = exigir(cargarIndiceSoportes())
  const soporte = evaluarSoporte("certificado_cumplimiento_tributario", indexados, FECHA)
  assert.equal(soporte.estado, "ausente")
  assert.equal(soporte.archivo, null)
  assert.equal(soporte.vigencia_hasta, null)
})

test("checklist de los cuatro casos reales", () => {
  const indexados = exigir(cargarIndiceSoportes())
  const esperado: Record<string, { listo: boolean; presentes: number; ausentes: number; vencidos: number }> = {
    "co-industrias-delta": { listo: true, presentes: 4, ausentes: 0, vencidos: 0 },
    "hn-agroexport-sula": { listo: false, presentes: 2, ausentes: 0, vencidos: 1 },
    "ec-corp-andina": { listo: false, presentes: 4, ausentes: 1, vencidos: 0 },
    "pa-logistica-istmo": { listo: true, presentes: 2, ausentes: 0, vencidos: 0 },
  }

  for (const [caso, exp] of Object.entries(esperado)) {
    const leido = exigir(cargarCaso(caso))
    const checklist = evaluarSoportes({ caso, exigidos: leido.soportes_exigidos, indexados, fecha: FECHA })

    assert.equal(checklist.listo_para_firma, exp.listo, `${caso}: veredicto de firma`)
    assert.equal(checklist.presentes.length, exp.presentes, `${caso}: presentes`)
    assert.equal(checklist.ausentes.length, exp.ausentes, `${caso}: ausentes`)
    assert.equal(checklist.vencidos.length, exp.vencidos, `${caso}: vencidos`)
    assert.equal(checklist.caso, caso)

    // RN3: el veredicto es coherente con los bloqueos, no un valor suelto.
    assert.equal(checklist.listo_para_firma, checklist.bloqueos.length === 0)
    for (const bloqueo of checklist.bloqueos) {
      assert.ok(
        ["soporte_ausente", "soporte_vencido"].includes(bloqueo.motivo),
        `motivo inesperado: ${bloqueo.motivo}`,
      )
      assert.ok(bloqueo.detalle.length > 0, "cada bloqueo debe explicarse")
    }
  }
})

test("el caso hondureño se bloquea por parafiscales vencidos y lo dice con fecha", () => {
  const leido = exigir(cargarCaso("hn-agroexport-sula"))
  const checklist = evaluarSoportes({
    caso: leido.caso,
    exigidos: leido.soportes_exigidos,
    indexados: exigir(cargarIndiceSoportes()),
    fecha: FECHA,
  })
  assert.deepEqual(checklist.vencidos, ["parafiscales"])
  const bloqueo = checklist.bloqueos.find((b) => b.motivo === "soporte_vencido")
  assert.ok(bloqueo, "debe existir un bloqueo por vencimiento")
  assert.match(bloqueo.detalle, /2026-08-31/)
  assert.match(bloqueo.detalle, /parafiscales/)
})

test("un soporte que existe pero ningún caso exige no entra al checklist", () => {
  const indexados = exigir(cargarIndiceSoportes())
  assert.ok(
    indexados.some((s) => s.tipo === "certificado_iso_9001"),
    "el índice sí contiene el certificado ISO",
  )

  for (const caso of ["co-industrias-delta", "hn-agroexport-sula", "ec-corp-andina", "pa-logistica-istmo"]) {
    const leido = exigir(cargarCaso(caso))
    const checklist = evaluarSoportes({ caso, exigidos: leido.soportes_exigidos, indexados, fecha: FECHA })
    assert.equal(
      checklist.soportes.filter((s) => s.tipo === "certificado_iso_9001").length,
      0,
      `${caso}: el ISO no se exige y no debe aparecer`,
    )
  }
})

test("un campo del formulario faltante NO bloquea la firma (solo los soportes lo hacen)", () => {
  const leido = exigir(cargarCaso("hn-agroexport-sula"))
  // hn tiene un campo faltante (Referencias comerciales) pero su bloqueo viene del vencimiento.
  const checklist = evaluarSoportes({
    caso: leido.caso,
    exigidos: leido.soportes_exigidos.filter((s) => s !== "parafiscales"),
    indexados: exigir(cargarIndiceSoportes()),
    fecha: FECHA,
  })
  assert.equal(checklist.listo_para_firma, true, "sin el soporte vencido, el paquete sí está listo")
  assert.equal(checklist.vencidos.length, 0)
})
