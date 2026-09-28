# Reto 01 · Agente conversacional «Registro como Proveedor»

> Periferia IT Group · Equipo Perxia 2.0 · TypeScript · Node 24 · Ollama local (sin claves)
> El agente prepara el formulario y el paquete de soportes. **Firmar y enviar es humano.**

Agente que, a partir de una solicitud recibida por correo, identifica los campos pedidos, los llena
desde el repositorio maestro, genera el formulario en el formato solicitado (Excel, PDF o los valores
listos para pegar en un portal web) y arma el paquete de soportes **listo para firma**, con la traza
de cada herramienta que ejecutó.

| Si buscas… | Ve a |
|---|---|
| El planteamiento, las decisiones, la cobertura y los riesgos | [`SOLUCION.md`](SOLUCION.md) |
| La aplicación (API, ciclo del agente, herramientas, front y pruebas) | [`solucion/`](solucion/) |
| Comprobarlo por tu cuenta, en cuatro niveles de coste | [`solucion/docs/prueba-funcional.md`](solucion/docs/prueba-funcional.md) |
| Cómo se eligió el modelo y cómo cambiarlo | [`solucion/docs/modelo-llm.md`](solucion/docs/modelo-llm.md) |

---

## 1. Levantarlo en local (un comando)

```bash
cd reto-01/solucion
npm install
npm run dev          # front de chat + API en http://127.0.0.1:3000
```

Eso levanta las dos piezas (el backend sirve el front) y tarda menos de un minuto con las
dependencias ya descargadas.

### Con Docker, sin instalar Node ni dependencias

```bash
cd reto-01
docker compose up --build     # lo mismo, en http://127.0.0.1:3000
```

### Para que el agente responda de verdad hace falta un modelo

```bash
ollama pull granite4.1:8b     # 5,3 GB · máquina con ~16 GB de RAM
```

Si Ollama corre en tu máquina y usas **Docker**, no hay que tocar nada más: el contenedor apunta a
`http://host.docker.internal:11434`. Si copias `.env.example` a un `.env`, deja ahí ese mismo valor
(un `localhost` dentro del contenedor sería el propio contenedor, no tu máquina).

**Sin modelo también arranca**, y es lo que recomiendo para una primera mirada:

```bash
cd reto-01/solucion && LLM_PROVIDER=mock npm run dev
```

`mock` no es un agente: es un guion fijo de cuatro pasos que permite recorrer la pantalla completa
(tarjetas de herramienta, confirmación y archivos) sin descargar nada y sin claves.

### Requisitos

| Requisito | Versión | Nota |
|---|---|---|
| Node | **≥ 22.18** (probado en 24.19) | Ejecuta TypeScript directamente, sin compilar |
| Ollama | opcional | Solo para el agente real; `granite4.1:8b` es el modelo del entregable |
| Docker | opcional | Probado con Docker 29.6.2 + Compose v5.3.1 |

---

## 2. Variables de entorno

Ninguna es obligatoria para arrancar: los valores por defecto funcionan sin `.env`. Están todas
documentadas, con su porqué, en [`solucion/.env.example`](solucion/.env.example).

```bash
cp solucion/.env.example solucion/.env   # para `npm run dev`
cp solucion/.env.example .env            # para `docker compose` (se lee desde reto-01/)
```

| Variable | Por defecto | Para qué |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | `ollama` (local, sin claves) · `openai` (cualquier API compatible) · `mock` (guion fijo) |
| `OLLAMA_MODEL` | `granite4.1:8b` | Modelo del ciclo del agente |
| `OLLAMA_HOST` | `http://localhost:11434` | Con Docker: `http://host.docker.internal:11434` |
| `OLLAMA_NUM_CTX` | `8192` | El prompt más los esquemas rondan 4 200 tokens; por debajo de 8192 Ollama rechaza la petición |
| `OLLAMA_THINK` | sin definir | Razonamiento previo de los modelos híbridos; solo si el modelo razona |
| `OPENAI_API_KEY` | — | Solo con `LLM_PROVIDER=openai`. **Nunca se versiona ni se devuelve por la API** |
| `OPENAI_MODEL` | `gpt-4o-mini` | Modelo del proveedor compatible con OpenAI |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Dentro de Docker, `HOST=0.0.0.0` |
| `FIXTURES_DIR` | `../fixtures/reto-01` | Repositorio de casos; vacío usa los fixtures del reto, sin copiarlos |
| `FECHA_EJECUCION` | fecha del sistema | Fija la fecha para que vencimientos y veredicto de firma sean reproducibles |

---

## 3. `demo.ts`: las herramientas sin modelo

```bash
cd reto-01/solucion
node demo.ts            # los 4 casos de fixtures/
node demo.ts --envio    # además, el envío simulado con confirmación
```

Salida esperada: `casos procesados: 4/4 · listos para firma: 2`, y por caso los campos llenos, los
que requieren confirmación, los faltantes, el estado de los soportes y el veredicto de firma. Corre
sin ninguna clave de proveedor y limpia `out/` al empezar, así que dos ejecuciones seguidas dan el
mismo resultado (salvo marcas de tiempo).

---

## 4. Pruebas automáticas

```bash
cd reto-01/solucion
npm test            # 119 pruebas, 0 fallos (sin modelo y sin red)
npm run typecheck   # 0 errores
```

Cubren el motor determinista, las herramientas y su contrato, el ciclo del agente con confirmación
humana, la API completa, el parser del stream SSE **y el front ejecutándose de verdad** contra el
backend (arranque, un turno completo, el clic de Enviar y los fallos de red).

---

## 5. Link de prueba

> **Pendiente de publicar.** Se completa en esta misma fase con el túnel estable o el despliegue, y
> se deja activo durante la defensa. Mientras tanto, la aplicación se levanta en local con el comando
> de la sección 1 (el PRD §9.3 admite esa modalidad con −10).

**Clave de acceso:** no aplica; el link es público y no expone ninguna clave de modelo.

---

## 6. Qué hay dentro

```
reto-01/
├── PRD.md                  # el enunciado entregado por Periferia
├── fixtures/               # datos de entrada del reto (sin modificar)
├── docker-compose.yml      # `docker compose up --build`
├── SOLUCION.md             # planteamiento de la solución (PRD §9.1)
└── solucion/               # la aplicación
    ├── agent/prompt.md         # comportamiento del agente (system prompt)
    ├── src/knowledge/          # conocimiento del proceso que el agente consulta
    ├── src/tools/              # ejecución: herramientas zod proveedor_*
    ├── src/agent/              # ciclo del agente, sesiones y confirmación humana
    ├── src/server/             # API HTTP (SSE), front estático y memoria de sesiones
    ├── web/                    # front de chat (HTML, CSS y módulos ES, sin build)
    ├── docs/                   # decisiones y guías de prueba
    ├── test/                   # pruebas automáticas
    ├── demo.ts                 # verificación sin modelo
    └── out/                    # generado en ejecución (ignorado por git)
```

Las tres piezas que separa el PRD §6.5 son **comportamiento** (`agent/prompt.md`), **conocimiento**
(`src/knowledge/`) y **ejecución** (`src/tools/`): cambiar una regla de negocio no obliga a tocar el
servidor ni el front.
