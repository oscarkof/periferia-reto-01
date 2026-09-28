# Proceso: registro como proveedor ante clientes

> Conocimiento del proceso que el agente consulta. No es comportamiento (eso vive en
> `agent/prompt.md`): aquí está **qué es verdad del negocio**, no cómo debe hablar el agente.

## 1. Qué resuelve

Periferia IT Group debe inscribirse como proveedor de sus clientes. Cada cliente envía un correo con
un formulario en su propio formato (Excel, PDF o portal web) y una lista de soportes. Hoy una
analista transcribe a mano, campo por campo, información que ya existe en el repositorio maestro.

Este proceso automatiza esa transcripción y **deja la firma y el envío en manos de una persona**.

## 2. Actores

| Actor | Qué hace |
|---|---|
| Recepción | Recibe el correo del cliente y lo deposita como caso. No usa el agente. |
| Analista administrativa | Conversa con el agente, revisa faltantes y aprueba el paquete. |
| Representante legal | Firma. Nunca interactúa con el agente. |
| Cliente | Solicita el registro. Fuera del sistema. |

## 3. Entradas de un caso

Cada caso es una carpeta en `fixtures/reto-01/casos/<caso>/`:

| Archivo | Qué aporta |
|---|---|
| `solicitud.json` | Correo normalizado: `id`, `de`, `asunto`, `fecha`, `pais`, `cliente`, `formato`, `cuerpo`, `adjuntos[]` |
| `plantilla-celdas.json` | Solo si `formato = xlsx`: `hoja`, `celda_etiqueta`, `etiqueta`, `celda_valor` |
| `plantilla-campos.json` | Solo si `formato = pdf` o `portal`: `etiqueta`, `obligatorio` |
| `soportes-exigidos.json` | Lista de tipos de soporte que exige ese cliente |

## 4. Fuentes de datos (nunca se inventa un valor)

| Fuente | Contenido |
|---|---|
| `repositorio/maestro.json` | Datos de Periferia en `snake_case`, incluidas claves anidadas (`banco.swift`, `representante_legal.identificacion`) |
| `glosario-campos.json` | Sinónimos: etiqueta que usa el cliente → clave del maestro |
| `repositorio/soportes/index.json` | Soportes con `tipo`, `archivo`, `vigencia_hasta` y `pais_emisor` |

**Regla de oro:** el único origen válido de un valor es una de estas fuentes. Si un campo pedido no
existe aquí, el campo es `faltante`; jamás se completa con un valor plausible.

**Quién escribe el valor:** `proveedor_generar_formulario` y `proveedor_armar_paquete` **recalculan** el
mapeo con el motor determinista antes de escribir. Si el agente les pasa un `mapeo`, se compara con el
suyo, la discrepancia se informa en `advertencias` y se escribe el del motor: un valor alterado no
llega al formulario nunca. Es a propósito, y por eso el argumento se acepta en vez de rechazarse: así
el desvío queda auditado en lugar de invisible.

## 5. Estados de un campo

| Estado | Cuándo | Qué significa para el humano |
|---|---|---|
| `lleno` | El glosario mapea la etiqueta **y** el maestro tiene el dato | Listo para escribir en el formulario |
| `requiere_confirmacion` | Regla de país (RN1), etiqueta genérica, o confianza < 0.8 | **Tiene valor**; una persona debe revisarlo. **No bloquea** `listo_para_firma` (ver RN3) |
| `faltante` | Sin mapeo o sin dato en el maestro | Hay que conseguirlo. No bloquea la firma, pero queda en el checklist |

El campo guarda siempre `ruta_dato` (de dónde salió) y `confianza` (1.0 exacto, 0.7 aproximado).

## 6. Estados de un soporte

| Estado | Cuándo | Efecto |
|---|---|---|
| `presente` | Está en el índice y `vigencia_hasta` es `null` o posterior a la fecha de ejecución | Ninguno |
| `vencido` | `vigencia_hasta` anterior a la fecha de ejecución | **Bloquea `listo_para_firma`** |
| `ausente` | El cliente lo exige pero no está en el índice | **Bloquea `listo_para_firma`** |

Un soporte que existe en el repositorio pero que el cliente no exige **no entra** en el checklist.

## 7. Reglas de negocio

### RN1 · Identificador tributario según el país

| País | Cómo se llama |
|---|---|
| CO | NIT |
| EC | RUC |
| PE | RUC |
| PA | RUC |
| HN | RTN |

Periferia solo tiene **NIT colombiano**. Cuando el cliente de otro país pide su identificador local,
el campo **se llena con el NIT** y se marca `requiere_confirmacion` con la nota
*"identificador extranjero"*: la analista decide si sirve o si hay que tramitar uno local.

Si la etiqueta es genérica (*"Identificación tributaria"*, *"Número de identificación fiscal"*), el
agente no asume: la marca `requiere_confirmacion` y propone el nombre local del país.

