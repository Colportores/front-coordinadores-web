# front-coordinadores-web

Panel web del coordinador: seguimiento de sus equipos de colportores, asignación de zonas, control de jornadas y reportes de su asociación.

**Estado: UI en construcción con datos simulados.** Cada HU se conecta a las RPC de Supabase en su sprint, según [plan-sprints.md](https://github.com/Colportores/docs-organizacion/blob/main/docs/plan-sprints.md).

## Contexto

Parte del sistema [Colportaje App](https://github.com/Colportores). La arquitectura, los flujos y las decisiones viven en la [documentación de la organización](https://github.com/Colportores/docs-organizacion).

- Habla directo con Supabase, sin BFF: el login con `supabase-js` y los datos por RPC con el JWT del coordinador, nunca `.from()` sobre tablas ([ADR-013](https://github.com/Colportores/docs-organizacion/blob/main/docs/decisiones/ADR-013-clientes-directo-a-rpc-de-supabase.md)). El BFF queda como implementación futura.
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

- **Tope de memoria.** El servicio del panel en `compose.dev.yml` lleva `mem_limit: 2500m` / `memswap_limit: 3g` y `NODE_OPTIONS=--max-old-space-size=1536` (heap de Node de 1,5 GB para la build y los checks). Sirve para que el pico de RAM de un check local (~1,3 GB, ~2 GB con la build de Next y Playwright) no deje sin memoria a la VM de Docker; vale solo para el desarrollo local: el CI, staging y producción no pasan por ese compose. Si un check se queda sin memoria (el contenedor sale con 137), cerrá lo que no uses antes de subir el tope.

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

### Equipo con datos reales de Supabase (solo desarrollo)

Para la demo, la pestaña **Equipo** puede leer la campaña y los colportores reales de un proyecto de Supabase en vez de los simulados (issue #45). Es un puente de desarrollo con la cuenta de un coordinador cargada en el servidor: la conexión definitiva usa el login del coordinador (sección siguiente) y la RPC de cada pestaña.

Creá un `.env.local` en la raíz del repo (git lo ignora; Next lo carga solo, también adentro de Docker) con la cuenta de un coordinador:

```sh
SUPABASE_URL=https://<proyecto>.supabase.co
SUPABASE_ANON_KEY=<clave publishable o anon>
SUPABASE_COORDINADOR_EMAIL=<correo del coordinador>
SUPABASE_COORDINADOR_PASSWORD=<su contraseña>
```

Después `docker compose -f compose.dev.yml up` y abrí `/equipo`. El servidor inicia sesión con esa cuenta (GoTrue) y consulta con su token, así que las políticas RLS ven al coordinador: la campaña vigente sale de `campanias_del_coordinador()`, las ciudades de `ciudades_de_campania()`, las zonas (la de hoy, las anteriores con sus fechas y las casas registradas) de `zonas_por_colportor()` y los acompañamientos de `historial_de_acompaniamientos()`; registrar uno va por `jornadas_cerradas_de_colportor()` y `agregar_acompaniamiento()` (`src/datos/equipo/pestana-rpc.ts`, vista 33, issue #63). La contraseña vive solo en el servidor (variables sin `NEXT_PUBLIC_`).

- **Se apaga sola** si falta alguna de las cuatro variables y **siempre en un build de producción** (`next build` / `next start`: staging, producción y el sitio de Pages), aunque estén definidas. Los tests lo prueban.
- **Lo que todavía no tiene fuente real** queda sin conectar, sin inventar datos: el departamento de cada ciudad (backend-supabase#92), la nota y el origen de cada acompañamiento y las solicitudes para entrar a la campaña. La vista de **añadir colportor** (`/equipo/anadir`, issue #41) va por las RPC `campanias_del_coordinador()`, `buscar_candidatos()`, `colportores_de_campania()` e `inscribir_colportor()` (`src/datos/equipo/rpc.ts`): usa la primera campaña del coordinador (cómo se elige cuando tiene varias está pendiente de decisión) y, sin una campaña en curso, lo dice en vez de mostrar el buscador.
- **No lo dejes en el entorno al correr `npm run build:pages`:** ese build rechaza a propósito cualquier `.env*` o variable de Supabase.

### Ciudades y zonas con datos reales de Supabase (solo desarrollo)

La pestaña **Ciudades** (vista 24, issue #40) usa el mismo puente y las mismas cuatro variables: con ellas lee y escribe por las RPC `ciudades_de_campania()`, `zonas_de_ciudad()`, `colportores_de_campania()`, `ciudades_del_catalogo()`, `agregar_ciudad_a_campania()`, `guardar_zona()`, `baja_zona()`, `asignar_zona()` y `quitar_zona()` (`src/datos/equipo/zonas/rpc.ts`). Se apaga sola igual que Equipo (sin variables, o en cualquier build de producción, queda la simulada).

- **Campaña:** la primera de `campanias_del_coordinador()` (`src/datos/supabase/campania-provisoria.ts`); cómo se elige cuando el coordinador tiene varias está pendiente de decisión. Sin una campaña en curso ni por empezar, la vista lo dice en vez de mostrar el mapa.
- **Lo que todavía no está conectado:** las zonas **por esquinas** (marcar una esquina, el borde por calles y guardarlas) esperan a `backend-supabase#25`; la **superposición** con otra zona y el aviso de **calle compartida** no los calcula ninguna RPC, así que no se muestran; el buscador de ciudades no trae provincia porque el catálogo de la base no la tiene.
- **Colportores:** cada ciudad lista a todos los inscriptos de la campaña con su zona (la zona de un colportor es una por campaña, de la ciudad que sea).

## Acceso del coordinador y conexión a Supabase

El panel inicia sesión **directo con Supabase Auth** (`@supabase/supabase-js`, [ADR-015](https://github.com/Colportores/docs-organizacion/blob/main/docs/decisiones/ADR-015-paneles-web-nextjs-shadcn.md)) y pide los datos por RPC con el JWT del coordinador ([ADR-013](https://github.com/Colportores/docs-organizacion/blob/main/docs/decisiones/ADR-013-clientes-directo-a-rpc-de-supabase.md)). La sesión vive en una **cookie `httpOnly`** que el JavaScript de la página no lee (decisión «Sesión panel», 21/10, con `@supabase/ssr`): el navegador nunca habla con Auth, lo hace el servidor del panel.

- **Variables por entorno** (públicas por diseño: la clave anónima viaja en el navegador y los datos los protege la RLS): `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `src/datos/supabase/config-publica.ts` las lee y **no acepta una clave de servicio** (`sb_secret_…` o un JWT con rol `service_role`): con `NEXT_PUBLIC_` iría al navegador de todos. Next incrusta esas variables en el build antes de que corra ese módulo, así que el chequeo está **en el arranque**: `next.config.ts` llama a `verificarEntornoSupabase` y `next dev` / `next build` fallan, sin escribir la clave. La URL tiene que ser `https://`; `http://` solo vale para `localhost`, `127.0.0.1` y `[::1]` (el Supabase local). El sitio de prueba de Pages las rechaza igual que al resto de las variables de Supabase (y deja pasar el código del panel que menciona `service_role` como texto: la guarda busca claves y la variable `SERVICE_ROLE_KEY`, no la palabra).
- **`src/datos/supabase/sdk.ts`**: `crearSupabase(config, opciones)` crea el cliente del SDK (renueva el token solo; no elige dónde se guarda la sesión, pero se queda con el lugar para poder borrarla: `borrarSesionGuardada`) y `crearClienteRpc(supabase)` es el cliente que comparten las fuentes de `src/datos/*`. Un rechazo sale como `ErrorSupabase` con el estado y el código de la RPC.
- **`src/datos/supabase/fetch-auth.ts`**: el `fetch` del cliente, solo para los pedidos a Auth. Les pone un tope de 5 s (un pedido colgado deja trabado al SDK), hace pasar un 429 al renovar el token por una caída de red (el SDK borra la sesión ante cualquier otro rechazo) y no deja que una renovación en camino vuelva a guardar una sesión que ya se cerró.
- **`src/auth/acceso.ts`**: `iniciarSesion`, `verificarAcceso` y `cerrarSesion`, con resultados tipados. El rol lo decide la base (`tiene_rol('COORDINADOR')`: vigencia y bajas); la autoridad de cada dato sigue en la RLS de cada RPC.
- **Falla de conexión o de configuración ≠ sesión vencida** (`src/datos/supabase/errores.ts`, el mismo criterio que tenía el BFF): sin red, Supabase caído o una clave anónima mal cargada dan `no-disponible` y **no** mandan a iniciar sesión de nuevo; solo el rechazo del token (`PGRST3xx`) es una sesión vencida. Inicio de sesión, comprobación y cierre esperan a Supabase 5 s como máximo. **Cerrar sesión nunca deja la sesión abierta en este navegador**: si no se pudo avisar al servidor (sin red, token vencido que no se pudo renovar, servidor colgado) igual la borra y el resultado es `cerrada-sin-revocar`. Un intento de inicio de sesión que ya venció no pisa ni cierra la sesión del siguiente.
- **Tres modos** (`src/auth/modo.ts`): **activo** (las dos variables públicas de Supabase, válidas: hay login y todo se pide con la sesión del coordinador), **apagado** (ninguna variable, o el sitio de prueba de Pages: el panel funciona como siempre, con datos simulados y sin login) y **mal configurado** (alguna variable presente pero inválida: se bloquea todo con «no disponible», nunca se cae a datos simulados).
- **Guarda de rutas** (`src/proxy.ts` + `src/auth/guarda.ts`): con el login activo, cada pedido renueva la sesión y comprueba el rol antes de pintar. Sin sesión va a `/acceso?siguiente=…`; vencida, a `/acceso?motivo=vencida`; una cuenta sin el rol, a `motivo=sin-acceso`; Supabase caído, a `motivo=no-disponible` (sin cerrar la sesión). Las server actions sin sesión reciben 401 o 503 (un redirect rompería la respuesta). El destino (`siguiente`) solo puede ser una ruta del panel (`destinoSeguro`). La autoridad de cada dato sigue siendo la RLS.
- **Pantalla de acceso** (vista 38, `src/app/acceso/page.tsx` + `src/features/acceso/`): los ocho artboards son estados de `PantallaDeAcceso` (vacío, entrando, credenciales, sin acceso, sesión vencida, no disponible, sesión cerrada, sin conexión). Se ve sin el marco del panel: el proxy marca el pedido con la cabecera `x-panel-sin-marco` (que borra de cualquier otro pedido) y el layout raíz la lee. Entrar y salir son server actions (`src/auth/acciones.ts`) que escriben la cookie; después de entrar o salir la navegación es una carga completa. «Cerrar sesión» está en el menú del avatar (`src/shell/MenuDeCuenta.tsx`): antes manda las inscripciones a medio mandar y, si alguna falla, no cierra.
- **Sin hacer, a propósito** (pendientes de decisión del PR de #18): el enlace «¿Olvidaste tu contraseña?» (no tiene destino), que `tiene_rol` y la RLS descarten a un suspendido (decisión de base de datos; el panel ya lo bloquea con `estado_cuenta()`, ver `src/auth/acceso.ts`) y qué pasa en staging o producción sin variables (decisión «Sin env», 27/10: ver «Aviso de datos simulados»).
- **Tests**: usan el `supabase-js` real con un `fetch` falso (`src/test/supabase.ts`), así que prueban lo que hace el SDK con cada respuesta.

## Aviso de datos simulados (issue #101)

Nunca un dato simulado sin aviso. `AvisoVersionDePrueba` (la franja fija de arriba, sin botón para cerrarla) se muestra en cualquier build donde alguna pestaña a la vista use la fuente simulada; `src/config/datos-simulados.ts` decide cuánto:

- **Todo simulado** (sitio de prueba de Pages, o un build sin `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` ni el puente de desarrollo): «Versión de prueba con datos simulados…».
- **Solo Stock y/o Cuentas** (conexión real, pero esas pestañas están visibles por el modo dev o su flag y su fuente es siempre la simulada): la franja las nombra.
- **Con todo conectado** (staging y producción con las variables y esas pestañas ocultas): no aparece.

**Producción exige Supabase** (decisión «Sin env», 27/10): `verificarEntornoDeProduccion` (`next.config.ts`) hace fallar el build si faltan las variables, salvo que se pida el modo simulado con `PANEL_DATOS_SIMULADOS=1` (lo carga `build:pages`). **Está desarmado hasta que exista el Supabase de producción**: se arma con `PANEL_EXIGIR_SUPABASE=1` en el build de producción; sin esa variable el build, el CI y el staging siguen como hasta ahora (con el aviso).

## Sitio de prueba (GitHub Pages)

El panel se publica para probarlo desde un navegador, **solo desde la rama `develop`** y **con datos simulados**: sin backend, sin claves, sin datos de personas.

- **URL:** https://colportores.github.io/front-coordinadores-web/ (cada push a `develop` lo actualiza con `.github/workflows/deploy-pages.yml`; no hay deploys desde feature, PR, staging ni production).
- Es un sitio público, sin acceso restringido: lleva `noindex, nofollow` y un `robots.txt` que bloquea todo. El modo dev está prendido: todas las pestañas visibles y el estado de cada HU.
- **Aviso fijo en cada pantalla** (`AvisoVersionDePrueba`, arriba del topbar, sin botón para cerrarlo): «Versión de prueba con datos simulados. Lo que hagas no se guarda: al recargar la página vuelve a los datos de ejemplo.» En este build (`NEXT_PUBLIC_DEPLOY_PAGES=1`) `build:pages` falla si alguna página no lo lleva. Fuera de Pages el mismo componente avisa cuando hay datos simulados a la vista (ver «Aviso de datos simulados» más abajo).
- **Qué lo distingue del build normal:** export estático (`output: 'export'`) con `basePath` y `assetPrefix` `/front-coordinadores-web`, solo cuando corre `npm run build:pages` (`DEPLOY_PAGES=1`, ver `next.config.ts`). `next dev`, `npm run build` y el CI de siempre no cambian.
- **Sin servidor no hay server actions ni proxy.** Las vistas que usan server actions (`/equipo`, `/ciudades`, `/equipo/anadir`) tienen una variante `*Local` que le habla a la fuente simulada desde el navegador, y el módulo con las server actions (`acciones-servidor.ts`, `inscribir-servidor.ts`, `buscar-servidor.ts`) se importa solo cuando no es este build. El estado de esas acciones vive en la pestaña: al recargar vuelve a los datos de ejemplo. **Una vista nueva con server actions necesita las dos variantes**: el CI corre `npm run build:pages` y falla si falta (ver [`docs/PESTANAS.md`](./docs/PESTANAS.md), sección 2).
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
├── datos/<pestaña>/     ← contrato.ts (tipos + interfaz de la fuente) · simulado.ts · index.ts (selección)
├── datos/supabase/      ← conexión a Supabase: config, cliente `supabase-js`, cliente de RPC y clases de falla
├── auth/                ← acceso del coordinador: iniciar y cerrar sesión, comprobar el rol
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

## Artefacto con Supabase dev (pruebas de demo)

Además del sitio de Pages (datos simulados, no cambia), cada push a `develop` deja un **artefacto de Actions** con el panel compilado y **conectado al Supabase de desarrollo** (proyecto `ohdsavwpasfpapbyutrv`), para probarlo o mostrarlo desde una PC propia. Es de uso interno: no se publica en Pages ni en ningún hosting y no se guarda en el repo (issue #123).

- **Dónde:** pestaña *Actions* → workflow «Artefacto del panel con Supabase dev» → artefacto `panel-supabase-dev` (retención de 7 días). También con *Run workflow* (`workflow_dispatch`, solo sobre `develop`; el botón aparece cuando el workflow llega a la rama por defecto). `.github/workflows/demo-supabase-dev.yml`.
- **No es estático:** con la conexión real el panel necesita servidor (proxy, cookie de sesión `httpOnly` y server actions), así que no se puede exportar como el de Pages. El artefacto es un servidor Node autónomo (`output: "standalone"`, solo con `NEXT_PUBLIC_DEMO_SUPABASE_DEV=1`): se descomprime y se corre `PORT=3000 HOSTNAME=127.0.0.1 node server.js` (Node 24) o con Docker; se abre en `http://localhost:3000`. El `README.md` de dentro del artefacto lo explica y lleva el correo de la cuenta demo (la contraseña no va en el artefacto ni en el repo: el repo es público y la da Cristian).
- **Qué lleva:** solo la URL pública del proyecto dev y la clave **anónima** (pública por diseño: la autoridad es la RLS), de las variables del repo `SUPABASE_URL` y `SUPABASE_ANON_KEY` (variables, no secrets). Nunca la clave de servicio, claves del BFF ni secretos.
- **Aviso fijo** en cada pantalla (también la de acceso): «Versión de prueba conectada a Supabase dev (datos de demostración)» (`AvisoVersionDePrueba`), `noindex` (meta, cabecera `X-Robots-Tag` y `robots.txt`). Es un build como staging: modo dev apagado, Stock y Cuentas ocultas.
- **Guardas** (`scripts/build-demo-supabase.mjs`, `scripts/lib/guardia-demo-supabase.mjs`): el build falla si la URL no es la del proyecto dev, si la clave no es anónima o publishable, si el entorno trae otras variables de credenciales o si hay archivos `.env*`; después revisa los archivos del artefacto (JWT que no sean `anon`, `sb_secret_`, URLs de otro proyecto, `SERVICE_ROLE_KEY`) y levanta el servidor armado para comprobar aviso, `noindex` y que sin sesión se pide iniciar sesión. `ci.yml` (PR) y `deploy-pages.yml` no necesitan variables de Supabase, y `build:pages` sigue rechazándolas.

Reproducirlo en local, en Docker (deja `panel-supabase-dev/`, que no se versiona; las dos variables salen del entorno, sin escribirlas en ningún archivo):

```sh
docker compose -f compose.dev.yml run --rm -e NEXT_PUBLIC_SUPABASE_URL -e NEXT_PUBLIC_SUPABASE_ANON_KEY app npm run build:demo-supabase
```

## Licencia

Uso propio — todos los derechos reservados. Ver [LICENSE](./LICENSE).
