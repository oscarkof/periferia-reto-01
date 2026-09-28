/**
 * Front del chat (PRD §6.1 · CA3 · CA4).
 *
 * Responsabilidades, y nada más:
 *   · enviar el mensaje al backend y leer su stream SSE;
 *   · mostrar el historial, cada llamada a herramienta y el indicador de trabajo;
 *   · **resaltar** el turno en que el agente pide confirmación (CA3);
 *   · ofrecer los archivos generados para descargar.
 *
 * Todo lo que se pinta se construye con nodos del DOM y `textContent`: el texto
 * del modelo nunca se interpreta como HTML.
 */
import { crearAcumulador, FIN } from "./sse.js"

/** Referencias al documento, en un solo sitio. */
const dom = {
  estado: document.querySelector("#estado-servidor"),
  nuevaSesion: document.querySelector("#boton-nueva-sesion"),
  conversacion: document.querySelector("#conversacion"),
  pensando: document.querySelector("#pensando"),
  pensandoTexto: document.querySelector("#pensando-texto"),
  confirmacion: document.querySelector("#confirmacion"),
  confirmacionDetalle: document.querySelector("#confirmacion-detalle"),
  confirmar: document.querySelector("#boton-confirmar"),
  rechazar: document.querySelector("#boton-rechazar"),
  sugerencias: document.querySelector("#sugerencias"),
  formulario: document.querySelector("#formulario"),
  entrada: document.querySelector("#entrada"),
  datoSesion: document.querySelector("#dato-sesion"),
  datoTurnos: document.querySelector("#dato-turnos"),
  archivos: document.querySelector("#archivos"),
  casos: document.querySelector("#casos"),
  aviso: document.querySelector("#aviso"),
}

/** Ejemplos de mensaje: el primero es el del PRD §11. */
const SUGERENCIAS = [
  "Procesa el caso «ec-corp-andina». Dime qué campos quedaron llenos, cuáles faltan, si el paquete está listo para firma y qué soportes debo actualizar. No envíes nada todavía.",
  "¿Qué casos puedes procesar?",
  "Procesa «co-industrias-delta» y arma el paquete para firma.",
]

/** Estado de la sesión en curso. */
const estado = {
  sesion: nuevoIdentificador(),
  ocupado: false,
  caso: null,
}

/** Identificador de sesión válido para el backend. */
function nuevoIdentificador() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `web-${Date.now().toString(36)}`
}

let temporizadorAviso = null

/** Muestra un aviso flotante que se va solo. */
function avisar(texto) {
  dom.aviso.textContent = texto
  dom.aviso.hidden = false
  if (temporizadorAviso !== null) clearTimeout(temporizadorAviso)
  temporizadorAviso = setTimeout(() => {
    dom.aviso.hidden = true
  }, 8000)
}

/** Escribe texto en un nodo, sin interpretar HTML. */
function escribir(nodo, texto) {
  nodo.textContent = texto
  return nodo
}

/**
 * Pinta el texto del agente respetando lo mínimo del Markdown que usa
 * (encabezados, viñetas, negritas y `código`) sin `innerHTML`: cada pieza se
 * crea como nodo, así que nada de lo que devuelva el modelo puede ejecutarse.
 */
