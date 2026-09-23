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

La imagen (`dockerfile.dev`) parte de la de Playwright, que trae Node y Chromium para el QA de vistas.

### Modo dev

`NEXT_PUBLIC_MODO_DEV=1` (activo en `compose.dev.yml`, apagado en staging y producción) muestra el estado de cada historia de usuario: chips sobre cada sección, estado agregado en la navegación y el panel flotante "Estado de HU". El registro está en `src/dev/estado-hu.ts`.

Las pestañas **Stock** y **Cuentas** muestran datos simulados hasta su conexión en V2: tienen flag propio (`NEXT_PUBLIC_PESTANA_STOCK`, `NEXT_PUBLIC_PESTANA_CUENTAS`) que, si no se define, sigue al modo dev. En staging y producción quedan ocultas.

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
