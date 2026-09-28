# Solución · Agente conversacional «Registro como Proveedor»

> Reto 01 · Periferia IT Group · Equipo Perxia 2.0
> Documento con la estructura obligatoria del PRD §9.1.
> Cómo levantar y probar la aplicación, en [`README.md`](README.md).

---

## 1. El problema en una frase

El área administrativa transcribe a mano, entre 8 y 12 veces al mes, los mismos datos de proveedor en
formularios distintos (Excel, PDF, portales de cliente), y cada transcripción es una oportunidad de
equivocarse en un dato que ya existe en su repositorio maestro. **Le duele a quien registra
proveedores**: dedica horas a copiar, y a quien revisa: no hay forma de saber de dónde salió cada
valor ni qué soporte falta antes de la firma.

El agente recibe la solicitud en lenguaje natural, **localiza los valores en el repositorio maestro**,
genera el formulario en el formato que pidió el cliente y arma el paquete de soportes, dejando
`listo_para_firma` a la vista. No firma ni envía: eso es humano y queda marcado como pendiente de
confirmación explícita.

---

## 2. Arquitectura

```
                    navegador
                       │  HTML/CSS/JS estático (web/), sin paso de build
                       ▼
        ┌──────────────────────────────┐
        │  front de chat · web/app.js  │   historial · tarjetas de herramienta
        └──────────────┬───────────────┘   indicador de trabajo · banda de confirmación
                       │  POST /api/chat (stream SSE) · GET /api/sessions/:id
                       │  GET /api/health · GET /api/files/<caso>/<ruta>
                       ▼
        ┌──────────────────────────────┐
        │  API HTTP · src/server.ts    │   Fastify · sirve el front y la API en el mismo puerto
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐        ┌──────────────────────────────┐
        │  ciclo del agente            │◀──────▶│  adaptador de proveedor      │
        │  src/agent/loop.ts           │        │  src/llm/ollama · openai ·   │
        │  tope 25 iteraciones         │        │  mock (guion sin modelo)     │
        │  tope 200 000 tokens/sesión  │        └──────────────────────────────┘
        │  sesiones en out/sessions/   │
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  herramientas · src/tools/   │   zod valida los argumentos antes de ejecutar
        │  proveedor_*                 │   nunca lanzan: devuelven { ok, error }
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  archivos · out/<caso>/      │   formulario.xlsx · pdf · paquete/ · log.jsonl
        └──────────────────────────────┘
```

**Dónde vive cada cosa** (la separación que evalúa el PRD §6.5):

| Capa | Archivo | Qué cambia sin tocar las demás |
|---|---|---|
| Comportamiento | `agent/prompt.md` | Tono, reglas de conversación, cuándo pedir confirmación |
| Conocimiento | `src/knowledge/registro-proveedor.md` | Requisitos por país, reglas de negocio, glosario de campos |
| Ejecución | `src/tools/*.ts` | Formato de salida, validación y escritura de archivos |
| Dictamen | `src/core/*.ts` (motor determinista) | Mapeo, vencimientos y veredicto de firma |

Las rutas de datos están confinadas: todo se resuelve relativo a una raíz declarada y ninguna
herramienta acepta rutas absolutas (`src/core/rutas.ts` · `resolverDentro`). El nombre del caso lo
propone el modelo, así que se valida contra `^[a-zA-Z0-9][a-zA-Z0-9_-]*$` antes de tocar el disco.

---

## 3. Ciclo del agente

`src/agent/loop.ts` implementa el bucle **modelo → herramientas → modelo** con dos topes y una regla
de seguridad:

1. El usuario envía un mensaje; el ciclo arma el historial (sistema + turnos) y llama al proveedor con
   los esquemas JSON de las cinco herramientas.
2. Si el modelo pide herramientas, cada argumento se **valida con zod** antes de ejecutar. Si no
   cumple, el error vuelve al modelo como resultado tipado y el ciclo continúa (no muere).
3. Cada herramienta devuelve **string JSON** con `{ ok: true, data }` o `{ ok: false, error }` y
   **nunca lanza excepciones** (HU-5). Cada ejecución se añade a `out/<caso>/log.jsonl`: es la traza de
   RN5 y lo que el front muestra como tarjeta.
