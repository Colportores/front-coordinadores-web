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

  it("es siempre el mismo: la semilla sale del colportor y el producto", async () => {
    expect(await fuenteStockSimulada.obtenerStock()).toEqual(crearDatosDeStockSimulados());
  });

  it("no trae plata ni datos de clientes", () => {
    const texto = JSON.stringify(crearDatosDeStockSimulados());

    expect(texto).not.toMatch(/monto|deuda|depositado|enMano|cliente|email|telefono/i);
  });

  it("el selector apunta a la simulada hasta que se conecte la RPC (V2)", () => {
    expect(fuenteStock).toBe(fuenteStockSimulada);
  });
});