function pintarTexto(contenedor, texto) {
  contenedor.replaceChildren()

  for (const linea of texto.split("\n")) {
    const limpia = linea.trimEnd()
    if (limpia.trim() === "") continue

    const encabezado = /^(#{1,6})\s+(.*)$/.exec(limpia)
    const vineta = /^[-*]\s+(.*)$/.exec(limpia)
    const nodo = document.createElement(encabezado ? "h3" : vineta ? "li" : "p")
    const contenido = encabezado ? encabezado[2] : vineta ? vineta[1] : limpia

    for (const pieza of contenido.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
      if (pieza.startsWith("**") && pieza.endsWith("**")) {
        nodo.append(escribir(document.createElement("strong"), pieza.slice(2, -2)))
      } else if (pieza.startsWith("`") && pieza.endsWith("`")) {
        nodo.append(escribir(document.createElement("code"), pieza.slice(1, -1)))
      } else if (pieza !== "") {
        nodo.append(document.createTextNode(pieza))
      }
    }

    if (vineta) {
      const lista = document.createElement("ul")
      lista.append(nodo)
      contenedor.append(lista)
    } else {
      contenedor.append(nodo)
    }
  }
}

/** Añade un turno a la conversación y devuelve sus nodos para ir rellenándolos. */
function agregarTurno(quien, texto) {
  const turno = document.createElement("li")
  turno.className = `turno turno--${quien}`

  const titulo = escribir(document.createElement("span"), quien === "usuario" ? "Tú" : "Agente")
  titulo.className = "turno__quien"

  const cuerpo = document.createElement("div")
  cuerpo.className = "turno__cuerpo"
  if (typeof texto === "string") cuerpo.textContent = texto

  turno.append(titulo, cuerpo)
  dom.conversacion.append(turno)
  turno.scrollIntoView({ block: "end", behavior: "smooth" })
  return { turno, cuerpo }
}

/** Muestra u oculta el indicador de trabajo. */
function trabajando(activo, texto = "El agente está trabajando…") {
  dom.pensandoTexto.textContent = texto
  dom.pensando.hidden = !activo
}

/** Identificador y turnos en el panel lateral. */
function pintarSesion(turnos) {
  dom.datoSesion.textContent = estado.sesion
  if (typeof turnos === "number") dom.datoTurnos.textContent = String(turnos)
}

/** Tarjeta de una llamada a herramienta; se rellena al llegar su resultado. */
function agregarLlamada(cuerpoDelTurno, evento) {
  let lista = cuerpoDelTurno.querySelector(".llamadas")
  if (lista === null) {
    lista = document.createElement("ul")
    lista.className = "llamadas"
    cuerpoDelTurno.append(lista)
  }

  const item = document.createElement("li")
  item.className = "llamada"
  item.dataset["herramienta"] = evento.nombre

  const nombre = document.createElement("span")
  nombre.className = "llamada__nombre"
  escribir(nombre, evento.nombre)

  const args = document.createElement("span")
  args.className = "llamada__args"
  escribir(args, JSON.stringify(evento.argumentos ?? {}))

  const resumen = document.createElement("span")
  resumen.className = "llamada__resumen"
  escribir(resumen, "…")

  item.append(nombre, args, resumen)
  lista.append(item)
  return item
}

/** Color de la tarjeta: verde si la herramienta fue bien, rojo si falló. */
function marcarResultado(contenedor, evento) {
  contenedor.classList.add(evento.ok ? "llamada--ok" : "llamada--fallo")
  const resumen = contenedor.querySelector(".llamada__resumen")
  if (resumen !== null) escribir(resumen, `${evento.ok ? "ok" : "falló"} · ${evento.resumen}`)
}

/** Estado del backend en la cabecera: proveedor y modelo, sin claves. */
async function consultarSalud() {
  try {
    const respuesta = await fetch("/api/health")
    const datos = await respuesta.json()

    escribir(dom.estado, `${datos.provider} · ${datos.model}`)
    dom.estado.className = "insignia insignia--ok"

    dom.casos.replaceChildren()
    for (const caso of datos.casos ?? []) {
      const boton = escribir(document.createElement("button"), caso)
      boton.type = "button"
      boton.className = "caso"
      boton.addEventListener("click", () => {
        dom.entrada.value = `Procesa el caso «${caso}» y dime si está listo para firma.`
        dom.entrada.focus()
      })

      const item = document.createElement("li")
      item.append(boton)
      dom.casos.append(item)
    }
    if (dom.casos.children.length === 0) {
      dom.casos.append(escribir(document.createElement("li"), "No se encontraron casos en fixtures/"))
    }
  } catch {
    escribir(dom.estado, "Sin conexión con el backend")
    dom.estado.className = "insignia insignia--error"
    avisar("No pude hablar con el backend. Revisa que el servidor esté levantado.")
  }
}

/** Botones con ejemplos de mensaje. */
function pintarSugerencias() {
  for (const sugerencia of SUGERENCIAS) {
    const etiqueta = sugerencia.length > 62 ? `${sugerencia.slice(0, 60)}…` : sugerencia
    const boton = escribir(document.createElement("button"), etiqueta)
    boton.type = "button"
    boton.className = "sugerencia"
    boton.title = sugerencia
    boton.addEventListener("click", () => {
      dom.entrada.value = sugerencia
      dom.entrada.focus()
    })
    dom.sugerencias.append(boton)
  }
}

/** Muestra la banda de confirmación con la acción que quedó pendiente (CA3). */
function mostrarConfirmacion(descripcion) {
  escribir(dom.confirmacionDetalle, descripcion)
  dom.confirmacion.hidden = false
}

/** Oculta la banda de confirmación. */
function ocultarConfirmacion() {
  dom.confirmacion.hidden = true
}

/** Rutas de archivo que aparecen en la respuesta de una herramienta. */
function rutasDeArchivo(contenido) {
  try {
    const datos = JSON.parse(contenido)?.data
    if (datos === null || typeof datos !== "object") return []

    const rutas = []
    for (const valor of [datos["ruta"], datos["formulario"]]) {
      if (typeof valor === "string") rutas.push(valor)
    }
    for (const valor of datos["archivos"] ?? []) {
      if (typeof valor === "string") rutas.push(valor)
    }
    return rutas
  } catch {
    return []
  }
}

/**
 * Convierte una ruta en algo descargable por `/api/files/`.
 * Devuelve `null` para lo que no sea un archivo (por ejemplo, el directorio del
 * paquete) o para lo que no pertenezca a `out/`.
 */
function rutaDescargable(ruta, caso) {
  if (caso === null || !/\.[a-z0-9]+$/i.test(ruta)) return null

  const marca = `out/${caso}/`
  const indice = ruta.indexOf(marca)
  const relativa = indice >= 0 ? ruta.slice(indice + marca.length) : ruta
  if (relativa === "" || relativa.startsWith("/")) return null

  return `/api/files/${encodeURIComponent(caso)}/${relativa.split("/").map(encodeURIComponent).join("/")}`
}

/** Lista de archivos generados del caso en curso, con enlace de descarga. */
function pintarArchivos(mensajes) {
  const vistos = new Set()
  const enlaces = []

  for (const mensaje of mensajes) {
    if (mensaje.rol !== "tool") continue
    for (const ruta of rutasDeArchivo(mensaje.contenido)) {
      const url = rutaDescargable(ruta, estado.caso)
      if (url !== null && !vistos.has(url)) {
        vistos.add(url)
        enlaces.push({ url, etiqueta: url.replace("/api/files/", "") })
      }
    }
  }

  dom.archivos.replaceChildren()
  if (enlaces.length === 0) {
    dom.archivos.append(escribir(document.createElement("li"), "Aún no hay archivos: procesa un caso."))
    return
  }

  for (const enlace of enlaces) {
    const ancla = escribir(document.createElement("a"), enlace.etiqueta)
    ancla.href = enlace.url
    ancla.target = "_blank"
    ancla.rel = "noreferrer"

    const item = document.createElement("li")
    item.append(ancla)
    dom.archivos.append(item)
  }
}

/** Relee la sesión del backend: turnos, acción pendiente y archivos generados. */
async function refrescarSesion() {
  try {
    const respuesta = await fetch(`/api/sessions/${encodeURIComponent(estado.sesion)}`)
    const cuerpo = await respuesta.json()
    if (cuerpo.ok !== true) return

    pintarSesion(cuerpo.data.turnos)
    if (cuerpo.data.pendiente) mostrarConfirmacion(cuerpo.data.pendiente.descripcion)
    else ocultarConfirmacion()
    pintarArchivos(cuerpo.data.mensajes ?? [])
  } catch {
    // Un fallo al releer la sesión no debe romper la conversación.
  }
}

/**
 * Procesa un evento del stream dentro del turno en curso.
 * Los tipos son los del ciclo del agente (`src/agent/eventos.ts`).
 */
function procesarEvento(evento, actual) {
  if (evento.tipo === "inicio") return

  if (evento.tipo === "llamada") {
    if (typeof evento.argumentos?.caso === "string") estado.caso = evento.argumentos.caso
    actual.llamadas.push({ nombre: evento.nombre, nodo: agregarLlamada(actual.cuerpo, evento) })
    return
  }

  if (evento.tipo === "resultado") {
    const pendiente = actual.llamadas.find((llamada) => llamada.nombre === evento.nombre && llamada.marcada !== true)
    if (pendiente !== undefined) {
      marcarResultado(pendiente.nodo, evento)
      pendiente.marcada = true
    }
    return
  }

  if (evento.tipo === "texto") {
    actual.fragmentos.push(evento.texto)
    pintarTexto(actual.cuerpo, actual.fragmentos.join(""))
    return
  }

  if (evento.tipo === "aviso") {
    const nodo = escribir(document.createElement("span"), evento.texto)
    nodo.className = "aviso-turno"
    actual.cuerpo.append(nodo)
    return
  }

  if (evento.tipo === "error") {
    escribir(actual.cuerpo, evento.texto)
    actual.fila.classList.add("turno--error")
    return
  }

  if (evento.tipo === "fin") {
    pintarTexto(actual.cuerpo, actual.fragmentos.join("") || evento.texto)
    if (evento.needsConfirmation === true) {
      mostrarConfirmacion("El agente terminó el turno esperando tu confirmación.")
    }
  }
}

/** Envía el mensaje y consume el stream SSE del backend. */
async function consumirStream(mensaje, actual) {
  const respuesta = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: estado.sesion, message: mensaje }),
  })

  if (!respuesta.ok || respuesta.body === null) {
    const cuerpo = await respuesta.json().catch(() => ({}))
    throw new Error(cuerpo.error ?? `el backend respondió ${respuesta.status}`)
  }

  const lector = respuesta.body.getReader()
  const decodificador = new TextDecoder()
  const acumulador = crearAcumulador()

  for (;;) {
    const { value, done } = await lector.read()
    if (done === true) return

    for (const evento of acumulador.empujar(decodificador.decode(value, { stream: true }))) {
      if (evento === FIN) return
      procesarEvento(evento, actual)
    }
  }
}