4. El bucle termina cuando el modelo responde sin pedir herramientas, o al alcanzar el **tope de 25
   iteraciones** (`MAX_ITERACIONES`), o el **tope de 200 000 tokens por sesión** (`MAX_TOKENS_SESION`).
   En los dos topes el agente responde con lo que tiene y lo explica, en vez de cortar la sesión.
5. La sesión (`out/sessions/<id>.json`) guarda historial, turnos, tokens acumulados y la **acción
   pendiente**.

### La confirmación humana (CA3 · RN4)

`proveedor_simular_envio` **no envía nada**: deja una constancia `ENVIO-SIMULADO.md`. El ciclo impone
`confirmado = false` siempre que el modelo intente ejecutarla sin autorización previa
(`src/agent/paso.ts`), así que el modelo no puede autorizarse a sí mismo.

La señal de «falta un sí» se deriva **del resultado de la herramienta**, no del texto del modelo:
cuando `proveedor_armar_paquete` deja un paquete listo, el ciclo registra la acción pendiente
(`pendiente.descripcion`) y el turno cierra con `needsConfirmation: true`, que es lo que el front
convierte en la banda ámbar. El «sí» posterior solo autoriza **ese** caso
(`pendiente.argumentos.caso`), y quien decide es el backend: los botones de la interfaz son solo
atajos de tecleo para dos frases que el usuario podría escribir a mano.

### La corrección que salió de las pruebas

En la primera versión `needsConfirmation` era `false` en el camino normal: se calculaba desde
`sesion.pendiente`, que solo se llenaba cuando el modelo *intentaba* el envío sin permiso. Como el
flujo habitual es «el modelo arma el paquete y pregunta en prosa», la señal no llegaba nunca y el
front no tenía nada que resaltar. Se movió al resultado de la herramienta
(`docs/modelo-llm.md` §7.1). Medido en el E2E: turno 1 con `needsConfirmation: true` en 70 s y turno 2
(«envía») con `false` en 26 s.

---

## 4. Elección del modelo

**Elegido: `granite4.1:8b` servido por Ollama local.** Cambiar de proveedor o de modelo es cambiar
variables de entorno (`LLM_PROVIDER`, `OLLAMA_MODEL`); el ciclo del agente no toca ninguna API.

| Criterio | Por qué `granite4.1:8b` |
|---|---|
| Costo | $0 por caso: corre en la máquina, sin claves ni cuotas |
| Licencia | Apache 2.0 (IBM), sin restricciones de uso comercial |
| Tool calling | Soportado y **verificado en el E2E**: completa los dos turnos, incluida la confirmación |
| Tamaño | 5,3 GB cuantizado: entra con holgura en 16 GB de RAM junto al sistema y el KV cache |
| Sesgo de dominio | Orientado a empresa (GRC, compliance) y con salida JSON estructurada, que es el formato del contrato de herramientas |

**Descartados, con la razón medida** (tabla completa en `docs/modelo-llm.md` §3):

- `qwen3:4b-instruct` (2,5 GB): el más liviano, pero **no pasa el turno de confirmación**; se queda a
  medias con el «sí» del usuario.
- `qwen3:14b` (9,3 GB): no deja aire para el escritorio en 16 GB; los tiempos por turno se disparan.
- `qwen3:30b` / `granite4.1:30b` (17-19 GB): no caben.
- APIs de pago: se dejaron **como alternativa lista**, no como requisito, porque el PRD permite
  cualquier modelo y la clave tendría que ser del candidato.

### Tres hallazgos medidos que condicionan el uso

1. **La ventana por defecto no alcanza.** El prompt del sistema más los esquemas de las cinco
   herramientas rondan **4 179 tokens** y el valor por defecto de Ollama es 4 096, así que la petición
   fallaba con `request exceeds the available context size`. Se pide 8 192 (`OLLAMA_NUM_CTX`).
2. **Ollama devuelve los argumentos ya como objeto**, mientras que las APIs compatibles con OpenAI los
   mandan como string JSON. El adaptador normaliza las dos formas, con pruebas.
