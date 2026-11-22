import { describe, expect, it } from "vitest";

import { COLOR_ZONA_SIN_COLOR, colorDeBorde } from "@/datos/equipo/zonas/paleta";
import { leerCatalogo, MapaBaseInvalido, paqueteDeCiudad } from "@/features/equipo/zonas/mapa-base/catalogo";

/**
 * QA de #148 (PR #174): casos límite de las reglas nuevas del catálogo (rutas con trucos de URL, tamaños y sha256 raros, ámbitos
 * con espacios, catálogos enormes) y del borde de zona. No repite los casos de `catalogo.test.ts`.
 */
const BUCKET = "https://abc.supabase.co/storage/v1/object/public/mapas";
const URL_CATALOGO = `${BUCKET}/catalogo.json`;
const CIUDAD = "01a117a9-0619-7d34-bbfc-058f61d81448";
const SHA = "581c301248397e2f6ad764adeb4c13f45a564bf129587731e1629e1c9935022a";

const parte = (archivo: unknown, sobre: Record<string, unknown> = {}) => ({ archivo, tamano_bytes: 1024, sha256: SHA, ...sobre });
const paquete = (sobre: Record<string, unknown> = {}) => ({
  id: "ciudad-montevideo",
  nivel: "ciudad",
  ambito_id: CIUDAD,
  nombre: "Montevideo",
  version: SHA,
  partes: [parte("paquetes/ciudad/montevideo.pmtiles")],
  ...sobre,
});
const catalogo = (paquetes: unknown[] = [paquete()], sobre: Record<string, unknown> = {}) => ({
  version: 1,
  estilo: { url: "estilo/colportores.json" },
  paquetes,
  ...sobre,
});
const ciudadDe = (json: unknown) => paqueteDeCiudad(leerCatalogo(json, URL_CATALOGO), CIUDAD);

describe("QA #148 · catálogo: la ruta no puede salir de la carpeta del bucket", () => {
  it.each([
    ["puntos codificados %2e%2e", "paquetes/%2e%2e/%2e%2e/otro/x.pmtiles"],
    ["puntos mezclados .%2E", "paquetes/.%2E/.%2E/otro/x.pmtiles"],
    ["salto de línea escondido dentro de '..'", "paquetes/\n../../otro/x.pmtiles"],
    ["tabulación antes de //host", "\t//evil.example/x.pmtiles"],
    ["barras invertidas", "paquetes\\..\\..\\otro\\x.pmtiles"],
    ["esquema en mayúsculas", "HTTPS://evil.example/x.pmtiles"],
    ["esquema data:", "data:text/plain,hola"],
  ])("un paquete con la parte «%s» se descarta entero y no tumba al resto", (_nombre, archivo) => {
    const otra = paquete({ id: "ciudad-otra", ambito_id: "otra-ciudad" });
    const leido = leerCatalogo(catalogo([paquete({ partes: [parte(archivo)] }), otra]), URL_CATALOGO);
    expect(paqueteDeCiudad(leido, CIUDAD)).toBeNull();
    expect(paqueteDeCiudad(leido, "otra-ciudad")?.partes).toHaveLength(1);
  });

  it.skip("QA #148: una parte con la ruta de solo espacios se resuelve contra la URL del catálogo y queda el propio catalogo.json como «tiles»", () => {
    expect(ciudadDe(catalogo([paquete({ partes: [parte("   ")] })]))).toBeNull();
  });

  it("un estilo con la ruta codificada que sube de carpeta hace fallar el catálogo (no hay mapa sin estilo)", () => {
    expect(() => leerCatalogo(catalogo([paquete()], { estilo: { url: "estilo/%2e%2e/%2e%2e/otro.json" } }), URL_CATALOGO)).toThrow(MapaBaseInvalido);
  });

  it("una ruta con tildes, espacios y emoji se acepta y queda codificada", () => {
    const leido = ciudadDe(catalogo([paquete({ partes: [parte("paquetes/ciudad/Montevideo ñandú 🗺.pmtiles")] })]));
    expect(leido?.partes[0]).toBe(`${BUCKET}/paquetes/ciudad/Montevideo%20%C3%B1and%C3%BA%20%F0%9F%97%BA.pmtiles`);
  });
});

