# CI/CD del panel: dónde está, cómo funciona y cómo leerlo

Guía de lectura para quien nunca miró el CI de este repo. Las guías de configuración (cargar credenciales, crear los
proyectos) están en [`ci-cloudflare.md`](ci-cloudflare.md) y [`ci-sonarqube.md`](ci-sonarqube.md); los nombres de
secrets y variables, en [`ci-variables.md`](ci-variables.md). **Acá no hay valores secretos**: el repo es público.

## 1. El mapa: qué workflows hay

Todo vive en `.github/workflows/`. En GitHub se ve en la pestaña **Actions** del repo
(`https://github.com/Colportores/front-coordinadores-web/actions`); a la izquierda aparece la lista de workflows.

| Workflow (nombre en Actions) | Archivo | Cuándo corre | Qué hace |
|---|---|---|---|
| **CI** | `ci.yml` | En cada PR y en cada push a `develop`, `staging`, `production` | Lint, typecheck, tests **con cobertura**, build, build del sitio de prueba y, solo en el push a `staging`, **análisis de SonarQube Cloud** |
| **Deploy Pages** | `deploy-pages.yml` | Solo a mano (o lo llama `staging.yml`, que también es solo manual) | Publica el sitio de prueba (datos simulados) en GitHub Pages |
| **Staging** | `staging.yml` | Solo a mano | Llama a Deploy Pages y al artefacto de demo con Supabase dev |
| **Deploy Cloudflare (staging)** | `deploy-cloudflare.yml` | Solo a mano (sobre `develop` o `staging`); desde el 11/11 (#105) ya no corre por push | Publica el mismo sitio de prueba en **Cloudflare Pages** |
| *(sin workflow)* **Vercel** | integración de Vercel con el repo (Git), no hay archivo en `.github/workflows/` | Push a las ramas que Vercel tenga habilitadas (ver sección 4) | Build y despliegue de staging con `next build` (con servidor), configurado en el panel de Vercel; deja el estado «Vercel» en el commit |
| **Production** | `production.yml` | Push a `production` o a mano | Despliegue de producción (Vercel, ADR-015); hoy falla a propósito sin sus variables |

El trabajo de #147 son tres piezas: el **paso de SonarQube dentro de CI**, el workflow **Deploy Cloudflare (staging)**
(hoy solo manual, ver sección 4) y las guías.

## 2. Cómo ver todo en GitHub, paso a paso

1. **Los workflows y sus corridas:** repo → pestaña **Actions**. Elegí un workflow a la izquierda para ver solo sus
   corridas. Cada fila es una corrida: verde (pasó), rojo (falló), amarillo (en curso), gris (cancelada).
2. **El detalle de una corrida:** hacé clic en la fila → se ven los *jobs* → clic en el job → se ven los pasos
   (*steps*) con su log. Para CI, el job se llama «lint + typecheck + tests + build (Docker)».
3. **En un PR:** abajo de la conversación está el recuadro de **checks**. «CI» tiene que estar en verde. El enlace
   *Details* lleva al log. Sonar no analiza los PRs (ver sección 5.2), así que no aparece su chequeo.
4. **Los secrets y variables:** a nivel organización en
   `https://github.com/organizations/Colportores/settings/secrets/actions` (y `…/variables/actions`), con acceso por
   repo. Ahí se ven solo nombres y fechas, nunca valores. A nivel repo: **Settings → Secrets and variables → Actions**.
5. **Los environments:** **Settings → Environments** (`staging`, `github-pages`). En la página principal del repo, la
   columna derecha **Deployments** lista cada despliegue con su URL.
6. **Correr un workflow a mano:** Actions → elegí el workflow → **Run workflow** → rama → **Run workflow** (solo los que
   tienen `workflow_dispatch`: Staging, Deploy Pages, Deploy Cloudflare, Production).
7. **El resultado de Vercel (staging):** en el commit o el PR, el estado «Vercel» con el enlace a su panel
   (`https://vercel.com/colportores/front-coordinadores-web/…`); la URL pública del despliegue está ahí. Si se corrió a
   mano Deploy Cloudflare: el resumen (*Summary*) de la corrida y el panel de Cloudflare (Workers & Pages → el proyecto).
8. **El resultado de Sonar:** en <https://sonarcloud.io> → organización → proyecto (sección 5).

## 3. Qué pasa en un PR (paso a paso)

1. Abrís o actualizás un PR hacia `develop`.
2. Arranca **CI**. Construye la imagen `dockerfile.dev` (la misma del desarrollo local).
3. Dentro del contenedor corre `npm run check`: lint, typecheck, tests, build y verificación de pestañas ocultas. Los
   tests corren con `COVERAGE=1`: vitest deja `coverage/lcov.info` en una carpeta compartida con el runner.
4. Build del sitio de prueba (export estático con datos simulados) para asegurarse de que nada lo rompe.
5. **Paso de SonarQube:** en un PR **se salta**. Solo corre en el push a `staging` (sección 4 y 5.2).
6. Con CI verde y la revisión hecha, se mergea con squash.

## 4. Qué pasa al pasar a staging (paso a paso)

1. Se mergea `develop` → `staging` (push a `staging`).
2. **CI** corre en ese push y, solo ahí, sube el análisis a **SonarQube Cloud**. Los workflows **Staging** (GitHub
   Pages y demo con Supabase dev) y **Deploy Cloudflare (staging)** **ya no corren solos**: desde el 11/11 (#105) el
   único despliegue automático de staging es el de **Vercel**.
3. **Vercel** reacciona al push por su propia integración con Git, en paralelo con el CI: no hay workflow en este
   repo ni secretos de GitHub para esto (el `VERCEL_TOKEN` de `production.yml` es otra cosa y no interviene). Qué
   compila y con qué variables de entorno depende de la configuración del proyecto en el panel de Vercel (no verificable
   desde el repo; el repo no tiene `vercel.json`). El resultado queda como estado «Vercel» del commit.
4. **Lo que mira Cristian en Vercel** (no se ve desde el repo): Settings → Git → *Production Branch* (qué rama cuenta
   como producción de Vercel; por defecto es la rama por defecto del repo, hoy `staging`), si las demás ramas y los
   PR generan *Preview Deployments*, y Settings → Environment Variables (qué valores usa cada entorno).
5. **Deploy Cloudflare (staging)**, solo si se corre a mano (Actions → Run workflow, sobre `develop` o `staging`):
   1. Valida que existan `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_PROJECT_NAME`; si falta algo,
      falla diciendo cuál.
   2. Instala dependencias y corre `npm run build:pages` (con sus guardas: sin claves, `noindex`, aviso de datos
      simulados). **El token de Cloudflare no entra a este paso.**
   3. Arma la carpeta a publicar: el export va dentro de `/front-coordinadores-web/` (el `basePath` que necesita GitHub
      Pages) y la raíz redirige a esa carpeta.
   4. Publica con `wrangler pages deploy` (carga directa). Recién acá se usa el token. El sitio queda en
      `https://<proyecto>.pages.dev/front-coordinadores-web/`.

El despliegue actual de GitHub Pages **no se toca**: los dos conviven.

## 5. SonarQube Cloud a fondo

### 5.1 Qué es y para qué sirve

SonarQube Cloud (antes SonarCloud) es un servicio que **lee el código** y lo califica: busca errores probables,
agujeros de seguridad, código difícil de mantener, duplicado o sin tests. No ejecuta la app ni reemplaza a los tests:
mira el código y la **cobertura** (qué porcentaje del código recorren los tests) que le mandamos. Es gratis para
repositorios públicos como este.

### 5.2 Cómo funciona acá

1. El CI corre los tests con cobertura y genera `coverage/lcov.info` (un archivo de texto: por cada archivo, qué líneas
   se ejecutaron).
2. La acción `sonarqube-scan-action` lee `sonar-project.properties` (qué carpetas son código, cuáles son tests, dónde
   está el `lcov`) y sube todo a SonarQube Cloud con el `SONAR_TOKEN`.
3. SonarQube Cloud analiza, calcula las métricas y evalúa el **quality gate** (la nota de aprobado/reprobado).
4. El resultado se ve en su web.

**Cuándo corre:** solo en el **push a `staging`**, que es la rama principal del proyecto en Sonar. Es a propósito: el
plan Free de SonarQube Cloud analiza **una sola rama** y tiene un cupo limitado, y con varios agentes abriendo PRs todo
el día se gastaría enseguida. En los PRs el paso se salta; `develop` y `production` no se analizan (aparecen como
«Not analyzed»). Para analizar otra rama o cada PR hace falta otro plan (Team) o el plan Open Source.

El análisis es **desde el CI** (no «Automatic Analysis»): es la única forma de que entre la cobertura. Por eso la
Automatic Analysis tiene que estar apagada.

### 5.3 Vocabulario básico

| Concepto | Qué significa |
|---|---|
| **Issue** | Un hallazgo en el código. Tiene tipo (abajo), severidad y la línea exacta |
| **Bug** | Código que probablemente falla en ejecución (ejemplo: usar un valor que puede ser `undefined`) |
| **Vulnerability** | Un agujero de seguridad explotable (ejemplo: armar una consulta con texto del usuario sin escapar) |
| **Security hotspot** | Código sensible que **una persona tiene que revisar** y marcar «seguro» o «arreglar»; no es un error seguro |
| **Code smell** | Problema de mantenimiento: función enorme, código muerto, complejidad alta, nombres confusos |
| **Coverage** | % de líneas (nuevas o totales) que ejecutan los tests |
| **Duplications** | % de líneas repetidas en bloques |
| **Rating (A a E)** | Nota por área: *Reliability* (bugs), *Security* (vulnerabilidades), *Maintainability* (deuda). A es la mejor |
| **Technical debt** | Estimación en tiempo de lo que costaría arreglar todos los code smells |
| **New Code** | El código cambiado desde una referencia (la versión anterior o una rama). **Lo que más importa**: el gate mira el código nuevo, no el viejo |
| **Quality gate** | Conjunto de condiciones sobre el New Code. Pasa (verde) o falla (rojo) |

### 5.4 El quality gate «Sonar way»

Es el predeterminado. Sobre el **código nuevo** pide, en general (los números exactos se ven en *Project Settings →
Quality Gate*):

- Sin bugs ni vulnerabilidades nuevos (ratings de Reliability y Security en A).
- 100 % de los *security hotspots* nuevos revisados.
- Deuda nueva con Maintainability en A.
- Cobertura del código nuevo de al menos 80 %.
- Duplicación del código nuevo de a lo sumo 3 %.

Un PR que toca poco código y lo cubre con tests lo pasa fácil. Uno que agrega 300 líneas sin tests falla por cobertura.

### 5.5 Cómo leer el resultado (primera vez, paso a paso)

1. Entrá a <https://sonarcloud.io> con GitHub → elegí la organización → el proyecto del panel.
2. **Overview:** arriba está el estado del gate («Passed» o «Failed») y las tarjetas del *New Code*: Security, Reliability,
   Maintainability, Hotspots, Coverage, Duplications. Hacé clic en cualquier tarjeta para ver el detalle.
3. **Pull Requests** (menú superior): lista cada PR analizado con su gate. Entrá al PR que te interese.
4. **Issues:** filtros a la izquierda (tipo, severidad, archivo). Abrí un issue: muestra la línea, **por qué es un
   problema** y cómo arreglarlo (pestaña *Why is this an issue?* / *How can I fix it?*).
5. **Code (Measures):** navegás por carpetas; cada archivo muestra su cobertura línea por línea (verde = cubierta, rojo
   = sin cubrir).
6. **Qué hacer con un issue:**
   - Es real → se arregla en el mismo PR.
   - Es falso positivo → *Resolve as → False positive* con un comentario que explique por qué.
   - Es real pero se acepta → *Resolve as → Accepted* (queda registrado).
   - Un *hotspot* → *Review* → «Safe» (con justificación) o «Fixed».
7. **Primera vez:** probablemente haya muchos issues del código existente. No hace falta arreglarlos todos: mirá solo
   el **New Code** y que los PRs nuevos no empeoren la nota.

### 5.6 Por qué hoy no frena el merge

La decisión del #147 es arrancar **solo con informe**: el paso del CI usa `continue-on-error` y no espera el gate. Así
se ve cómo se comporta con este código sin trabar a nadie. Cuando se quiera exigirlo:

0. Primero habría que analizar también los PRs (hoy el paso corre solo en el push a `staging`, ver 5.2).
1. En el workflow, agregar `-Dsonar.qualitygate.wait=true` a los `args` y quitar `continue-on-error`.
2. En **Settings → Rules → Rulesets** de `develop`, marcar el chequeo de SonarQube como requerido.

Es una decisión del equipo, no un cambio técnico menor: conviene hacerla cuando el New Code venga en verde de forma
estable.

### 5.7 Reproducir la cobertura en tu máquina

Siempre en Docker (nunca `--build`):

```bash
docker compose -f compose.dev.yml run --rm -e COVERAGE=1 app npx vitest run --maxWorkers=2
```

Deja `coverage/lcov.info` (para Sonar) y `coverage/lcov-report/index.html` (un informe que se abre en el navegador). La
carpeta `coverage/` está en `.gitignore`. `--maxWorkers=2` evita que el contenedor local se quede sin memoria.

### 5.8 Problemas frecuentes

| Síntoma | Causa y arreglo |
|---|---|
| El paso de Sonar no aparece o dice «skipped» | Falta `SONAR_TOKEN`, `SONAR_ORGANIZATION` o `SONAR_PROJECT_KEY`, o el PR viene de un fork (los forks no reciben secrets). Es lo esperado |
| Error «You are running CI analysis while Automatic Analysis is enabled» | Apagá *Administration → Analysis Method → Automatic Analysis* |
| Cobertura 0 % en Sonar | El `lcov.info` no se generó (tests rojos) o las rutas no coinciden con `sonar.sources`. Revisá `sonar.javascript.lcov.reportPaths` |
| Error 401 / «Not authorized» | Token vencido o revocado: se rota (ver `ci-sonarqube.md`) |
| Falla por «project not found» | `SONAR_PROJECT_KEY` o `SONAR_ORGANIZATION` mal escritos |
| El gate falla por cobertura en un PR chico | Faltan tests del código nuevo; el detalle por línea está en Code |

## 6. Otros problemas frecuentes del CI

| Síntoma | Causa y arreglo |
|---|---|
| El estado «Vercel» del commit no aparece o está en rojo | Se mira en el panel de Vercel (el log del build está ahí, no en Actions); el repo no tiene un workflow de Vercel para staging |
| Deploy Cloudflare (solo manual): «Faltan … CLOUDFLARE_…» | Falta un secreto o una variable: ver `ci-cloudflare.md` |
| Deploy Cloudflare: error de autenticación (código 10000) | Token vencido o sin el permiso `Cloudflare Pages: Edit` |
| Deploy Cloudflare: «Project not found» | El proyecto de Pages no existe o el nombre no coincide con `CLOUDFLARE_PROJECT_NAME` |
| CI rojo solo en tests con «Timeout waiting for worker» | El runner o el contenedor se quedó sin recursos: se re-corre el job |

## 7. Ejemplos reales de corridas fallidas (para mostrar cómo funciona el CI)

Todas son corridas **reales** del workflow CI de este repo. La columna «Por qué falló» sale del mensaje de error del log (no de revisar cada diff), así que es la causa más probable. Cada enlace lleva al log: abrí el job «lint + typecheck +
tests + build (Docker)» y el paso rojo «Check (lint, typecheck, tests, build)». El paso corre `npm run check`, que
encadena lint → typecheck → tests → build y **se corta en el primero que falla**, por eso cada ejemplo muestra un solo
tipo de error.

| Tipo de falla | PR / corrida | Qué falló | Por qué falló |
|---|---|---|---|
| **Lint** (ESLint) | [#141](https://github.com/Colportores/front-coordinadores-web/pull/141) · [corrida](https://github.com/Colportores/front-coordinadores-web/actions/runs/41978248551) | `'ESPERA_DEL_MAPA_MS' is defined but never used` | Dos constantes sin usar. El lint corre con `--max-warnings=0`: un *warning* ya cuenta como error |
| **Test de guarda del CI** | [#130](https://github.com/Colportores/front-coordinadores-web/pull/130) · [corrida](https://github.com/Colportores/front-coordinadores-web/actions/runs/41724909139) | `expected … to contain 'SUPABASE_REF_DEV: ohdsavwpasfpapbyutrv'` | Un test lee `production.yml` y exige que lleve esa línea; el PR cambió el workflow y el test quedó desactualizado |
| **Test de guarda del CI** | [#126](https://github.com/Colportores/front-coordinadores-web/pull/126) · [corrida](https://github.com/Colportores/front-coordinadores-web/actions/runs/40965092816) | `expected … to contain 'branches: [develop]'` | Otro test del workflow de la demo: el PR movió la rama a `staging` y el test seguía esperando `develop` |
| **Test de comportamiento (QA de vista)** | [#112](https://github.com/Colportores/front-coordinadores-web/pull/112) · [corrida](https://github.com/Colportores/front-coordinadores-web/actions/runs/40512310067) | `expect(element).toHaveTextContent()` en «sin acceso al buscar» | El texto o el enlace que mostraba la pantalla no coincidía con el que pedía la prueba |
| **Test con datos simulados** | [#75](https://github.com/Colportores/front-coordinadores-web/pull/75) · [corrida](https://github.com/Colportores/front-coordinadores-web/actions/runs/39975027927) | `expected { id: 'zona-art-0', … } to match object { nombre: 'Rampla', … }` | Las zonas simuladas no coincidían con las del diseño que verifica el test |
| **Test que usa una API de Next fuera de lugar** | [#76](https://github.com/Colportores/front-coordinadores-web/pull/76) · [corrida](https://github.com/Colportores/front-coordinadores-web/actions/runs/39982192891) | `cookies was called outside a request scope` | El código leyó las cookies de la sesión, algo que Next solo permite dentro de una petición; en el test no la había |
| **Test demasiado lento** | [#74](https://github.com/Colportores/front-coordinadores-web/pull/74) · [corrida](https://github.com/Colportores/front-coordinadores-web/actions/runs/39691200008) | `Test timed out in 5000ms` (exportar 500 colportores) | La prueba tardó más de 5 s en el runner de GitHub, que es más lento que una PC local. Es un fallo de rendimiento, no de lógica |
| **Mock desactualizado** (fallo heredado de otro PR) | [develop](https://github.com/Colportores/front-coordinadores-web/actions/runs/41982466652) y [#145](https://github.com/Colportores/front-coordinadores-web/actions/runs/42075558218) | `No "addProtocol" export is defined on the "maplibre-gl" mock` | Un PR agregó código que llama a `addProtocol` y el doble de otro test no lo definía. Quedó rojo `develop`, y todos los PRs que partían de ahí heredaron el rojo. Se arregló en el #149 |
| **Build** (Next/Turbopack) | [develop, 23/09](https://github.com/Colportores/front-coordinadores-web/actions/runs/35897790491) | `Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'` | La compilación no pudo resolver la fuente de Google del layout. No fallaron los tests: falló el paso `build` |
| **Infraestructura del CI** (propio de la cobertura) | [#149](https://github.com/Colportores/front-coordinadores-web/actions/runs/42097672700) | `EBUSY: resource busy or locked, rmdir '/app/coverage'` | Vitest intentó borrar `coverage/`, que en el CI es una carpeta montada desde el runner (volumen de Docker). Se arregló con `clean: false` |

### Qué muestran estos ejemplos

1. **El CI corta en el primer paso rojo:** lint, luego tipos, luego tests, luego build. Un error de lint ni llega a correr los tests.
2. **Casi todos los rojos son tests**, y de tres clases: el código no cumple lo que la prueba pide (#112, #75), el código cambió y la prueba quedó vieja (#130, #126, develop), o el entorno del test no se parece al real (#76, #74).
3. **Un rojo en `develop` se hereda:** cualquier PR que parte de ahí falla igual hasta que alguien lo arregle.
4. **Cada falla es corta de explicar:** el log trae el nombre del test, lo esperado y lo recibido.

### Qué no hay (todavía) en el historial

- **Typecheck:** no hay ninguna corrida fallida por tipos (`tsc`) en las últimas.
- **SonarQube:** el análisis es nuevo y nunca falló un quality gate. Para mostrarlo en vivo se puede abrir un PR de prueba (no se mergea) con un cambio que falle a propósito: un *warning* de lint, un error de tipos o un bloque de código nuevo sin tests (esto último hace fallar el gate de cobertura en Sonar). Pedilo y se arma.