3. **Los modelos híbridos razonan antes de responder** (`think`), lo que cuesta latencia; se envía solo
   si se pide (`OLLAMA_THINK`), porque los que no razonan rechazan el campo.

### Costo estimado por caso

Medido en la sesión real de la demo (3 turnos con `granite4.1:8b`, registrado por el propio ciclo en
`out/sessions/`): **43 591 tokens → ≈14 500 tokens por turno**. Con un proveedor de pago y precios de
referencia de un modelo pequeño (0,15 USD por millón de tokens de entrada y 0,60 por millón de salida):

| Concepto | Cálculo | Costo |
|---|---|---|
| Un turno | ~14 000 in + ~500 out | ≈ 0,0024 USD |
| Un caso completo (procesar + confirmar el envío) | 2 turnos | ≈ **0,005 USD** |
| La carga real del área (8-12 casos/mes) | 12 × 0,005 | ≈ **0,06 USD/mes** |
| Local con Ollama | energía de la máquina | **0 USD** |

La cota de gasto no depende del modelo: el ciclo corta a las 25 iteraciones y a los 200 000 tokens
por sesión (≈14 turnos al ritmo medido), así que una sesión desbocada no puede consumir más que eso.
Los precios son de referencia y cambian; el número de tokens es el que cuenta, y está medido.

---

## 5. Diseño del portal web (PRD §7.4)

**Lo que hace hoy la aplicación.** El caso `pa-logistica-istmo` pide un portal web. El PRD es
explícito: ese formato **no se automatiza** (P2). El agente responde con la nota «formato no
soportado» y deja `out/pa-logistica-istmo/valores-portal.md`: los valores del repositorio maestro
ordenados como los pide el formulario, listos para copiar y pegar, más los campos pendientes de
confirmar (`src/tools/formato-portal.ts`). Es un entregable verificable: el archivo existe y el
humano decide si lo copia.

**Cómo lo abordaría si hubiera que automatizarlo.** Con el portal como ciudadano de primera, no como
un RPA frágil:

1. **Credenciales fuera del agente.** Viven en un gestor de secretos (Vault, AWS Secrets Manager) y las
   usa el *adaptador de navegador*, nunca el modelo. Ni el prompt, ni el historial de la sesión, ni
   `log.jsonl` ven una contraseña. Hoy el diseño ya separa «valores» de «secretos», así que no hay que
   reescribir el ciclo: se añade una herramienta que recibe un *handle* de credencial, no la clave.
2. **Navegador real, no coordenadas.** Playwright con localizadores semánticos (etiqueta, `aria-label`,
   texto del `<label>`) casados contra el mismo glosario de campos
   (`fixtures/reto-01/glosario-campos.json`) que ya usa el mapeo. Si una etiqueta no tiene
   equivalencia, el campo se marca **pendiente**; el agente no adivina.
3. **El paso humano donde toca.** MFA y CAPTCHA los resuelve una persona en la misma sesión del
   navegador (patrón *human in the loop*): el robot rellena, la persona aprueba y pulsa. El agente
   nunca envía solo, igual que con `proveedor_simular_envio` (RN4).
4. **Trazabilidad por campo.** Cada valor escrito se anota con su origen en el repositorio maestro, en
   el mismo `log.jsonl` que ya existe. Si mañana alguien pregunta «¿de dónde salió este RUC?», la
   respuesta está en el log, no en la memoria de nadie.
5. **Detección de cambios de plantilla.** Se guarda un sello del formulario (hash de sus etiquetas y
   orden) y, cuando cambia, el agente **avisa y para** en vez de rellenar a ciegas un formulario que ya
   no es el mismo.
6. **Un portal, una configuración.** Cada portal se declara con su mapa de etiquetas y su flujo; el
   motor (valores, reglas, veredicto de firma) es el mismo para todos.

**Alternativas descartadas:**

| Alternativa | Por qué no |
|---|---|
| RPA por coordenadas (clic en x,y) | Se rompe con un cambio de layout o un banner nuevo, y falla **en silencio** rellenando el campo equivocado |
| API privada del portal obtenida por scraping | Suele violar los términos de uso del cliente y se rompe sin aviso |
| Pedir usuario y contraseña en el chat | Las credenciales acabarían en el historial de la sesión y en los logs, que es justo lo que el PRD §8 prohíbe |
| Automatizar el envío final | Quita el control humano sobre un acto administrativo con consecuencias legales |

