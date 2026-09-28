# Puesta en marcha del repositorio Git

> Reto 01 · Agente de Registro como Proveedor · Periferia IT Group
> Guía ejecutable paso a paso. Ejecuta los bloques en orden.

---

## 0. Dos decisiones, en orden

### 0.1 Un repositorio por reto (decidido)

Verificado en los tres PRD (§0, §9.1, §9.4, §9.5) y en las fixtures — no es una suposición:

| Evidencia | reto-01 | reto-02 | reto-03 |
|---|---|---|---|
| Artefacto de entrega (§9.5) | `reto-01-<apellido>.zip` | `reto-02-<apellido>.zip` | `reto-03-<apellido>.zip` |
| Fixtures (§7.1) | `casos/` + `repositorio/` + `glosario-campos.json` | `buzon/msg-00N` + `comerciales.json` + `maestro-contratos.csv` | `solicitudes/sol-00N` + `maestros/*.json` |
| Secciones de `SOLUCION.md` (§9.1) | 10 | 11 (añade extracción y regla de gobierno) | propio |
| Entregable extra | — | propuesta de regla de gobierno (1 página) | — |
| `modulo/` (§9.4) | `tools/proveedor.ts` + `skill/registro-proveedor/` | `tools/contratos.ts` + `skill/registro-contratos/` | `tools/oc.ts` + `skill/ordenes-compra/` |
| Rúbrica y link de prueba | 70/100 + link propios | 70/100 + link propios | 70/100 + link propios |

Los tres PRD repiten en su ficha: *"Construir un agente conversacional completo e
**independiente**"*, *"**El reto es independiente**"*, y el documento se entrega *"al inicio de la
sesión"*. Los paths de datos embeben el número del reto (`fixtures/reto-0N/…`) y en la carpeta
contenedora no hay nada compartido (ni README, ni workspace, ni `package.json`).

**Conclusión:** la entrega se juzga por reto → **un repositorio por reto**, con la raíz en la
carpeta del reto. Un monorepo con los tres obligaría a tallar el `.zip` de cada reto y dejaría
código de otro reto dentro de "su" entrega.

### 0.2 Dónde vive la raíz de ese repositorio

Esta decisión cambia las rutas de los comandos (no el `.gitignore`, que es raíz-agnóstico).

| Opción | Raíz | Ventajas | Costos |
|---|---|---|---|
| **A (recomendada)** | `reto-01/` | Cero duplicación de fixtures; el `.zip` `reto-01-<apellido>.zip` es exactamente esta carpeta; `fixtures/` queda en su sitio original e intacto | La app vive en `solucion/`, así que la ruta de los fixtures es `../fixtures/reto-01` (una sola constante, documentada) |
| B | `reto-01/solucion/` | La estructura interna queda plana como en el PRD §6.5 (`fixtures/` junto a `src/`, `web/`, `demo.ts`) | Hay que **copiar** los 21 fixtures dentro y mantenerlos sincronizados (dos fuentes de verdad) |

**Recomendación: A.** El PRD prohíbe modificar los fixtures y considera que representan la
variabilidad real de los clientes; duplicarlos es la forma más fácil de divergir sin darse
cuenta. La ruta se resuelve una sola vez en código (`FIXTURES_DIR`, con default
`../fixtures/reto-01`) y se declara como supuesto en `SOLUCION.md`.

Los comandos de abajo usan la **Opción A** (raíz `reto-01/`).

---

## 1. Archivos de control de versiones (ya creados)

| Archivo | Responsabilidad |
|---|---|
| `reto-01/.gitignore` | **Raíz del repo**: reglas de todo el árbol — secretos, dependencias, `out/*`, builds y cachés, logs, cobertura, basura del SO/IDE, tooling de agentes, salida de archify (`.archify/`), modelos locales y artefactos de entrega (`*.zip`). |
| `solucion/.gitignore` | **Portabilidad de la app**: solo lo mínimo para reutilizar `solucion/` como base de otro reto sin arrastrar basura. **No dupliques aquí las reglas del repo.** |
| `solucion/out/.gitkeep` | Git no versiona carpetas vacías; conserva `out/` sin versionar su contenido. |

