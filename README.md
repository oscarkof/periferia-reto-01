# Reto 01 · Agente conversacional «Registro como Proveedor»

> Periferia IT Group · Equipo Perxia 2.0
> TypeScript sobre Node 24 · front estático sin build · `granite4.1:8b` en Ollama local · Docker opcional
> El agente prepara el formulario y el paquete de soportes. **Firmar y enviar es humano.**

Este README es el documento maestro del entregable: cómo levantarlo, **con qué está hecho y por qué**,
cómo se eligió el modelo, **qué hace cada archivo del repositorio** y qué queda fuera del alcance.

## Qué hace este agente

Automatiza el **registro como proveedor** ante clientes de Colombia, Ecuador, Perú, Panamá y Honduras
(8–12 solicitudes al mes): a partir de una solicitud recibida por correo, **identifica los campos que pide
el cliente y los llena con los valores del repositorio maestro**, genera el formulario en el formato
solicitado (plantilla Excel, PDF o los valores para un portal) y arma el **paquete de soportes listo para
la firma del representante legal**.

**El agente nunca firma ni envía:** deja todo preparado y pide confirmación humana. Y **no puede inventar
un dato**: los valores solo pueden salir del repositorio maestro por código determinista, y el veredicto de
«listo para firma» también lo decide código. El modelo conversa y pide herramientas; el resultado es el
mismo con cualquier modelo o sin ninguno.

## Cómo leer esta entrega

| Documento | Qué cuenta |
|---|---|
| **`README.md`** (este) | Cómo levantarlo, con qué está hecho y por qué, el modelo elegido con sus mediciones, y **qué hace cada archivo** |
| [`SOLUCION.md`](SOLUCION.md) | El planteamiento completo: arquitectura, decisiones con la alternativa descartada, cobertura de las historias de usuario y riesgos |
| [`solucion/docs/`](solucion/docs/) | El detalle por tema: modelo, front, prueba funcional y puesta en marcha del repositorio |
| [`solucion/demo.ts`](solucion/demo.ts) | Los cuatro casos del repositorio ejecutados sin modelo y sin claves |

