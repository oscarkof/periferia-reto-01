# Prueba funcional · cómo comprobarlo por tu cuenta

> Todo lo que hay aquí está **ejecutado y verificado** en esta máquina (macOS, Node 24, 16 GB de RAM,
> Ollama con `granite4.1:8b`). Los tiempos son medidas reales, no estimaciones.

Cuatro niveles, de menos a más costoso. **Los niveles 0 y 1 no necesitan ningún modelo**: sirven para
revisar el motor determinista y la API en dos minutos.

---

## 0 · Pruebas automáticas (~30 s, sin modelo)

```bash
cd reto-01/solucion
npm test            # 99 pruebas, 0 fallos
npm run typecheck   # 0 errores
node demo.ts        # los 4 casos, sin proveedor de lenguaje
```

Lo que debes ver en `node demo.ts`: `casos procesados: 4/4 · listos para firma: 2`. Imprime por caso los
campos llenos / por confirmar / faltantes, el estado de los soportes, el veredicto de firma y los
bloqueos. Es el motor determinista, sin modelo: si esto falla, el problema no es la IA.

Para ver además el envío simulado (con confirmación):

```bash
node demo.ts --envio
```

---

## 1 · La API sin modelo, con guion fijo (~2 min)

El adaptador `mock` repite un guion de cuatro pasos, así que permite recorrer la aplicación completa
sin descargar nada y sin claves. Revisa `src/llm/mock.ts`: **no es un agente**, es un guion.

En una pestaña:

```bash
cd reto-01/solucion
LLM_PROVIDER=mock npm run dev
```

**Abre `http://127.0.0.1:3000` en el navegador**: ahí está la interfaz de chat (historial, tarjetas de
cada llamada a herramienta, indicador de trabajo y banda de confirmación). Los `curl` de abajo sirven
para ver el mismo flujo sin navegador. Los detalles del front están en `docs/front-web.md`.

En otra pestaña:

```bash
# 1) estado del servicio: proveedor, modelo, herramientas y casos
curl -s http://127.0.0.1:3000/api/health

# 2) un turno completo, en JSON en vez de stream
curl -s -X POST 'http://127.0.0.1:3000/api/chat?json=1' \
  -H 'content-type: application/json' \
  -d '{"sessionId":"prueba-1","message":"procesa el caso co-industrias-delta"}'

# 3) el mismo turno, ahora como stream SSE (lo que consume el front)
curl -sN -X POST http://127.0.0.1:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"sessionId":"prueba-2","message":"procesa el caso co-industrias-delta"}'

# 4) el historial guardado de la sesión
curl -s http://127.0.0.1:3000/api/sessions/prueba-1

# 5) descargar lo generado (ábrelo en Excel)
curl -s -o /tmp/formulario.xlsx http://127.0.0.1:3000/api/files/co-industrias-delta/formulario.xlsx
open /tmp/formulario.xlsx
```

Comprobado con `LLM_PROVIDER=mock`: el turno devuelve `"needsConfirmation": true`, las tres llamadas
(`proveedor_leer_solicitud`, `proveedor_mapear_campos`, `proveedor_armar_paquete`), la sesión queda
guardada, el xlsx se sirve con su `content-type`, un `sessionId` inválido da **400** y una ruta
inexistente dentro de `out/` da **404**.

Dos cosas esperadas que **no** son fallos:

- El guion solo tiene cuatro pasos. Un segundo turno en la misma sesión responde
  `Guion de prueba agotado: no hay más pasos definidos.` y `needsConfirmation` sigue en `true`, porque
  nadie simuló el envío. Para recorrer la confirmación completa usa el nivel 2 (modelo real).
- El contador del guion es del adaptador, no de la sesión: dos sesiones seguidas comparten los pasos.

---

## 2 · El agente con el modelo local (~5 min, dos turnos)

Requisitos: Ollama en marcha y un modelo con tool calling. En esta máquina:

```bash
ollama list                      # granite4.1:8b debe aparecer
ollama pull granite4.1:8b        # 5.3 GB, si no está
```

Arranca el agente (sin `.env` también funciona: los valores por defecto apuntan a Ollama):

```bash
cd reto-01/solucion
cp .env.example .env             # opcional, para ajustar puerto o modelo
npm run dev
```