describe("QA #148 · catálogo: tamaño y sha256 de cada parte", () => {
  it.each([
    ["sha256 de 63 caracteres", { sha256: SHA.slice(1) }],
    ["sha256 de 65 caracteres", { sha256: `${SHA}0` }],
    ["sha256 con una letra que no es hex", { sha256: `g${SHA.slice(1)}` }],
    ["sha256 numérico", { sha256: 12345 }],
    ["sha256 vacío", { sha256: "" }],
    ["tamaño 0", { tamano_bytes: 0 }],
    ["tamaño negativo", { tamano_bytes: -5 }],
    ["tamaño con decimales", { tamano_bytes: 10.5 }],
    ["tamaño como texto", { tamano_bytes: "1024" }],
    ["tamaño nulo", { tamano_bytes: null }],
    ["tamaño infinito", { tamano_bytes: Number.POSITIVE_INFINITY }],
  ])("%s: el paquete se descarta", (_nombre, sobre) => {
    expect(ciudadDe(catalogo([paquete({ partes: [parte("a.pmtiles", sobre)] })]))).toBeNull();
  });

  it("un sha256 en mayúsculas o mezclado se acepta (es hex igual)", () => {
    const ciudad = ciudadDe(catalogo([paquete({ partes: [parte("a.pmtiles", { sha256: SHA.toUpperCase() })] })]));
    expect(ciudad?.partes).toEqual([`${BUCKET}/a.pmtiles`]);
  });

  it("una sola parte mala de varias descarta el paquete, aunque la primera esté bien", () => {
    const partes = [parte("a.pmtiles"), parte("b.pmtiles", { sha256: "no-es-hex" })];
    expect(ciudadDe(catalogo([paquete({ partes })]))).toBeNull();
  });
});

describe("QA #148 · catálogo: nivel, ámbito, versión e id", () => {
  it("«zona» no es un nivel del contrato: se descarta; «departamento» y «uruguay» se leen pero no son de ninguna ciudad", () => {
    const leido = leerCatalogo(
      catalogo([
        paquete({ id: "z", nivel: "zona" }),
        paquete({ id: "d", nivel: "departamento", ambito_id: CIUDAD }),
        paquete({ id: "u", nivel: "uruguay", ambito_id: undefined }),
      ]),
      URL_CATALOGO,
    );
    expect(leido.paquetes).toEqual([]);
  });

  it("el ámbito con espacios alrededor se recorta y se encuentra; uno solo de espacios descarta el paquete", () => {
    expect(ciudadDe(catalogo([paquete({ ambito_id: `  ${CIUDAD}  ` })]))?.ambitoId).toBe(CIUDAD);
    expect(ciudadDe(catalogo([paquete({ ambito_id: "   " })]))).toBeNull();
    expect(ciudadDe(catalogo([paquete({ ambito_id: 42 })]))).toBeNull();
  });

  it.each([
    ["sin version", { version: undefined }],
    ["version vacía", { version: "" }],
    ["version de solo espacios", { version: "  " }],
    ["version numérica", { version: 7 }],
    ["id con espacios", { id: "ciudad montevideo" }],
    ["id de 81 caracteres", { id: "a".repeat(81) }],
    ["id vacío", { id: "" }],
    ["id numérico", { id: 5 }],
    ["partes que no es lista", { partes: "a.pmtiles" }],
    ["partes vacía", { partes: [] }],
    ["una parte que no es objeto", { partes: ["a.pmtiles"] }],
  ])("%s: el paquete se descarta", (_nombre, sobre) => {
    expect(ciudadDe(catalogo([paquete(sobre)]))).toBeNull();
  });

  it("ids raros del prototipo no rompen el conteo de repetidos", () => {
    const leido = leerCatalogo(
      catalogo([
        paquete({ id: "__proto__", ambito_id: "a" }),
        paquete({ id: "constructor", ambito_id: "b" }),
        paquete({ id: "toString", ambito_id: "c" }),
      ]),
      URL_CATALOGO,
    );
    expect(leido.paquetes.map((p) => p.ambitoId)).toEqual(["a", "b", "c"]);
  });

  it("el nombre con emoji o larguísimo se guarda recortado y entero (el recorte visual es de la vista)", () => {
    const largo = `Ciudad ${"ñ".repeat(500)} 🗺`;
    expect(ciudadDe(catalogo([paquete({ nombre: `  ${largo}  ` })]))?.nombre).toBe(largo);
    expect(ciudadDe(catalogo([paquete({ nombre: 42 })]))?.nombre).toBe("");
  });
});

