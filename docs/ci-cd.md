# CI/CD del panel: dónde está, cómo funciona y cómo leerlo

Guía de lectura para quien nunca miró el CI de este repo. Las guías de configuración (cargar credenciales, crear los
proyectos) están en [`ci-cloudflare.md`](ci-cloudflare.md) y [`ci-sonarqube.md`](ci-sonarqube.md); los nombres de
secrets y variables, en [`ci-variables.md`](ci-variables.md). **Acá no hay valores secretos**: el repo es público.

## 1. El mapa: qué workflows hay

Todo vive en `.github/workflows/`. En GitHub se ve en la pestaña **Actions** del repo
(`https://github.com/Colportores/front-coordinadores-web/actions`); a la izquierda aparece la lista de workflows.

| Workflow (nombre en Actions) | Archivo | Cuándo corre | Qué hace |
|---|---|---|---|
| **CI** | `ci.yml` | En cada PR y en cada push a `develop`, `staging`, `production` | Lint, typecheck, tests **con cobertura**, build, build del sitio de prueba y **análisis de SonarQube Cloud** |
| **Deploy Pages** | `deploy-pages.yml` | Lo llama `staging.yml` (push a `staging`) o se corre a mano sobre `develop`/`staging` | Publica el sitio de prueba (datos simulados) en GitHub Pages |
| **Staging** | `staging.yml` | Push a `staging` o a mano | Llama a Deploy Pages y al artefacto de demo con Supabase dev |
| **Deploy Cloudflare (staging)** | `deploy-cloudflare.yml` | Push a `staging` o a mano (sobre `develop` o `staging`) | Publica el mismo sitio de prueba en **Cloudflare Pages** |
| **Production** | `production.yml` | Push a `production` o a mano | Despliegue de producción (Vercel, ADR-015); hoy falla a propósito sin sus variables |

El trabajo de #147 son tres piezas: el **paso de SonarQube dentro de CI**, el workflow **Deploy Cloudflare (staging)** y
las guías.

## 2. Cómo ver todo en GitHub, paso a paso

1. **Los workflows y sus corridas:** repo → pestaña **Actions**. Elegí un workflow a la izquierda para ver solo sus
   corridas. Cada fila es una corrida: verde (pasó), rojo (falló), amarillo (en curso), gris (cancelada).
2. **El detalle de una corrida:** hacé clic en la fila → se ven los *jobs* → clic en el job → se ven los pasos
   (*steps*) con su log. Para CI, el job se llama «lint + typecheck + tests + build (Docker)».
3. **En un PR:** abajo de la conversación está el recuadro de **checks**. «CI» tiene que estar en verde. El enlace
   *Details* lleva al log. Si Sonar está configurado, también aparece su comentario/chequeo del análisis.
4. **Los secrets y variables:** a nivel organización en
   `https://github.com/organizations/Colportores/settings/secrets/actions` (y `…/variables/actions`), con acceso por
   repo. Ahí se ven solo nombres y fechas, nunca valores. A nivel repo: **Settings → Secrets and variables → Actions**.
5. **Los environments:** **Settings → Environments** (`staging`, `github-pages`). En la página principal del repo, la
   columna derecha **Deployments** lista cada despliegue con su URL.
6. **Correr un workflow a mano:** Actions → elegí el workflow → **Run workflow** → rama → **Run workflow** (solo los que
   tienen `workflow_dispatch`: Staging, Deploy Pages, Deploy Cloudflare, Production).
7. **El resultado de Cloudflare:** en la corrida de Deploy Cloudflare, el resumen (*Summary*) muestra la URL
   publicada; también en Deployments. Y en el panel de Cloudflare: Workers & Pages → el proyecto.
8. **El resultado de Sonar:** en <https://sonarcloud.io> → organización → proyecto (sección 5).

## 3. Qué pasa en un PR (paso a paso)

1. Abrís o actualizás un PR hacia `develop`.
2. Arranca **CI**. Construye la imagen `dockerfile.dev` (la misma del desarrollo local).
3. Dentro del contenedor corre `npm run check`: lint, typecheck, tests, build y verificación de pestañas ocultas. Los
   tests corren con `COVERAGE=1`: vitest deja `coverage/lcov.info` en una carpeta compartida con el runner.
4. Build del sitio de prueba (export estático con datos simulados) para asegurarse de que nada lo rompe.
5. **Paso de SonarQube:** si existen `SONAR_TOKEN`, `SONAR_ORGANIZATION` y `SONAR_PROJECT_KEY` y el PR no viene de un
   fork, sube el análisis y la cobertura a SonarQube Cloud. Si algo falta, **se salta sin romper el CI**.
6. El resultado de Sonar es **solo informe**: no frena el merge (ver sección 5.6).
7. Con CI verde y la revisión hecha, se mergea con squash.

## 4. Qué pasa al pasar a staging (paso a paso)

1. Se mergea `develop` → `staging` (push a `staging`).
2. **Staging** dispara Deploy Pages (GitHub Pages) y la demo con Supabase dev, como antes.
3. **Deploy Cloudflare (staging)** arranca en paralelo:
   1. Valida que existan `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_PROJECT_NAME`. Por push, si falta
      algo, avisa y se salta; a mano, falla diciendo cuál falta.
   2. Instala dependencias y corre `npm run build:pages` (con sus guardas: sin claves, `noindex`, aviso de datos
      simulados). **El token de Cloudflare no entra a este paso.**
   3. Arma la carpeta a publicar: el export va dentro de `/front-coordinadores-web/` (el `basePath` que necesita GitHub
      Pages) y la raíz redirige a esa carpeta.
   4. Publica con `wrangler pages deploy` (carga directa). Recién acá se usa el token.
4. El sitio queda en `https://<proyecto>.pages.dev/front-coordinadores-web/`.

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
4. El resultado se ve en su web y, si está activada la integración con GitHub, en el PR.

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
| Deploy Cloudflare: «Faltan … CLOUDFLARE_…» | Falta un secreto o una variable: ver `ci-cloudflare.md` |
| Deploy Cloudflare: error de autenticación (código 10000) | Token vencido o sin el permiso `Cloudflare Pages: Edit` |
| Deploy Cloudflare: «Project not found» | El proyecto de Pages no existe o el nombre no coincide con `CLOUDFLARE_PROJECT_NAME` |
| CI rojo solo en tests con «Timeout waiting for worker» | El runner o el contenedor se quedó sin recursos: se re-corre el job |
