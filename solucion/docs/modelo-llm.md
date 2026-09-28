# Elección y cambio de modelo

> Reto 01 · Agente de Registro como Proveedor · Periferia IT Group
> Qué modelo usa el agente, por qué ese y cómo cambiarlo sin tocar una línea de código.

---

## 1. El contrato: `LLM_PROVIDER` + `OLLAMA_MODEL`

El ciclo del agente no habla con ningún proveedor: habla con la interfaz
`AdaptadorLlm.enviar(mensajes, herramientas)`. Cambiar de modelo o de proveedor es
cambiar variables de entorno (todas documentadas en `.env.example`):

```bash
# local, sin claves (por defecto)
LLM_PROVIDER=ollama OLLAMA_MODEL=granite4.1:8b node src/server.ts

# API compatible con OpenAI (el ciclo del agente no cambia)
LLM_PROVIDER=openai OPENAI_API_KEY=... OPENAI_MODEL=gpt-4o-mini node src/server.ts
```

| Proveedor | Variable de modelo | Cuándo usarlo |
|---|---|---|
| `ollama` | `OLLAMA_MODEL` | Local, gratis, sin claves. Es el modo del entregable y de los E2E. |
| `openai` | `OPENAI_MODEL` | Si se quiere máxima fiabilidad de instrucciones, asumiendo clave y costo. |
| `mock` | — | Guion fijo sin modelo: permite recorrer la app entera y correr las pruebas. |

`GET /api/health` devuelve `provider` y `model` **ya resueltos**, así que la elección se puede
comprobar en caliente sin abrir el código:

```bash
curl -s http://127.0.0.1:3000/api/health
# {"ok":true,"provider":"ollama","model":"granite4.1:8b",...}
```

---

## 2. Tres hallazgos medidos que condicionan la elección

No son teoría: salen de correr el agente contra Ollama de verdad.

### 2.1 La ventana de contexto por defecto no alcanza → `num_ctx: 8192`

El prompt del sistema (`agent/prompt.md` + el conocimiento del proceso) más los esquemas JSON de
las cinco herramientas ronda **4 179 tokens**. El valor por defecto de Ollama es **4 096**, así que
la petición fallaba con `request exceeds the available context size`. El adaptador pide **8 192**
(`OLLAMA_NUM_CTX` para ajustarlo).

### 2.2 Ollama devuelve los argumentos como **objeto**, no como string

`message.tool_calls[].function.arguments` llega ya parseado en Ollama, mientras que las APIs
compatibles con OpenAI lo mandan como **string JSON**. El adaptador normaliza las dos formas antes
de salir, y eso está cubierto por pruebas.

### 2.3 Los modelos híbridos razonan antes de responder → `OLLAMA_THINK`

`qwen3` y otros exponen razonamiento previo (`think`), que cuesta latencia. El adaptador lo envía
**solo si se pide** (`OLLAMA_THINK=true|false|low|medium|high|max`) porque los modelos que no
razonan rechazan el campo. Un valor no reconocido se ignora en vez de romper el arranque.

---

## 3. Candidatos para una máquina de 18 GB de RAM

Capacidades declaradas por los autores en la biblioteca de Ollama; "contexto" es la ventana que
anuncia la ficha.

| Modelo | Tamaño | Contexto | Español | Tool calling | Notas |
|---|---|---|---|---|---|
| `qwen3:4b-instruct` | 2.5 GB | 256K | sí | sí | El más liviano. **Descartado para el E2E**: ver §4. |
| **`granite4.1:8b`** | 5.3 GB | 128K | **declarado** | sí | IBM, Apache 2.0, orientado a empresa (GRC, compliance) y con salida JSON estructurada. Modelo por defecto. |
| `qwen3:14b` | 9.3 GB | 40K | sí | sí | Misma familia que el 4B validado; más capaz y más lento. Alternativa. |
| `qwen3:30b` / `granite4.1:30b` | 19 GB / 17 GB | 256K / 128K | sí | sí | No entran con holgura en 18 GB de memoria unificada. |

