import { describe, expect, it } from "vitest";

import { contiene } from "@/datos/equipo/zonas/geometria";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";

const MONTEVIDEO = DATOS_ZONAS_SIMULADO.ciudades[0];
const CANELONES = DATOS_ZONAS_SIMULADO.ciudades[2];
const CAMPANIA = DATOS_ZONAS_SIMULADO.campaniaId;

describe("casasDeLaCiudad simulada (sitio de prueba)", () => {
  it("inventa las casas de cada zona dentro de su forma, tantas como sus ubicaciones registradas (hasta el tope)", async () => {
    const casas = await fuenteZonasSimulada.casasDeLaCiudad(CAMPANIA, MONTEVIDEO.id);

    for (const zona of MONTEVIDEO.zonas) {
      const deLaZona = casas.filter((c) => c.zonaIds.includes(zona.id));
      expect(deLaZona).toHaveLength(Math.min(zona.ubicacionesRegistradas, 260));
      expect(deLaZona.every((c) => contiene(zona.poligonoGeojson, c))).toBe(true);
    }
  });

  it("suma casas que no caen en ninguna zona: sin zona en la casa y afuera de todas las formas", async () => {
    const casas = await fuenteZonasSimulada.casasDeLaCiudad(CAMPANIA, MONTEVIDEO.id);
    const sinZona = casas.filter((c) => c.zonaIds.length === 0);

    expect(sinZona.length).toBeGreaterThan(0);
    expect(sinZona.every((c) => MONTEVIDEO.zonas.every((z) => !contiene(z.poligonoGeojson, c)))).toBe(true);
    expect(casas.length).toBeGreaterThan(sinZona.length);
  });

  it("una ciudad sin zonas tiene casas, todas sin zona", async () => {
    const casas = await fuenteZonasSimulada.casasDeLaCiudad(CAMPANIA, CANELONES.id);

    expect(CANELONES.zonas).toHaveLength(0);
    expect(casas.length).toBeGreaterThan(0);
    expect(casas.every((c) => c.zonaIds.length === 0)).toBe(true);
  });

  it("son siempre las mismas y con ids distintos", async () => {
    const a = await fuenteZonasSimulada.casasDeLaCiudad(CAMPANIA, MONTEVIDEO.id);
    const b = await fuenteZonasSimulada.casasDeLaCiudad(CAMPANIA, MONTEVIDEO.id);

    expect(b).toEqual(a);
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
  });

  it("Montevideo pasa de 200 casas (se ve el agrupado) y tiene de todos los estados", async () => {
    const casas = await fuenteZonasSimulada.casasDeLaCiudad(CAMPANIA, MONTEVIDEO.id);

    expect(casas.length).toBeGreaterThan(200);
    expect(new Set(casas.map((c) => c.estado)).size).toBe(8);
    expect(new Set(casas.map((c) => c.tipo))).toEqual(new Set(["CASA", "NEGOCIO", "EDIFICIO"]));
  });

  it("una ciudad que no existe no tiene casas", async () => {
    expect(await fuenteZonasSimulada.casasDeLaCiudad(CAMPANIA, "ciudad-que-no-existe")).toEqual([]);
  });

  it("las casas con estado traen la fecha de su último cambio y las «Sin visita» no", async () => {
    const casas = await fuenteZonasSimulada.casasDeLaCiudad(CAMPANIA, MONTEVIDEO.id);

    expect(casas.filter((c) => c.estado !== "SIN_VISITA").every((c) => typeof c.ultimoCambio === "string" && !Number.isNaN(Date.parse(c.ultimoCambio)))).toBe(true);
    expect(casas.filter((c) => c.estado === "SIN_VISITA").every((c) => c.ultimoCambio === null)).toBe(true);
  });

  it("trae la dirección y quien la registró, y algunas casas sin una o sin otro", async () => {
    const casas = await fuenteZonasSimulada.casasDeLaCiudad(CAMPANIA, MONTEVIDEO.id);

    expect(casas.some((c) => typeof c.direccion === "string" && c.direccion !== "")).toBe(true);
    expect(casas.some((c) => c.direccion === null)).toBe(true);
    expect(casas.some((c) => typeof c.registradaPor === "string")).toBe(true);
    expect(casas.some((c) => c.registradaPor === null)).toBe(true);
    // Quien registra es alguien de la ciudad, y nunca una cuenta suspendida.
    const nombres = new Set(MONTEVIDEO.colportores.filter((c) => !c.suspendido).map((c) => c.nombre));
    expect(casas.every((c) => c.registradaPor === null || nombres.has(c.registradaPor as string))).toBe(true);
  });

  it("nunca lleva montos ni personas", async () => {
    const [casa] = await fuenteZonasSimulada.casasDeLaCiudad(CAMPANIA, MONTEVIDEO.id);

    expect(Object.keys(casa).sort()).toEqual(["direccion", "estado", "id", "lat", "lon", "registradaPor", "tipo", "ultimoCambio", "zonaIds"]);
  });
});