**Costo de llevarlo a producción:** una configuración por portal (etiquetas + flujo de login), del
orden de un día de trabajo cada una, con el motor actual reutilizado. El cuello de botella no es la
técnica: es que cada cliente tiene su portal.

---

## 6. Decisiones y trade-offs

### 6.1 Front estático sin build, en vez de un framework

**Decidido:** HTML, CSS y módulos ES servidos por el propio backend (`solucion/web/`).
**Descartado:** React o Svelte con bundler.
**Por qué:** el PRD §8 exige **un comando** y menos de dos minutos en una máquina limpia. Un bundler
añade paso de build, dependencias y un modo de fallo más (versión de Node, caché del bundler) a cambio
de reactividad que esta pantalla no necesita: su estado es una sesión y un turno en curso.
**Costo aceptado:** no hay componentes ni reactividad, así que el DOM se maneja a mano. Se compensa
con pruebas que **ejecutan** el front contra el backend (`test/front-navegador.test.ts`) y con la
marca de versión en pantalla más el *cache-busting* `?v=`, que evitan depurar una versión vieja
guardada en el navegador. Detalle en `docs/front-web.md`.

### 6.2 El dictamen es determinista; el modelo solo conversa

**Decidido:** mapeo, vencimientos y veredicto de firma son código (`src/core/`). El modelo decide *qué*
herramienta llamar y con qué caso; los **valores solo pueden salir del repositorio maestro**.
**Descartado:** dejar que el modelo redacte el formulario y declare «listo para firma».
**Por qué:** es el riesgo que el propio PRD §10 señala: un modelo puede «completar» un campo faltante
con un valor plausible. Aquí el borrador de correo no lleva datos bancarios (RN2) y el envío sin
confirmación se rechaza (RN4) porque lo impone el ciclo, no el prompt.
**Costo aceptado:** más ingeniería (glosario, reglas por país) y un motor que no «aprende». A cambio,
dos ejecuciones dan el mismo resultado y hay pruebas anti-alucinación que fallan si el modelo altera
un mapeo.

### 6.3 Los fixtures se usan en su sitio, no se copian

**Decidido:** la app vive en `solucion/` y lee `../fixtures/reto-01`; `FIXTURES_DIR` permite apuntar a
otra ubicación.
**Descartado:** copiar los fixtures dentro de `solucion/` para calcar la estructura del PRD §6.5.
**Por qué:** el PRD prohíbe modificarlos y los presenta como la variabilidad real del cliente.
Duplicarlos crea dos fuentes de verdad que divergen sin que nadie lo note.
**Costo aceptado:** una constante documentada (y un supuesto en §7). El `.zip` de entrega es la
carpeta `reto-01/`, así que los fixtures viajan igual.

### 6.4 El chat responde en streaming (SSE), con `?json=1` para automatizar

**Decidido:** `POST /api/chat` devuelve un stream SSE; el mismo endpoint devuelve JSON con `?json=1`.
**Descartado:** responder solo JSON completo.
**Por qué:** con el modelo local un turno tarda entre 60 y 70 segundos. Sin stream, la pantalla se
queda muda y parece colgada —fue exactamente lo que pasó en la primera prueba manual—; con stream, cada
tarjeta de herramienta aparece cuando ocurre, y el indicador cuenta los segundos.
**Costo aceptado:** parser incremental que guarda los eventos partidos entre dos trozos (probado con
streams reales troceados a mano) y un front más listo. `?json=1` mantiene el camino simple para
scripts, pruebas y automatizaciones.

### 6.5 Sesiones en disco, en vez de solo en memoria

**Decidido:** cada sesión es un archivo en `out/sessions/<id>.json` (historial, turnos, tokens y
acción pendiente).
**Descartado:** guardar el estado en la memoria del proceso.
**Por qué:** recargar el navegador no pierde nada, el front puede releer el estado real
(`GET /api/sessions/:id`) y en la defensa se puede abrir el JSON y ver la acción pendiente exacta.
**Costo aceptado:** no escala horizontal sin cambiar el almacenamiento; para 8-12 casos al mes es de
sobra. `out/` está ignorado por git.