Con el navegador en `http://127.0.0.1:3000` la prueba es la misma, pero se ve cada llamada a
herramienta mientras ocurre. En otra pestaña de la terminal, **turno 1**: procesar un caso.

```bash
curl -s -X POST 'http://127.0.0.1:3000/api/chat?json=1' \
  -H 'content-type: application/json' \
  -d '{"sessionId":"mi-prueba","message":"Procesa el caso co-industrias-delta y dime si esta listo para firma"}'
```

Y **turno 2**: confirmar el envío con un "sí" explícito.

```bash
curl -s -X POST 'http://127.0.0.1:3000/api/chat?json=1' \
  -H 'content-type: application/json' \
  -d '{"sessionId":"mi-prueba","message":"si, envia"}'
```

### Qué debes ver (medido, `granite4.1:8b`)

| Turno | Tiempo | `needsConfirmation` | Herramientas que llama |
|---|---|---|---|
| 1 · procesar | **69 s** | **true** | `leer_solicitud` → `mapear_campos` → `armar_paquete` (`listo_para_firma: true`) |
| 2 · "sí, envía" | **17 s** | **false** | `simular_envio` (ok) → escribe `out/<caso>/ENVIO-SIMULADO.md` |

Los tiempos incluyen que Ollama cargue el modelo (unos 30 s la primera vez; el turno 1 sin esa carga
ronda los 40 s). En un caso **bloqueado** (`ec-corp-andina`) los turnos tardaron 70 s y 26 s, y el
veredicto fue `listo_para_firma: false`.

Ese `true → false` es la señal de la que depende el front: el turno 1 cierra con una acción pendiente
real y el turno 2 la consume. Puedes comprobarlo en los artefactos, no solo en la respuesta.

---

## 3 · Evidencias que puedes abrir

```bash
# el paquete completo: formulario, checklist, borrador de correo y soportes copiados
ls -R reto-01/solucion/out/co-industrias-delta

# la constancia del envío simulado (turno 2)
cat reto-01/solucion/out/co-industrias-delta/ENVIO-SIMULADO.md

# la traza de cada herramienta ejecutada (RN5 · CA4)
cat reto-01/solucion/out/co-industrias-delta/log.jsonl

# el historial del chat y la acción pendiente de la sesión
cat reto-01/solucion/out/sessions/mi-prueba.json
```

En `out/sessions/mi-prueba.json`, después del turno 1 y **antes** de confirmar, debe aparecer:

```json
"pendiente": {
  "herramienta": "proveedor_simular_envio",
  "argumentos": { "caso": "co-industrias-delta", "confirmado": true },
  "descripcion": "simular el envío del caso \"co-industrias-delta\""
}
```

Ese campo lo escribe el **ciclo**, no el modelo: es lo que hace que `needsConfirmation` sea verdadero
en el flujo normal y lo que obliga a que el "sí" sea para ese caso concreto (RN4).

Un caso bloqueado, para ver el otro camino: repite el turno 1 con `ec-corp-andina`. El veredicto debe
ser `No está listo para firma` **solo** por el soporte ausente
(`certificado_cumplimiento_tributario`), y del campo RUC por confirmar debe decir que no bloquea.

---

## 4 · Qué mirar si algo no cuadra

| Síntoma | Causa y solución |
|---|---|
| `request exceeds the available context size` | `OLLAMA_NUM_CTX` por debajo de 8192. El prompt más los esquemas rondan 4 200 tokens |
| El modelo no llama ninguna herramienta | Modelo sin soporte de tool calling, o demasiado pequeño. `qwen3:4b-instruct` no pasa el turno de confirmación; `granite4.1:8b` sí |
| `EADDRINUSE` | Otro proceso en el puerto. `PORT=3001 npm run dev`, y comprueba con `lsof -nP -iTCP:3000 -sTCP:LISTEN` |
| Va todo lentísimo y el turno pasa de 60 s | Falta de memoria. Comprueba `sysctl vm.swapusage` y `ollama ps`. **No descargues un modelo grande mientras haces inferencia**: con 16 GB, un 8B cuantizado es el techo cómodo |
| El modelo razona y no responde | Modelos híbridos: prueba `OLLAMA_THINK=false` (o `low`). Con modelos que no razonan, deja la variable sin definir |
| Un error del modelo no debe tumbar la sesión | Es intencional (CA5): el turno devuelve el error y la sesión sigue viva |

