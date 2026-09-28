# Front de chat (F4)

> Chat del agente: historial, llamadas a herramienta visibles y estado de confirmación resaltado.
> Cubre el PRD §6.1 (front obligatorio) y los criterios CA3 y CA4.

---

## 1. Decisión: estático, sin build

El PRD §0 deja el front libre ("React, Svelte, Vue o HTML plano") y §8 exige que **un comando**
levante front y backend en menos de dos minutos en una máquina limpia. Con HTML plano:

- `npm run dev` es lo único que hay que correr: no hay paso de build ni de bundler;
- no se añade ninguna dependencia que justificar en `SOLUCION.md`;
- el backend ya servía estáticos, así que no hay que tocar la API.

El costo es que no hay componentes ni reactividad de framework; el estado de esta pantalla es
pequeño (una sesión, un turno en curso), así que el DOM directo se mantiene legible.

**Si algún día se migra a React o Svelte**, el backend no cambia: `src/server/front.ts` sirve
`web/dist` cuando existe y, si no, los estáticos de `web/`. El build entra en `dist/`, que ya está
ignorado por git.

## 2. Archivos y responsabilidades

| Archivo | Qué hace |
|---|---|
| `web/index.html` | Estructura: cabecera con el estado del backend, conversación, banda de confirmación, entrada, panel lateral de sesión y archivos |
| `web/estilos.css` | Estilos con variables CSS y una sola acento. Sin dependencias |
| `web/sse.js` | Parser del stream SSE, sin DOM: trocea, guarda el resto incompleto y decodifica. Es lo único del front con pruebas unitarias |
| `web/app.js` | Orquesta: envía, pinta cada evento, resalta la confirmación y ofrece las descargas |
| `src/server/front.ts` | Decide qué carpeta se sirve (`web/dist` o `web/`) |

`app.js` no usa `innerHTML`: el texto del modelo se convierte en nodos con `textContent`, así que
una respuesta con HTML no se ejecuta en el navegador.

## 3. El contrato con el backend

`app.js` consume `POST /api/chat` como **stream SSE** (el mismo endpoint que devuelve JSON con
`?json=1`). Cada evento del ciclo (`src/agent/eventos.ts`) se pinta así:

| Evento | Qué se hace en pantalla |
|---|---|
| `inicio` | Guarda el `sessionId` de la sesión |
| `llamada` | Abre una **tarjeta de herramienta** con nombre y argumentos (CA4) |
| `resultado` | Cierra esa tarjeta con su resumen y la colorea: verde si fue bien, rojo si falló |
| `texto` | Se va pintando el texto del agente (Markdown mínimo: encabezados, viñetas, negritas, `código`) |
| `aviso` | Banda ámbar dentro del turno (por ejemplo, un envío sin confirmación) |
| `error` | Pinta el turno en rojo. La sesión sigue viva (CA5) |
| `fin` | Cierra el turno; si `needsConfirmation` es `true`, se resalta la confirmación |

Después de cada turno, `app.js` relee `GET /api/sessions/:id` y de ahí saca dos cosas que no vienen
en el stream: los **turnos** de la sesión, la **descripción de la acción pendiente**
(`pendiente.descripcion`) y los **archivos generados** (de las respuestas de las herramientas). Los
archivos se ofrecen como enlaces a `/api/files/<caso>/<ruta>`, sin inventar rutas.

## 4. Cómo se resalta el estado de confirmación (CA3)

Cuando el ciclo cierra un turno con una acción pendiente, `fin` trae `needsConfirmation: true` y la
banda ámbar aparece con la descripción que el backend guardó en la sesión ("simular el envío del
caso …").

Sus dos botones **no autorizan nada**: son atajos de tecleo para dos respuestas que el usuario podría
escribir a mano —`sí, confirmo` y `no, espera`—. Quien decide es el backend: la detección vive en
`src/agent/confirmacion.ts` y el valor de `confirmado` lo impone el ciclo del agente, no el modelo ni
el front (RN4). Si el usuario escribe otra cosa, la banda se recalcula con la respuesta real.

## 5. Cómo probarlo

Sin modelo, con el guion fijo (no tarda nada):

```bash
cd reto-01/solucion
LLM_PROVIDER=mock npm run dev
```

Abre `http://127.0.0.1:3000` y escribe `procesa el caso co-industrias-delta`. Con el modelo real:

```bash
cd reto-01/solucion
npm run dev
```

y usa el prompt del PRD §11 (está entre las sugerencias de la pantalla, a un clic).

Qué mirar:

1. La insignia de la cabecera con el proveedor y el modelo, sin claves.
2. Las **tarjetas de herramienta** apareciendo una por una, con nombre, argumentos y resumen.
3. El indicador de trabajo, que avanza: primero "El agente está trabajando… · 12 s" y luego
   "Ejecutando proveedor_leer_solicitud… · 28 s". Con el modelo local la primera tarjeta tarda entre
   25 y 30 segundos y el turno completo entre 60 y 70, así que el contador no es adorno: es la señal
   de que la petición sigue viva.
4. La **banda ámbar** al cerrar el turno, porque armar el paquete deja el envío pendiente.
5. El botón "Sí, confirmo": desaparece la banda, la tarjeta de `proveedor_simular_envio` sale en
   verde y aparece `ENVIO-SIMULADO.md` en el panel de archivos (descargable).

### Un bug real que dejó este front, y su prueba

La primera versión marcaba `hidden` en `#pensando` y `#confirmacion`, pero el CSS fijaba
`display: flex` en `.pensando` y `.confirmacion`. Como una regla del autor pesa más que la del
navegador, **los dos se veían siempre**: la pantalla abría pidiendo una confirmación que nadie había
pedido e indicando que el agente estaba trabajando sin haber enviado nada, lo que hacía pensar que
estaba colgada. Se corrigió con `[hidden] { display: none !important }` y hay una prueba de regresión
en `test/web.test.ts` que falla si alguien quita esa regla mientras alguna clase de un elemento
oculto siga fijando `display`.


## 6. Lo que el front no hace, a propósito

- **No guarda estado en el navegador**: la sesión vive en el backend (`out/sessions/<id>.json`), así
  que recargar la página no pierde nada y "Nueva sesión" empieza de cero con otro identificador.
- **No interpreta HTML**: el Markdown se resuelve con nodos del DOM, así que una respuesta no puede
  inyectar scripts.
- **No tiene pruebas de DOM** (no hay jsdom ni navegador headless en la suite). Lo que sí se prueba
  en `test/web.test.ts`: que el backend sirve el front y no expone nada fuera de `web/`, que cada
  `#id` que usa `app.js` existe en `index.html`, y que el parser SSE lee correctamente un stream
  **real** del backend, incluidos los eventos partidos entre dos trozos.

