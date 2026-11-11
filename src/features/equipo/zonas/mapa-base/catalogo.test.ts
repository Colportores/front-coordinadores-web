import casosDeLaLibreria from "@colportores/lib-mapa/pruebas/catalogo/casos.json";
import catalogoDeLaLibreria from "@colportores/lib-mapa/pruebas/catalogo/catalogo-de-ejemplo.json";
import { describe, expect, it } from "vitest";

import {
  estiloConPaquete,
  leerCatalogo,
  MapaBaseInvalido,
  paqueteDeCiudad,
  urlDelCatalogo,
} from "@/features/equipo/zonas/mapa-base/catalogo";

const BUCKET = "https://abc.supabase.co/storage/v1/object/public/mapas";
const URL_CATALOGO = `${BUCKET}/catalogo.json`;
const MONTEVIDEO = "01a117a9-0619-7d34-bbfc-058f61d81448";

const SHA = "581c301248397e2f6ad764adeb4c13f45a564bf129587731e1629e1c9935022a";
const parte = (archivo: unknown, sobre: Record<string, unknown> = {}) => ({ archivo, tamano_bytes: 10_920_234, sha256: SHA, ...sobre });

const paquete = (sobre: Record<string, unknown> = {}) => ({
  id: "ciudad-montevideo",
  nivel: "ciudad",
  ambito_id: MONTEVIDEO,
  nombre: "Montevideo",
  version: "581c301248397e2f6ad764adeb4c13f45a564bf129587731e1629e1c9935022a",
  partes: [parte("paquetes/ciudad/montevideo.581c30124839.pmtiles")],
  ...sobre,
});

const catalogo = (paquetes: unknown[] = [paquete()]) => ({
  version: 1,
  estilo: { url: "estilo/colportores.json", fuente_de_tiles: "protomaps" },
  paquetes,
});

const ESTILO = {
  version: 8,
  glyphs: `${BUCKET}/estilo/glyphs/{fontstack}/{range}.pbf`,
  sources: { protomaps: { type: "vector", attribution: "© OpenStreetMap", url: "pmtiles://REEMPLAZAR" } },
  layers: [
    { id: "fondo", type: "background", paint: { "background-color": "#eee" } },
    { id: "agua", type: "fill", source: "protomaps", "source-layer": "water" },
    { id: "calles", type: "line", source: "protomaps", "source-layer": "roads" },
  ],
};

describe("urlDelCatalogo", () => {
  it("cuelga el catálogo del bucket público de mapas, con o sin barra final", () => {
    expect(urlDelCatalogo("https://abc.supabase.co")).toBe(URL_CATALOGO);
    expect(urlDelCatalogo("https://abc.supabase.co/")).toBe(URL_CATALOGO);
    expect(urlDelCatalogo("https://abc.supabase.co///")).toBe(URL_CATALOGO);
  });

  it("una cadena enorme de barras no cuelga el armado de la URL", () => {
    const inicio = Date.now();
    expect(urlDelCatalogo(`https://abc.supabase.co${"/".repeat(200_000)}`)).toBe(URL_CATALOGO);
    expect(Date.now() - inicio).toBeLessThan(1500);
  });
});

