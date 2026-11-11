# QA de punta a punta y staging

Issue #27 (Sprint 12, cierre). Este documento dice qué se prueba solo, cómo es el staging de hoy (Vercel contra el Supabase de demo, con el login real), qué hay que hacer a mano y qué falta para que el panel llegue a un coordinador real. El repo es público: **acá no hay cuentas, contraseñas ni claves**, solo los nombres de las variables.

## 1. Qué prueba el CI solo

`npm run check` (lo que corre el CI con `NEXT_PUBLIC_MODO_DEV=0`, como staging y producción) termina con dos verificaciones sobre el build de producción servido con `next start`:

| Paso | Qué comprueba |
|------|---------------|
| `npm run verificar:pestanas-ocultas` | Stock y Cuentas responden 404 y su contenido no está ni en el HTML ni en el payload RSC. |
| `npm run qa:staging` (`scripts/qa-staging.mjs`, modo **apagado**) | Sobre un build sin variables de Supabase (datos simulados, sin login), en un Chromium real a 1280 x 800: cada pestaña visible (Inicio, Equipo, Añadir colportor, Ciudades, Reportes) responde 200, tiene un solo h1, marca su pestaña activa, no se desborda, no deja errores de consola, excepciones ni pedidos propios caídos, no muestra rastro del modo dev y no ofrece Stock ni Cuentas en el menú. Stock, Cuentas y sus subrutas dan 404 con el aviso del panel. `/acceso` sin login vuelve a Inicio. axe-core (WCAG 2.2 AA) sin violaciones en todas. Y dos flujos que pasan por el servidor: elegir campaña en el topbar (server action, Esc, cookie) y buscar, añadir y deshacer un colportor. |

Para correrlos solos (con el build hecho): `docker compose -f compose.dev.yml run --rm -e NEXT_PUBLIC_MODO_DEV=0 app sh -c "npm run build && npm run qa:staging"`.

El sitio de prueba de GitHub Pages (`npm run build:pages`) tiene su propio build y su propia guarda; no pasa por `qa:staging`.

## 2. Cómo es el staging hoy

