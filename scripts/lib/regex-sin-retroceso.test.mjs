// Sonar S8786 (regex con retroceso): las guardas del CI siguen detectando lo mismo y no se cuelgan con una entrada larga.
// Los valores de estas pruebas son inventados: el repo es público y no lleva ningún secreto.
import { describe, expect, it } from "vitest";

import { entornoDelBuild, hallazgosEnTexto as hallazgosDemo, problemasDelEntorno, URL_PROYECTO_DEV } from "./guardia-demo-supabase.mjs";
import { hallazgosEnTexto as hallazgosPages } from "./guardia-pages.mjs";
import { esModuloDeServerActions, importsDe } from "./guardia-variantes-local.mjs";

const TOPE_MS = 1500;
const conTiempo = (fn) => {
  const inicio = Date.now();
  const resultado = fn();
  return { resultado, ms: Date.now() - inicio };
};
const resumen = (imports) =>
  imports.map(({ especificador, dinamico, soloTipos, nombres }) => [especificador, dinamico, soloTipos, nombres]);

describe("esModuloDeServerActions", () => {
  it("detecta la directiva sola en su línea, con comillas simples o dobles, con o sin `;` y con sangría", () => {
    expect(esModuloDeServerActions('"use server";')).toBe(true);
    expect(esModuloDeServerActions("'use server'")).toBe(true);
    expect(esModuloDeServerActions('\n\n  "use server"  ;  \nexport const x = 1;')).toBe(true);
    expect(esModuloDeServerActions('"use server";\r\nexport const x = 1;')).toBe(true);
    expect(esModuloDeServerActions("export function f() {\n\t'use server'\n}")).toBe(true);
  });

  it("no la confunde con otra cosa", () => {
    expect(esModuloDeServerActions('"use client";')).toBe(false);
    expect(esModuloDeServerActions('"use server\';')).toBe(false);
    expect(esModuloDeServerActions('const a = "use server";')).toBe(false);
    expect(esModuloDeServerActions('// "use server"')).toBe(false);
    expect(esModuloDeServerActions('"use server" + 1')).toBe(false);
    expect(esModuloDeServerActions("")).toBe(false);
  });

  it("no se cuelga con miles de líneas en blanco o de espacios, con o sin la directiva al final", () => {
    const blancos = " \t \n".repeat(60_000);
    const sin = conTiempo(() => esModuloDeServerActions(blancos + "x"));
    const con = conTiempo(() => esModuloDeServerActions(blancos + '"use server"'));
    expect(sin.resultado).toBe(false);
    expect(con.resultado).toBe(true);
    expect(Math.max(sin.ms, con.ms)).toBeLessThan(TOPE_MS);
  });
});

describe("importsDe", () => {
  it("lee los imports estáticos de todas las formas que usa el panel", () => {
    const texto = [
      'import { a } from "@/a";',
      "import b from './b'",
      'import type { T } from "@/t";',
      'import type Def from "@/def";',
      "import {",
      "  C,",
      "  D,",
      '} from "./cd";',
      '  import * as E from "./e";',
      'import "./efecto";',
      "import './efecto2';",
      'import   x   ,   { y }   from   "./espacios"',
      'import from "./sin-nombres";',
      'import {a}from"./pegado"',
    ].join("\n");
    expect(resumen(importsDe(texto))).toEqual([
      ["@/a", false, false, "{ a }"],
      ["./b", false, false, "b"],
      ["@/t", false, true, "{ T }"],
      ["@/def", false, true, "Def"],
      ["./cd", false, false, "{\n  C,\n  D,\n}"],
      ["./e", false, false, "* as E"],
      ["./efecto", false, false, ""],
      ["./efecto2", false, false, ""],
      ["./espacios", false, false, "x   ,   { y }"],
      ["./sin-nombres", false, false, ""],
      ["./pegado", false, false, "{a}"],
    ]);
  });

  it("lee los dinámicos y guarda la posición de cada uno", () => {
    const texto = 'const x = await import("./d");\n  import { z } from "./z";';
    const imports = importsDe(texto);
    expect(imports.map(({ especificador, dinamico }) => [especificador, dinamico])).toEqual([
      ["./z", false],
      ["./d", true],
    ]);
    expect(imports[0].posicion).toBe(texto.indexOf("  import { z }"));
    expect(imports[1].posicion).toBe(texto.indexOf("import("));
  });

  it("no toma por import lo que no lo es", () => {
    for (const texto of [
      'importar("./x")',
      '// import { a } from "./x"',
      'const s = "import x from y";',
      'import { a } from "./x',
      'import { a } "./x"',
      "import { a } from ;",
      'import x from "";',
      'import x from "a\'b";',
      "import (algo)",
      "import",
    ]) {
      expect(importsDe(texto), texto).toEqual([]);
    }
  });

  it("un `;` antes de la comilla corta el import (no es de este import el `from` que sigue)", () => {
    expect(importsDe('import a;\nconst b = f("x") // from "y"')).toEqual([]);
    expect(resumen(importsDe('import a;\nimport c from "./c"'))).toEqual([["./c", false, false, "c"]]);
  });

  it("no se cuelga con miles de `import` sin cerrar, ni con un solo import larguísimo", () => {
    const sinCierre = conTiempo(() => importsDe("import a\n".repeat(60_000)));
    const largo = conTiempo(() => importsDe(`import {${" a,".repeat(60_000)} } from "./x"`));
    const blancos = conTiempo(() => importsDe(`import${" ".repeat(100_000)}x`));
    const dinamicos = conTiempo(() => importsDe('import(" '.repeat(20_000)));
    expect(sinCierre.resultado).toEqual([]);
    expect(largo.resultado).toHaveLength(1);
    expect(blancos.resultado).toEqual([]);
    expect(dinamicos.resultado).toEqual([]);
    expect(Math.max(sinCierre.ms, largo.ms, blancos.ms, dinamicos.ms)).toBeLessThan(TOPE_MS);
  });
});