/** Un turno completo: pinta lo del usuario, consume el stream y refresca el estado. */
async function enviar(mensaje) {
  const texto = typeof mensaje === "string" ? mensaje.trim() : ""
  if (texto === "" || estado.ocupado) return

  estado.ocupado = true
  limpiarAviso()
  ocultarConfirmacion()
  dom.entrada.value = ""

  agregarTurno("usuario", texto)
  const creado = agregarTurno("agente")
  const actual = { fila: creado.turno, cuerpo: creado.cuerpo, llamadas: [], fragmentos: [] }
  trabajando(true)

  try {
    await consumirStream(texto, actual)
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error)
    actual.fila.classList.add("turno--error")
    escribir(actual.cuerpo, `No pude completar el turno: ${detalle}`)
    avisar(`No pude completar el turno: ${detalle}`)
  } finally {
    trabajando(false)
    estado.ocupado = false
    await refrescarSesion()
    dom.entrada.focus()
  }
}

/** Empieza de cero: sesión nueva, conversación vacía y sin pendientes. */
function nuevaSesion() {
  estado.sesion = nuevoIdentificador()
  estado.caso = null
  dom.conversacion.replaceChildren()
  pintarSesion(0)
  ocultarConfirmacion()
  pintarArchivos([])
  dom.entrada.focus()
}

/* ── Arranque ─────────────────────────────────────────────────────────────── */

dom.formulario.addEventListener("submit", (evento) => {
  evento.preventDefault()
  void enviar(dom.entrada.value)
})

// Enter envía; Mayús+Enter deja el salto de línea, que es lo que espera un chat.
dom.entrada.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && !evento.shiftKey) {
    evento.preventDefault()
    void enviar(dom.entrada.value)
  }
})

// La confirmación son dos respuestas que el usuario podría escribir a mano: el
// botón solo las pone a un clic. El backend sigue siendo el que autoriza (RN4).
dom.confirmar.addEventListener("click", () => void enviar("sí, confirmo"))
dom.rechazar.addEventListener("click", () => void enviar("no, espera"))
dom.nuevaSesion.addEventListener("click", nuevaSesion)

pintarSugerencias()
pintarSesion(0)
pintarArchivos([])
ocultarConfirmacion()
void consultarSalud()
void refrescarSesion()