### 6.6 `mock` como adaptador de primera clase

**Decidido:** `LLM_PROVIDER=mock` recorre la aplicación completa con un guion fijo de cuatro pasos.
**Descartado:** depender siempre de un modelo real.
**Por qué:** permite enseñar la app y correr las 119 pruebas **sin claves, sin red y sin descargar
5 GB**. La demo funciona en una máquina recién clonada.
**Costo aceptado:** hay que mantener el guion al día y evitar que se confunda con un agente: está
documentado como «no es un agente, es un guion», y el `/api/health` lo declara (`model: "guion"`).

---

## 7. Supuestos

1. **Los fixtures representan la variabilidad real de los clientes** (lo dice el propio PRD §10). En
   producción habrá plantillas peores: por eso el mapeo falla de forma explícita («campo faltante»)
   en vez de inventar un valor.
2. **El repositorio maestro está actualizado y es un dato local.** Aquí es
   `fixtures/reto-01/repositorio/`; en producción necesita un **dueño del dato** y una integración con
   el ERP o CRM del área, que este reto no incluye.
3. **Node ≥ 22.18.** El PRD habla de «Bun o Node 20+», pero la aplicación ejecuta TypeScript
   directamente con el borrado de tipos nativo, que no existe en Node 20. Está declarado en
   `package.json` (`engines`) y en el `README.md`.
4. **La fecha de ejecución es la del sistema**, salvo que se fije `FECHA_EJECUCION`. Es deliberado y
   tiene consecuencia: los vencimientos de soportes y el veredicto de firma cambian con el tiempo, y
   por eso la variable existe (reproducibilidad en `demo.ts` y en las pruebas).
5. **El formato pedido viene declarado en la solicitud.** `solicitud.json` dice si es `xlsx`, `pdf` o
   `portal`, y los casos que no son Excel traen `plantilla-campos.json`. El agente no tiene que
   adivinar el formato desde el texto del correo.
6. **Un usuario por sesión, sin autenticación.** El PRD permite un link público, así que no hay login;
   el aislamiento es por `sessionId` y el estado queda en `out/sessions/`.
7. **El envío real está fuera de alcance** (PRD §2.3 y la pregunta abierta de §10): la firma
   electrónica y el envío al cliente no se implementan. El agente prepara y **simula**, dejando
   constancia en `ENVIO-SIMULADO.md`.
8. **Datos ficticios.** No hay credenciales ni datos personales reales en el repositorio ni en los
   fixtures (PRD §8).
9. **Los fixtures se leen en su sitio original** (`../fixtures/reto-01` respecto a `solucion/`). En la
   imagen Docker se copian a `/fixtures/reto-01`, que es exactamente la misma ruta relativa, así que el
   comportamiento no cambia entre local y contenedor.

---

## 8. Cobertura

Todas las historias del PRD §5 están implementadas y verificadas. La columna «dónde se comprueba»
apunta al archivo real, no a una promesa.

