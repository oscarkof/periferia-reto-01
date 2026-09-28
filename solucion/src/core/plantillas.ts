/**
 * Validación y normalización de los archivos de un caso (PRD §7.1).
 *
 * Módulo puro: recibe objetos ya parseados. Sin disco y sin modelo, para poder
 * probar cada regla en aislamiento. Los mensajes de error son legibles y citan
 * el caso, el archivo y el campo (HU-5: nada de trazas crudas).
 */
import { esObjeto } from "./io.ts"
import { esEtiquetaTributariaGenerica, esPais, nombreIdentificadorTributario } from "./pais.ts"
import type {
  Ambiguo,
  CampoPlantilla,
  CeldaPlantilla,
  Formato,
  Pais,
  Resultado,
  Solicitud,
} from "./tipos.ts"

const FORMATOS: readonly Formato[] = ["xlsx", "pdf", "portal"]

/** Texto no vacío del objeto, o `null` si falta o no es cadena utilizable. */
export function texto(entrada: Record<string, unknown>, campo: string): string | null {
  const valor = entrada[campo]
  return typeof valor === "string" && valor.trim() !== "" ? valor : null
}

/** Valida y normaliza `solicitud.json`. */
export function interpretarSolicitud(bruto: unknown, caso: string): Resultado<Solicitud> {
  if (!esObjeto(bruto)) return { ok: false, error: `${caso}/solicitud.json: se esperaba un objeto` }

  const obligatorios = ["id", "de", "asunto", "fecha", "pais", "cliente", "formato", "cuerpo"] as const
  const faltan = obligatorios.filter((campo) => texto(bruto, campo) === null)
  if (faltan.length > 0) {
    return { ok: false, error: `${caso}/solicitud.json: faltan campos obligatorios (${faltan.join(", ")})` }
  }

  const pais = texto(bruto, "pais") ?? ""
  if (!esPais(pais)) {
    return { ok: false, error: `${caso}/solicitud.json: país no soportado "${pais}" (esperado CO, EC, PE, PA o HN)` }
  }

  const formato = texto(bruto, "formato") ?? ""
  if (!FORMATOS.includes(formato as Formato)) {
    return {
      ok: false,
      error: `${caso}/solicitud.json: formato no soportado "${formato}" (esperado xlsx, pdf o portal)`,
    }
  }

  const adjuntos = bruto["adjuntos"]
  return {
    ok: true,
    data: {
      id: texto(bruto, "id") ?? caso,
      de: texto(bruto, "de") ?? "",
      asunto: texto(bruto, "asunto") ?? "",
      fecha: texto(bruto, "fecha") ?? "",
      pais: pais as Pais,
      cliente: texto(bruto, "cliente") ?? "",
      formato: formato as Formato,
      cuerpo: texto(bruto, "cuerpo") ?? "",
      adjuntos: Array.isArray(adjuntos) ? adjuntos.filter((a): a is string => typeof a === "string") : [],
    },
  }
}

/** Valida `plantilla-celdas.json` (solo casos xlsx). */
export function interpretarCeldas(bruto: unknown, caso: string): Resultado<CeldaPlantilla[]> {
  if (!Array.isArray(bruto)) return { ok: false, error: `${caso}/plantilla-celdas.json: se esperaba un arreglo` }

  const celdas: CeldaPlantilla[] = []
  for (const fila of bruto) {
    if (!esObjeto(fila)) {
      return { ok: false, error: `${caso}/plantilla-celdas.json: hay una fila que no es un objeto` }
    }
    const hoja = texto(fila, "hoja")
    const celdaEtiqueta = texto(fila, "celda_etiqueta")
    const etiqueta = texto(fila, "etiqueta")
    const celdaValor = texto(fila, "celda_valor")
    if (hoja === null || celdaEtiqueta === null || etiqueta === null || celdaValor === null) {
      return {
        ok: false,
        error: `${caso}/plantilla-celdas.json: cada fila necesita hoja, celda_etiqueta, etiqueta y celda_valor`,
      }
    }
    celdas.push({ hoja, celda_etiqueta: celdaEtiqueta, etiqueta, celda_valor: celdaValor })
  }
  return { ok: true, data: celdas }
}

/** Valida `plantilla-campos.json` (casos pdf y portal). */
export function interpretarCampos(bruto: unknown, caso: string): Resultado<CampoPlantilla[]> {
  if (!Array.isArray(bruto)) return { ok: false, error: `${caso}/plantilla-campos.json: se esperaba un arreglo` }

  const campos: CampoPlantilla[] = []
  for (const fila of bruto) {
    if (!esObjeto(fila)) {
      return { ok: false, error: `${caso}/plantilla-campos.json: hay una fila que no es un objeto` }
    }
    const etiqueta = texto(fila, "etiqueta")
    if (etiqueta === null) {
      return { ok: false, error: `${caso}/plantilla-campos.json: cada fila necesita una etiqueta` }
    }
    campos.push({ etiqueta, obligatorio: fila["obligatorio"] === true })
  }
  return { ok: true, data: campos }
}

/** Detecta etiquetas ambiguas y propone el equivalente local del país (HU-1). */
export function detectarAmbiguos(campos: string[], pais: Pais): Ambiguo[] {
  return campos
    .filter((etiqueta) => esEtiquetaTributariaGenerica(etiqueta))
    .map((etiqueta) => ({
      etiqueta,
      equivalente_local: nombreIdentificadorTributario(pais),
      nota: `etiqueta genérica: en ${pais} se llama ${nombreIdentificadorTributario(pais)}`,
    }))
}
