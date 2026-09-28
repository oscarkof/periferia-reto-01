/**
 * Motor de mapeo etiqueta → dato del maestro (PRD HU-2).
 *
 * Es 100 % determinista: **no usa el modelo de lenguaje**. El modelo orquesta
 * (decide qué herramienta llamar); los valores los produce este motor. Así se
 * cumple CA2 ("el modelo no puede afirmar un valor que no haya salido de una
 * herramienta") por diseño y no solo por prompt.
 *
 * Cada campo termina en uno de tres estados:
 *   · `lleno`               → hay valor y mapeo fiable (confianza 1.0);
 *   · `requiere_confirmacion` → hay valor, pero el mapeo es difuso, la etiqueta
 *                              es genérica o la regla de país lo exige (RN1);
 *   · `faltante`            → no hay fuente en el maestro. **Nunca se inventa**.
 */
import { buscarEnGlosario, type Glosario } from "./glosario.ts"
import { leerRuta } from "./maestro.ts"
import {
  esEtiquetaTributariaGenerica,
  esIdentificadorTributarioExtranjero,
  nombreIdentificadorTributario,
} from "./pais.ts"
import type { CampoMapeado, Mapeo, Pais } from "./tipos.ts"

/** Umbral por debajo del cual un mapeo exige confirmación humana (HU-2). */
export const UMBRAL_CONFIRMACION = 0.8

/** Contexto necesario para mapear campos de un caso. */
export interface ContextoMapeo {
  pais: Pais
  maestro: unknown
  glosario: Glosario
}

/** Datos completos de un mapeo: contexto más la lista de etiquetas. */
export interface EntradaMapeo extends ContextoMapeo {
  caso: string
  campos: string[]
}

/** Campo sin fuente en el maestro. */
function faltante(campo: string): CampoMapeado {
  return { campo, estado: "faltante", ruta_dato: null, valor: null, confianza: 0, nota: null }
}

/** Campo que lleva valor pero necesita que un humano lo confirme. */
function porConfirmar(campo: string, clave: string, valor: unknown, confianza: number, nota: string): CampoMapeado {
  return { campo, estado: "requiere_confirmacion", ruta_dato: clave, valor, confianza, nota }
}

/**
 * Mapea una sola etiqueta. Orden de decisión:
 *   1. glosario (exacto o difuso); si no hay acierto → `faltante`;
 *   2. el valor tiene que existir en el maestro; si no → `faltante`;
 *   3. RN1 · identificador tributario fuera de Colombia → confirmación;
 *   4. etiqueta tributaria genérica → confirmación con el equivalente local;
 *   5. acierto difuso (confianza < 0.8) → confirmación;
 *   6. en cualquier otro caso → `lleno`.
 */
export function mapearCampo(contexto: ContextoMapeo, campo: string): CampoMapeado {
  const acierto = buscarEnGlosario(contexto.glosario, campo)
  if (acierto === null) return faltante(campo)

  const valor = leerRuta(contexto.maestro, acierto.clave)
  if (valor === null) return faltante(campo)

  if (esIdentificadorTributarioExtranjero(contexto.pais, acierto.clave)) {
    const local = nombreIdentificadorTributario(contexto.pais)
    return porConfirmar(
      campo,
      acierto.clave,
      valor,
      acierto.confianza,
      `identificador extranjero: Periferia solo tiene NIT colombiano y este cliente pide ${local}`,
    )
  }

  if (esEtiquetaTributariaGenerica(campo)) {
    const local = nombreIdentificadorTributario(contexto.pais)
    return porConfirmar(
      campo,
      acierto.clave,
      valor,
      acierto.confianza,
      `etiqueta genérica: en ${contexto.pais} equivale a ${local}`,
    )
  }

  if (acierto.confianza < UMBRAL_CONFIRMACION) {
    return porConfirmar(
      campo,
      acierto.clave,
      valor,
      acierto.confianza,
      `mapeo aproximado a "${acierto.clave}" (confianza ${acierto.confianza.toFixed(2)} < ${UMBRAL_CONFIRMACION})`,
    )
  }

  return { campo, estado: "lleno", ruta_dato: acierto.clave, valor, confianza: acierto.confianza, nota: null }
}

/** Mapea todos los campos de un caso y los agrupa por estado. */
export function mapearCampos(entrada: EntradaMapeo): Mapeo {
  const contexto: ContextoMapeo = {
    pais: entrada.pais,
    maestro: entrada.maestro,
    glosario: entrada.glosario,
  }
  const campos = entrada.campos.map((campo) => mapearCampo(contexto, campo))
  return {
    caso: entrada.caso,
    pais: entrada.pais,
    campos,
    llenos: campos.filter((c) => c.estado === "lleno"),
    faltantes: campos.filter((c) => c.estado === "faltante"),
    requiere_confirmacion: campos.filter((c) => c.estado === "requiere_confirmacion"),
  }
}