| HU | Qué pide | Estado | Dónde se comprueba |
|---|---|---|---|
| **HU-1** · Leer la solicitud | Extraer país, cliente, formato, campos y soportes pedidos | **Hecho** | `src/tools/proveedor.ts` (`proveedor_leer_solicitud`), `src/core/solicitud.ts`, casos de `test/` |
| **HU-2** · Mapear campos al maestro | Llenar desde el repositorio maestro y decir qué falta y qué requiere confirmación | **Hecho** | `src/core/mapeo.ts` + `glosario-campos.json`; pruebas de mapeo, reglas por país y anti-alucinación |
| **HU-3** · Generar el formulario | Excel (P0), PDF (P1) y portal (P2) | **Hecho** | `src/tools/formulario.ts`, `formato-xlsx.ts`, `formato-pdf.ts`, `formato-portal.ts`; el xlsx marca en ámbar los campos por confirmar |
| **HU-4** · Armar el paquete para firma | Checklist de soportes, veredicto `listo_para_firma` y bloqueos | **Hecho** | `src/tools/paquete.ts`, `paquete-textos.ts`; pruebas de soportes y vencimientos |
| **HU-5** · Manejo de errores | Errores legibles, sin excepciones y sin tumbar la sesión | **Hecho** | Contrato tipado `{ ok, error }` en todas las herramientas + CA5 en `test/api.test.ts` y `test/bucle*.test.ts` |
| CA3 · Confirmación humana | Resaltar el turno que espera un «sí» | **Hecho** | `needsConfirmation` + `pendiente` en `src/agent/paso.ts`; banda ámbar y prueba de regresión del front |
| CA4 · Herramientas visibles | Ver cada llamada con su resumen y su traza | **Hecho** | Tarjetas en el front (`web/app.js`) y `out/<caso>/log.jsonl` |
| RN2 · Sin datos bancarios | El borrador de correo no lleva datos de pago | **Hecho** | `test/tools.test.ts` («el borrador de correo no lleva datos bancarios») |
| RN4 · Nada se envía sin confirmación | El modelo no puede autorizarse | **Hecho** | `src/agent/paso.ts` fuerza `confirmado=false`; pruebas RN4 |
| RN5 · Trazabilidad | Registrar cada herramienta ejecutada | **Hecho** | `log.jsonl` por caso (`src/core/`), leído por el front |

### Qué falta para llevarlo a producción

| Falta | Por qué y qué haría |
|---|---|
| **Autenticación y multiusuario** | Hoy el link es público y las sesiones se identifican por `sessionId`. Iría a login corporativo (OIDC) y sesiones ligadas a usuario |
| **Repositorio maestro real** | Hoy son archivos en `fixtures/`. Tocaría integración de solo lectura con el maestro, con dueño del dato y sello de vigencia |
| **Firma y envío reales** | Fuera de alcance por el PRD. Necesitaría integración de firma electrónica y el visto bueno legal del área |
| **Automatización de portales** | Diseñada en §5, no implementada: una configuración por portal |
| **Persistencia escalable** | `out/sessions/*.json` sirve para una máquina; en producción iría a una base de datos con cola de trabajos |
| **Sello de plantillas** | Detectar cuándo el cliente cambia su formulario, para no rellenar a ciegas |
| **Observabilidad y costo** | Si se pasa a un proveedor de pago: métricas por caso, alerta por sesión y presupuesto mensual |
| **Verificación en navegador real** | La suite ejecuta el front con un DOM mínimo; un Playwright cerraría el hueco de CSS y pintado |

---

## 9. Uso de IA

**Qué asistió y qué se decidió aquí.** La aplicación se construyó con un asistente de IA como par de
programación (Cline, dentro de VS Code), dirigido por mí en cada fase. El asistente escribió código y
documentación; las decisiones de alcance, el modelo elegido y el criterio de lo que se descartaba se
tomaron y se comprobaron aquí, con la regla de que **cada fase cierra con pruebas y typecheck en verde**
antes de pasar a la siguiente:

| Fase | Qué entró | Cómo se cerró |
|---|---|---|
| F0 | Estructura, `.gitignore`, arquitectura validada | Commit de baseline + diagrama |
| F1 | Motor determinista (mapeo, reglas por país, vencimientos) | Pruebas del motor + `demo.ts` |
| F2 | Herramientas `proveedor_*` con zod | Contrato de herramientas probado, incluidas las que lanzan |
| F3 | Ciclo del agente, sesiones y confirmación humana | Pruebas del bucle y adaptadores (ollama/openai/mock) |
| F4 | Front de chat con tarjetas y banda de confirmación | Pruebas que **ejecutan** el front contra el backend |
| F5 | Docker, README y este documento | `docker compose up --build` probado de punta a punta |

**Lo que descarté de lo que me propuso la IA, y por qué:**

- **`qwen3:4b-instruct` como modelo por defecto**: era la opción más liviana, pero al medirla **no
  pasaba el turno de confirmación**. Se cambió a `granite4.1:8b` (5,3 GB) y se documentó la medición.
- **Un framework de front con bundler**: añadía un paso de build y dependencias a cambio de
  reactividad que esta pantalla no necesita (PRD §8 pide un comando y menos de dos minutos).
