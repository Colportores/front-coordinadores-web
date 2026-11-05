# SonarQube Cloud: crear el proyecto y cargar el token

Guía paso a paso para conectar el repo con SonarQube Cloud (issue #147). **Acá nunca van valores**: el token se carga
directo en GitHub y no se escribe en archivos, commits, PRs ni capturas (el repo es público).

El análisis corre dentro del job de tests de `ci.yml`, con la cobertura de vitest (`coverage/lcov.info`). Al principio
es **solo informe**: el quality gate se muestra pero no frena el merge. Corre **solo en el push a `staging`**, que tiene
que ser la **rama principal** del proyecto en Sonar (*Administration → Branches and Pull Requests → Main branch*): el
plan Free analiza una sola rama y su cupo se gasta rápido si lo usa cada PR. Si el secreto `SONAR_TOKEN` no existe, el
paso se salta y el CI pasa igual.

## Qué se carga y dónde

| Nombre | Tipo | Dónde | Qué es |
|---|---|---|---|
| `SONAR_TOKEN` | **secreto** | repositorio u organización con acceso a este repo (Settings → Secrets and variables → Actions) | Token del proyecto en SonarQube Cloud. A nivel repositorio, no environment: el CI corre en PRs, no en un deploy |
| `SONAR_ORGANIZATION` | variable | repositorio | Clave de la organización en SonarQube Cloud |
| `SONAR_PROJECT_KEY` | variable | repositorio | Clave del proyecto (se ve en Project Information) |

La organización y la clave no son secretas, pero van como variables para no fijarlas en `sonar-project.properties`
mientras Cristian no confirme cuáles son.

## Paso a paso

### 1. Entrar y crear la organización

1. Entrá a <https://sonarcloud.io> (SonarQube Cloud) con **Log in with GitHub**.
2. **Import an organization from GitHub** → elegí la organización `Colportores`. Hace falta ser dueño/administrador de
   la organización de GitHub. Instala la app «SonarQubeCloud» en GitHub: dale acceso **solo** a
   `front-coordinadores-web` (o a los repos que quieran analizar).
3. Elegí el plan **Free**: los repos públicos se analizan sin costo.
4. Anotá la **clave de la organización** (Organization key). Es el valor de `SONAR_ORGANIZATION`.

Qué organización se usa (la de `Colportores` u otra) lo decide Cristian.

### 2. Crear el proyecto

1. **Analyze new project** → marcá `front-coordinadores-web` → **Set Up**.
2. En «New Code» dejá **Previous version** (o la referencia de rama `develop`) para que los hallazgos viejos no
   tapen los del PR. Se puede cambiar después.
3. **Elegí el método de análisis «With GitHub Actions»** (no «Automatic Analysis»): la cobertura solo entra con el
   análisis desde el CI.
4. En **Administration → Analysis Method** confirmá que **SonarQube Cloud Automatic Analysis** está en **OFF**. Si
   está en ON, el escaneo del CI falla por conflicto.
5. En **Project Information** copiá la **Project Key**. Es el valor de `SONAR_PROJECT_KEY`.

### 3. Generar el token

1. Esquina superior derecha → **My Account → Security → Generate Tokens**.
2. Nombre `github-actions-front-coordinadores-web`, tipo **Project Analysis Token** limitado a este proyecto (si tu
   plan no lo ofrece, un *User token* de una cuenta con permiso «Execute Analysis» solo sobre este proyecto), con
   vencimiento (90 días).
3. Copiá el valor **ahí mismo**: no se vuelve a mostrar. No lo copies a un archivo ni a un chat.

### 4. Cargarlo en GitHub

Por la web: repo → **Settings → Secrets and variables → Actions → New repository secret** → `SONAR_TOKEN`; y en la
pestaña **Variables**, `SONAR_ORGANIZATION` y `SONAR_PROJECT_KEY`.

O por consola, sin escribir el valor en disco (`gh` pide el token por la entrada y no lo repite):

```bash
gh secret set SONAR_TOKEN
gh variable set SONAR_ORGANIZATION
gh variable set SONAR_PROJECT_KEY
```

No uses `--body` con el token: quedaría en el historial de la terminal.

### 5. Quality gate: informe sin frenar

1. En SonarQube Cloud → **Project Settings → Quality Gate**: dejá «Sonar way» (el predeterminado).
2. En GitHub **no** marques el chequeo de Sonar como requerido en el ruleset de `develop`, y el workflow no espera el
   resultado del gate (`sonar.qualitygate.wait` apagado). El resultado se ve en SonarQube Cloud y, si se activó la
   decoración de PR, como comentario/chequeo del PR.
3. Cuando el equipo decida que el gate frene el merge: se activa `sonar.qualitygate.wait=true` en el workflow y se
   agrega el chequeo al ruleset. Es una decisión aparte.

### 6. Probar

1. Abrí un PR de prueba o volvé a correr el CI de uno abierto (**Actions → CI → Re-run**).
2. En el log del job de tests tiene que aparecer el paso «SonarQube Cloud» y terminar en `ANALYSIS SUCCESSFUL`.
3. En SonarQube Cloud, **Overview** muestra la cobertura (el número sale de `coverage/lcov.info`). Si dice 0 %, revisá
   que `sonar.javascript.lcov.reportPaths` apunte al archivo y que las rutas de `lcov.info` sean relativas a la raíz
   del repo.
4. Sin `SONAR_TOKEN` (por ejemplo, un PR de un fork) el paso se salta y el job queda verde.

### 7. Rotar

Cada 90 días o enseguida si el token se filtró:

1. Generá un token nuevo (paso 3).
2. `gh secret set SONAR_TOKEN` con el valor nuevo.
3. Re-corré el CI de un PR (paso 6).
4. Recién ahí revocá el token viejo (My Account → Security → Revoke).
5. Si se filtró: revocalo primero.

## Qué no hacer

- El token en `sonar-project.properties`, en el workflow, en un PR o en una captura. Si se vio, se revoca.
- Dejar la Automatic Analysis en ON junto con el análisis del CI.
- Volver el gate bloqueante sin avisar: hoy es solo informe a propósito.
