/**
 * Adaptador de pruebas: responde con un guion fijo, sin red y sin modelo.
 *
 * Sirve para dos cosas:
 *   · probar el ciclo del agente de forma determinista (tope de iteraciones,
 *     confirmación, errores) sin depender de un proveedor;
 *   · permitir que la aplicación arranque y se pueda recorrer de punta a punta
 *     sin ninguna clave (`LLM_PROVIDER=mock`).
 *
 * No es un agente: repite un guion. Está documentado así en el README.
 */
import type {
  AdaptadorLlm,
  DefinicionHerramienta,
  Mensaje,
  OpcionesEnvio,
  RespuestaLlm,
} from "./adapter.ts"
import type { Resultado } from "../core/tipos.ts"

/** Un paso del guion: o pide herramientas, o responde texto. */
export interface PasoMock {
  texto?: string
  llamadas?: { nombre: string; argumentos: Record<string, unknown> }[]
}

/** Adaptador de guion, con contadores para poder afirmar cosas en las pruebas. */
export interface AdaptadorMock extends AdaptadorLlm {
  /** Cuántas veces se llamó al adaptador. */
  readonly envios: number
  /** Historial recibido en cada envío, para inspeccionarlo desde las pruebas. */
  readonly historiales: Mensaje[][]
  /** Herramientas ofrecidas en el último envío. */
  readonly herramientasVistas: string[]
}

/** Crea un adaptador que sigue `guion` paso a paso. */
export function crearAdaptadorMock(guion: PasoMock[] = []): AdaptadorMock {
  let envios = 0
  const historiales: Mensaje[][] = []
  let herramientasVistas: string[] = []

  return {
    proveedor: "mock",
    modelo: "guion",

    get envios() {
      return envios
    },
    get historiales() {
      return historiales
    },
    get herramientasVistas() {
      return herramientasVistas
    },

    async enviar(
      mensajes: Mensaje[],
      herramientas: DefinicionHerramienta[],
      _opciones?: OpcionesEnvio,
    ): Promise<Resultado<RespuestaLlm>> {
      envios += 1
      historiales.push(mensajes.map((mensaje) => ({ ...mensaje })))
      herramientasVistas = herramientas.map((herramienta) => herramienta.nombre)

      const paso = guion[envios - 1]
      if (paso === undefined) {
        return {
          ok: true,
          data: {
            texto: "Guion de prueba agotado: no hay más pasos definidos.",
            llamadas: [],
            uso: { entrada: 0, salida: 0 },
          },
        }
      }

      return {
        ok: true,
        data: {
          texto: paso.texto ?? null,
          llamadas: (paso.llamadas ?? []).map((llamada, indice) => ({
            id: `llamada-${indice + 1}`,
            nombre: llamada.nombre,
            argumentos: llamada.argumentos,
          })),
          uso: { entrada: 10, salida: 5 },
        },
      }
    },
  }
}

/**
 * Guion que reproduce el prompt de ejemplo del PRD §11 sin modelo: leer la
 * solicitud, mapear, generar el formulario, armar el paquete y cerrar pidiendo
 * confirmación antes de simular el envío.
 */
export function guionDemo(caso: string): PasoMock[] {
  return [
    { llamadas: [{ nombre: "proveedor_leer_solicitud", argumentos: { caso } }] },
    {
      llamadas: [
        {
          nombre: "proveedor_mapear_campos",
          argumentos: { caso, campos: [] },
        },
      ],
    },
    { llamadas: [{ nombre: "proveedor_armar_paquete", argumentos: { caso } }] },
    {
      texto:
        `Listo: dejé el formulario y el paquete del caso ${caso} en out/${caso}/. ` +
        "Revisa el checklist: si hay soportes vencidos o ausentes, el paquete queda bloqueado para firma. " +
        "¿Quieres que simule el envío ya confirmado o prefieres revisar primero?",
    },
  ]
}
