# Variables y secretos de GitHub Actions (compilados y publicación)

Todo lo configurable de los workflows de despliegue sale de variables (`vars.*`) o secretos (`secrets.*`) de GitHub
Actions, por **environment**. No hay valores secretos en el repo (es público): acá solo hay nombres y ejemplos.

- **Staging** (`staging.yml` → `deploy-pages.yml` y `demo-supabase-dev.yml`, push a `staging` o corrida manual): usa el
  environment `staging`. Pages no necesita nada (datos simulados). El artefacto `panel-supabase-dev` toma
  `SUPABASE_URL` y `SUPABASE_ANON_KEY` del environment `staging` o, si no las define, de las variables del repo (hoy
  apuntan al proyecto dev). Si no hay ninguna, el job avisa qué cargar y se salta el build, sin romper el resto.
- **Production** (`production.yml`, push a `production`): usa el environment `production`. Si falta una variable o un
  secreto el workflow **falla con un mensaje que dice cuál falta y dónde cargarla**. Nunca cae a las variables de dev:
  lee sus propios nombres `PRODUCTION_SUPABASE_*`, que no existen a nivel repositorio (las `SUPABASE_URL` /
  `SUPABASE_ANON_KEY` del repo son las del proyecto dev, y `vars.*` mezcla environment y repo, así que con los mismos
  nombres un olvido en el environment compilaría el panel con la clave de dev).
- Ningún paso lee secretos en un PR ni en un fork: solo disparan por push a `staging` / `production` o a mano, y el
  evento `pull_request` de esos archivos no tiene jobs.

Cómo cargar: Settings → Environments → `<entorno>` → Variables / Secrets, o por consola
(`gh variable set NOMBRE --env production`, `gh secret set NOMBRE --env production`).
Un environment pisa a las variables del repo (Settings → Secrets and variables → Actions → Variables).

## Tabla

| Nombre | Tipo | Environment | Para qué sirve | Obligatoria | Ejemplo (sin secretos) |
|---|---|---|---|---|---|
| `SUPABASE_URL` | variable | staging (y repositorio) | URL del proyecto Supabase dev al que se conecta el artefacto de staging | no (valen las del repo; sin ninguna se salta el artefacto con Supabase). Production no la lee | `https://abcdefghijklmnop.supabase.co` |
| `SUPABASE_ANON_KEY` | variable | staging (y repositorio) | Clave anónima del proyecto dev (pública por diseño, la autoridad es la RLS). Nunca la `service_role` | igual que la URL. Production no la lee | `sb_publishable_...` |
| `PRODUCTION_SUPABASE_URL` | variable | production | URL del proyecto Supabase de producción. Distinta de la de dev (el build falla si contiene el ref dev) | production: sí | `https://qrstuvwxyzabcdef.supabase.co` |
| `PRODUCTION_SUPABASE_ANON_KEY` | variable | production | Clave anónima del proyecto de producción (pública por diseño). Nunca la `service_role`; el build falla si es igual a la `SUPABASE_ANON_KEY` del repo | production: sí | `sb_publishable_...` |
| `APP_ENV` | variable | production | Marca de que el environment está configurado: tiene que valer `production` | production: sí | `production` |
| `SUPABASE_REF_DEV` | variable | production | Ref adicional que producción no puede usar. Se suma al de la demo (`ohdsavwpasfpapbyutrv`), que siempre se rechaza | no | `otroproyectodev` |
| `VERCEL_ORG_ID` | variable | production | `orgId` de la organización o cuenta de Vercel (`.vercel/project.json` al correr `vercel link`) | production: sí | `team_xxxxxxxxxxxx` |
| `VERCEL_PROJECT_ID` | variable | production | `projectId` del proyecto de Vercel | production: sí | `prj_xxxxxxxxxxxx` |
| `VERCEL_TOKEN` | secreto | production | Token de Vercel con acceso al proyecto | production: sí | (secreto) |
| `PRODUCTION_DOMAIN` | variable | production | Dominio al que se asigna el deploy (`vercel alias set`), solo el host sin `https://`; tiene que estar agregado al proyecto en Vercel → Settings → Domains | no (queda la URL de Vercel) | `panel.ejemplo.org` |

## Qué cubre cada decisión pendiente (ci-despliegue p1–p5)

Decisión de Cristian (03/11): se resuelven por variables de Actions. Cargar el environment correspondiente deja cada
una lista; ninguna implica una cuenta o un costo que este repo decida.

- **p4, hosting de producción del panel.** El panel necesita servidor (proxy, cookies de sesión, server actions), no un
  export estático. `production.yml` hace `vercel pull/build/deploy --prebuilt --prod` con el proyecto que indiquen
  `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` y `VERCEL_TOKEN`: crear el proyecto en Vercel (el plan lo elige y paga Cristian;
  Hobby tiene términos de uso no comercial a confirmar), vincularlo (`vercel link` da los dos ids), cargar el token como
  secreto y las variables de la tabla. Si más adelante se prefiere otro servidor, el build `standalone` es el mismo
  formato del artefacto de staging y solo cambiaría el paso de deploy.
- **p5, staging del panel conectado a Supabase dev.** Hoy: el artefacto `panel-supabase-dev` (respeta #123, no se
  publica en ningún hosting) y Pages con datos simulados. Con la integración nativa de Vercel sobre el proyecto de la
  demo no hace falta nada en Actions.
- **p1, p2, p3** (APK de staging, firma y sufijo, Google Play) son del móvil: `docs/ci-variables.md` de
  `front-colportores-mobile`.