| Quiero… | Sección |
|---|---|
| Levantarlo y verlo funcionando | [1. Arranque](#1-arranque-un-comando) |
| Saber el stack y por qué cada pieza | [2. Stack](#2-stack-con-qué-está-hecho-y-por-qué) |
| Entender la elección del modelo, con números | [3. El modelo](#3-el-modelo-elección-mediciones-y-costo) |
| Saber qué hace cada archivo | [4. Estructura](#4-estructura-del-repositorio-archivo-por-archivo) |
| Ver las herramientas sin modelo | [5. `demo.ts`](#5-demots-las-herramientas-sin-modelo) |
| Correr las pruebas | [6. Pruebas](#6-pruebas-automáticas) |
| Configurar el entorno | [7. Variables de entorno](#7-variables-de-entorno) |
| Probar la aplicación en línea | [8. Link de prueba](#8-link-de-prueba) |
| Saber qué quedó fuera del alcance | [9. Limitaciones](#9-qué-queda-fuera-limitaciones-declaradas) |

---

## 1. Arranque (un comando)

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
ollama serve                  # normalmente ya corre como servicio
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

## 2. Stack: con qué está hecho (y por qué)

| Capa | Elección | Versión | Por qué esta y no otra |
|---|---|---|---|
| Runtime | **Node** | 24.19 (`engines ≥22.18`) | Ejecuta TypeScript **directamente** (borrado de tipos nativo): sin paso de compilación, sin `ts-node`, sin `dist/`. Menos piezas que mantener. `tsconfig` usa `erasableSyntaxOnly`, que prohíbe la sintaxis que Node no sabe borrar |
| Lenguaje | **TypeScript** | 7.0 | `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; **cero `any`** en todo el proyecto (lo comprueba el grep y el typecheck) |
| API HTTP | **Fastify** | 5.12 | Rápido, tipado y con `inject()`: las pruebas ejercitan las rutas sin abrir un puerto |
| Servir el front | **@fastify/static** | 10.1 | El mismo proceso sirve API y front: un comando, un puerto, cero CORS |
| Validación de argumentos | **zod** | 4.6 | Lo exige el PRD §6.2/§8. Los esquemas se convierten en JSON Schema para el modelo **y** validan antes de ejecutar: el modelo no puede inventar un caso con `../` |
| Excel (.xlsx) | **exceljs** | 4.4 | Escribe en la **hoja y celda exactas** que dice la plantilla, y permite fondo ámbar + comentario en los campos por confirmar |
| PDF | **pdfkit** | 0.20 | PDF generado con etiqueta y valor en el orden de la plantilla (el PRD acepta PDF generado, no AcroForm) |
| Front | **HTML + CSS + módulos ES** | — | El PRD §0 lo admite y §8 pide un comando: sin bundler no hay build que se rompa. El costo (sin componentes) está asumido en `SOLUCION.md` §6.1 |
| Modelo | **Ollama + `granite4.1:8b`** | — | Local, sin claves, con *tool calling*. Detalle en §3 y en `solucion/docs/modelo-llm.md` |
| Empaquetado | **Docker + Compose** | 29.6.2 / v5.3.1 | `docker compose up --build` levanta todo sin instalar Node. Probado de punta a punta |
| Pruebas | **`node:test`** | incluido en Node | Sin *test runner* externo: `node --test` corre también los `.ts` |
| Diagramas | HTML autocontenido en `docs/diagramas/` | — | Material visual de la arquitectura (front → API → ciclo → herramientas → archivos), sin depender de una herramienta externa |

### Dependencias directas: cinco para producir, tres para construir

| Dependencia | Tipo | Para qué |
|---|---|---|
| `fastify` | producción | El servidor HTTP |
| `@fastify/static` | producción | Servir el front y los archivos generados |
| `zod` | producción | Contrato y validación de las herramientas |
| `exceljs` | producción | Formulario Excel (P0) |
| `pdfkit` | producción | Formulario PDF (P1) |
| `typescript` | desarrollo | Solo para `tsc --noEmit`: en ejecución **no** se usa |
| `@types/node`, `@types/pdfkit` | desarrollo | Tipado de la plataforma |

**Lo que deliberadamente no se usó**, y por qué (útil si lo preguntan):

- **Nada de bundler de front** (Vite, Webpack): añadiría un paso de build obligatorio.
- **Nada de framework de front**: el estado de la pantalla es una sesión y un turno.
- **Nada de ORM ni base de datos**: las sesiones son archivos `out/sessions/<id>.json`; el
  repositorio maestro son fixtures. Un ORM aquí sería una pieza más que justificar.
- **Nada de `dotenv`**: Node ya lee `.env` de forma nativa (`--env-file-if-exists`, ver §7).
- **Nada de *test runner* externo** (Jest, Vitest): `node:test` viene en Node y corre TypeScript.
- **Nada de cola de trabajos**: 8-12 casos al mes y un turno de ~70 s no lo necesitan.

---

## 3. El modelo: elección, mediciones y costo

**`granite4.1:8b` servido por Ollama local.** El ciclo del agente no conoce ninguna API: habla con una
interfaz propia (`src/llm/adapter.ts` · `enviar(mensajes, herramientas)`), así que cambiar de modelo o
de proveedor es cambiar una variable de entorno.

| Criterio | Por qué este modelo |
|---|---|
| Costo | 0 por caso: corre en la máquina, sin claves ni cuotas |
| Licencia | Apache 2.0 (IBM), sin restricciones de uso comercial |
| *Tool calling* | Verificado en el E2E, **incluido el turno de confirmación** |
| Tamaño | 5,3 GB cuantizado: cabe en 16 GB de RAM junto al sistema y el KV cache |
| Dominio | Orientado a empresa (GRC, compliance) y con salida JSON estructurada, que es el formato del contrato de herramientas |

**Descartados, con la razón medida** (tabla completa en `solucion/docs/modelo-llm.md` §3):

- `qwen3:4b-instruct` (2,5 GB): el más liviano, pero **no pasa el turno de confirmación**.
- `qwen3:14b` (9,3 GB): no deja aire para el escritorio en 16 GB; los tiempos por turno se disparan.
- `qwen3:30b` / `granite4.1:30b` (17-19 GB): no caben.
- APIs de pago: quedaron **como alternativa lista**, no como requisito.

### Tres hallazgos medidos que explican partes del código

1. **La ventana de contexto por defecto no alcanza.** El prompt del sistema más los esquemas de las
   cinco herramientas rondan **4 179 tokens** y el valor por defecto de Ollama es 4 096, así que la
   petición fallaba con `request exceeds the available context size`. El adaptador pide 8 192
   (`OLLAMA_NUM_CTX`).
2. **Ollama devuelve los argumentos ya como objeto** (`tool_calls[].function.arguments`), mientras que
   las APIs compatibles con OpenAI los mandan como string JSON. El adaptador normaliza las dos formas,
   con pruebas que cubren ambas.
3. **Los modelos híbridos razonan antes de responder** (`think`) y eso cuesta latencia; se envía solo
   si se pide (`OLLAMA_THINK`), porque los que no razonan rechazan el campo.

### Números medidos (no estimaciones)

| Qué | Medición |
|---|---|
| Prompt + esquemas de las cinco herramientas | 4 179 tokens |
| Turno 1: procesa el caso y arma el paquete | **70 s** en local |
| Turno 2: «envía» con confirmación | **26 s** |
| Un turno completo dentro del contenedor, con el modelo del host | **66 s** |
| Tokens por turno (sesión real de 3 turnos: 43 591 en total) | ≈ **14 500** |
| Coste con un proveedor de pago (0,15/0,60 USD por millón de tokens) | ≈ **0,0024 USD/turno** · ≈ **0,005 USD/caso** |
| Coste con el modelo local | **0 USD** (la energía de la máquina) |
| Cota de gasto por sesión | 25 iteraciones · 200 000 tokens |

### Cómo se cambia de modelo (sin tocar código)

```bash
LLM_PROVIDER=ollama OLLAMA_MODEL=granite4.1:8b npm run dev          # por defecto
LLM_PROVIDER=openai OPENAI_API_KEY=... OPENAI_MODEL=gpt-4o-mini npm run dev
LLM_PROVIDER=mock npm run dev                                      # guion fijo, sin modelo
```

`GET /api/health` declara en caliente qué está activo y **no expone ninguna clave**:

```bash
curl -s http://127.0.0.1:3000/api/health
# {"ok":true,"provider":"ollama","model":"granite4.1:8b","herramientas":[…],"casos":[…]}
```

---

## 4. Estructura del repositorio, archivo por archivo

Tres clases de contenido, para que no haya dudas de qué es fuente y qué es salida:

| Clase | Qué es | Se versiona |
|---|---|---|
| **Fuente** | Código, front, documentación y configuración propias | Sí |
| **Entregado por Periferia** | `PRD.md` y `fixtures/` | Sí, **sin modificar** |
| **Generado en ejecución** | `solucion/out/` (formularios, paquetes, `log.jsonl`, sesiones) | No (`.gitignore`) |

```
reto-01/                          ← raíz del repo y del entregable (.zip = esta carpeta)
├── PRD.md                        enunciado de Periferia
├── README.md                     este documento
├── SOLUCION.md                   planteamiento (§9.1): arquitectura, decisiones, cobertura
├── docker-compose.yml            `docker compose up --build`
├── .dockerignore                 qué NO entra en la imagen (node_modules, out, .env)
├── .gitignore                    reglas de todo el árbol
├── fixtures/reto-01/             21 archivos de entrada entregados (casos, maestro, soportes)
└── solucion/                     la aplicación
    ├── Dockerfile                imagen (Node 24 alpine, usuario sin privilegios, healthcheck)
    ├── package.json              dependencias, scripts y engines
    ├── package-lock.json         versiones exactas (sí se versiona)
    ├── tsconfig.json             TypeScript estricto, sin emitir
    ├── .env.example              las 11 variables documentadas, sin valores
    ├── .gitignore                lo mínimo para reutilizar esta carpeta como base
    ├── demo.ts                   recorrido de los 4 casos sin modelo (PRD §6.6)
    ├── agent/prompt.md           comportamiento del agente (system prompt)
    ├── src/knowledge/            conocimiento del proceso que el agente consulta
    ├── src/core/                 motor determinista (mapeo, reglas, vencimientos, archivos)
    ├── src/agent/                ciclo del agente, sesiones y confirmación humana
    ├── src/llm/                  adaptadores de proveedor (ollama · openai · mock)
    ├── src/tools/                las cinco herramientas `proveedor_*`
    ├── src/server/               API HTTP, stream SSE y front estático
    ├── src/demo/                 la lógica que usa `demo.ts`
    ├── web/                      front de chat (HTML, CSS, JS sin build)
    ├── test/                     119 pruebas automáticas
    ├── test-utils/               utilidades y dobles de prueba (no son pruebas)
    ├── docs/                     decisiones y guías por tema
    └── out/                      salida generada (solo su .gitkeep se versiona)
```

### 4.1 Raíz del repo y documentación

| Archivo | Qué hace | Por qué existe |
|---|---|---|
| `PRD.md` | El enunciado del reto | Entregado por Periferia: es la referencia de los números de sección que se citan en todo el código |
| `SOLUCION.md` | Planteamiento completo (10 secciones del PRD §9.1) | Es lo que evalúa «cómo pensaste», no solo qué corriste |
| `README.md` | Este documento maestro | **Un comando** para levantarlo (PRD §9.2), el stack y el mapa de archivos |
| `docker-compose.yml` | Servicio `agente` con build, puerto, variables, volumen `out/` y `host.docker.internal` | Da el «un comando» alternativo del PRD §8 sin instalar Node |
| `.dockerignore` | Excluye `node_modules`, `out/`, `.env`, `.git`, zips y `.DS_Store` | Evita que la imagen arrastre 123 MB de dependencias del host y secretos |
| `.gitignore` | Secretos, dependencias, `out/*`, cachés, basura de SO/IDE, tooling de agentes, `*.zip` | Que el repo sea entregable: el PRD §9.5 prohíbe `node_modules`, `out` y `.env` |
| `fixtures/reto-01/**` | Los 4 casos, el repositorio maestro, los soportes, el glosario y las plantillas | Datos del cliente: **no se modifican** y no se copian dentro de la app (§6.3 de `SOLUCION.md`) |

### 4.2 `solucion/`: configuración y punto de entrada

| Archivo | Qué hace | Por qué existe |
|---|---|---|
| `Dockerfile` | Imagen lista para correr: copia la app a `/app` y los fixtures a `/fixtures`, instala solo dependencias de producción, corre como usuario `node` y trae `HEALTHCHECK` | Que `docker compose up --build` funcione sin Node instalado; los fixtures quedan donde el código los busca, sin tocar `FIXTURES_DIR` |
| `package.json` | Dependencias, 4 scripts (`test`, `typecheck`, `demo`, `dev`) y `engines: >=22.18` | Un comando (`npm run dev`) y un runner sin dependencias extra |
| `package-lock.json` | Versiones exactas del árbol de dependencias | Reproducibilidad: dos clones instalan lo mismo (y **sí** se versiona) |
| `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`, sin emitir | Es el contrato de calidad: sin `any` y con la sintaxis que Node puede borrar |
| `.env.example` | Las 12 variables con su explicación y sus valores por defecto | Documentación ejecutable de la configuración; `.env` está ignorado |
| `.gitignore` | Lo mínimo para que esta carpeta se pueda reutilizar como base de otro reto | Portabilidad: no arrastra basura del reto 01 |
| `demo.ts` | Recorre los 4 casos llamando a las herramientas, sin modelo (PRD §6.6) | Demostrar el motor determinista en 30 s, sin claves ni descargas |
| `agent/prompt.md` | El *system prompt*: comportamiento, tono y reglas que el modelo **sí** debe seguir | El PRD §6.5 exige separar comportamiento de código: cambiar reglas no toca el servidor |
| `src/knowledge/registro-proveedor.md` | Conocimiento del proceso: requisitos por país, reglas de negocio, glosario y el diseño del portal | Segunda pieza separada por el PRD §6.5; el agente lo consulta como contexto |
| `out/.gitkeep` | Marcador de carpeta | Git no versiona carpetas vacías y `out/` debe existir (y estar vacía) desde el primer clon |

### 4.3 `src/core/`: el motor determinista (sin modelo)

Aquí **no hay lenguaje natural**: es el código que decide los valores, los vencimientos y el veredicto
de firma. Es la razón de que el agente no pueda inventar un dato.

| Archivo | Qué hace | Por qué existe |
|---|---|---|
| `io.ts` | Lectura de disco con `Resultado<T>` tipado: ninguna función lanza | Base de HU-5: un archivo raro da un mensaje legible, no una traza |
| `rutas.ts` | Resuelve la raíz del proyecto, los fixtures y `out/`; valida el nombre del caso (`^[a-zA-Z0-9][a-zA-Z0-9_-]*$`) y confina toda ruta (`resolverDentro`) | El nombre del caso lo propone el modelo: hay que impedir `../` antes de tocar el disco |
| `tipos.ts` | Tipos compartidos: `Resultado<T>`, `Formato`, `CasoLeido`, `Mapeo`, `ChecklistSoportes`… | Un solo vocabulario para todas las capas; el compilador vigila el contrato |
| `plantillas.ts` | Valida y normaliza los archivos del caso (`solicitud.json`, `plantilla-celdas.json`, `plantilla-campos.json`) | Módulo puro: cada regla del PRD §7.1 se prueba en aislamiento |
| `casos.ts` | Carga un caso completo y lista los disponibles | Orquesta la lectura; separa «cargar» de «interpretar» |
| `fixtures.ts` | Carga el repositorio maestro, el glosario y el índice de soportes | Acceso único a los datos entregados, con errores tipados |
| `maestro.ts` | Resuelve rutas con punto (`banco.swift`, `representante_legal.identificacion`) sobre el maestro | **Garantiza que un valor solo puede salir de aquí** (CA2) |
| `glosario.ts` | Traduce la etiqueta del cliente a la clave del maestro, indexada por etiqueta normalizada | Es donde se resuelve «NIT» vs «RUC» vs «Tax ID» |
| `normalizar.ts` | Quita tildes, mayúsculas y signos; calcula similitud entre textos | Hace que la búsqueda de sinónimos no dependa de cómo escribió el cliente |
| `mapeo.ts` | El motor de mapeo: llenos, faltantes y `requiere_confirmacion` | Es el corazón de HU-2 y es **100 % determinista**: el modelo no produce valores |
| `pais.ts` | Reglas por país (RN1): CO → NIT, EC/PE/PA → RUC, HN → RTN, y qué se marca por confirmar | La regla con más variantes del reto: cada país identifica a la empresa de otra forma y pide soportes distintos |
| `soportes.ts` | Evalúa cada soporte exigido: presente/ausente/vencido, con la fecha de ejecución | Alimenta el veredicto de firma (RN3) y es reproducible con `FECHA_EJECUCION` |
| `escritor.ts` | Escribe siempre dentro de `out/`, con `limpiar()` para el arranque determinista | Confina la escritura y hace que dos ejecuciones den lo mismo (PRD §8) |
| `log.ts` | Registra cada herramienta en `out/<caso>/log.jsonl` y en `out/log.jsonl` | Es la traza de RN5 y lo que el front muestra como tarjetas (CA4) |

### 4.4 `src/agent/`: el ciclo del agente

| Archivo | Qué hace | Por qué existe |
|---|---|---|
| `loop.ts` | El bucle modelo → herramientas → modelo, con tope de **25 iteraciones** y de **200 000 tokens** por sesión, y cierre limpio al alcanzarlos | CA1 y el control de costo del PRD §8: el agente no puede quedarse girando ni gastar sin límite |
| `paso.ts` | Ejecuta las llamadas que pide el modelo: valida con zod, audita el mapeo y **impone `confirmado=false`** si no hubo confirmación | CA2 y RN4: son reglas del código, no del prompt, para que el modelo no pueda saltárselas |
| `confirmacion.ts` | Detecta si el usuario confirmó **en el turno inmediatamente anterior** | CA3: una acción externa solo se ejecuta con un «sí» explícito y reciente |
| `eventos.ts` | Define los eventos del turno (`inicio`, `llamada`, `resultado`, `texto`, `aviso`, `error`, `fin`) | El ciclo no habla HTTP: emite eventos y el servidor decide cómo los transmite |
| `sesion.ts` | Estructura de la sesión (historial, turnos, tokens, acción pendiente) y su persistencia en `out/sessions/<id>.json` | Que el historial sobreviva a un reinicio y que `GET /api/sessions/:id` devuelva el estado real |
| `prompt.ts` | Carga `agent/prompt.md` y el conocimiento y los compone como contexto del sistema | Cumple la separación del PRD §6.5: el comportamiento y el conocimiento no viven en el código |

### 4.5 `src/llm/`: los adaptadores de proveedor

| Archivo | Qué hace | Por qué existe |
|---|---|---|
| `adapter.ts` | Define la interfaz `enviar(mensajes, herramientas) → respuesta` y `definirHerramienta` (zod → JSON Schema) | Es lo que permite cambiar de proveedor sin tocar el ciclo del agente (PRD §6.1) |
| `ollama.ts` | Adaptador de Ollama: pide `num_ctx`, manda `think` solo si se pide y **normaliza los argumentos** (objeto o string JSON) | Es el proveedor del entregable; los tres detalles salieron de medir, no de suponer |
| `openai.ts` | Adaptador para cualquier API compatible con OpenAI (`/chat/completions`) | Demuestra la promesa del PRD: cambiar de proveedor es cambiar una variable |
| `mock.ts` | Adaptador de guion fijo: cuatro pasos, sin red | Permite enseñar la app y correr las 119 pruebas sin claves, sin red y sin descargar 5 GB |
| `fabrica.ts` | Construye el adaptador según `LLM_PROVIDER` y **lee la clave del entorno** (nunca la registra) | Único punto donde se resuelve el proveedor; la seguridad del PRD §8 vive aquí |

### 4.6 `src/tools/`: las cinco herramientas del contrato

| Archivo | Qué hace | Por qué existe |
|---|---|---|
| `contrato.ts` | El contrato del PRD §6.2: `description` + `args` (zod) + `execute` que **devuelve string y nunca lanza** | Un solo sitio define cómo se declara una herramienta; el nombre que ve el modelo es `<archivo>_<export>` |
| `proveedor.ts` | Las cinco herramientas visibles: `proveedor_leer_solicitud`, `_mapear_campos`, `_generar_formulario`, `_armar_paquete`, `_simular_envio` | Es la superficie que el modelo puede llamar; cada una es una capacidad del negocio |
| `contexto.ts` | Lo común a todas: resolver el escritor desde `ctx.directory`, cargar caso y maestro, auditar el mapeo y registrar la ejecución (RN5) | Evita cinco copias de las mismas comprobaciones de seguridad |
| `formulario.ts` | Genera el formulario en el formato pedido, compartido por dos herramientas | Si viviera dos veces, habría dos formas de rellenar el mismo formulario |
| `formato-xlsx.ts` | Escribe en la **hoja y celda exactas** de la plantilla; ámbar + comentario en los campos por confirmar | P0 del PRD: es el caso real de `co-industrias-delta` |
| `formato-pdf.ts` | PDF con etiqueta y valor en el orden de la plantilla | P1 del PRD: PDF generado, sin AcroForm |
| `formato-portal.ts` | Deja `valores-portal.md` listos para copiar y responde «formato no soportado» | P2 del PRD: el portal **no se automatiza**, pero el humano no se queda sin los valores |
| `valores.ts` | Convierte el mapeo en la vista `etiqueta → texto` que consumen los tres formatos | Un solo mapeo alimenta xlsx, pdf y portal sin reinterpretar estados |
| `paquete.ts` | Arma `out/<caso>/paquete/` con formulario, copias de soportes, `checklist.md` y `borrador-correo.md` | HU-4: lo que el humano firma tiene que estar junto y ordenado |
| `paquete-textos.ts` | Genera el texto del checklist y del correo (módulo puro) | Se prueba el contenido sin tocar el disco; el correo respeta RN2 (sin datos bancarios) |

### 4.7 `src/server/`: la API y el front

| Archivo | Qué hace | Por qué existe |
|---|---|---|
| `src/server.ts` | Arranque: carga prompt y conocimiento, construye el adaptador y escucha en `PORT`/`HOST` | Es el `npm run dev`; valida la configuración antes de abrir el puerto |
| `aplicacion.ts` | Registra las rutas (`POST /api/chat`, `GET /api/sessions/:id`, `GET /api/health`, `GET /api/files/*`), el front y el registro de peticiones | Un solo sitio donde se ve la superficie HTTP completa (PRD §6.4) |
| `chat.ts` | `POST /api/chat`: stream **SSE** por defecto y JSON con `?json=1` | El stream es lo que hace visible el trabajo mientras el modelo piensa |
| `estaticos.ts` | Sirve `/api/files/<caso>/<ruta>` **confinado a `out/`** | Permite descargar lo generado sin abrir el disco a cualquiera (probado con `/etc/hosts` → 404) |
| `front.ts` | Decide qué carpeta sirve: `web/dist` si existe, si no `web/` | Deja la puerta abierta a un front con bundler sin tocar el servidor |
| `memoria.ts` | Sesiones vivas del proceso, respaldadas por `out/sessions/<id>.json` | Evita releer el disco en cada turno sin perder el historial al reiniciar |
| `identificadores.ts` | Genera identificadores de sesión válidos a partir del reloj | El `sessionId` que llega del navegador se valida; el que genera el servidor cumple el patrón |
| `src/demo/ejecucion.ts` | Recorre todos los casos llamando a las herramientas y devuelve un resumen estable | Es la lógica de `demo.ts`, separada para poder probarla y para que el resumen sea comparable entre corridas |

### 4.8 `web/`: el front, sin build

| Archivo | Qué hace | Por qué existe |
|---|---|---|
| `index.html` | Estructura: cabecera con el estado del backend, conversación, banda de confirmación, entrada y panel lateral | Es la pantalla que se enseña en la demo; lleva la marca de versión (`interfaz v4`) para no depurar una copia vieja en caché |
| `app.js` | Envía el mensaje, lee el SSE, pinta el historial, las tarjetas de herramienta y la banda de confirmación | Es el front entero: ~570 líneas sin dependencias, todo con nodos del DOM (`textContent`, nunca `innerHTML`) |
| `sse.js` | Parser del stream SSE: trocea, guarda el resto incompleto y decodifica | Va aparte y sin DOM para poder probarlo en Node con eventos partidos entre dos trozos |
| `estilos.css` | Estilos con variables CSS; resalta la confirmación porque CA3 lo exige | Sin CSS externo: un solo fichero, sin red ni fuentes remotas |
| `favicon.svg` | Icono | Evita el 404 de `favicon.ico` en cada carga y en los logs |

### 4.9 `docs/`: las decisiones, por tema

| Archivo | Qué hace | Por qué existe |
|---|---|---|
| `docs/modelo-llm.md` | Elección de modelo, mediciones, cómo cambiar de proveedor y los hallazgos (ventana de contexto, argumentos, `think`) | Es el detalle detrás de §3 de este README |
| `docs/front-web.md` | Decisiones del front, contrato con el backend y los **tres bugs** que encontraron las pruebas | Deja escrito por qué el front es estático y qué se aprendió de cada fallo |
| `docs/prueba-funcional.md` | Guía de prueba en cuatro niveles: pruebas, API con guion, API con modelo real y qué mirar si algo falla | Para que el evaluador lo compruebe por su cuenta, con los comandos exactos |
| `docs/repo-setup.md` | Cómo se organizó el repositorio: un repo por reto, convención de commits y checklist de seguridad previo a cada push | Explica la forma del historial de Git y cómo se verifica que no se filtren secretos |
| `docs/diagramas/arquitectura-reto01.html` | Diagrama de arquitectura autocontenido (front → API → ciclo → herramientas → archivos) | Material visual de la arquitectura, sin depender de herramientas externas |

### 4.10 `test/`: 119 pruebas automáticas

```bash
cd reto-01/solucion && npm test      # node --test, sin modelo y sin red
```

| Archivo | Qué cubre |
|---|---|
| `casos.test.ts` | Carga y validación de los archivos de un caso; errores legibles (HU-5) |
| `normalizar.test.ts` · `mapeo.test.ts` · `mapeo-reglas.test.ts` | Normalización, mapeo etiqueta → maestro y reglas por país (HU-2) |
| `soportes.test.ts` | Presente/ausente/vencido y su efecto en el veredicto de firma (RN3) |
| `contrato.test.ts` · `herramientas.test.ts` · `herramientas-seguridad.test.ts` | Contrato del PRD §6.2, las cinco herramientas y sus defensas (nombres de caso, rutas, mapeo alterado) |
| `confirmacion.test.ts` · `bucle.test.ts` · `bucle-confirmacion.test.ts` | Ciclo del agente: topes, sesiones, errores que no tumban la sesión y confirmación humana (CA3/RN4) |
| `adaptador-ollama.test.ts` | Adaptador de Ollama contra un servidor falso: `num_ctx`, `think` y las dos formas de argumentos |
| `rutas.test.ts` | Resolución de rutas y confinamiento (`../` fuera) |
| `api.test.ts` | Las rutas HTTP completas: salud, JSON, SSE, sesiones, archivos y los 400/404 |
| `web.test.ts` | Que el backend sirva el front, que no exponga nada fuera de `web/`, el contrato HTML ↔ `app.js` y el parser SSE con un stream real |
| `front-navegador.test.ts` | **Ejecuta el front de verdad** contra el backend: arranque, un turno completo, el clic de Enviar, mensaje vacío, backend caído y coherencia de la versión |

### 4.11 `test-utils/`: los dobles de prueba

| Archivo | Qué hace | Por qué existe |
|---|---|---|
| `ayuda.ts` | Utilidades compartidas (`exigir`, cargar un caso de prueba) | Está fuera de `test/` porque el runner trata como prueba todo lo que hay dentro de esa carpeta |
| `herramientas.ts` | Monta un `out/` temporal y ejecuta herramientas con `ctx.directory` | Demuestra que ninguna herramienta escribe fuera del contexto que recibe |
| `bucle.ts` | Monta un turno completo con el adaptador de guion | Probar el ciclo sin modelo, con el prompt reducido a texto de prueba |
| `ollama-falso.ts` | Servidor local que imita `/api/chat` de Ollama y guarda lo que recibe | Probar el adaptador sin tener el modelo descargado ni el servicio levantado |
| `front.ts` | **Navegador mínimo**: DOM falso en un contexto `vm` y `fetch` conectado al backend real | Es lo que permite que la suite lance `app.js`; sin esto, el front no se probaba |

---

## 5. `demo.ts`: las herramientas sin modelo

```bash
cd reto-01/solucion
node demo.ts            # los 4 casos de fixtures/
node demo.ts --envio    # además, el envío simulado con confirmación
```

Salida esperada: `casos procesados: 4/4 · listos para firma: 2`, y por caso los campos llenos, los que
requieren confirmación, los faltantes, el estado de los soportes y el veredicto de firma. Corre sin
ninguna clave de proveedor y limpia `out/` al empezar, así que dos ejecuciones seguidas dan el mismo
resultado (salvo marcas de tiempo).

---

## 6. Pruebas automáticas

```bash
cd reto-01/solucion
npm test            # 119 pruebas, 0 fallos (sin modelo y sin red)
npm run typecheck   # 0 errores
```

Cubren el motor determinista, las herramientas y su contrato, el ciclo del agente con confirmación
humana, la API completa, el parser del stream SSE **y el front ejecutándose de verdad** contra el
backend. El detalle de qué prueba cada archivo está en §4.10.

---

## 7. Variables de entorno

Ninguna es obligatoria para arrancar: los valores por defecto funcionan sin `.env`. Están todas
documentadas, con su porqué, en [`solucion/.env.example`](solucion/.env.example).

```bash
cp solucion/.env.example solucion/.env   # para `npm run dev` (Node lo lee solo)
cp solucion/.env.example .env            # para `docker compose` (se lee desde reto-01/)
```

El `.env` es **opcional y nativo**: los scripts usan `--env-file-if-exists=.env`, así que si el archivo
existe se carga y si no, el arranque sigue igual (`Node ≥22.18`). No hay `dotenv` de por medio. Las
variables también se pueden pasar por delante del comando, que es lo más cómodo para probar:

```bash
LLM_PROVIDER=mock npm run dev
LLM_PROVIDER=openai OPENAI_API_KEY=... npm run dev
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
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Cambia el destino si usas otro proveedor compatible (Azure, Groq, vLLM…) |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Dentro de Docker, `HOST=0.0.0.0` |
| `FIXTURES_DIR` | `../fixtures/reto-01` | Repositorio de casos; vacío usa los fixtures del reto, sin copiarlos |
| `FECHA_EJECUCION` | fecha del sistema | Fija la fecha para que vencimientos y veredicto de firma sean reproducibles |

---

## 8. Link de prueba

> **Decisión: se despliega en local durante la defensa.** El PRD §9.3 admite esa modalidad y asume el
> **−10**; a cambio, la demo corre sobre la máquina, que es lo único que conserva el modelo local (Ollama) sin
> publicar ninguna clave. Lo que sí está hecho y verificado es el despliegue: `docker compose up --build`
> levanta front y API en un comando y el contenedor queda *healthy* (§1).

**Cómo se prueba:** `cd reto-01 && docker compose up --build` y el chat en `http://127.0.0.1:3000`. Con
`LLM_PROVIDER=mock` el turno responde en milisegundos, que es lo ideal para enseñar la pantalla completa; con
Ollama real el front va mostrando cada herramienta mientras trabaja.

**Vías, si algún día se decide publicar** (ninguna está activa):

| Vía | Cómo | Qué se gana |
|---|---|---|
| **Túnel a esta máquina** (Cloudflare Tunnel o ngrok) | `docker compose up -d` y el túnel apuntando a `http://127.0.0.1:3000` | Es lo único que conserva el **modelo local** detrás del link |
| **Render / Railway / Fly.io** | Desplegar la imagen del `Dockerfile` | URL permanente; a cambio hay que usar un proveedor por API o enseñar el `mock` |
| **Azure** (Container Apps o App Service) | Igual, con la imagen en un *registry* | Es la nube que un cliente corporativo ya tiene contratada |

**Clave de acceso:** no aplica; el link es público y no expone ninguna clave de modelo.

---

## 9. Qué queda fuera (limitaciones declaradas)

1. **El link público está pendiente de publicar** (§8); el PRD §9.3 acepta probarlo en local con −10.
2. **Los portales web no se automatizan**: el PRD lo pide así. Se generan los valores para copiar, y el
   diseño de una automatización futura está en `SOLUCION.md` §5.
3. **La firma electrónica y el envío real están fuera de alcance** (PRD §2.3): el agente simula el
   envío y deja constancia.
4. **El front se prueba con un DOM mínimo, no con un navegador**: lo que dependa de CSS o del pintado
   real (como el caso del `[hidden]`) no lo detecta la suite; el siguiente nivel sería Playwright.
5. **Sin autenticación ni multiusuario**: las sesiones se identifican por `sessionId`, como permite el
   PRD para un link público.
6. **PDF generado, no AcroForm**: el PRD admite un PDF que reproduzca etiqueta y valor; no se rellena
   un PDF de entrada.
7. **El repositorio maestro son fixtures**, no un sistema real: en producción necesita dueño del dato e
   integración.
8. **No hay reintentos ni cola**: si el proveedor falla, el turno devuelve un error legible y la sesión
   sigue; para volumen alto habría que añadir cola y reintentos con *backoff*.
