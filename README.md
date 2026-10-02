# front-coordinadores-web

Panel web del coordinador: seguimiento de sus equipos de colportores, asignación de zonas, control de jornadas y reportes de su asociación.

**Estado: UI en construcción con datos simulados** (Sprint 4). Cada HU se conecta al BFF en su sprint, según [plan-sprints.md](https://github.com/Colportores/docs-organizacion/blob/main/docs/plan-sprints.md).

## Contexto

Parte del sistema [Colportaje App](https://github.com/Colportores). La arquitectura, los flujos y las decisiones viven en la [documentación de la organización](https://github.com/Colportores/docs-organizacion).

- Habla únicamente con su BFF ([bff-coordinadores](https://github.com/Colportores/bff-coordinadores)); nunca con Supabase directo ([ADR-013](https://github.com/Colportores/docs-organizacion/blob/main/docs/decisiones/ADR-013-un-bff-por-aplicacion-en-workers.md)).
- Stack: Next.js (App Router) + React + TypeScript + Tailwind CSS + shadcn/ui ([ADR-015](https://github.com/Colportores/docs-organizacion/blob/main/docs/decisiones/ADR-015-paneles-web-nextjs-shadcn.md)).
- Nomenclatura de repos: [ADR-016](https://github.com/Colportores/docs-organizacion/blob/main/docs/decisiones/ADR-016-multi-repo-capa-usuario-plataforma.md).

## Desarrollo (todo en Docker)

```sh
docker compose -f compose.dev.yml up          # dev server en http://localhost:3000 (con modo dev)
sh scripts/check.sh                           # lint + typecheck + tests + build, igual que el CI
docker compose -f compose.dev.yml run --rm app npm install <paquete>
```

- **Imagen y cachés compartidas.** `-p <nombre>` propio está bien para aislar contenedores, `node_modules` y `.next`; la imagen (`front-coordinadores-web-dev:latest`) es compartida por todos los proyectos.
  `docker compose build` solo cuando cambia `dockerfile.dev`.

La imagen (`dockerfile.dev`) parte de la de Playwright, que trae Node y Chromium para el QA de vistas.

**Después de cambiar dependencias** (`package.json` / `package-lock.json`, incluido un `git pull` que las cambie) hay que recrear el volumen de `node_modules`: Docker copia las dependencias de la imagen solo cuando crea el volumen, y si no se recrea el dev server sigue con las viejas.

```sh
docker compose -f compose.dev.yml down -v     # borra los volúmenes node_modules y .next
docker compose -f compose.dev.yml build
docker compose -f compose.dev.yml up
```

`sh scripts/check.sh` no usa esos volúmenes: construye la imagen e instala con `npm ci`, igual que el CI y con el modo dev apagado.

### Modo dev

`NEXT_PUBLIC_MODO_DEV=1` (activo en `compose.dev.yml`, apagado en staging y producción) muestra el estado de cada historia de usuario: chips sobre cada sección, estado agregado en la navegación y el panel flotante "Estado de HU". El registro está en `src/dev/estado-hu.ts`.

Las pestañas **Stock** y **Cuentas** muestran datos simulados hasta su conexión en V2: tienen flag propio (`NEXT_PUBLIC_PESTANA_STOCK`, `NEXT_PUBLIC_PESTANA_CUENTAS`) que, si no se define, sigue al modo dev. En staging y producción quedan ocultas: `src/proxy.ts` reescribe esas rutas a un 404 antes de renderizar (así ni el HTML ni el payload RSC llevan su contenido) y, con el flag apagado, la ruta no se prerenderiza (`LayoutPestanaConFlag`).

## Sitio de prueba (GitHub Pages)

El panel se publica para probarlo desde un navegador, **solo desde la rama `develop`** y **con datos simulados**: sin backend, sin claves, sin datos de personas.

- **URL:** https://colportores.github.io/front-coordinadores-web/ (cada push a `develop` lo actualiza con `.github/workflows/deploy-pages.yml`; no hay deploys desde feature, PR, staging ni production).
- Es un sitio público, sin acceso restringido: lleva `noindex, nofollow` y un `robots.txt` que bloquea todo. El modo dev está prendido: todas las pestañas visibles y el estado de cada HU.
- **Qué lo distingue del build normal:** export estático (`output: 'export'`) con `basePath` y `assetPrefix` `/front-coordinadores-web`, solo cuando corre `npm run build:pages` (`DEPLOY_PAGES=1`, ver `next.config.ts`). `next dev`, `npm run build` y el CI de siempre no cambian.
- **Sin servidor no hay server actions ni proxy.** Las vistas que usan server actions (`/ciudades`, `/equipo/anadir`) tienen una variante `*Local` que le habla a la fuente simulada desde el navegador, y el módulo con las server actions (`acciones-servidor.ts`, `inscribir-servidor.ts`) se importa solo cuando no es este build. El estado de esas acciones vive en la pestaña: al recargar vuelve a los datos de ejemplo. **Una vista nueva con server actions necesita las dos variantes**: el CI corre `npm run build:pages` y falla si falta (ver [`docs/PESTANAS.md`](./docs/PESTANAS.md), sección 2).
- **Nunca lleva credenciales:** `scripts/build-pages.mjs` falla si el entorno trae variables de Supabase, del BFF o credenciales (`SUPABASE_*`, `*_SECRET`, `NEXT_PUBLIC_*` ajenas al panel…), si hay archivos `.env*`, o si algún archivo de `out/` parece llevar un JWT o una URL de Supabase. Corre `next build` con un entorno limpio.

Reproducirlo en local, en Docker (el sitio queda en http://localhost:3000/front-coordinadores-web/):

```sh
docker compose -f compose.dev.yml run --rm --service-ports app sh -c "npm run build:pages && npm run servir:pages"
```

`servir:pages` sirve `out/` como lo hace Pages (`/ruta/` → `ruta/index.html`, 404 con `404.html`). Después se puede borrar `out/` (no se versiona).

### Configuración del repo (admin)

El workflow no cambia la configuración del repo. **Ya está hecha** (02/10): Pages con la fuente «GitHub Actions» y `develop` entre las ramas permitidas del environment `github-pages`. Queda a criterio del admin sacar la política de `production` que GitHub agrega por defecto (este workflow no despliega desde ahí). Para rehacerla en otro repo, en la web: *Settings → Pages → Build and deployment → Source: GitHub Actions*, y *Settings → Environments → `github-pages` → Deployment branches and tags → Selected branches and tags → `develop`*. O con `gh`:

```sh
# 1. Pages con la fuente «GitHub Actions»
gh api -X POST repos/Colportores/front-coordinadores-web/pages -f build_type=workflow

# 2. El environment github-pages solo despliega desde develop
gh api -X PUT repos/Colportores/front-coordinadores-web/environments/github-pages --input - <<< '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
gh api -X POST repos/Colportores/front-coordinadores-web/environments/github-pages/deployment-branch-policies -f name=develop -f type=branch

# 3. Si el environment ya traía otra política (por ejemplo la de production), sacarla
gh api repos/Colportores/front-coordinadores-web/environments/github-pages/deployment-branch-policies --jq '.branch_policies[] | "\(.id) \(.name)"'
gh api -X DELETE repos/Colportores/front-coordinadores-web/environments/github-pages/deployment-branch-policies/<id>
```

El botón «Run workflow» (`workflow_dispatch`) aparece cuando el workflow llega a la rama por defecto del repo (`production`); el push a `develop` publica sin esperar a eso.

## Estructura

```
src/
├── app/                 ← rutas (App Router): /inicio /equipo /stock /cuentas /reportes
├── features/<pestaña>/  ← componentes de cada pestaña
├── datos/<pestaña>/     ← contrato.ts (tipos + interfaz del BFF) · simulado.ts · index.ts (selección)
├── shell/               ← topbar, navegación, contenedor de pestaña
├── dev/                 ← modo dev: registro de HU, SeccionHu, ChipHu, panel "Estado de HU"
├── config/              ← flags
├── components/ui/       ← shadcn/ui
└── lib/
```

Cómo se construye una pestaña: [`docs/PESTANAS.md`](./docs/PESTANAS.md).

## Privacidad

Los datos personales de clientes (`persona.nombre`, `persona.apellido`, `persona.telefono`, `nota.texto`) son **local-only**: viven solo en el dispositivo del colportor y nunca llegan al cloud, por la Ley 18.331 de Uruguay. Ver [`02-restricciones.md`](https://github.com/Colportores/docs-organizacion/blob/main/docs/02-restricciones.md).

Este panel **no recibe ni muestra** datos de clientes: trabaja con agregados, estado de ubicaciones y métricas de equipo.

## Licencia

Uso propio — todos los derechos reservados. Ver [LICENSE](./LICENSE).