describe("leerCatalogo", () => {
  it("resuelve las rutas relativas al catálogo y deja el paquete de cada ciudad", () => {
    const leido = leerCatalogo(catalogo(), URL_CATALOGO);
    expect(leido.estiloUrl).toBe(`${BUCKET}/estilo/colportores.json`);
    expect(leido.paquetes).toEqual([
      { ambitoId: MONTEVIDEO, nombre: "Montevideo", partes: [`${BUCKET}/paquetes/ciudad/montevideo.581c30124839.pmtiles`] },
    ]);
  });

  it("un paquete mal armado se saltea sin dejar sin mapa a los demás", () => {
    const leido = leerCatalogo(
      catalogo([
        paquete({ ambito_id: undefined }),
        paquete({ nivel: "departamento" }),
        paquete({ partes: [] }),
        paquete({ partes: [{ sha256: "x" }] }),
        paquete({ id: "ciudad-salto", ambito_id: "otra", nombre: "Salto" }),
      ]),
      URL_CATALOGO,
    );
    expect(leido.paquetes.map((p) => p.ambitoId)).toEqual(["otra"]);
  });

  it("no sigue una ruta que sale del bucket (otro servidor u otra carpeta)", () => {
    const leido = leerCatalogo(
      catalogo([
        paquete({ id: "a", ambito_id: "a", partes: [parte("https://malo.example/x.pmtiles")] }),
        paquete({ id: "b", ambito_id: "b", partes: [parte("../../../otro/x.pmtiles")] }),
        paquete({ id: "c", ambito_id: "c" }),
      ]),
      URL_CATALOGO,
    );
    expect(leido.paquetes.map((p) => p.ambitoId)).toEqual(["c"]);
    expect(() => leerCatalogo({ ...catalogo(), estilo: { url: "https://malo.example/estilo.json" } }, URL_CATALOGO)).toThrow(
      MapaBaseInvalido,
    );
  });

  it.each([null, "texto", [], {}, { paquetes: [], estilo: {} }, { paquetes: "no", estilo: { url: "a.json" } }])(
    "un catálogo que no tiene la forma del contrato (%j) se rechaza",
    (json) => {
      expect(() => leerCatalogo(json, URL_CATALOGO)).toThrow(MapaBaseInvalido);
    },
  );
});

describe("leerCatalogo con las reglas del celular (lib-mapa#9 P5)", () => {
  const ids = (paquetes: unknown[]) => leerCatalogo(catalogo(paquetes), URL_CATALOGO).paquetes.map((p) => p.ambitoId);

  it.each([
    "paquetes/ciudad/mvd.pmtiles?x=1",
    "paquetes/ciudad/mvd.pmtiles#parte",
    "./paquetes/ciudad/mvd.pmtiles",
    "paquetes/./ciudad/mvd.pmtiles",
    "paquetes/../paquetes/ciudad/mvd.pmtiles",
    "/storage/v1/object/public/mapas/paquetes/ciudad/mvd.pmtiles",
    "https://abc.supabase.co/storage/v1/object/public/mapas/paquetes/ciudad/mvd.pmtiles",
    "//abc.supabase.co/storage/v1/object/public/mapas/paquetes/ciudad/mvd.pmtiles",
    "paquetes\\ciudad\\mvd.pmtiles",
    "",
  ])("descarta el paquete con la ruta %j aunque quede dentro del bucket", (archivo) => {
    expect(ids([paquete({ partes: [parte(archivo)] })])).toEqual([]);
  });

  it("descarta el id repetido: vale el primero", () => {
    const leido = leerCatalogo(
      catalogo([paquete(), paquete({ nombre: "Montevideo bis", ambito_id: "otra" }), paquete({ id: "ciudad-salto", ambito_id: "s" })]),
      URL_CATALOGO,
    );
    expect(leido.paquetes.map((p) => [p.ambitoId, p.nombre])).toEqual([
      [MONTEVIDEO, "Montevideo"],
      ["s", "Montevideo"],
    ]);
  });

  it.each([
    ["sin id", { id: undefined }],
    ["con un id que no es simple", { id: "ciudad/montevideo" }],
    ["sin versión", { version: undefined }],
    ["con la versión vacía", { version: "  " }],
    ["con un nivel desconocido", { nivel: "barrio" }],
    ["sin sha256", { partes: [parte("paquetes/ciudad/mvd.pmtiles", { sha256: undefined })] }],
    ["con un sha256 corto", { partes: [parte("paquetes/ciudad/mvd.pmtiles", { sha256: "abc" })] }],
    ["sin tamaño", { partes: [parte("paquetes/ciudad/mvd.pmtiles", { tamano_bytes: undefined })] }],
    ["con tamaño 0", { partes: [parte("paquetes/ciudad/mvd.pmtiles", { tamano_bytes: 0 })] }],
    ["con un tamaño no entero", { partes: [parte("paquetes/ciudad/mvd.pmtiles", { tamano_bytes: 1.5 })] }],
  ])("descarta el paquete %s sin tirar el resto", (_, sobre) => {
    expect(ids([paquete(sobre), paquete({ id: "ciudad-salto", ambito_id: "s" })])).toEqual(["s"]);
  });

  it("un paquete de departamento o de Uruguay cuenta para el id repetido pero no es el de una ciudad", () => {
    expect(ids([paquete({ nivel: "departamento" }), paquete({ ambito_id: "otra" })])).toEqual([]);
    expect(ids([paquete({ id: "uy", nivel: "uruguay", ambito_id: undefined }), paquete()])).toEqual([MONTEVIDEO]);
  });

  it.each([undefined, 2, "1", 0])("rechaza el catálogo entero con formato %j (no es el 1)", (version) => {
    expect(() => leerCatalogo({ ...catalogo(), version }, URL_CATALOGO)).toThrow(MapaBaseInvalido);
  });

  it("rechaza el estilo con una ruta que no es simple", () => {
    expect(() => leerCatalogo({ ...catalogo(), estilo: { url: "estilo/colportores.json?v=2" } }, URL_CATALOGO)).toThrow(MapaBaseInvalido);
    expect(() => leerCatalogo({ ...catalogo(), estilo: { url: "./estilo/colportores.json" } }, URL_CATALOGO)).toThrow(MapaBaseInvalido);
  });
});

