/**
 * Carga de un caso completo desde `fixtures/reto-01/casos/<caso>/` (HU-1).
 *
 * Solo orquesta: valida el nombre del caso, lee los archivos y delega el
 * parseo en `plantillas.ts`. Un caso mal formado devuelve un error legible y el
 * caso siguiente debe poder procesarse igual (HU-5).
 */
import path from "node:path"
import { esDirectorio, leerJson, listarDirectorio } from "./io.ts"
import { dirCasos, dirCaso } from "./rutas.ts"
import { verificarFixtures } from "./fixtures.ts"
import { detectarAmbiguos, interpretarCampos, interpretarCeldas, interpretarSolicitud } from "./plantillas.ts"
import type { CampoPlantilla, CasoLeido, CeldaPlantilla, Resultado } from "./tipos.ts"

/** Casos disponibles en `fixtures/reto-01/casos/`, en orden alfabético. */
export function listarCasos(): Resultado<string[]> {
  const base = verificarFixtures()
  if (!base.ok) return base
  if (!esDirectorio(dirCasos())) return { ok: false, error: `no existe la carpeta de casos en ${dirCasos()}` }

  const entradas = listarDirectorio(dirCasos())
  if (!entradas.ok) return entradas
  return { ok: true, data: entradas.data.filter((e) => esDirectorio(path.join(dirCasos(), e))) }
}

/**
 * Carga un caso: solicitud, plantilla, campos pedidos, ambiguos y soportes
 * exigidos. El formato decide qué plantilla manda (`xlsx` → celdas,
 * `pdf` y `portal` → campos).
 */
export function cargarCaso(caso: string): Resultado<CasoLeido> {
  const carpeta = dirCaso(caso)
  if (!carpeta.ok) return carpeta
  if (!esDirectorio(carpeta.data)) {
    return { ok: false, error: `el caso "${caso}" no existe en fixtures/reto-01/casos/` }
  }

  const solicitudBruta = leerJson<unknown>(path.join(carpeta.data, "solicitud.json"))
  if (!solicitudBruta.ok) return solicitudBruta
  const solicitud = interpretarSolicitud(solicitudBruta.data, caso)
  if (!solicitud.ok) return solicitud

  const celdasBrutas = leerJson<unknown>(path.join(carpeta.data, "plantilla-celdas.json"))
  let plantillaCeldas: CeldaPlantilla[] = []
  if (celdasBrutas.ok) {
    const celdas = interpretarCeldas(celdasBrutas.data, caso)
    if (!celdas.ok) return celdas
    plantillaCeldas = celdas.data
  }

  const camposBrutos = leerJson<unknown>(path.join(carpeta.data, "plantilla-campos.json"))
  let plantillaCampos: CampoPlantilla[] = []
  if (camposBrutos.ok) {
    const campos = interpretarCampos(camposBrutos.data, caso)
    if (!campos.ok) return campos
    plantillaCampos = campos.data
  }

  const usaCeldas = solicitud.data.formato === "xlsx"
  const etiquetas = usaCeldas ? plantillaCeldas.map((c) => c.etiqueta) : plantillaCampos.map((c) => c.etiqueta)
  if (etiquetas.length === 0) {
    const esperada = usaCeldas ? "plantilla-celdas.json" : "plantilla-campos.json"
    return {
      ok: false,
      error: `el caso "${caso}" (formato ${solicitud.data.formato}) no tiene ${esperada} legible: no se pueden saber los campos pedidos`,
    }
  }

  const soportesBrutos = leerJson<unknown>(path.join(carpeta.data, "soportes-exigidos.json"))
  if (!soportesBrutos.ok) return soportesBrutos
  if (!Array.isArray(soportesBrutos.data)) {
    return { ok: false, error: `${caso}/soportes-exigidos.json: se esperaba un arreglo de tipos de soporte` }
  }

  return {
    ok: true,
    data: {
      caso,
      solicitud: solicitud.data,
      campos: etiquetas,
      ambiguos: detectarAmbiguos(etiquetas, solicitud.data.pais),
      soportes_exigidos: soportesBrutos.data.filter((s): s is string => typeof s === "string"),
      plantilla_celdas: plantillaCeldas,
      plantilla_campos: plantillaCampos,
    },
  }
}
