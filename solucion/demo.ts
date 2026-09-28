#!/usr/bin/env node
/**
 * Verificación de las herramientas SIN modelo de lenguaje (PRD §6.6).
 *
 *   node demo.ts            recorre los cuatro casos y resume cada uno
 *   node demo.ts --envio    además simula el envío ya confirmado
 *
 * Garantías que exige el PRD §8:
 *   · corre sin ninguna clave de proveedor;
 *   · limpia `out/` al inicio;
 *   · produce el mismo resultado entre ejecuciones consecutivas. Para poder
 *     comprobarlo escribe `out/resumen.json` **sin timestamps**: dos
 *     ejecuciones seguidas deben dar un archivo idéntico.
 */
import { listarCasos } from "./src/core/casos.ts"
import { crearEscritor } from "./src/core/escritor.ts"
import { procesarCaso, relativa, type ResumenCaso } from "./src/demo/ejecucion.ts"

const conEnvio = process.argv.includes("--envio")

/** Bloque legible por caso. */
function imprimir(resumen: ResumenCaso): void {
  const marca = resumen.listo_para_firma ? "LISTO PARA FIRMA" : "BLOQUEADO"
  console.log(`\n━━━ ${resumen.caso} · ${resumen.pais} · ${resumen.formato} ━━━`)
  console.log(
    `  campos: ${resumen.campos.total} → ${resumen.campos.llenos} llenos, ` +
      `${resumen.campos.por_confirmar} por confirmar, ${resumen.campos.faltantes} faltantes`,
  )
  if (resumen.por_confirmar.length > 0) console.log(`  por confirmar: ${resumen.por_confirmar.join(", ")}`)
  if (resumen.faltantes.length > 0) console.log(`  sin dato: ${resumen.faltantes.join(", ")}`)
  console.log(
    `  soportes: ${resumen.soportes.presentes.length} presentes, ` +
      `${resumen.soportes.ausentes.length} ausentes, ${resumen.soportes.vencidos.length} vencidos`,
  )
  console.log(`  formulario: ${resumen.archivo_formulario}`)
  console.log(`  paquete: ${resumen.archivos.length} archivos → ${marca}`)
  for (const bloqueo of resumen.bloqueos) console.log(`    ⛔ ${bloqueo}`)
  console.log("  envío sin confirmación: rechazado correctamente (RN4)")
  if (resumen.envio_simulado !== null) console.log(`  envío simulado: ${resumen.envio_simulado}`)
}

async function principal(): Promise<void> {
  const escritor = crearEscritor()
  const limpieza = escritor.limpiar()
  console.log(`out/ limpiado al inicio (${limpieza.ok ? limpieza.data : "?"} entradas eliminadas)`)

  const casos = listarCasos()
  if (!casos.ok) {
    console.error(`No se pudieron listar los casos: ${casos.error}`)
    process.exitCode = 1
    return
  }

  const resumenes: ResumenCaso[] = []
  const fallos: string[] = []

  for (const caso of casos.data) {
    try {
      const resumen = await procesarCaso(caso, conEnvio)
      resumenes.push(resumen)
      imprimir(resumen)
    } catch (error) {
      // HU-5: un caso malo no impide procesar el siguiente.
      const mensaje = error instanceof Error ? error.message : String(error)
      fallos.push(`${caso}: ${mensaje}`)
      console.log(`\n━━━ ${caso} ━━━\n  ✖ ${mensaje}`)
    }
  }

  const escrito = escritor.texto(`${JSON.stringify({ casos: resumenes, fallos }, null, 2)}\n`, "resumen.json")
  const listos = resumenes.filter((resumen) => resumen.listo_para_firma).length

  console.log(`\n${"═".repeat(64)}`)
  console.log(`casos procesados: ${resumenes.length}/${casos.data.length} · listos para firma: ${listos}`)
  console.log(
    `resumen determinista: ${escrito.ok ? relativa(escrito.data) : `no se pudo escribir (${escrito.error})`}`,
  )
  if (fallos.length > 0) {
    console.log(`fallos: ${fallos.length}`)
    process.exitCode = 1
  }
}

await principal()
