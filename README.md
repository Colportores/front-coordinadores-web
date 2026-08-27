# front-coordinadores-web

Panel web del coordinador: seguimiento de sus equipos de colportores, asignación de zonas, control de jornadas y reportes de su asociación.

**Estado: en construcción** — repo creado según la nomenclatura de [ADR-015](https://github.com/Colportores/docs-organizacion/blob/main/docs/decisiones/ADR-015-nomenclatura-repositorios.md); todavía sin código.

## Contexto

Parte del sistema [Colportaje App](https://github.com/Colportores). La arquitectura, los flujos y las decisiones viven en la [documentación de la organización](https://github.com/Colportores/docs-organizacion).

- Habla únicamente con su BFF ([bff-coordinadores](https://github.com/Colportores/bff-coordinadores)); nunca con Supabase directo ([ADR-016](https://github.com/Colportores/docs-organizacion/blob/main/docs/decisiones/ADR-016-bff-por-aplicacion.md)).
- Stack previsto: Next.js 14 (App Router) + React + TypeScript + Shadcn/ui ([ADR-008](https://github.com/Colportores/docs-organizacion/blob/main/docs/decisiones/ADR-008-stack-panel-web.md)).

## Privacidad

Los datos personales de clientes (`persona.nombre`, `persona.apellido`, `persona.telefono`, `nota.texto`) son **local-only**: viven solo en el dispositivo del colportor y nunca llegan al cloud, por la Ley 18.331 de Uruguay. Ver [`02-restricciones.md`](https://github.com/Colportores/docs-organizacion/blob/main/docs/02-restricciones.md).

Este panel **no recibe ni muestra** datos de clientes: trabaja con agregados, estado de ubicaciones y métricas de equipo.

## Licencia

Uso propio — todos los derechos reservados. Ver [LICENSE](./LICENSE).
