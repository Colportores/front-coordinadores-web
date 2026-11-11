# Cloudflare: crear el proyecto y cargar las credenciales del despliegue

Guía paso a paso para dejar listo el despliegue del panel en Cloudflare (issue #147). **Acá nunca van valores**: solo
nombres. El repo es público; los valores se cargan directo en GitHub (o con `gh`) y no se escriben en archivos, commits,
PRs ni capturas.

> **Actualización del 11/11 (#105):** el despliegue automático de staging pasó a **Vercel** (integración Git, sin
> secretos de GitHub). `deploy-cloudflare.yml` ya no corre por push a `staging`: queda solo para correrlo a mano
> (Actions → Run workflow). Esta guía sigue valiendo para ese caso manual.
>
> **Decisión de Cristian (11/11):** el staging se despliega con **Vercel**, y el ADR-015 y `production.yml` dejan a
> Vercel como hosting de producción, porque el panel necesita servidor (`src/proxy.ts`, cookies de sesión, server
> actions). Cloudflare Pages queda como copia estática opcional del sitio de prueba, solo a mano. Esta guía **no toca**
> `production.yml` ni `deploy-pages.yml`; si Cloudflare llegara a reemplazar a Vercel, se decide aparte y se cambia el ADR.

## Qué se carga y dónde

Convención de `docs/ci-variables.md`: por **environment** de GitHub, con nombres propios (`CLOUDFLARE_*`) que no se
pisan con los de Vercel ni con las variables de nivel repositorio.

| Nombre | Tipo | Environment | Qué es | Dónde se saca |
|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | **secreto** | staging, production | Token de API con el mínimo de permisos (paso 3) | Cloudflare → Manage Account → Account API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | variable | staging, production | Id de la cuenta (no es secreto, pero va por environment) | Cloudflare → Workers & Pages → panel derecho «Account ID» |
| `CLOUDFLARE_PROJECT_NAME` | variable | staging, production | Nombre del Worker (camino A) o del proyecto de Pages (camino B) | El que elijas en el paso 4, p. ej. `panel-coordinadores-staging` |

Cada environment tiene su propio token y su propio proyecto: así se rota o se revoca uno sin tocar el otro, y un fallo
en staging no alcanza a producción.

## Org o environment: dónde viven los valores

Los workflows leen `secrets.CLOUDFLARE_API_TOKEN` y `vars.CLOUDFLARE_*` sin importar dónde estén cargados. Hoy están a
**nivel organización, con acceso limitado a este repo** (Organization settings → Secrets and variables → Actions). Ojo:
un secreto de organización **no pasa por las reglas del environment** (revisores requeridos, ramas permitidas): cualquier
workflow de una rama de este repo lo puede leer. Si se quiere esa protección, cargá el mismo nombre en el environment
(`gh secret set CLOUDFLARE_API_TOKEN --env staging`): el del environment pisa al de la organización. Con el token de
permiso mínimo (solo Cloudflare Pages) y sin acceso de escritura abierto al repo, el riesgo es bajo para staging;
para `production` conviene el environment con revisores.

## Paso a paso

### 1. Cuenta de Cloudflare

1. Entrá a <https://dash.cloudflare.com> y creá (o usá) la cuenta **de la organización**, no una personal. Qué cuenta
   es lo decide Cristian.
2. El plan gratuito alcanza para empezar. Ojo con el camino A: el plan gratis limita el tamaño del Worker (alrededor de
   3 MB comprimido, 10 MB en el plan pago) y un Next con OpenNext puede pasarse. Verificalo en la documentación vigente
   de límites de Workers antes de decidir el plan.
3. Activá la verificación en dos pasos de la cuenta (Profile → Authentication).

### 2. Account ID

1. Dashboard → **Workers & Pages**.
2. En la columna derecha copiá **Account ID** (también es el tramo de la URL `dash.cloudflare.com/<ID>/…`).
3. Guardalo para el paso 5. No es secreto, pero tampoco lo pegues en capturas.

### 3. Token de API con el mínimo de permisos

1. **Manage Account → Account API Tokens → Create Token → Create Custom Token.** Preferí un token de cuenta antes que
   uno de usuario: no depende de una persona.
2. Nombre: `github-actions-panel-<environment>` (ejemplo `github-actions-panel-staging`).
3. Permisos (solo estos):
   - **Camino A (Workers):** `Account` → `Workers Scripts` → `Edit`.
   - **Camino B (Pages):** `Account` → `Cloudflare Pages` → `Edit`.
   - Solo si el despliegue usa dominio propio: `Zone` → `Workers Routes` → `Edit` y `Zone` → `Zone` → `Read`,
     limitados a esa zona. Solo si se usa caché o almacenamiento de OpenNext: `Workers KV Storage` o
     `Workers R2 Storage` → `Edit`. Si `wrangler` pide otro permiso, el error dice cuál; agregá solo ese.
4. **Account Resources:** `Include` → solo la cuenta de la organización.
5. **TTL:** poné vencimiento (90 días). Sin filtro de IP: las IPs de los runners de GitHub cambian.
6. **Continue to summary → Create Token.** Cloudflare muestra el valor **una sola vez**. No lo copies a un archivo ni a
   un chat: andá directo al paso 5 con la ventana abierta.
7. Nunca uses la *Global API Key*: da acceso a toda la cuenta.

### 4. Crear el proyecto

Elegí **un** camino según lo que decida Cristian. En los dos, **no conectes el repo por Git** desde Cloudflare: el
build y el despliegue los hace GitHub Actions (así corren las mismas validaciones y los secretos no salen del
environment), y en Pages no se puede pasar de Git a carga directa después.

**Camino A, Workers (el panel con servidor).** Cloudflare lo ejecuta con el adaptador OpenNext
(`@opennextjs/cloudflare`); el workflow lo agrega cuando se confirme este camino.
1. Dashboard → **Workers & Pages → Create → Start with Hello World!**
2. Nombre `panel-coordinadores-staging` (y luego `panel-coordinadores-production`) → **Deploy**. El primer despliegue
   de Actions lo reemplaza por el panel.
3. Ese nombre es el valor de `CLOUDFLARE_PROJECT_NAME`.

**Camino B, Pages (solo el export estático con datos simulados).**
1. Dashboard → **Workers & Pages → Create → Pages → Upload assets** (Direct Upload).
2. Nombre `panel-coordinadores-staging` → **Create project**. Dejá la rama de producción en `main` (el workflow
   publica con `--branch main`, así queda en `<proyecto>.pages.dev`). Podés saltar la subida de archivos: la hace el
   workflow.
3. Ese nombre es el valor de `CLOUDFLARE_PROJECT_NAME`.
4. Sirve para el sitio de prueba, no para el panel real (sin servidor no hay sesión ni server actions).

### 5. Cargar las credenciales en GitHub

1. En el repo: **Settings → Environments.** `staging` ya existe; creá `production`.
2. En `production`: **Required reviewers** (alguien que apruebe cada despliegue) y **Deployment branches and tags** →
   solo la rama `production`. En `staging`: las ramas `staging` y `develop` (el workflow `deploy-cloudflare.yml` corre solo a mano, sobre cualquiera de
   las dos).
3. En cada environment, **Environment secrets → Add secret** → `CLOUDFLARE_API_TOKEN` (el valor del paso 3).
   **Environment variables → Add variable** → `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_PROJECT_NAME`.
4. O por consola, sin escribir el valor en disco (`gh` lo pide por la entrada y no lo repite en pantalla):

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --env staging
   gh variable set CLOUDFLARE_ACCOUNT_ID --env staging
   gh variable set CLOUDFLARE_PROJECT_NAME --env staging --body panel-coordinadores-staging
   ```

   Repetí con `--env production`. No pegues el valor del token en el comando (`--body`): quedaría en el historial de la
   terminal.
5. Revisá la lista, que muestra nombres y fechas pero nunca valores de secretos:
   `gh secret list --env staging` y `gh variable list --env staging`.

### 6. Probar

1. Verificar que el token es válido, sin imprimirlo (en una terminal propia, el valor se lee sin eco):

   ```bash
   read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN
   curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/tokens/verify"
   unset CLOUDFLARE_API_TOKEN
   ```

   La respuesta tiene que traer `"status":"active"`. Si el token es de usuario y no de cuenta, la URL es
   `…/client/v4/user/tokens/verify`.
2. Probar el workflow: **Actions → Deploy Cloudflare (staging) → Run workflow** sobre `develop` o `staging`. Si falta
   algo, falla con un mensaje que dice cuál nombre falta y dónde cargarlo. Al terminar, abrí
   `https://<proyecto>.pages.dev/`: redirige a `/front-coordinadores-web/` (el export lleva ese `basePath`).
   El workflow ya no corre por push: sin credenciales siempre falla con ese mensaje.
3. Comprobar que el environment `production` pide aprobación antes de arrancar.

### 7. Rotar

Cada 90 días (el vencimiento del paso 3) o enseguida si el token se filtró:

1. Creá un token nuevo igual al anterior (paso 3).
2. `gh secret set CLOUDFLARE_API_TOKEN --env <environment>` con el valor nuevo.
3. Corré el workflow del paso 6 para confirmar que funciona.
4. Recién ahí **borrá el token viejo** en Cloudflare (Account API Tokens → Delete). Si lo hubieras querido «Roll»,
   tené en cuenta que invalida el valor viejo al instante y el workflow falla hasta que cargues el nuevo.
5. Si se filtró: revocalo primero y recién después seguí con los pasos 1 a 3.

## Qué no hacer

- Valores de tokens o claves en el repo, en commits, en PRs, en logs o en capturas (el repo es público). Si una
  captura muestra el token, hay que revocarlo.
- `wrangler login` en una máquina compartida o archivos `.dev.vars` / `.env` con el token: están en `.gitignore`, pero
  mejor que no existan.
- Reusar el token de staging en producción.
- Dar permisos de más «por si acaso»: se agregan solo cuando el error lo pide.