describe("hallazgos de la URL de un proyecto de Supabase", () => {
  const ajeno = "https://abcdefghijkl.supabase.co/rest/v1";

  it("siguen detectando la URL de otro proyecto (.co y .in, con cualquier tamaño de letra)", () => {
    expect(hallazgosPages(ajeno)).toHaveLength(1);
    expect(hallazgosPages("https://ABC-def-123.SUPABASE.IN")).toHaveLength(1);
    expect(hallazgosDemo(ajeno)).toEqual([expect.stringContaining("no es el de desarrollo")]);
    expect(hallazgosDemo("https://ABC-def-123.supabase.in/x")).toEqual([expect.stringContaining("no es el de desarrollo")]);
  });

  it("detectan la URL con una etiqueta más larga que 63 letras (aunque se corte, no es la de desarrollo)", () => {
    const larga = `https://${"a".repeat(80)}.supabase.co`;
    expect(hallazgosPages(larga)).toHaveLength(1);
    expect(hallazgosDemo(larga)).toEqual([expect.stringContaining("no es el de desarrollo")]);
  });

  it("no marcan lo que no es la URL de un proyecto", () => {
    for (const texto of ["supabase.co", ".supabase.co", "mi-supabase.com", "abc.supabase.com", "abc.supabase.coz", "abc.supabase"]) {
      expect(hallazgosPages(texto), texto).toEqual([]);
      expect(hallazgosDemo(texto), texto).toEqual([]);
    }
  });

  it("la guarda del artefacto sigue dejando pasar la URL del proyecto de desarrollo", () => {
    expect(hallazgosDemo(`fetch("${URL_PROYECTO_DEV}/rest/v1")`)).toEqual([]);
  });

  it("no se cuelgan con un texto enorme de letras y guiones sin el dominio", () => {
    const enorme = "a-".repeat(150_000);
    const pages = conTiempo(() => hallazgosPages(enorme));
    const demo = conTiempo(() => hallazgosDemo(enorme));
    expect(pages.resultado).toEqual([]);
    expect(demo.resultado).toEqual([]);
    expect(Math.max(pages.ms, demo.ms)).toBeLessThan(TOPE_MS);
  });
});

describe("la barra final de la URL de Supabase del artefacto de demo", () => {
  const base = { NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_AbCdEfGhIjKlMnOpQrSt" };

  it("se ignora con una o varias barras y con espacios", () => {
    for (const url of [URL_PROYECTO_DEV, `${URL_PROYECTO_DEV}/`, `  ${URL_PROYECTO_DEV}///  `]) {
      const env = { ...base, NEXT_PUBLIC_SUPABASE_URL: url };
      expect(problemasDelEntorno(env)).toEqual([]);
      expect(entornoDelBuild(env).NEXT_PUBLIC_SUPABASE_URL).toBe(URL_PROYECTO_DEV);
    }
  });

  it("una URL de otro proyecto o ausente sigue siendo un problema, aunque venga con una cadena larga de barras", () => {
    const larga = conTiempo(() => problemasDelEntorno({ ...base, NEXT_PUBLIC_SUPABASE_URL: `https://otro.supabase.co${"/".repeat(200_000)}x` }));
    expect(larga.resultado).toEqual([expect.stringContaining("no es la del proyecto de desarrollo")]);
    expect(larga.ms).toBeLessThan(TOPE_MS);
    expect(problemasDelEntorno({ ...base, NEXT_PUBLIC_SUPABASE_URL: "///" })).toEqual([expect.stringContaining("falta NEXT_PUBLIC_SUPABASE_URL")]);
    expect(problemasDelEntorno(base)).toEqual([expect.stringContaining("falta NEXT_PUBLIC_SUPABASE_URL")]);
  });
});
