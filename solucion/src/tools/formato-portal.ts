/**
 * Formato "portal web" (P2 · HU-3).
 *
 * El PRD es explícito: **no se implementa** el llenado de portales. El agente
 * responde "formato no soportado" y deja `out/<caso>/valores-portal.md` con los
 * valores listos para copiar. El diseño completo (RPA, credenciales, qué hace el
 * humano) está en `src/knowledge/registro-proveedor.md`.
 */
import type { Escritor } from "../core/escritor.ts"
import type { CampoPlantilla, Resultado } from "../core/tipos.ts"

/** Estado legible de cada campo en la tabla de valores. */
function estado(etiqueta: string, valores: Map<string, string>, pendientes: Map<string, string>): string {
  const motivo = pendientes.get(etiqueta)
  if (motivo !== undefined) return `**confirmar** — ${motivo}`
  if (valores.has(etiqueta)) return "listo"
  return "_sin dato en el maestro_"
}

/** Genera la hoja de valores copiables para un portal. */
export function escribirValoresPortal(
  escritor: Escritor,
  caso: string,
  campos: CampoPlantilla[],
  valores: Map<string, string>,
  pendientes: Map<string, string>,
): Resultado<string> {
  const filas = campos.map((campo, indice) => {
    const valor = valores.get(campo.etiqueta) ?? "—"
    const obligatorio = campo.obligatorio ? " (obligatorio)" : ""
    return `| ${indice + 1} | ${campo.etiqueta}${obligatorio} | ${valor} | ${estado(campo.etiqueta, valores, pendientes)} |`
  })

  const contenido = [
    `# Valores para el portal · ${caso}`,
    "",
    "> **Este formato no se automatiza.** El cliente pide cargar los datos en un portal web con",
    "> usuario y contraseña, y el proceso no lo hace por diseño: las credenciales las ingresa una",
    "> persona y el clic en «Enviar» también es humano. Aquí quedan los valores listos para copiar.",
    "",
    `Campos en el orden del formulario (${campos.length}):`,
    "",
    "| # | Campo | Valor | Estado |",
    "|---|---|---|---|",
    ...filas,
    "",
    "## Qué hacer con los campos marcados",
    "",
    "- **confirmar**: el valor existe pero requiere validación humana (regla de país, etiqueta",
    "  genérica o mapeo aproximado). Revísalo antes de pegarlo en el portal.",
    "- **_sin dato en el maestro_**: no hay fuente. Hay que conseguir el dato; no se inventa.",
    "",
  ].join("\n")

  return escritor.texto(contenido, caso, "valores-portal.md")
}