- **Dejar el veredicto de firma al modelo**: el PRD §10 señala el riesgo de que «complete» un campo
  faltante. El dictamen quedó en código determinista; el modelo conversa y pide herramientas.
- **Copiar los fixtures dentro de la app** para calcar la estructura del PRD: crea dos fuentes de
  verdad de un material que no se puede modificar.

**Los tres fallos que la IA no vio y las pruebas sí** (los tres están hoy cubiertos por una prueba de
regresión, que es la parte que importa):

1. El CSS de `.pensando` y `.confirmacion` fijaba `display: flex`, así que el `hidden` del HTML no
   hacía nada: la pantalla abría pidiendo una confirmación que nadie había pedido.
2. `enviar()` llamaba a `limpiarAviso()`, una función que **no existía**; el turno moría con
   `limpiarAviso is not defined` y el botón Enviar parecía no hacer nada. Lo cazó la prueba que ejecuta
   el front, añadida después.
3. `pintarTexto()` repintaba el cuerpo del turno completo, así que **borraba las tarjetas de
   herramienta** ya pintadas: CA4 se perdía al cerrar el turno.

Los tres se encontraron **ejecutando**, no leyendo: la lección que quedó en el repositorio es que una
suite que no lanza el front no prueba el front. El modelo real (`granite4.1:8b`) también aportó
hallazgos: la ventana de contexto, los argumentos como objeto y el ruido del razonamiento están
documentados en `docs/modelo-llm.md` con sus mediciones.

**Declaración final del uso de IA.** El único asistente usado para construir el entregable fue **Cline**
(extensión de VS Code), y su papel está acotado en lo de arriba: propuso el código, la documentación y las
pruebas, que yo dirigí, revisé y acepté o descarté fase por fase, sin pasar a la siguiente hasta tener
`npm test` y `npm run typecheck` en verde.

En **tiempo de ejecución** el entregable no llama a ningún servicio de IA de terceros: el modelo del agente
es local (`granite4.1:8b` en Ollama), así que no envía datos del proceso a ninguna API y no necesita la
clave de nadie. Si se decidiera usar un proveedor de pago, la clave viviría solo en la variable de entorno
del backend (§4) y el cambio sería una variable, no un rediseño.

---

## 10. Riesgos de llevarlo a producción

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El cliente cambia la plantilla de su formulario | **Alto**: se rellenarían campos equivocados | Hoy el mapeo falla de forma explícita («campo faltante») en vez de inventar; en producción, un sello/hash de la plantilla que avise y pare |
| El repositorio maestro está desactualizado | **Alto**: un dato obsoleto acaba en un documento firmado | Dueño del dato + fecha de vigencia visible, y el veredicto de firma ya bloquea con soportes vencidos o ausentes |
| El modelo «completa» un valor que no está en el maestro | Alto | Los valores solo pueden salir del mapeo determinista; hay pruebas anti-alucinación que fallan si el modelo altera un campo |
| El modelo intenta ejecutar acciones sin autorización | **Alto** | RN4 se impone en el ciclo (no en el prompt): `confirmado=false` forzado y acción pendiente atada al caso |
| Fuga de credenciales o de datos | **Alto** | Claves solo por variable de entorno, nunca en el repositorio, los logs ni las respuestas; datos ficticios en todo el reto |
| Costo descontrolado si se usa un proveedor de pago | Medio | Topes de 25 iteraciones y 200 000 tokens por sesión, ya implementados; en producción, presupuesto y alertas por sesión |
| Latencia del modelo local (60-70 s por turno) | Medio | Streaming SSE + contador visible; alternativa de API de pago lista para cambiar con una variable |
| Portal con MFA o CAPTCHA | Medio | Paso humano en la misma sesión del navegador (§5); el agente nunca envía solo |
| Dependencia de un único proveedor de modelo | Bajo | Adaptador intercambiable: `LLM_PROVIDER=ollama|openai|mock` sin tocar el ciclo |
| Pérdida de sesiones en disco | Bajo | Volumen persistente con Docker (ya configurado); en producción, base de datos |
| El link público sin autenticación expone la herramienta | Medio | Es lo que el PRD permite; en producción, OIDC y sesiones por usuario |