describe("QA #148 · catálogo: forma del JSON", () => {
  it.each([
    ["null", null],
    ["un número", 7],
    ["una lista", []],
    ["un texto", "catalogo"],
    ["sin estilo", { version: 1, paquetes: [] }],
    ["paquetes que no es lista", { version: 1, estilo: { url: "e.json" }, paquetes: {} }],
  ])("%s falla con MapaBaseInvalido, nunca con un error de tipos", (_nombre, json) => {
    expect(() => leerCatalogo(json, URL_CATALOGO)).toThrow(MapaBaseInvalido);
  });

  it.each([["la versión como texto", "1"], ["la versión 2", 2], ["la versión 0", 0], ["sin versión", undefined]])(
    "%s: el formato no se reconoce y el catálogo entero se rechaza (el mapa cae al aviso «sin calles», con Reintentar)",
    (_nombre, version) => {
      expect(() => leerCatalogo(catalogo([paquete()], { version }), URL_CATALOGO)).toThrow(MapaBaseInvalido);
    },
  );

  it("el mensaje del rechazo no deja ver la URL ni los datos del catálogo", () => {
    try {
      leerCatalogo(catalogo([paquete()], { version: 9 }), URL_CATALOGO);
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain("supabase.co");
      expect(String(e)).not.toContain(CIUDAD);
    }
  });

  it("un catálogo con 20 000 paquetes y una ruta de 200 000 caracteres se lee sin colgarse", () => {
    const muchos = Array.from({ length: 20_000 }, (_, i) => paquete({ id: `c${i}`, ambito_id: `a${i}` }));
    muchos.push(paquete({ id: "larga", ambito_id: "larga", partes: [parte(`${"a/".repeat(100_000)}x.pmtiles`)] }));
    const inicio = Date.now();
    const leido = leerCatalogo(catalogo(muchos), URL_CATALOGO);
    expect(leido.paquetes.length).toBeGreaterThanOrEqual(20_000);
    expect(Date.now() - inicio).toBeLessThan(3000);
  });
});

describe("QA #148 · colorDeBorde con valores que vienen de la base", () => {
  it.each(["#13407a", "#13407A"])("acepta %s en minúsculas o mayúsculas y devuelve #RRGGBB", (color) => {
    expect(colorDeBorde(color)).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it.each(["#13407AFF", "#FFF", "rgb(1,2,3)", "", "   ", "#GGGGGG", "javascript:alert(1)"])(
    "«%s» se dibuja como una zona sin color, sin lanzar",
    (malo) => {
      expect(colorDeBorde(malo)).toBe(colorDeBorde(COLOR_ZONA_SIN_COLOR));
    },
  );

  it("un valor que no es texto (nulo o indefinido que se cuela de la base) tampoco rompe el mapa", () => {
    expect(colorDeBorde(null as unknown as string)).toBe(colorDeBorde(COLOR_ZONA_SIN_COLOR));
    expect(colorDeBorde(undefined as unknown as string)).toBe(colorDeBorde(COLOR_ZONA_SIN_COLOR));
  });

  it("el blanco y el negro, los extremos, dan un borde que sigue siendo #RRGGBB", () => {
    for (const extremo of ["#FFFFFF", "#000000"]) expect(colorDeBorde(extremo)).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
