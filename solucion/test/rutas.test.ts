import { test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { dirCasos, dirFixtures, dirOut, dirProyecto, resolverDentro, validarNombreCaso } from "../src/core/rutas.ts"
import { exigir } from "../test-utils/ayuda.ts"

test("la raíz del proyecto es la carpeta que contiene package.json", () => {
  assert.equal(path.basename(dirProyecto()), "solucion")
  assert.ok(dirOut().endsWith(path.join("solucion", "out")))
})

test("los fixtures viven fuera de la aplicación, en fixtures/reto-01", () => {
  assert.ok(dirFixtures().endsWith(path.join("fixtures", "reto-01")), dirFixtures())
  assert.ok(dirCasos().endsWith(path.join("fixtures", "reto-01", "casos")))
})

test("FIXTURES_DIR permite apuntar a otra ubicación", () => {
  process.env["FIXTURES_DIR"] = "/tmp/fixtures-de-prueba"
  assert.equal(dirFixtures(), path.resolve("/tmp/fixtures-de-prueba"))
  process.env["FIXTURES_DIR"] = "  "
  assert.ok(dirFixtures().endsWith(path.join("fixtures", "reto-01")), "un valor vacío cae al default")
  delete process.env["FIXTURES_DIR"]
})

test("nombres de caso válidos", () => {
  for (const nombre of ["co-industrias-delta", "ec-corp-andina", "Caso_2026"]) {
    assert.equal(exigir(validarNombreCaso(nombre)), nombre)
  }
})

test("nombres de caso inválidos (el nombre lo propone el modelo: se valida)", () => {
  const invalidos = ["", "   ", "a/b", "../x", "..", "x.y", "con espacio", "-empieza-con-guion", "x".repeat(65)]
  for (const nombre of invalidos) {
    const resultado = validarNombreCaso(nombre)
    assert.equal(resultado.ok, false, `"${nombre}" debía rechazarse`)
    if (!resultado.ok) assert.ok(resultado.error.length > 0)
  }
})

test("resolverDentro confina cualquier ruta a su base", () => {
  const base = "/tmp/base-confiable"

  assert.equal(exigir(resolverDentro(base, "caso", "solicitud.json")), path.join(base, "caso", "solicitud.json"))
  assert.equal(exigir(resolverDentro(base)), path.resolve(base), "la base sin partes es válida")

  for (const intento of [[".."], ["../otro"], ["caso", "..", "..", "fuera"], ["/etc/passwd"]]) {
    const resultado = resolverDentro(base, ...intento)
    assert.equal(resultado.ok, false, `debía bloquear ${intento.join("/")}`)
    if (!resultado.ok) assert.match(resultado.error, /fuera del directorio/i)
  }
})
