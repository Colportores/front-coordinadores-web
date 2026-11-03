import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  esModuloDeServerActions,
  importsDe,
  PAGINAS_SIN_LOCAL,
  resolverImport,
  revisarVariantesLocal,
} from "./guardia-variantes-local.mjs";

// Vitest corre siempre desde la raíz del repo (en jsdom `import.meta.url` no es una URL de archivo).
const RAIZ = process.cwd();

/** Todo `src/` salvo los tests, con saltos de línea LF (el árbol de trabajo puede estar en CRLF). */
function leerSrc() {
  const archivos = {};
  for (const relativa of readdirSync(join(RAIZ, "src"), { recursive: true })) {
    const ruta = `src/${String(relativa).replaceAll("\\", "/")}`;
    if (!/\.(ts|tsx)$/.test(ruta) || /\.test\.(ts|tsx)$/.test(ruta)) continue;
    archivos[ruta] = readFileSync(join(RAIZ, ruta), "utf8").replaceAll("\r\n", "\n");
  }
  return archivos;
}

const REAL = leerSrc();

/** El código real con un archivo cambiado: `cambiar(texto)` devuelve el texto roto. */
function con(ruta, cambiar) {
  expect(REAL[ruta], `no existe ${ruta}`).toBeDefined();
  const roto = cambiar(REAL[ruta]);
  expect(roto, `el cambio no modificó ${ruta}`).not.toBe(REAL[ruta]);
  return { ...REAL, [ruta]: roto };
}

/** Las páginas con server actions y la variante `*Local` que cada una renderiza en el sitio de prueba. */
const PAGINAS_CON_LOCAL = [
  { pagina: "src/app/ciudades/page.tsx", local: "ZonasCampaniaLocal", archivo: "src/features/equipo/zonas/ZonasCampaniaLocal.tsx" },
  { pagina: "src/app/equipo/page.tsx", local: "EquipoVistaLocal", archivo: "src/features/equipo/vista-33/EquipoVistaLocal.tsx" },
  { pagina: "src/app/equipo/anadir/page.tsx", local: "AnadirColportorLocal", archivo: "src/features/equipo/AnadirColportorLocal.tsx" },
  { pagina: "src/app/inicio/page.tsx", local: "InicioLocal", archivo: "src/features/inicio/InicioLocal.tsx" },
];

