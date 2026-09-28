import { test } from "node:test"
import assert from "node:assert/strict"
import { distancia, normalizar, similitud } from "../src/core/normalizar.ts"

test("normalizar quita tildes, mayúsculas, signos y espacios sobrantes", () => {
  assert.equal(normalizar("  Razón Social  "), "razon social")
  assert.equal(normalizar("Código CIIU"), "codigo ciiu")
  assert.equal(normalizar("Dígito de Verificación"), "digito de verificacion")
  assert.equal(normalizar("Correo electrónico:"), "correo electronico")
  assert.equal(normalizar("¿Teléfono?"), "telefono")
  assert.equal(normalizar("Nombre o razón social del proveedor"), "nombre o razon social del proveedor")
})

test("normalizar conserva los separadores que usan las etiquetas reales", () => {
  assert.equal(normalizar("Departamento / Provincia"), "departamento / provincia")
  assert.equal(normalizar("Datos-Bancarios"), "datos-bancarios")
})

test("normalizar colapsa espacios y deja vacío lo que no aporta texto", () => {
  assert.equal(normalizar("  a    b  "), "a b")
  assert.equal(normalizar("¿?"), "")
  assert.equal(normalizar("   "), "")
})

test("distancia de Levenshtein", () => {
  assert.equal(distancia("", ""), 0)
  assert.equal(distancia("abc", "abc"), 0)
  assert.equal(distancia("", "abc"), 3)
  assert.equal(distancia("abc", ""), 3)
  assert.equal(distancia("casa", "calle"), 3)
  // Caso realista: el cliente omite la preposición.
  assert.equal(distancia("digito verificacion", "digito de verificacion"), 3)
})

test("similitud normalizada", () => {
  assert.equal(similitud("abc", "abc"), 1)
  assert.equal(similitud("", ""), 1)
  assert.equal(similitud("abc", ""), 0)
  const s = similitud("digito verificacion", "digito de verificacion")
  assert.ok(s >= 0.85, `se esperaba >= 0.85 y se obtuvo ${s}`)
})

test("la similitud NO confunde etiquetas distintas de los fixtures", () => {
  // Estas dos etiquetas conviven en los casos y no deben parecerse.
  const s = similitud(normalizar("Número de contribuyente especial"), normalizar("Número de identificación fiscal"))
  assert.ok(s < 0.85, `se esperaba < 0.85 y se obtuvo ${s}`)

  const t = similitud(normalizar("Referencias comerciales"), normalizar("Contacto comercial"))
  assert.ok(t < 0.85, `se esperaba < 0.85 y se obtuvo ${t}`)
})
