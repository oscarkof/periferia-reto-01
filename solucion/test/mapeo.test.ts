import { test } from "node:test"
import assert from "node:assert/strict"
import { mapearCampos } from "../src/core/mapeo.ts"
import { cargarCasoDePrueba } from "../test-utils/ayuda.ts"

/**
 * Tabla de aceptación de F1: lo que debe producir cada caso real de fixtures.
 * Los números no son aproximados: si cambian, algo se rompió.
 */
const ESPERADO: Record<string, { campos: number; llenos: number; faltantes: number; confirmar: number }> = {
  "co-industrias-delta": { campos: 17, llenos: 17, faltantes: 0, confirmar: 0 },
  "hn-agroexport-sula": { campos: 11, llenos: 9, faltantes: 1, confirmar: 1 },
  "ec-corp-andina": { campos: 15, llenos: 13, faltantes: 1, confirmar: 1 },
  "pa-logistica-istmo": { campos: 9, llenos: 8, faltantes: 0, confirmar: 1 },
}

for (const [caso, esperado] of Object.entries(ESPERADO)) {
  test(`mapeo completo de ${caso}`, () => {
    const { leido, maestro, glosario } = cargarCasoDePrueba(caso)
    const mapeo = mapearCampos({ caso, pais: leido.solicitud.pais, campos: leido.campos, maestro, glosario })

    assert.equal(mapeo.campos.length, esperado.campos, "campos mapeados")
    assert.equal(mapeo.llenos.length, esperado.llenos, `llenos: ${mapeo.llenos.map((c) => c.campo).join(" | ")}`)
    assert.equal(
      mapeo.faltantes.length,
      esperado.faltantes,
      `faltantes: ${mapeo.faltantes.map((c) => c.campo).join(" | ")}`,
    )
    assert.equal(mapeo.requiere_confirmacion.length, esperado.confirmar, "requiere confirmación")

    // Invariante 1: un campo faltante no trae valor ni ruta (no se inventa nada).
    for (const campo of mapeo.faltantes) {
      assert.equal(campo.valor, null, `"${campo.campo}" es faltante pero trae valor`)
      assert.equal(campo.ruta_dato, null, `"${campo.campo}" es faltante pero trae ruta_dato`)
      assert.equal(campo.confianza, 0, `"${campo.campo}" es faltante pero tiene confianza`)
    }

    // Invariante 2: un campo lleno siempre tiene fuente y confianza máxima.
    for (const campo of mapeo.llenos) {
      assert.notEqual(campo.ruta_dato, null, `"${campo.campo}" está lleno sin ruta_dato`)
      assert.notEqual(campo.valor, null, `"${campo.campo}" está lleno sin valor`)
      assert.equal(campo.confianza, 1, `"${campo.campo}" debería tener confianza 1`)
      assert.equal(campo.nota, null, `"${campo.campo}" está lleno y no debería llevar nota`)
    }

    // Invariante 3: los tres grupos particionan exactamente los campos.
    assert.equal(
      mapeo.llenos.length + mapeo.faltantes.length + mapeo.requiere_confirmacion.length,
      mapeo.campos.length,
      "los estados deben particionar los campos",
    )
  })
}

test("los valores salen del maestro, con la ruta del dato anotada", () => {
  const { leido, maestro, glosario } = cargarCasoDePrueba("co-industrias-delta")
  const mapeo = mapearCampos({ caso: leido.caso, pais: leido.solicitud.pais, campos: leido.campos, maestro, glosario })
  const porCampo = new Map(mapeo.campos.map((c) => [c.campo, c]))

  assert.equal(porCampo.get("Razón social")?.valor, "Periferia IT Group S.A.S.")
  assert.equal(porCampo.get("Razón social")?.ruta_dato, "razon_social")
  assert.equal(porCampo.get("Código CIIU")?.ruta_dato, "ciiu_principal")
  assert.equal(porCampo.get("Titular de la cuenta")?.ruta_dato, "banco.titular")
  assert.equal(porCampo.get("Correo electrónico")?.valor, "lgomez@periferia-ficticia.com")
  assert.equal(porCampo.get("SWIFT"), undefined, "este caso no pide SWIFT")
})

test("los campos se conservan en el orden de la plantilla", () => {
  const { leido, maestro, glosario } = cargarCasoDePrueba("pa-logistica-istmo")
  const mapeo = mapearCampos({ caso: leido.caso, pais: leido.solicitud.pais, campos: leido.campos, maestro, glosario })
  assert.deepEqual(
    mapeo.campos.map((c) => c.campo),
    leido.campos,
  )
})

test("el mapeo es determinista: dos ejecuciones dan el mismo resultado", () => {
  const { leido, maestro, glosario } = cargarCasoDePrueba("ec-corp-andina")
  const entrada = { caso: leido.caso, pais: leido.solicitud.pais, campos: leido.campos, maestro, glosario }
  assert.equal(JSON.stringify(mapearCampos(entrada)), JSON.stringify(mapearCampos(entrada)))
})
