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

const paquete = (sobre: Record<string, unknown> = {}) => ({
  id: "ciudad-montevideo",
  nivel: "ciudad",
  ambito_id: MONTEVIDEO,
  nombre: "Montevideo",
  partes: [{ archivo: "paquetes/ciudad/montevideo.581c30124839.pmtiles" }],
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
        paquete({ ambito_id: "otra", nombre: "Salto" }),
      ]),
      URL_CATALOGO,
    );
    expect(leido.paquetes.map((p) => p.ambitoId)).toEqual(["otra"]);
  });

  it("no sigue una ruta que sale del bucket (otro servidor u otra carpeta)", () => {
    const leido = leerCatalogo(
      catalogo([
        paquete({ ambito_id: "a", partes: [{ archivo: "https://malo.example/x.pmtiles" }] }),
        paquete({ ambito_id: "b", partes: [{ archivo: "../../../otro/x.pmtiles" }] }),
        paquete({ ambito_id: "c" }),
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