describe("guardia de las variantes *Local del sitio de prueba", () => {
  describe("sobre el código del panel", () => {
    it("no encuentra nada roto", () => {
      expect(revisarVariantesLocal(REAL)).toEqual([]);
    });

    it("conoce las páginas con server actions y su variante *Local (la guarda no está vacía)", () => {
      const modulos = Object.keys(REAL).filter((ruta) => esModuloDeServerActions(REAL[ruta]));
      for (const { pagina, local, archivo } of PAGINAS_CON_LOCAL) {
        expect(REAL[pagina]).toContain(`<${local}`);
        expect(REAL[archivo]).toMatch(/^"use client"/);
        const dinamicos = importsDe(REAL[pagina])
          .filter((imp) => imp.dinamico)
          .map((imp) => resolverImport(imp.especificador, pagina, (r) => r in REAL));
        expect(dinamicos.some((ruta) => modulos.includes(ruta)), `${pagina} ya no importa server actions`).toBe(true);
      }
    });

    it("las páginas que no tienen variante *Local lo dicen con su motivo y existen", () => {
      for (const [ruta, motivo] of Object.entries(PAGINAS_SIN_LOCAL)) {
        expect(REAL[ruta], `${ruta} ya no existe: sacala de PAGINAS_SIN_LOCAL`).toBeDefined();
        expect(motivo.length).toBeGreaterThan(10);
      }
    });
  });

  describe.each(PAGINAS_CON_LOCAL)("cuando se rompe $pagina", ({ pagina, local, archivo }) => {
    it("falla si la rama del sitio de prueba deja de renderizar la variante *Local", () => {
      const roto = con(pagina, (t) => t.replace(new RegExp(`<${local}\\b[^>]*/>`), "<div />"));
      expect(revisarVariantesLocal(roto)).toEqual([expect.stringContaining("no renderiza ninguna variante `*Local`")]);
    });

    it("falla si la variante *Local deja de ser un componente de cliente", () => {
      const roto = con(archivo, (t) => t.replace(/^"use client";\n/, ""));
      expect(revisarVariantesLocal(roto)).toEqual([expect.stringContaining('(`"use client"`)')]);
    });

    it("falla si la variante *Local toma el selector de fuente en vez de la simulada", () => {
      const roto = con(archivo, (t) => `${t}\nexport const _x = fuenteEquipo;\n`);
      expect(revisarVariantesLocal(roto)).toEqual([expect.stringContaining("usa el selector `fuenteEquipo`")]);
    });

    it("falla si la variante *Local importa un módulo de server actions", () => {
      const roto = con(archivo, (t) => t.replace(/^("use client";\n)/, '$1import { crearAccionesServidor } from "@/app/ciudades/acciones-servidor";\n'));
      expect(revisarVariantesLocal(roto)).toEqual([expect.stringContaining("importa las server actions de src/app/ciudades/acciones-servidor.ts")]);
    });
  });

  describe("reglas del import de las server actions", () => {
    it("falla con un import estático del módulo de acciones", () => {
      const roto = con("src/app/ciudades/page.tsx", (t) => `import { crearAccionesServidor as _a } from "./acciones-servidor";\n${t}`);
      expect(revisarVariantesLocal(roto)).toEqual([expect.stringContaining("de forma estática")]);
    });

    it("tolera un import estático solo de tipos", () => {
      const roto = con("src/app/ciudades/page.tsx", (t) => `import type { crearAccionesServidor as _a } from "./acciones-servidor";\n${t}`);
      expect(revisarVariantesLocal(roto)).toEqual([]);
    });

    it("falla si el import() está en la rama del sitio de prueba y no en el else", () => {
      const roto = con("src/app/ciudades/page.tsx", (t) =>
        t
          .replace('const { crearAccionesServidor } = await import("./acciones-servidor");', "")
          .replace("const datos = await fuenteZonasSimulada.obtenerZonas();", 'const { crearAccionesServidor } = await import("./acciones-servidor");\n    const datos = await fuenteZonasSimulada.obtenerZonas();\n    void crearAccionesServidor;'),
      );
      expect(revisarVariantesLocal(roto)).toEqual([expect.stringContaining("no está en el `else`")]);
    });

    it("falla si el import() no tiene la condición del sitio de prueba que lo deje afuera", () => {
      const roto = con("src/app/inicio/page.tsx", (t) => t.replace('process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1"', "false"));
      expect(revisarVariantesLocal(roto)).toEqual([expect.stringContaining("no tiene el `if (")]);
    });

    it("también cuida el layout (la lista de campañas del topbar)", () => {
      const roto = con("src/app/layout.tsx", (t) => `import { listarCampaniasAccion as _l } from "./acciones-campanias";\n${t}`);
      expect(revisarVariantesLocal(roto)).toEqual([expect.stringContaining("src/app/layout.tsx: importa las server actions de src/app/acciones-campanias.ts de forma estática")]);
    });
  });

  describe("reglas de la condición y de la rama del sitio de prueba", () => {
    it("falla si la condición no es la literal", () => {
      const roto = con("src/app/equipo/page.tsx", (t) => t.replace('process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1"', 'process.env["NEXT_PUBLIC_DEPLOY_PAGES"] === "1"'));
      expect(revisarVariantesLocal(roto)).toContainEqual(expect.stringContaining("sin la condición literal"));
    });

    it("falla si la rama del sitio de prueba lee cookies o cabeceras", () => {
      const roto = con("src/app/inicio/page.tsx", (t) => t.replace("<InicioLocal />", "{String(cookies())}<InicioLocal />"));
      expect(revisarVariantesLocal(roto)).toEqual([expect.stringContaining("usa `cookies()`")]);
    });

    it("falla si la rama del sitio de prueba espera connection()", () => {
      const roto = con("src/app/equipo/page.tsx", (t) => t.replace("const datos = await fuenteEquipoSimulada.obtenerEquipoPorCiudad();", "await connection();\n    const datos = await fuenteEquipoSimulada.obtenerEquipoPorCiudad();"));
      expect(revisarVariantesLocal(roto)).toEqual([expect.stringContaining("usa `connection()`")]);
    });
  });

  describe("una página nueva con server actions", () => {
    const PAGINA_NUEVA = `import { SeccionHu } from "@/dev/SeccionHu";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

export default async function Nueva() {
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    return <ContenidoPestana titulo="Nueva">{null}</ContenidoPestana>;
  } else {
    const { crearAccionesServidor } = await import("../ciudades/acciones-servidor");
    return <SeccionHu hu="HU-X">{String(crearAccionesServidor)}</SeccionHu>;
  }
}
`;

    it("falla si no trae su variante *Local", () => {
      const roto = { ...REAL, "src/app/nueva/page.tsx": PAGINA_NUEVA };
      expect(revisarVariantesLocal(roto)).toEqual([expect.stringContaining("src/app/nueva/page.tsx: usa server actions y su rama del sitio de prueba no renderiza ninguna variante `*Local`")]);
    });

    it("falla si renderiza una *Local que no existe", () => {
      const conLocal = PAGINA_NUEVA.replace("{null}", "<NuevaLocal />");
      const roto = { ...REAL, "src/app/nueva/page.tsx": conLocal };
      expect(revisarVariantesLocal(roto)).toEqual([expect.stringContaining("no se encuentra su archivo")]);
    });

    it("pasa con una *Local de cliente que usa la fuente simulada", () => {
      const conLocal = `import { NuevaLocal } from "@/features/nueva/NuevaLocal";\n${PAGINA_NUEVA.replace("{null}", "<NuevaLocal />")}`;
      const ok = {
        ...REAL,
        "src/app/nueva/page.tsx": conLocal,
        "src/features/nueva/NuevaLocal.tsx": '"use client";\n\nimport { fuenteNuevaSimulada } from "@/datos/nueva/simulado";\n\nexport function NuevaLocal() {\n  return <p>{String(fuenteNuevaSimulada)}</p>;\n}\n',
      };
      expect(revisarVariantesLocal(ok)).toEqual([]);
    });
  });

  describe("piezas", () => {
    it("reconoce la directiva use server de módulo y la de una función, y no la de un comentario", () => {
      expect(esModuloDeServerActions('"use server";\nexport async function a() {}')).toBe(true);
      expect(esModuloDeServerActions("export function f() {\n  return async () => {\n    'use server';\n  };\n}")).toBe(true);
      expect(esModuloDeServerActions('// el módulo no lleva "use server" a propósito\nexport const x = 1;')).toBe(false);
    });

    it("lee imports estáticos (también de varias líneas y solo de tipos), de efectos y dinámicos", () => {
      const imports = importsDe('import type { A } from "@/a";\nimport {\n  B,\n  C,\n} from "./b";\nimport "./c";\nconst x = await import("./d");');
      expect(imports.map(({ especificador, dinamico, soloTipos }) => [especificador, dinamico, soloTipos])).toEqual([
        ["@/a", false, true],
        ["./b", false, false],
        ["./c", false, false],
        ["./d", true, false],
      ]);
    });

    it("resuelve alias, relativos y carpetas con index, y deja los paquetes", () => {
      const existe = (ruta) => ["src/a/b.ts", "src/c/index.tsx", "src/app/x/acciones.ts"].includes(ruta);
      expect(resolverImport("@/a/b", "src/app/page.tsx", existe)).toBe("src/a/b.ts");
      expect(resolverImport("@/c", "src/app/page.tsx", existe)).toBe("src/c/index.tsx");
      expect(resolverImport("./acciones", "src/app/x/page.tsx", existe)).toBe("src/app/x/acciones.ts");
      expect(resolverImport("../x/acciones", "src/app/y/page.tsx", existe)).toBe("src/app/x/acciones.ts");
      expect(resolverImport("react", "src/app/x/page.tsx", existe)).toBeNull();
      expect(resolverImport("./nada", "src/app/x/page.tsx", existe)).toBeNull();
    });
  });
});
