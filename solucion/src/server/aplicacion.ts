/**
 * Construcción de la aplicación HTTP del agente (PRD §6.4).
 *
 *   POST /api/chat            { sessionId, message } → stream SSE (ver chat.ts)
 *   GET  /api/sessions/:id    historial completo de la sesión
 *   GET  /api/health          { ok, provider, model } sin exponer claves
 *   GET  /api/files/<caso>/…  descarga de lo generado en `out/`
 *
 * El backend no contiene reglas de negocio: compone el ciclo del agente, que a
 * su vez usa las herramientas. Cambiar una regla del proceso no toca este archivo.
 */
import fs from "node:fs"
import path from "node:path"
import Fastify, { type FastifyInstance } from "fastify"
import fastifyStatic from "@fastify/static"
import { idValido, listarSesiones } from "../agent/sesion.ts"
import { listarCasos } from "../core/casos.ts"
import type { AdaptadorLlm } from "../llm/adapter.ts"
import { NOMBRES } from "../tools/proveedor.ts"
import { registrarChat } from "./chat.ts"
import { leerDeOut } from "./estaticos.ts"
import { crearMemoria, obtenerSesion, type MemoriaSesiones } from "./memoria.ts"

/** Dependencias ya resueltas que necesita la aplicación. */
export interface Dependencias {
  /** Raíz del proyecto. */
  directorio: string
  adaptador: AdaptadorLlm
  prompt: string
  conocimiento: string
  /** Almacén de sesiones compartido; se puede inyectar en las pruebas. */
  memoria?: MemoriaSesiones
}

/** Crea la aplicación con todas sus rutas. */
export async function crearAplicacion(deps: Dependencias): Promise<FastifyInstance> {
  const { directorio, adaptador, prompt, conocimiento } = deps
  const memoria = deps.memoria ?? crearMemoria()
  const app = Fastify({ logger: false })

  // El front de desarrollo corre en otro puerto; en producción comparten origen.
  app.addHook("onSend", async (_peticion, reply) => {
    reply.header("access-control-allow-origin", "*")
    reply.header("access-control-allow-headers", "content-type")
  })
  app.options("/*", async (_peticion, reply) => reply.code(204).send())

  // El front construido se sirve solo si existe: la API funciona sin él.
  const raizWeb = path.join(directorio, "web", "dist")
  if (fs.existsSync(raizWeb)) {
    await app.register(fastifyStatic, { root: raizWeb, prefix: "/", wildcard: false })
  }

  app.get("/api/health", async () => {
    const casos = listarCasos()
    const sesiones = listarSesiones(directorio)
    return {
      ok: true,
      provider: adaptador.proveedor,
      model: adaptador.modelo,
      herramientas: NOMBRES,
      casos: casos.ok ? casos.data : [],
      sesiones: sesiones.ok ? sesiones.data.length : 0,
    }
  })

  app.get<{ Params: { id: string } }>("/api/sessions/:id", async (peticion, reply) => {
    const { id } = peticion.params
    if (!idValido(id)) return reply.code(400).send({ ok: false, error: "identificador de sesión inválido" })
    return { ok: true, data: obtenerSesion(directorio, id, memoria) }
  })

  app.get<{ Params: { "*": string } }>("/api/files/*", async (peticion, reply) => {
    const partes = (peticion.params["*"] ?? "").split("/").filter((parte) => parte !== "")
    const archivo = leerDeOut(directorio, partes)
    if (!archivo.ok) return reply.code(404).send({ ok: false, error: archivo.error })
    return reply
      .header("content-type", archivo.data.tipo)
      .header("content-disposition", `inline; filename="${archivo.data.nombre}"`)
      .send(archivo.data.contenido)
  })

  registrarChat(app, { directorio, adaptador, prompt, conocimiento, memoria })

  return app
}
