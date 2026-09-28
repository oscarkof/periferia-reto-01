/**
 * Paquete para firma (HU-4 · RN3).
 *
 * Construye `out/<caso>/paquete/` con el formulario, copias de los soportes
 * exigidos que existan en el repositorio, `checklist.md` y `borrador-correo.md`.
 *
 * El veredicto `listo_para_firma` viene de RN3: lo bloquean soportes vencidos o
 * ausentes. Un campo `faltante` del formulario **no** lo bloquea: solo aparece.
 */
import { rutaFixtures } from "../core/fixtures.ts"
import type { Escritor } from "../core/escritor.ts"
import type { CasoLeido, ChecklistSoportes, Mapeo, Resultado } from "../core/tipos.ts"
import { textoBorradorCorreo, textoChecklist } from "./paquete-textos.ts"

/** Resultado de armar el paquete. */
export interface PaqueteArmado {
  /** Ruta absoluta de la carpeta del paquete. */
  ruta: string
  listo_para_firma: boolean
  checklist: {
    presentes: string[]
    ausentes: string[]
    vencidos: string[]
    bloqueos: string[]
  }
  formulario: string
  soportes_copiados: string[]
  archivos: string[]
}

/**
 * Arma el paquete completo. Espera que el formulario ya esté generado en
 * `out/<caso>/` (lo hace `generarFormulario`).
 */
export async function armarPaquete(
  escritor: Escritor,
  leido: CasoLeido,
  mapeo: Mapeo,
  checklist: ChecklistSoportes,
  archivoFormulario: string,
): Promise<Resultado<PaqueteArmado>> {
  const carpeta = escritor.carpeta(leido.caso, "paquete")
  if (!carpeta.ok) return carpeta

  const checklistMd = escritor.texto(
    textoChecklist(leido, mapeo, checklist, archivoFormulario),
    leido.caso,
    "paquete",
    "checklist.md",
  )
  if (!checklistMd.ok) return checklistMd

  const borrador = escritor.texto(
    textoBorradorCorreo(leido, checklist, archivoFormulario),
    leido.caso,
    "paquete",
    "borrador-correo.md",
  )
  if (!borrador.ok) return borrador

  const origenFormulario = escritor.ruta(leido.caso, archivoFormulario)
  if (!origenFormulario.ok) return origenFormulario
  const copiaFormulario = escritor.copiar(origenFormulario.data, leido.caso, "paquete", archivoFormulario)
  if (!copiaFormulario.ok) return copiaFormulario

  const soportesCopiados: string[] = []
  for (const soporte of checklist.soportes) {
    if (soporte.archivo === null) continue
    const copia = escritor.copiar(
      rutaFixtures("repositorio", "soportes", soporte.archivo),
      leido.caso,
      "paquete",
      "soportes",
      soporte.archivo,
    )
    if (!copia.ok) return copia
    soportesCopiados.push(soporte.archivo)
  }

  return {
    ok: true,
    data: {
      ruta: carpeta.data,
      listo_para_firma: checklist.listo_para_firma,
      checklist: {
        presentes: checklist.presentes,
        ausentes: checklist.ausentes,
        vencidos: checklist.vencidos,
        bloqueos: checklist.bloqueos.map((bloqueo) => bloqueo.detalle),
      },
      formulario: archivoFormulario,
      soportes_copiados: soportesCopiados,
      archivos: [
        "checklist.md",
        "borrador-correo.md",
        archivoFormulario,
        ...soportesCopiados.map((archivo) => `soportes/${archivo}`),
      ],
    },
  }
}
