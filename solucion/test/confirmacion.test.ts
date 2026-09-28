import { test } from "node:test"
import assert from "node:assert/strict"
import { esConfirmacionExplicita, esNegacion, esRechazo, normalizarRespuesta } from "../src/agent/confirmacion.ts"

test("reconoce confirmaciones explícitas (CA3 · RN4)", () => {
  for (const texto of ["sí", "si", "Sí, envía", "ok", "dale", "confirmo", "confirmado el envío", "adelante", "procede"]) {
    assert.equal(esConfirmacionExplicita(texto), true, `"${texto}" debería confirmar`)
  }
})

test("no confunde una instrucción con una confirmación", () => {
  for (const texto of [
    "procesa el caso co-industrias-delta",
    "¿qué campos faltan?",
    "muéstrame el checklist",
    "",
    "   ",
  ]) {
    assert.equal(esConfirmacionExplicita(texto), false, `"${texto}" no debería confirmar`)
  }
})

test("una confirmación con freno NO es confirmación", () => {
  // Empezar por "sí" no basta si luego pide esperar o revisar.
  for (const texto of ["sí, pero antes revisa el checklist", "sí, espera", "ok, no lo envíes todavía", "sí, faltan soportes"]) {
    assert.equal(esConfirmacionExplicita(texto), false, `"${texto}" no debería confirmar`)
  }
})

test("reconoce negaciones y rechazos", () => {
  assert.equal(esNegacion("no lo envíes todavía"), true)
  assert.equal(esNegacion("espera un momento"), true)
  assert.equal(esRechazo("no"), true)
  assert.equal(esRechazo("cancela"), true)
  assert.equal(esRechazo("sí, envía"), false)
})

test("normaliza tildes, mayúsculas y signos para comparar", () => {
  assert.equal(normalizarRespuesta("  ¡SÍ,  ENVÍA!  "), "si envia")
})