### Resultado verificado del primer commit

Repliqué la estructura real en un repo de prueba y ejecuté `git add -A --dry-run`. **Esto es
exactamente lo que entraría al índice:**

```text
.gitignore
PRD.md
fixtures/reto-01/**                 ← los 21 archivos, sin modificar
solucion/.env.example
solucion/.gitignore
solucion/docs/**                    ← repo-setup.md + los diagramas
solucion/out/.gitkeep
```

Y esto **queda fuera del repo**, con la regla que lo excluye:

| Ruta | Regla aplicada |
|---|---|
| `solucion/.env` | `solucion/.gitignore:16` (`.env`) |
| `solucion/node_modules/**` | `solucion/.gitignore:13` |
| `solucion/out/formulario.xlsx`, `out/log.jsonl` | `solucion/.gitignore:21` (`out/*`) |
| `solucion/dist/**` | `solucion/.gitignore:25` |
| `solucion/.archify/**` | `.gitignore:95` (regla de la raíz) |
| `.DS_Store` **en la raíz** | `.gitignore:64` (regla de la raíz) |

> Ese último caso es el que obligó a tener un `.gitignore` en la raíz: sin él, un `.DS_Store`
> del nivel superior **sí** se versionaba, porque el archivo de `solucion/` no alcanza hacia
> arriba. Queda cubierto.

### Regla de Cline asociada

Existe una regla **global** en `~/Documents/Cline/Rules/gitignore-hygiene.md`: cada vez que Cline
cree, mueva o detecte un archivo que no debería versionarse, debe comprobar si está cubierto y, si
no, añadir el patrón al `.gitignore` que corresponda e informarlo en una línea.

Está en **global** (y no en `.clinerules/`) a propósito: así aplica sin importar qué carpeta abras
como workspace, y aquí vas a trabajar a veces en `reto-01/`, a veces en `reto-02/`. Si prefieres
versionarla y compartirla por git, cópiala a `<raíz-del-workspace>/.clinerules/` — las reglas de
workspace tienen precedencia sobre las globales.

---

## 2. Inicializar el repositorio

```bash
cd "/Users/oscarkof/Downloads/Retos IA Periferia IT Group/reto-01"
git init -b main
git config user.name  "Oscar Kofman"        # ajusta a tu nombre
git config user.email "tu@correo.com"       # ajusta a tu correo
git config core.autocrlf input              # evita ruido CRLF/LF si algún día editas en Windows
```

Comprobación rápida:

```bash
git rev-parse --is-inside-work-tree   # -> true
git branch --show-current             # -> main
```

---

## 3. Revisar ANTES de commitear (control de fugas)

Este paso es el importante: el PRD exige que la clave del modelo **nunca** aparezca en el
repositorio, ni en el front, ni en los logs. Verifica que git no vea nada de eso.

```bash
# 1) Qué va a entrar al índice (lo que NO está ignorado)
git status --short
git ls-files --others --exclude-standard

# 2) La prueba fiable de qué entraría al índice
git add -A --dry-run
#    -> deben aparecer SOLO archivos de trabajo (.gitignore, .gitkeep, docs/, .env.example…)
#    -> NO deben aparecer .env, node_modules/, out/log.jsonl ni dist/

# 3) Qué regla ignora cada cosa (ruta:línea:patrón)
git check-ignore -v solucion/.env solucion/node_modules/x solucion/out/log.jsonl solucion/dist/app.js
#    -> 4 líneas, cada una con la regla que la ignora

# 4) Cuidado al leer esa salida: un patrón que empieza por "!" NO es una exclusión,
#    es una re-inclusión; es decir, esos archivos SÍ se versionan.
git check-ignore -v solucion/.env.example solucion/out/.gitkeep
#    -> deben salir con los patrones "!.env.example" y "!out/.gitkeep"

# 5) Que no hay claves ni secretos en lo que se subiría
git ls-files | grep -iE '\.env$|secret|credential|api[_-]?key' || echo 'OK: sin archivos sensibles'
grep -rIlE 'sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|xoxb-|ghp_' . \
  --exclude-dir=.git --exclude-dir=node_modules || echo 'OK: sin claves detectadas'
```