describe("leerCatalogo contra los casos de lib-mapa (pruebas/catalogo/casos.json)", () => {
  for (const caso of casosDeLaLibreria.casos) {
    it(caso.nombre, () => {
      const leido = leerCatalogo(catalogoDeLaLibreria, casosDeLaLibreria.urlDelCatalogo);
      const paquete = paqueteDeCiudad(leido, caso.ambitoId);
      expect(paquete === null ? null : { nombre: paquete.nombre, partes: paquete.partes }).toEqual(caso.esperado);
    });
  }

  it("trae al menos los casos de la v1.0.0", () => {
    expect(casosDeLaLibreria.casos.length).toBeGreaterThanOrEqual(10);
  });
});

describe("paqueteDeCiudad", () => {
  it("elige por el id de la ciudad en el catálogo; sin paquete devuelve null", () => {
    const leido = leerCatalogo(catalogo(), URL_CATALOGO);
    expect(paqueteDeCiudad(leido, MONTEVIDEO)?.nombre).toBe("Montevideo");
    expect(paqueteDeCiudad(leido, "no-esta")).toBeNull();
  });
});

describe("estiloConPaquete", () => {
  const unaParte = { ambitoId: MONTEVIDEO, nombre: "Montevideo", partes: [`${BUCKET}/paquetes/ciudad/mvd.pmtiles`] };

  it("completa la URL de la fuente de tiles con el archivo de la ciudad y respeta el resto del estilo", () => {
    const estilo = estiloConPaquete(ESTILO, unaParte);
    expect(estilo.sources.protomaps).toMatchObject({
      type: "vector",
      attribution: "© OpenStreetMap",
      url: `pmtiles://${BUCKET}/paquetes/ciudad/mvd.pmtiles`,
    });
    expect(estilo.layers.map((c) => c.id)).toEqual(["fondo", "agua", "calles"]);
    expect(estilo.glyphs).toBe(ESTILO.glyphs);
    // No toca el estilo que recibió (se reutiliza para otra ciudad).
    expect(ESTILO.sources.protomaps.url).toBe("pmtiles://REEMPLAZAR");
  });

  it("con varias partes arma una fuente por parte y repite las capas sobre cada una", () => {
    const estilo = estiloConPaquete(ESTILO, { ...unaParte, partes: [`${BUCKET}/p1.pmtiles`, `${BUCKET}/p2.pmtiles`] });
    expect(Object.keys(estilo.sources)).toEqual(["protomaps", "protomaps-2"]);
    expect((estilo.sources["protomaps-2"] as { url: string }).url).toBe(`pmtiles://${BUCKET}/p2.pmtiles`);
    expect(estilo.layers.map((c) => [c.id, "source" in c ? c.source : null])).toEqual([
      ["fondo", null],
      ["agua", "protomaps"],
      ["agua~2", "protomaps-2"],
      ["calles", "protomaps"],
      ["calles~2", "protomaps-2"],
    ]);
  });

  it.each([null, {}, { sources: {}, layers: [] }, { sources: { protomaps: {} } }])("un estilo sin la fuente de tiles (%j) se rechaza", (malo) => {
    expect(() => estiloConPaquete(malo, unaParte)).toThrow(MapaBaseInvalido);
  });
});
