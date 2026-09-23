# Cómo se construye una pestaña del panel

Contrato entre el **shell** (topbar, layout, tokens, modo dev, registro de HU) y las **cinco pestañas** (Inicio, Equipo, Stock, Cuentas, Reportes). Cada pestaña se trabaja en su propia rama y en paralelo con las demás: si todos respetan este contrato, ninguna pisa a otra.

Diseño de referencia: Claude Design, proyecto "Vistas colportaje", archivo `Panel Coordinador.dc.html` (secciones INICIO, EQUIPO, STOCK, CUENTAS, REPORTES). Es una plantilla (`<sc-for>`, `<sc-if>`, `{{ }}`): se traduce a React, no se copia.

## 1. Qué archivos son tuyos

| Pestaña | Página | Componentes | Datos |
|---------|--------|-------------|-------|
| Inicio | `src/app/inicio/page.tsx` | `src/features/inicio/**` | `src/datos/inicio/**` |
| Equipo | `src/app/equipo/page.tsx` | `src/features/equipo/**` | `src/datos/equipo/**` |
| Stock | `src/app/stock/page.tsx` | `src/features/stock/**` | `src/datos/stock/**` |
| Cuentas | `src/app/cuentas/page.tsx` | `src/features/cuentas/**` | `src/datos/cuentas/**` |
| Reportes | `src/app/reportes/page.tsx` | `src/features/reportes/**` | `src/datos/reportes/**` |

Podés crear subrutas bajo tu carpeta de `src/app/<ruta>/` si el diseño las pide (por ejemplo un detalle).

**Regla: no se toca ningún archivo fuera de tu pestaña.** Son del shell y no se editan desde una pestaña:

- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/not-found.tsx`, `src/app/globals.css` (tokens).
- `src/proxy.ts`, `src/app/stock/layout.tsx` y `src/app/cuentas/layout.tsx` (el flag que oculta esas pestañas: el proxy corta la petición antes de renderizar y los layouts desactivan el prerender).
- `src/shell/**` (topbar, navegación, `ContenidoPestana`), `src/dev/**` (modo dev y **`estado-hu.ts`**), `src/config/**`, `src/datos/shell/**`, `src/lib/**`, `src/components/ui/**`, `src/test/**` (helpers de tests, p. ej. `fijarFlags`).
- `package.json`, `package-lock.json`, configs y `docs/`.

Si necesitás algo de esa lista (un token nuevo, un componente de `ui/`, una dependencia, cambiar el estado de una HU), no lo agregues: dejalo anotado como pendiente en tu PR y en tu issue.

## 2. Estructura de la página

```tsx
// src/app/equipo/page.tsx
import { fuenteEquipo } from "@/datos/equipo";
import { TablaColportores } from "@/features/equipo/TablaColportores";
import { SeccionHu } from "@/dev/SeccionHu";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

export default async function PestanaEquipo() {
  const equipo = await fuenteEquipo.obtenerEquipo();
  return (
    <ContenidoPestana titulo="Equipo">
      <SeccionHu hu="HU-CAM-004">
        <TablaColportores filas={equipo.colportores} />
      </SeccionHu>
    </ContenidoPestana>
  );
}
```

- **`ContenidoPestana`** (`@/shell/ContenidoPestana`) es el elemento raíz de toda página: ocupa el área bajo el topbar, tiene su propio scroll, el padding del diseño (20px 22px) y 16px entre bloques. Pide un `titulo` (h1 para lectores de pantalla).
- Las páginas son componentes de servidor por defecto y leen los datos con `await`. Lo interactivo (filtros, pestañas internas) va en componentes con `"use client"` dentro de `src/features/<pestaña>/`.
- **Solo escritorio**: el shell ya fija `min-width: 1280px`. No hace falta layout mobile.

## 3. Tokens de diseño

Están en un solo lugar, `src/app/globals.css`, y se usan como clases de Tailwind. **Nunca se escribe un color hexadecimal en un componente.**

| Qué | Clases |
|-----|--------|
| Fondos | `bg-fondo` (página), `bg-superficie` (tarjetas, blanco), `bg-superficie-calida` (fila resaltada), `bg-superficie-suave` (notas, pista de barras), `bg-superficie-mapa` (placeholder de mapa/imagen) |
| Bordes | `border-borde`, `border-borde-suave` (separadores dentro de tablas) |
| Texto | `text-tinta` (principal), `text-tinta-2`, `text-tinta-suave` (rótulos), `text-tinta-tenue` |
| Marca | `text-marca` / `bg-marca` (#002856), `text-marca-media`, `bg-marca-clara`, `bg-acento` (barras), `bg-grafico-neutro` |
| Estados | `text-exito` + `bg-exito-fondo`, `text-alerta` + `bg-alerta-fondo` + `bg-alerta-punto`, `text-peligro` + `bg-peligro-fondo` |
| Tipografías | `font-sans` (Inter, por defecto), `font-serif` (Source Serif 4: cifras y títulos), `font-mono` (JetBrains Mono) |
| Tamaños | `text-etiqueta` (10px, rótulos en mayúscula + `tracking-etiqueta font-semibold`), `text-mini` (11px), `text-chico` (12px), `text-cuerpo` (12.5px, filas), `text-nav` (13px), `text-titulo` (15px), `text-cifra` (28px) |
| Radios | `rounded-tarjeta` (8px), `rounded-control` (6px), `rounded-pastilla` (insignias), además de `rounded-sm/md/lg` (4/6/8px) |

Equivalencias rápidas del diseño: tarjeta = `rounded-tarjeta border border-borde bg-superficie px-[18px] py-4`; rótulo = `text-etiqueta font-semibold tracking-etiqueta text-tinta-suave`; cifra = `font-serif text-cifra font-semibold text-marca`. Medidas sueltas del diseño (paddings de 18px, grids con fracciones) van con valores arbitrarios de Tailwind (`px-[18px]`, `grid-cols-[1.8fr_1.4fr_1fr]`).

Componentes de shadcn/ui ya instalados en `src/components/ui/`: `button`, `badge`, `card`, `table`, `separator`, `progress`, `tooltip` (ya adaptados a los tokens). Para combinar clases usá `cn()` de `@/lib/utils`.

## 4. Modo dev y `SeccionHu`

Con `NEXT_PUBLIC_MODO_DEV=1` (lo trae `compose.dev.yml`) el panel muestra el estado de cada HU. Cada bloque de tu pestaña que implementa una HU se envuelve en **`<SeccionHu hu="HU-XXX-000">`** (`@/dev/SeccionHu`):

- En modo dev le pone un contorno punteado y un chip con id, estado y si el esquema existe en el back. Fuera del modo dev no agrega nada visible (siempre renderiza el mismo `<div>`, así el layout no cambia; pasale `className` si ese div tiene que ocupar una celda de grilla).
- Para marcar algo chico (un botón, una fila) sin envolverlo: `<ChipHu hu="…" />` de `@/dev/ChipHu`.
- Las HU de cada pestaña ya están en `src/dev/estado-hu.ts` (no lo edites). Usá esos ids:
  - Inicio: `HU-CAM-008`
  - Equipo: `HU-CAM-004`, `HU-CAM-006`, `HU-CAT-005`, `HU-JOR-004`
  - Stock: `HU-STK-001`, `HU-STK-003`, `HU-STK-004`, `HU-STK-005`
  - Cuentas: `HU-CTA-005`, `HU-COB-008`, `HU-CTA-006`
  - Reportes: `HU-REP-001`, `HU-REP-002`, `HU-REP-005`, `HU-REP-004` (heatmap)
- **Stock y Cuentas**: se ven en modo dev (marcadas como bloqueadas); en staging y producción el shell las oculta (flags `NEXT_PUBLIC_PESTANA_STOCK` / `NEXT_PUBLIC_PESTANA_CUENTAS`, que si no se definen siguen al modo dev). No tenés que hacer nada para eso.
- El panel flotante "Estado de HU" (abajo a la derecha) tiene un interruptor para ocultar los chips y sacar capturas limpias.

## 5. Patrón de datos simulados

Por pestaña, tres archivos en `src/datos/<pestaña>/` (el ejemplo completo está en `src/datos/shell/`):

1. **`contrato.ts`**: tipos TypeScript de lo que la vista necesita y la interfaz de la fuente de datos. Es lo que después implementa el BFF (`bff-coordinadores`), así que describí datos de negocio, no detalles de pintado.
   ```ts
   export interface FilaColportor { id: string; nombre: string; ventasMes: number; /* … */ }
   export interface FuenteDatosEquipo { obtenerEquipo(): Promise<{ colportores: FilaColportor[] }> }
   ```
2. **`simulado.ts`**: implementación con los datos de ejemplo del diseño (`export const fuenteEquipoSimulada: FuenteDatosEquipo = { … }`).
3. **`index.ts`**: **único punto de selección**: `export const fuenteEquipo: FuenteDatosEquipo = fuenteEquipoSimulada;`. Al conectar el BFF se cambia esta línea; las vistas importan siempre `fuenteEquipo` desde `@/datos/equipo` y no se tocan.

Las vistas nunca importan `simulado.ts` directo (los tests sí pueden).

**Criterios de datos (obligatorios):**

- El coordinador ve **montos y agregados, nunca datos de clientes**: ni nombres, ni apellidos, ni teléfonos, ni direcciones de clientes, ni notas. Los nombres de **colportores** sí (son el equipo del coordinador).
- Nada de datos simulados que parezcan reales en tickets, comprobantes o fotos de depósitos: placeholders visibles, como en el diseño.
- Montos con el mismo formato que muestra el diseño (por ejemplo `$U 612K`).

## 6. Qué no se decide en una pestaña

- **Acciones sin formulario diseñado** (autorizar, cargar, asignar…): botón con su estilo y sin comportamiento. Su formulario se define al conectar la HU.
- **Mapas y gráficos**: el mapa queda como placeholder (igual que en el diseño) y los gráficos simples se dibujan con divs y tokens, como en el diseño. No se agrega librería de mapas ni de gráficos: eso lo decide Cristian.
- Todo lo que no esté en el diseño ni en la documentación: se deja anotado como pendiente.

## 7. Tests y check

- Tests co-ubicados con el componente (`TablaColportores.test.tsx`), con Vitest + Testing Library. Naming: `describe('Componente') > describe('cuando …') > it('…')`. Para probar modo dev envolvé en `<ProveedorModoDev activo>` (`@/dev/ProveedorModoDev`).
- Todo corre en Docker:
  ```sh
  docker compose -f compose.dev.yml up                 # dev server en http://localhost:3000
  sh scripts/check.sh                                  # lint + typecheck + tests + build (lo mismo que el CI)
  docker compose -f compose.dev.yml run --rm app npx vitest run src/features/equipo   # solo tus tests
  ```
