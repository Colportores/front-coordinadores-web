import { describe, expect, it } from "vitest";

import { contiene } from "@/datos/equipo/zonas/geometria";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";

const MONTEVIDEO = DATOS_ZONAS_SIMULADO.ciudades[0];
const CAMPANIA = DATOS_ZONAS_SIMULADO.campaniaId;
const ids = (...zonas: typeof MONTEVIDEO.zonas) => zonas.map((z) => z.id);

describe("casasDeZonas simulada (sitio de prueba)", () => {
  it("inventa las casas de cada zona dentro de su forma, tantas como sus ubicaciones registradas (hasta el tope)", async () => {
    for (const zona of MONTEVIDEO.zonas) {
      const casas = await fuenteZonasSimulada.casasDeZonas(CAMPANIA, [zona.id]);

      expect(casas).toHaveLength(Math.min(zona.ubicacionesRegistradas, 260));
      expect(casas.every((c) => contiene(zona.poligonoGeojson, c))).toBe(true);
      expect(casas.every((c) => c.zonaIds.length === 1 && c.zonaIds[0] === zona.id)).toBe(true);
    }
  });

  it("son siempre las mismas y con ids distintos", async () => {
    const a = await fuenteZonasSimulada.casasDeZonas(CAMPANIA, ids(...MONTEVIDEO.zonas));
    const b = await fuenteZonasSimulada.casasDeZonas(CAMPANIA, ids(...MONTEVIDEO.zonas));

    expect(b).toEqual(a);
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
  });

  it("Montevideo pasa de 200 casas (se ve el agrupado) y tiene de todos los estados", async () => {
    const casas = await fuenteZonasSimulada.casasDeZonas(CAMPANIA, ids(...MONTEVIDEO.zonas));

    expect(casas.length).toBeGreaterThan(200);
    expect(new Set(casas.map((c) => c.estado)).size).toBe(8);
    expect(new Set(casas.map((c) => c.tipo))).toEqual(new Set(["CASA", "NEGOCIO", "EDIFICIO"]));
  });

  it("una zona que no existe no tiene casas y sin zonas no hay nada", async () => {
    expect(await fuenteZonasSimulada.casasDeZonas(CAMPANIA, ["zona-que-no-existe"])).toEqual([]);
    expect(await fuenteZonasSimulada.casasDeZonas(CAMPANIA, [])).toEqual([]);
  });

  it("nunca lleva montos ni personas", async () => {
    const [casa] = await fuenteZonasSimulada.casasDeZonas(CAMPANIA, ids(MONTEVIDEO.zonas[0]));

    expect(Object.keys(casa).sort()).toEqual(["estado", "id", "lat", "lon", "tipo", "zonaIds"]);
  });
});
