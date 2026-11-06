# QA de punta a punta y staging

Issue #27 (Sprint 12, cierre). Este documento dice qué se prueba solo, qué hay que hacer a mano y qué falta para que el panel llegue a un coordinador real.

## 1. Qué prueba el CI solo

`npm run check` (lo que corre el CI con `NEXT_PUBLIC_MODO_DEV=0`, como staging y producción) termina con dos verificaciones sobre el build de producción servido con `next start`:

| Paso | Qué comprueba |
|------|---------------|
| `npm run verificar:pestanas-ocultas` | Stock y Cuentas responden 404 y su contenido no está ni en el HTML ni en el payload RSC. |
| `npm run qa:staging` (`scripts/qa-staging.mjs`) | En un Chromium real a 1280 x 800: cada pestaña visible (Inicio, Equipo, Añadir colportor, Ciudades, Reportes) responde 200, tiene un solo h1, marca su pestaña activa, no se desborda, no deja errores de consola, excepciones ni pedidos propios caídos, no muestra rastro del modo dev y no ofrece Stock ni Cuentas en el menú. Stock, Cuentas y sus subrutas dan 404 con el aviso del panel. axe-core (WCAG 2.2 AA) sin violaciones en todas. Y dos flujos que pasan por el servidor: elegir campaña en el topbar (server action, Esc, cookie) y buscar, añadir y deshacer un colportor. |

Para correrlos solos (con el build hecho): `docker compose -f compose.dev.yml run --rm -e NEXT_PUBLIC_MODO_DEV=0 app sh -c "npm run build && npm run qa:staging"`.

El sitio de prueba de GitHub Pages (`npm run build:pages`) tiene su propio build y su propia guarda; no pasa por `qa:staging`.

## 2. Cómo es el build de staging

- Rama `staging` (flujo `feature → develop → staging → production`, siempre por PR con 1 aprobación; los administradores tienen bypass). Hosting: Vercel ([ADR-015](https://github.com/Colportores/docs-organizacion/blob/main/docs/decisiones/ADR-015-paneles-web-nextjs-shadcn.md)). El panel necesita servidor (server actions y `proxy.ts`), no es un export estático.
- Variables: **no definir** `NEXT_PUBLIC_MODO_DEV`, `NEXT_PUBLIC_PESTANA_STOCK` ni `NEXT_PUBLIC_PESTANA_CUENTAS` (así Stock y Cuentas quedan ocultas hasta V2). `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` del proyecto de staging, `https://` y nunca una clave de servicio (el build se frena si lo es). Ninguna otra variable de Supabase: el puente de desarrollo (`SUPABASE_URL`, `SUPABASE_COORDINADOR_*`) se ignora en cualquier build de producción.
- Sin Worker ni BFF: el panel habla directo con las RPC de Supabase con el JWT del coordinador (ADR-013).

## 3. Lo que impide hoy mostrárselo a un coordinador real

Estas piezas no están en el código y no las decide el QA; están anotadas como pendientes del PR:

1. **Sin pantalla de acceso ni guarda de rutas** (#18 dejó la lógica en `src/auth/acceso.ts`; falta la pantalla y proteger las rutas). Sin sesión no hay JWT, y sin JWT las RPC no devuelven nada.
2. **En un build de producción todas las fuentes caen en la simulada**: `leerConfigSupabase` (el puente de desarrollo) devuelve `null` con `NODE_ENV=production` y los `index.ts` de `src/datos/*` no tienen otra rama para producción. Un staging desplegado hoy muestra **datos de ejemplo como si fueran reales**, y a diferencia del sitio de Pages no lleva el aviso de «Versión de prueba con datos simulados».
3. El proyecto de Vercel, las variables de staging y el proyecto de Supabase de staging con su coordinador de prueba los crea una persona con acceso a esas cuentas.
4. La validación con un coordinador real (Agustín) es presencial.

## 4. Guion de validación con un coordinador real

Con staging conectado (puntos 1 a 3 resueltos) y un coordinador de prueba con una campaña en curso:

1. Entrar con su cuenta; con una cuenta sin rol de coordinador el panel debe negar el acceso con un aviso que diga qué hacer.
2. **Inicio**: las cifras coinciden con lo que ve la persona en el móvil; «hace N min» avanza al recargar.
3. **Equipo**: lista, acompañamientos (registrar uno propio y uno de otro colportor, con nota), becas. **Añadir colportor**: buscar por email, añadir, Deshacer dentro de los 8 s, y cambiar de pestaña con un alta sin contestar (el panel espera y avisa).
4. **Ciudades**: crear una zona con el mapa, asignar y quitar colportores, eliminar la zona.
5. **Reportes**: horas, ventas y desempeño; exportar CSV (abrir en Excel: acentos y fórmulas) y PDF.
6. Topbar: elegir otra campaña y comprobar que cada pestaña cambia de datos.
7. Cortar la red y repetir una acción: el panel dice que no hay conexión y no pierde lo que ya estaba.
8. Stock y Cuentas: la barra no las ofrece y `/stock` y `/cuentas` dan 404.

Lo que falle va como issue `fix/` con el paso del guion.