Si algo falla, **detente y arréglalo antes del commit**; borrar un secreto después de un
commit obliga a reescribir historia.

---

## 4. Primer commit (setup del repo)

Se proponen **dos commits** para que el historial cuente la historia con claridad
(el PRD pide "repositorio Git con historial de commits"). Si prefieres uno solo, salta al 4.c.

**4.a · Baseline: lo que entregó Periferia (Opción A).** Deja registrado el punto de partida
sin mezclarlo con tu trabajo:

```bash
git add PRD.md fixtures/
git commit -m "chore(baseline): PRD y fixtures entregados por Periferia, sin modificar"
```

**4.b · Setup propio: estructura, ignores y arquitectura validada.**

```bash
git add .gitignore solucion/.gitignore solucion/out/.gitkeep solucion/docs/
git commit -m "chore(setup): estructura del proyecto, .gitignore y arquitectura validada con archify"
```

Mensaje equivalente en una línea, por si prefieres texto plano:
`chore(setup): estructura del repo, control de versiones y diagrama de arquitectura`

**4.c · Variante de un solo commit:**

```bash
git add -A
git commit -m "chore(setup): baseline del reto, .gitignore y arquitectura del agente"
```

> **Nota sobre carpetas vacías:** `agent/`, `src/*`, `web/`, `test/` y `modulo/` no se
> versionan hasta que tengan archivos reales (git no rastrea directorios vacíos). No se crean
> `.gitkeep` falsos para "mostrar" la estructura: aparecerá sola al llegar F1 y F2 con código
> real. La única excepción es `out/`, que por diseño permanece vacía y sí necesita su `.gitkeep`.

---

## 5. Verificar después del commit

```bash
git log --oneline --stat
git ls-files | wc -l                     # inventario versionado
git ls-files | grep -c node_modules      # -> 0
git ls-files | grep -c '/out/'            # -> 1 (solo el marcador solucion/out/.gitkeep)
git status                               # -> "nothing to commit, working tree clean"
```

---

## 6. Convención para los commits de las fases siguientes

Conventional Commits con *scope* de la capa, una intención por commit:

| Fase | Mensaje sugerido |
|---|---|
| F1 | `feat(core): motor determinista de mapeo — glosario, reglas de país y vencimientos` |
| F2 | `feat(tools): herramientas zod proveedor_* + demo.ts reproducible sin modelo` |
| F3 | `feat(agent): ciclo del agente con tope de iteraciones, sesiones y confirmación humana` |
| F3 | `feat(llm): adaptador de proveedor con implementaciones ollama/openai/mock` |
| F4 | `feat(web): front de chat con tool-calls visibles y estado de confirmación` |
| F5 | `chore(deploy): Dockerfile, configuración de despliegue y README con el link de prueba` |
| F6 | `feat(modulo): agente empaquetado reutilizable + test de paridad con la app` |
| F6 | `docs(solucion): SOLUCION.md con arquitectura, decisiones, cobertura y riesgos` |

Con historial lineal basta para el entregable. Si quieres mostrar flujo de trabajo, usa
ramas por fase y cierra con `git merge --no-ff`, que deja el merge visible en el historial.

---

## 7. Remoto (opcional, cuando lo decidas)

```bash
git remote add origin git@github.com:<usuario>/reto-01-<apellido>.git
git push -u origin main
```

El remoto es independiente del *link de prueba* del deploy (§9.3 del PRD): son cosas distintas.

---

## 8. Checklist de seguridad antes de cada push

- [ ] `git ls-files | grep -i env` muestra **solo** `.env.example`
- [ ] Ningún diff contiene una clave (revisa `git diff --cached` antes del commit)
- [ ] `node_modules/`, `out/log.jsonl`, `out/sessions/` y `.env` no aparecen en `git ls-files`
- [ ] `fixtures/` sin modificaciones (`git status fixtures`)
- [ ] El `.zip` de entrega no incluye `node_modules/`, `out/` ni `.env`

