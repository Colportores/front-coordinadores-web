import { afterEach, describe, expect, it, vi } from "vitest";

/** El `Protocol` es el real; solo `maplibre-gl` (que necesita WebGL) se reemplaza por un doble que guarda el protocolo registrado. */
const maplibre = vi.hoisted(() => ({
  cargadores: new Map<string, (params: { url: string; type: string }, control: AbortController) => Promise<unknown>>(),
}));

vi.mock("maplibre-gl", () => ({
  addProtocol: (nombre: string, cargador: never) => maplibre.cargadores.set(nombre, cargador),
  removeProtocol: (nombre: string) => maplibre.cargadores.delete(nombre),
}));

const ARCHIVO = "https://abc.supabase.co/storage/v1/object/public/mapas/paquetes/ciudad/mvd.pmtiles";

async function pedirTileJson() {
  const cargador = maplibre.cargadores.get("pmtiles");
  if (!cargador) throw new Error("el protocolo no está registrado");
  return cargador({ url: `pmtiles://${ARCHIVO}`, type: "json" }, new AbortController()).catch(() => "fallo");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  maplibre.cargadores.clear();
});

describe("pmtiles", () => {
  it("registrar dos veces deja un solo protocolo", async () => {
    const { registrarPmtiles } = await import("@/features/equipo/zonas/mapa-base/pmtiles");
    registrarPmtiles();
    const primero = maplibre.cargadores.get("pmtiles");
    registrarPmtiles();
    expect(maplibre.cargadores.get("pmtiles")).toBe(primero);
  });

  it("tras una falla de red, olvidarArchivosPmtiles hace que el reintento vuelva a pedir el archivo (sin eso, devuelve el fallo guardado)", async () => {
    const pedido = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", pedido);
    const { olvidarArchivosPmtiles, registrarPmtiles } = await import("@/features/equipo/zonas/mapa-base/pmtiles");
    registrarPmtiles();

    expect(await pedirTileJson()).toBe("fallo");
    const antes = pedido.mock.calls.length;
    expect(antes).toBeGreaterThan(0);

    // El mismo protocolo recuerda el fallo: no hay ningún pedido nuevo.
    expect(await pedirTileJson()).toBe("fallo");
    expect(pedido.mock.calls.length).toBe(antes);

    olvidarArchivosPmtiles();
    expect(await pedirTileJson()).toBe("fallo");
    expect(pedido.mock.calls.length).toBeGreaterThan(antes);
  });

  it("olvidarArchivosPmtiles antes de registrar también deja el protocolo listo", async () => {
    const { olvidarArchivosPmtiles } = await import("@/features/equipo/zonas/mapa-base/pmtiles");
    olvidarArchivosPmtiles();
    expect(maplibre.cargadores.has("pmtiles")).toBe(true);
  });
});