### RN2 · Datos bancarios

Se llenan **solo si la plantilla los pide explícitamente**. Nunca aparecen en el borrador de correo:
el correo no debe llevar número de cuenta.

### RN3 · Bloqueo de la firma

Bloquea `listo_para_firma`:
- un soporte exigido **vencido** (`vigencia_hasta` anterior a la fecha de ejecución);
- un soporte exigido **ausente** del repositorio.

**No** lo bloquea ningún campo del formulario, ni `faltante` ni `requiere_confirmacion`: se reportan
y la analista decide. **El veredicto lo deciden solo los soportes.** Una descripción que mezcle campos
con bloqueos es incorrecta: diría que el paquete no se puede firmar cuando sí se puede.

### RN4 · Nada se ejecuta sin confirmación explícita

El agente no envía, no firma y no carga a un portal sin confirmación del usuario **en el turno
inmediatamente anterior**. En este reto, "enviar" solo escribe `out/<caso>/ENVIO-SIMULADO.md`.

La simulación de envío **no está sujeta a `listo_para_firma`**: si la analista confirma, se simula
aunque el paquete esté bloqueado, porque la constancia es justamente lo que documenta el bloqueo.
Lo que nunca ocurre es firmar ni enviar de verdad.

### RN5 · Trazabilidad

Toda ejecución de una herramienta deja registro en `out/<caso>/log.jsonl` y en `out/log.jsonl` con
`{ ts, herramienta, ok, resumen }`. El historial del chat también es evidencia.

## 8. Formatos de salida

| Formato | Qué se produce | Cómo |
|---|---|---|
| `xlsx` | `out/<caso>/formulario.xlsx` | Se escribe cada valor en la **celda exacta** que indica `plantilla-celdas.json` (hoja + `celda_valor`) |
| `pdf` | `out/<caso>/formulario.pdf` | Se genera un PDF con cada etiqueta y su valor **en el orden** de `plantilla-campos.json` |
| `portal` | `out/<caso>/valores-portal.md` | **No se implementa el llenado.** El agente responde "formato no soportado" y deja los valores listos para copiar |

En los tres casos se genera además `out/<caso>/paquete/` con el checklist de soportes y
`borrador-correo.md` (sin datos bancarios).

## 9. Portales web en producción (diseño, no implementado)

Los portales con usuario y contraseña **no se automatizan en este reto**. Estrategia para una fase
posterior, por orden de preferencia:

1. **API oficial** del portal, si existe: es lo único estable y auditable.
2. **RPA con navegador controlado** (Playwright) para portales sin API, con límites explícitos:
   CAPTCHA y MFA lo rompen, los cambios de layout obligan a mantenimiento continuo.
3. **Extensión de navegador asistida**: el humano navega y la extensión autocompleta.

Límites y reglas de seguridad:

- Las **credenciales las ingresa el humano**, en su navegador. No se guardan en el repositorio, ni en
  el prompt, ni en los logs, ni en la sesión del agente.
- El **clic en "Enviar" es humano**. El agente prepara los valores; no los publica.
- Si el portal pide CAPTCHA o MFA, se detiene y se lo dice al usuario: no se intenta rodear.

Lo que el agente sí hace hoy: dejar `valores-portal.md` con etiqueta y valor en el orden del
formulario, listo para copiar y pegar.

## 10. Cómo responder a un error

Ninguna herramienta lanza excepciones: devuelve `{ ok: false, error }` con un mensaje entendible.

| Situación | Qué hace el proceso |
|---|---|
| El caso no existe o el nombre es inválido | Mensaje claro; se puede probar otro caso |
| La plantilla está corrupta | Mensaje claro y **seguir con lo que sí se puede**: el reporte de faltantes |
| El formato es un portal | No es un error del proceso: se genera `valores-portal.md` |
| El proveedor del modelo falla o expira | Mensaje claro en el chat; la sesión no muere |

## 11. Casos de referencia de los fixtures

| Caso | País | Formato | Qué lo hace interesante |
|---|---|---|---|
| `co-industrias-delta` | CO | xlsx (2 hojas) | Todo mapea; su cámara de comercio **vence pronto** |
| `hn-agroexport-sula` | HN | xlsx | RTN requiere confirmación; *Referencias comerciales* es `faltante`; **parafiscales vencidos** bloquean la firma |
| `ec-corp-andina` | EC | pdf | *Número de contribuyente especial* es `faltante`; falta el **certificado de cumplimiento tributario** |
| `pa-logistica-istmo` | PA | portal | Ejercita el camino "formato no soportado → valores listos para copiar" |

Los cuatro comparten país distinto, formato distinto y un motivo distinto de bloqueo: son la prueba
de que el motor no está ajustado a un caso concreto.

