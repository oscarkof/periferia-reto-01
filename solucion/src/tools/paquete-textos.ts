/**
 * Textos del paquete para firma (HU-4 · RN2 · RN3).
 *
 * Módulo puro: recibe el caso, el mapeo y el checklist, y devuelve Markdown.
 * Separado de la escritura para poder probar el contenido sin tocar el disco.
 */
import type { CasoLeido, ChecklistSoportes, Mapeo, SoporteEvaluado } from "../core/tipos.ts"

/** Estado de un soporte, en lenguaje claro. */
export function describirSoporte(soporte: SoporteEvaluado): string {
  if (soporte.estado === "ausente") return "ausente del repositorio"
  if (soporte.estado === "vencido") return `vencido el ${soporte.vigencia_hasta ?? "?"}`
  return soporte.vigencia_hasta === null ? "vigente (no vence)" : `vigente hasta ${soporte.vigencia_hasta}`
}

/** Contenido de `checklist.md`. */
export function textoChecklist(
  leido: CasoLeido,
  mapeo: Mapeo,
  checklist: ChecklistSoportes,
  formulario: string,
): string {
  const lineas: string[] = [
    `# Checklist del paquete · ${leido.caso}`,
    "",
    `Cliente: ${leido.solicitud.cliente} · País: ${leido.solicitud.pais} · Formato: ${leido.solicitud.formato}`,
    "",
    "## Veredicto",
  ]

  lineas.push(
    checklist.listo_para_firma
      ? "- **listo_para_firma: sí** — no hay soportes vencidos ni ausentes."
      : `- **listo_para_firma: no** — ${checklist.bloqueos.length} bloqueo(s):`,
  )
  for (const bloqueo of checklist.bloqueos) lineas.push(`  - ${bloqueo.detalle}`)
  lineas.push("")

  lineas.push(`## Soportes exigidos por el cliente (${checklist.soportes.length})`, "")
  lineas.push("| Tipo | Estado | Archivo |")
  lineas.push("|---|---|---|")
  for (const soporte of checklist.soportes) {
    lineas.push(`| ${soporte.tipo} | ${describirSoporte(soporte)} | ${soporte.archivo ?? "—"} |`)
  }
  lineas.push("")

  lineas.push("## Formulario", "")
  lineas.push(`- Archivo: ${formulario}`)
  lineas.push(`- Campos llenos: ${mapeo.llenos.length}`)
  lineas.push(`- Requieren confirmación: ${mapeo.requiere_confirmacion.length}`)
  for (const campo of mapeo.requiere_confirmacion) lineas.push(`  - ${campo.campo}: ${campo.nota ?? ""}`)
  lineas.push(`- Sin dato en el maestro: ${mapeo.faltantes.length}`)
  for (const campo of mapeo.faltantes) lineas.push(`  - ${campo.campo}`)
  lineas.push("")
  lineas.push(
    "> Un campo sin dato **no** bloquea la firma: queda aquí para que la analista lo consiga. La firma es una decisión humana.",
    "",
  )
  return lineas.join("\n")
}

/**
 * Contenido de `borrador-correo.md`.
 *
 * RN2: el correo **nunca** lleva datos bancarios. Por eso este texto solo usa el
 * remitente, el cliente, el nombre del formulario y la lista de soportes: ningún
 * valor del bloque `banco` del maestro entra aquí.
 */
export function textoBorradorCorreo(leido: CasoLeido, checklist: ChecklistSoportes, formulario: string): string {
  const soportes = checklist.presentes.length > 0 ? checklist.presentes : ["(por confirmar)"]
  const lineas = [
    `# Borrador de correo · ${leido.caso}`,
    "",
    `**Para:** ${leido.solicitud.de}`,
    `**Asunto:** Registro como proveedor — documentación para ${leido.solicitud.cliente}`,
    "",
    "Estimado equipo:",
    "",
    "Adjuntamos la documentación solicitada para el registro de Periferia IT Group S.A.S. como proveedor:",
    "",
    `- Formulario diligenciado: ${formulario}`,
    ...soportes.map((soporte) => `- Soporte: ${soporte}`),
    "",
  ]

  if (!checklist.listo_para_firma) {
    lineas.push("Pendientes de nuestra parte antes del envío definitivo:", "")
    for (const bloqueo of checklist.bloqueos) lineas.push(`- ${bloqueo.detalle}`)
    lineas.push("")
  }

  lineas.push(
    "Quedamos atentos a la firma del representante legal y a cualquier ajuste que requieran.",
    "",
    "Cordialmente,",
    "Área administrativa — Periferia IT Group S.A.S.",
    "",
    "---",
    "> Los datos bancarios no se incluyen en este borrador (RN2). Si el cliente los pide, van",
    "> únicamente en el formulario que firma el representante legal.",
    "",
  )
  return lineas.join("\n")
}

/**
 * Contenido de `ENVIO-SIMULADO.md` (HU-4 · RN4).
 *
 * En este reto "enviar" no envía nada: deja constancia de qué se habría enviado
 * y con qué adjuntos, para que la decisión humana sea informada.
 */
export function textoEnvioSimulado(
  leido: CasoLeido,
  checklist: ChecklistSoportes,
  rutaPaquete: string,
  archivos: string[],
): string {
  const lineas = [
    `# Envío simulado · ${leido.caso}`,
    "",
    "> **No se envió nada.** Este archivo es la constancia de lo que se habría enviado tras la",
    "> confirmación explícita del usuario. El envío real y la firma son decisiones humanas (RN4).",
    "",
    `- **Para:** ${leido.solicitud.de}`,
    `- **Cliente:** ${leido.solicitud.cliente}`,
    `- **Asunto:** Registro como proveedor — documentación para ${leido.solicitud.cliente}`,
    `- **Paquete:** ${rutaPaquete}`,
    `- **Soportes incluidos:** ${checklist.presentes.length > 0 ? checklist.presentes.join(", ") : "ninguno"}`,
    `- **listo_para_firma:** ${checklist.listo_para_firma ? "sí" : "no"}`,
    "",
    "## Adjuntos",
    "",
    ...archivos.map((archivo) => `- ${archivo}`),
    "",
  ]

  if (!checklist.listo_para_firma) {
    lineas.push("## Avisos antes de enviar", "")
    for (const bloqueo of checklist.bloqueos) lineas.push(`- ${bloqueo.detalle}`)
    lineas.push("")
  }

  return lineas.join("\n")
}