- **Hosting: Vercel**, por su integración con Git (push a `staging`; sin workflow ni secretos de GitHub, ver [`ci-cd.md`](ci-cd.md)). Es el único despliegue automático de staging desde el 11/11 (#105). El panel necesita servidor (server actions, cookies de sesión y `src/proxy.ts`): no es un export estático. Flujo de ramas `feature → develop → staging → production`, siempre por PR con 1 aprobación (los administradores tienen bypass). Hosting de producción: Vercel también ([ADR-015](https://github.com/Colportores/docs-organizacion/blob/main/docs/decisiones/ADR-015-paneles-web-nextjs-shadcn.md)).
- **Cloudflare Pages quedó solo manual**: `deploy-cloudflare.yml` ya no corre por push; publica el sitio de prueba (datos simulados, sin login) a mano desde Actions. Es otra cosa que el staging de Vercel: **no sirve para probar el login ni las RPC**. Guía en [`ci-cloudflare.md`](ci-cloudflare.md). Lo mismo vale para GitHub Pages y para el artefacto `panel-supabase-dev` (`staging.yml`, también manual).
- **Contra qué base corre: el Supabase de demo** (el proyecto dev, ref `ohdsavwpasfpapbyutrv`), con **el login real**: el panel pide sesión de coordinador en todas las pantallas (`src/proxy.ts`), `/acceso` es la pantalla de acceso (vista 38) y cada pantalla habla con las RPC con el JWT de quien entró. Los datos de esa base son de demostración, no de personas.
- **Variables del proyecto de Vercel** (Settings → Environment Variables; los valores no se escriben en el repo):
  - `NEXT_PUBLIC_SUPABASE_URL` (`https://`) y `NEXT_PUBLIC_SUPABASE_ANON_KEY` del proyecto de demo, la clave publishable o anon, nunca una de servicio (el build se frena si lo es). Son las que prenden el **modo activo** (`src/auth/modo.ts`). Si falta solo una de las dos, o no sirve, el panel queda **mal configurado**: bloquea todo y la pantalla de acceso dice que no está disponible; nunca cae a datos simulados.
  - **No definir** `NEXT_PUBLIC_MODO_DEV`, `NEXT_PUBLIC_PESTANA_STOCK` ni `NEXT_PUBLIC_PESTANA_CUENTAS`: así Stock y Cuentas quedan ocultas (404) hasta V2 y no aparece el aviso de «datos simulados» (con todo conectado, no debe aparecer).
  - Ninguna otra variable de Supabase: el puente de desarrollo (`SUPABASE_URL`, `SUPABASE_COORDINADOR_*`) se ignora en cualquier build de producción.
  - `PANEL_EXIGIR_SUPABASE=1` es solo del build de producción real (Supabase de producción, diciembre): en staging no se pone.
- Sin Worker ni BFF: el panel habla directo con las RPC de Supabase con el JWT del coordinador (ADR-013).
- Lo que Vercel decide y no se ve desde el repo (qué rama es la de producción de Vercel, si los PR generan *Preview Deployments*, la protección de los despliegues): ver la sección 4 de [`ci-cd.md`](ci-cd.md).

## 3. QA del staging con login real (modo activo)

El mismo `scripts/qa-staging.mjs` tiene un segundo modo para un build con la conexión puesta. No corre en `npm run check` (el CI no tiene cuentas ni red hacia la demo): se corre a mano, contra el staging ya desplegado, cuando cambia algo del acceso, del proxy o de lo que se ve con sesión.

```sh
QA_STAGING_URL=https://<el-staging-de-vercel> \
QA_STAGING_CORREO=<coordinador-de-demo> QA_STAGING_CONTRASENA=<su-clave> \
QA_STAGING_CORREO_SIN_ACCESO=<cuenta-sin-rol> QA_STAGING_CONTRASENA_SIN_ACCESO=<su-clave> \
npm run qa:staging
```

(Con Docker: `docker compose -f compose.dev.yml run --rm --no-deps -e QA_STAGING_URL -e QA_STAGING_CORREO -e QA_STAGING_CONTRASENA app npm run qa:staging`, con esas variables ya puestas en el entorno de quien lo lanza: así no pasan por la línea de comandos ni por el historial.)

- Las cuentas de la demo y sus contraseñas **se leen del entorno y no se guardan en ningún archivo del repo**. El script no imprime lo que se le pasa, y tacha cualquier credencial que apareciera en su salida.
- `QA_STAGING_URL` tiene que abrirse sin la protección de despliegues de Vercel (con ella el recorrido termina en la pantalla de Vercel y la guarda lo informa como falla). Sin `QA_STAGING_URL`, `QA_STAGING_MODO=activo` sirve un build local hecho con la conexión puesta.
- `QA_STAGING_BUSQUEDA` (por defecto `ana`) es lo que se busca en «Añadir colportor»; tiene que encontrar al menos una cuenta de la demo. `QA_STAGING_EXIGIR_LOGIN=1` hace fallar el script si faltan las cuentas, en vez de avisar que saltó esa parte.

Qué comprueba:

| Parte | Qué comprueba |
|-------|---------------|
| Guarda, sin sesión | Cada ruta (también las ocultas y una que no existe) redirige a `/acceso` y recuerda adónde volver (`?siguiente=`), sin motivo y sin renderizar la pantalla pedida. |
| 401 sin sesión | Una llamada a una server action (o cualquier POST) sin sesión responde **401 `text/plain`** con la marca `panel-acceso:vencida` y `Cache-Control: no-store`, no una página: es lo que la pantalla abierta sabe leer. |
| `/acceso` | Responde 200 sin el marco del panel (ni menú de pestañas ni avatar), con su h1, los campos de correo y contraseña y «Entrar» apagado con los campos vacíos; cada motivo (`vencida`, `cerrada`, `no-disponible`) muestra su texto; axe sin violaciones; un `?siguiente=//sitio.malo` no saca a nadie del panel. |
| Contraseña equivocada | El aviso «El correo o la contraseña no son correctos.» (no dice cuál falló), la pantalla sigue en `/acceso` y los campos quedan habilitados. |
| Cuenta sin rol de coordinador (si hay cuenta) | «Sin acceso al panel», con el aviso del rol, y Inicio no se abre. |
| Entrar | Con la cuenta de coordinador vuelve a donde se iba; con sesión, `/acceso` lleva a Inicio. |
| Con sesión | Las mismas comprobaciones de cada pestaña que en el modo apagado (200, h1 único, pestaña activa, sin desborde, sin errores de consola ni pedidos propios caídos, axe) más: el avatar del topbar, y **ningún aviso de «datos simulados»**. Stock y Cuentas en 404. |
| Flujos por el servidor | Elegir campaña y buscar y añadir un colportor contra las RPC reales. Añadir siempre se deshace dentro de los 8 s (el alta se demora justamente para eso): no queda nada escrito en la base de demo. Una cuenta de coordinación o administración pide confirmar antes: el script cancela y prueba con la siguiente. |
| Cerrar sesión | Desde el menú del avatar vuelve a `/acceso` con «Cerraste sesión.» y las pantallas dejan de abrirse. |

El modo activo también corre contra un build local con una URL que no existe (la parte sin sesión no le pregunta nada a Supabase), útil para probar la guarda sin cuentas:

```sh
NEXT_PUBLIC_SUPABASE_URL=https://sin-red.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_qa npm run build
QA_STAGING_MODO=activo npm run qa:staging
```

Sin cuentas el script lo dice al final («AVISO … no se probó el login»): nunca da por probado lo que no probó.

## 4. Lo que sigue pendiente

1. **La validación con un coordinador real** (Agustín) es presencial y no la reemplaza ningún script (sección 5). #27 sigue abierto hasta entonces.
2. Stock y Cuentas siguen ocultas en staging hasta V2 (datos simulados; salvo «Validar tickets», que ya está conectada).
3. El Supabase de producción no existe hasta diciembre: ese día se arma `PANEL_EXIGIR_SUPABASE=1` en el build de producción (`production.yml`) y se repite este recorrido contra él.
4. Cloudflare y GitHub Pages siguen disponibles a mano como copias del sitio de prueba; si alguna vez Cloudflare reemplazara a Vercel, se decide aparte y se cambia el ADR-015.

## 5. Guion de validación con un coordinador real

Con el staging de Vercel y un coordinador de la demo con una campaña en curso (el modo activo de la sección 3 ya pasó en verde):

1. Entrar con su cuenta; con una cuenta sin rol de coordinador el panel debe negar el acceso con un aviso que diga qué hacer. Probar también «Cerrar sesión» desde el avatar.
2. **Inicio**: las cifras coinciden con lo que ve la persona en el móvil; «hace N min» avanza al recargar.
3. **Equipo**: lista, acompañamientos (registrar uno propio y uno de otro colportor, con nota), becas. **Añadir colportor**: buscar por email, añadir, Deshacer dentro de los 8 s, y cambiar de pestaña con un alta sin contestar (el panel espera y avisa). Una cuenta de coordinación o administración pide confirmar antes de añadirla.
4. **Ciudades**: crear una zona con el mapa, asignar y quitar colportores, eliminar la zona.
5. **Reportes**: horas, ventas y desempeño; exportar CSV (abrir en Excel: acentos y fórmulas) y PDF.
6. Topbar: elegir otra campaña y comprobar que cada pestaña cambia de datos.
7. Cortar la red y repetir una acción: el panel dice que no hay conexión y no pierde lo que ya estaba. Dejar la sesión abierta, esperar a que venza o revocarla, y repetir una acción: la pantalla pide entrar de nuevo con «Tu sesión venció.» y vuelve al mismo lugar.
8. Stock y Cuentas: la barra no las ofrece y `/stock` y `/cuentas` dan 404.

Lo que falle va como issue `fix/` con el paso del guion.
