/**
 * Tipos compartidos del motor determinista.
 *
 * Este módulo NO importa nada: ni zod, ni `node:fs`. Los tipos describen el
 * contrato del dominio tal como lo fijan los fixtures y el PRD (§7.1, §7.2).
 */

/**
 * Resultado tipado de toda operación que puede fallar.
 * El PRD (§8, Robustez) exige errores `{ ok: false, error }` y que nada lance
 * una excepción hacia el agente.
 */
export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string }

/** Países que atiende el proceso (PRD §7.3 · RN1). */
export type Pais = "CO" | "EC" | "PE" | "PA" | "HN"

/** Formato de salida que pide el cliente (PRD §7.1). */
export type Formato = "xlsx" | "pdf" | "portal"

/** Estados posibles de un campo tras cruzarlo con el maestro (PRD HU-2). */
export type EstadoCampo = "lleno" | "faltante" | "requiere_confirmacion"

/** Estados posibles de un soporte exigido (PRD §7.3 · RN3). */
export type EstadoSoporte = "presente" | "ausente" | "vencido"

/** Correo normalizado del cliente (fixtures `<caso>/solicitud.json`). */
export interface Solicitud {
  id: string
  de: string
  asunto: string
  fecha: string
  pais: Pais
  cliente: string
  formato: Formato
  cuerpo: string
  adjuntos: string[]
}

/** Fila de `plantilla-celdas.json` (solo casos xlsx). */
export interface CeldaPlantilla {
  hoja: string
  celda_etiqueta: string
  etiqueta: string
  celda_valor: string
}

/** Fila de `plantilla-campos.json` (solo casos pdf y portal). */
export interface CampoPlantilla {
  etiqueta: string
  obligatorio: boolean
}

/** Entrada de `repositorio/soportes/index.json`. */
export interface SoporteIndexado {
  tipo: string
  archivo: string
  /** `null` cuando el soporte no vence (p. ej. el RUT). */
  vigencia_hasta: string | null
  pais_emisor: string
  descripcion: string
}

/** Un campo solicitado, ya cruzado con el repositorio maestro. */
export interface CampoMapeado {
  /** Etiqueta tal como la escribió el cliente: se conserva como evidencia. */
  campo: string
  estado: EstadoCampo
  /**
   * Ruta del dato dentro del maestro, p. ej. `banco.swift`.
   * `null` cuando no hay fuente: el campo es `faltante`.
   */
  ruta_dato: string | null
  /** Valor resuelto DESDE el maestro. `null` solo si el campo es `faltante`. */
  valor: unknown
  /** Confianza del mapeo: 1 exacto, 0.7 difuso, 0 sin fuente (HU-2 corta en 0.8). */
  confianza: number
  /** Motivo legible cuando el campo lleva valor pero exige revisión humana. */
  nota: string | null
}

/** Etiqueta ambigua de la plantilla, con el equivalente local propuesto (HU-1). */
export interface Ambiguo {
  etiqueta: string
  equivalente_local: string | null
  nota: string
}

/** Un caso leído desde `fixtures/reto-01/casos/<caso>/` (HU-1). */
export interface CasoLeido {
  caso: string
  solicitud: Solicitud
  /** Etiquetas pedidas, en el orden de la plantilla. */
  campos: string[]
  /** Etiquetas ambiguas detectadas, ya con el equivalente local propuesto. */
  ambiguos: Ambiguo[]
  soportes_exigidos: string[]
  plantilla_celdas: CeldaPlantilla[]
  plantilla_campos: CampoPlantilla[]
}

/** Resultado de cruzar todos los campos de un caso con el maestro (HU-2). */
export interface Mapeo {
  caso: string
  pais: Pais
  campos: CampoMapeado[]
  llenos: CampoMapeado[]
  faltantes: CampoMapeado[]
  requiere_confirmacion: CampoMapeado[]
}

/** Un soporte exigido, evaluado contra la fecha de ejecución (RN3). */
export interface SoporteEvaluado {
  tipo: string
  estado: EstadoSoporte
  archivo: string | null
  vigencia_hasta: string | null
  pais_emisor: string | null
  descripcion: string | null
}

/** Motivo por el que el paquete no puede pasar a firma. */
export interface Bloqueo {
  motivo: string
  detalle: string
}

/** Checklist de soportes y veredicto de firma (HU-4 · RN3). */
export interface ChecklistSoportes {
  caso: string
  soportes: SoporteEvaluado[]
  presentes: string[]
  ausentes: string[]
  vencidos: string[]
  listo_para_firma: boolean
  bloqueos: Bloqueo[]
}