Regla práctica: un modelo denso de 8B en cuantización Q4 (≈5 GB) deja aire para el sistema, el
servidor Node y el KV cache; a partir de 14B la memoria empieza a apretar y el tiempo por turno se
dispara.

---

## 4. Evidencia del ciclo real (dos turnos, confirmación humana)

La prueba que importa no es "responde bonito", es **si respeta la regla del turno 2**: cuando el
usuario dice "envía", el modelo debe llamar a `proveedor_simular_envio` y dejar la constancia
`ENVIO-SIMULADO.md`, incluso si el paquete está bloqueado (la constancia documenta el bloqueo).

| Modelo | Caso (paquete) | Turno 2 llama la herramienta | `ENVIO-SIMULADO.md` | Veredicto |
|---|---|---|---|---|
| `qwen3:4b-instruct` | `ec-corp-andina` (bloqueado) | **no** (`llamadas: 0`) | **no** | **Falló**: se negó a simular aunque la confirmación existía. |
| `granite4.1:8b` | `co-industrias-delta` (listo) | **sí**, `confirmado: true` | **sí** (`listo_para_firma: sí`) | **Pasa.** Turno 1 en 68 s, turno 2 en 17 s. |
| `granite4.1:8b` | `ec-corp-andina` (bloqueado) | **sí**, `confirmado: true` | **sí** (`listo_para_firma: no`) | **Pasa.** Turno 1 en 61 s, turno 2 en 60 s (inflado por swap: ver §6). |

En el turno 1 de cada caso el veredicto que reportó el modelo coincidió con el de la herramienta:
`listo_para_firma=true` para `co-industrias-delta` y `false` para `ec-corp-andina`, señalando el
soporte ausente `certificado_cumplimiento_tributario` como causa.

> Cuando el 4B se negó, la negativa no era ambigua: contestaba "no se puede simular el envío" con
> **cero llamadas**, ignorando la instrucción del prompt y el campo `siguiente_paso` que el propio
> contrato de `proveedor_armar_paquete` le devuelve. Es un límite de capacidad del modelo, no del
> prompt, y por eso se cambia de modelo en vez de seguir retocando texto.

---

## 5. Cómo reproducir la medición

```bash
ollama pull granite4.1:8b

# sesión 1: procesar el caso
curl -s -X POST "http://127.0.0.1:3000/api/chat?json=1" -H "content-type: application/json" \
  -d '{"sessionId":"prueba","message":"Procesa el caso \"co-industrias-delta\". Dime si el paquete está listo para firma y qué soportes debo actualizar. No envíes nada todavía."}'

# sesión 2: confirmar el envío (mismo sessionId)
curl -s -X POST "http://127.0.0.1:3000/api/chat?json=1" -H "content-type: application/json" \
  -d '{"sessionId":"prueba","message":"envía"}'

ls out/co-industrias-delta/ENVIO-SIMULADO.md
```

`?json=1` devuelve la respuesta completa (texto, `toolCalls`, `needsConfirmation`, `eventos`); sin
el parámetro, `POST /api/chat` responde por SSE.

---

## 6. Lección de entorno: la memoria manda

Medido en la misma corrida: mientras se ejecutaba el turno 2 de `ec-corp-andina`, había una descarga
de otro modelo (9.3 GB) en paralelo y la memoria unificada llegó al límite:

```
vm.swapusage: total = 19456 M · used = 18228 M      Pages free: 4048 (≈63 MB)
```

El turno pasó de 17 s a 60 s porque el modelo estaba paginando a disco: **4 s de CPU en 19 s de
reloj**. Dos conclusiones prácticas:

- **No descargues un modelo grande en paralelo a una prueba de inferencia.** El sistema entra en swap
  y el modelo que ya estaba cargado se ralentiza; los tiempos que midas no significan nada.
- **El techo cómodo de una máquina de 18 GB es un 8B cuantizado.** Un 14B (9.3 GB) no deja aire para
  el escritorio ni para el KV cache, así que `qwen3:14b` queda como alternativa teórica.

Antes de medir rendimiento, comprueba que no hay presión de memoria:

```bash
sysctl vm.swapusage        # "used" cerca de "total" = el modelo va a paginar
ollama ps                  # modelos cargados y su tamaño en memoria
```

