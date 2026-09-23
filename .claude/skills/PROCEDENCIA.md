# Procedencia de las skills

Skills de dominio instaladas en este repo. Se copian tal cual desde su fuente; si se actualizan, se vuelve a bajar la carpeta entera y se actualiza el commit de referencia de esta tabla.

| Skill | Fuente | Commit de referencia | Licencia | Para qué |
|-------|--------|----------------------|----------|----------|
| `webapp-testing` | [anthropics/skills · `skills/webapp-testing`](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) (oficial de Anthropic) | `b9e19e6f44773509fbdd7001d77ff41a49a486c1` | Apache 2.0 (`webapp-testing/LICENSE.txt`) | QA de vistas con Playwright: estados, navegación con teclado, capturas a 375 px y 1280 px. |
| `accessibility` | [evanca/flutter-ai-rules · `skills/accessibility`](https://github.com/evanca/flutter-ai-rules/tree/main/skills/accessibility) | `e474b2628219b835cfc7b6ecbf7c7652a9cbed03` | MIT (`accessibility/LICENSE`, copiada de la raíz del repo de origen) | Auditoría con el criterio POUR y WCAG A/AA. Aunque viene de un repo de Flutter, las reglas son de plataforma cruzada y aplican a web. |
| `web-perf` | Ya estaba en el commit inicial del repo | — | Ver `web-perf/LICENSE` | Auditoría de rendimiento web (Core Web Vitals) con Chrome DevTools MCP. |

Pedido de Cristian en el issue #2 (23/09): toda vista del panel pasa por el QA de vistas (agente `sprint-qa`) antes del merge del sprint de conexión de cada HU. Para correrlo dentro de Docker, `dockerfile.dev` parte de la imagen de Playwright (Chromium incluido) y `axe-core` es dev dependency.
