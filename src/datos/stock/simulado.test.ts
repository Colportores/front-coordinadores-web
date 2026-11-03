import { describe, expect, it } from "vitest";

import { fuenteStock } from "@/datos/stock";
import { crearDatosDeStockSimulados, fuenteStockSimulada } from "@/datos/stock/simulado";

describe("fuente simulada de Stock", () => {
  it("tiene las tres ciudades del canvas, 25 colportores y 11 productos", () => {
    const datos = crearDatosDeStockSimulados();

    expect(datos.ciudades.map((c) => c.nombre)).toEqual(["Rivera", "Artigas", "Bella Unión"]);
    expect(datos.colportores).toHaveLength(25);
    expect(datos.productos).toHaveLength(11);
    expect(new Set(datos.colportores.map((c) => c.id)).size).toBe(25);
  });

  it("cada colportor tiene una existencia por producto y su ciudad existe", () => {
    const datos = crearDatosDeStockSimulados();
    const ciudades = new Set(datos.ciudades.map((c) => c.id));

    for (const c of datos.colportores) {
      expect(ciudades.has(c.ciudadId ?? "")).toBe(true);
      expect(c.existencias.map((e) => e.productoId)).toEqual(datos.productos.map((p) => p.id));
    }
  });

  it("es siempre el mismo: la semilla sale del colportor y el producto", () => {
    const ahora = new Date("2026-10-27T15:00:00Z");

    expect(crearDatosDeStockSimulados(ahora)).toEqual(crearDatosDeStockSimulados(new Date(ahora)));
  });

  it("la fuente entrega los datos de ahora", async () => {
    const datos = await fuenteStockSimulada.obtenerStock();

    expect(datos?.colportores).toHaveLength(25);
  });

  it("cada colportor trae cuándo llegó su último dato: casi todos de las últimas 31 horas, uno de hace tres días y uno nunca", () => {
    const ahora = new Date("2026-10-27T15:00:00Z");
    const datos = crearDatosDeStockSimulados(ahora);
    const horas = (nombre: string) => {
      const c = datos.colportores.find((x) => x.nombre === nombre);
      return c?.ultimoDatoAt == null ? null : (ahora.getTime() - Date.parse(c.ultimoDatoAt)) / 3_600_000;
    };

    expect(horas("Natalia Vidal")).toBeGreaterThan(72);
    expect(horas("Nicolás Viera")).toBeNull();
    const otros = datos.colportores.filter((c) => !["Natalia Vidal", "Nicolás Viera"].includes(c.nombre));
    expect(otros.every((c) => c.ultimoDatoAt !== null && ahora.getTime() - Date.parse(c.ultimoDatoAt) < 31 * 3_600_000)).toBe(true);
  });

  it("no trae plata ni datos de clientes", () => {
    const texto = JSON.stringify(crearDatosDeStockSimulados());

    expect(texto).not.toMatch(/monto|deuda|depositado|enMano|cliente|email|telefono/i);
  });

  it("el selector apunta a la simulada hasta que se conecte la RPC (V2)", () => {
    expect(fuenteStock).toBe(fuenteStockSimulada);
  });
});
