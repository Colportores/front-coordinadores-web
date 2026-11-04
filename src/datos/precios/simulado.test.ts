import { describe, expect, it } from "vitest";

import { claveDe } from "./contrato";
import { CIUDADES_SIMULADAS, crearDatosDePreciosSimulados, fuentePreciosSimulada, ITEMS_SIMULADOS } from "./simulado";

describe("datos simulados de precios (vista 27)", () => {
  it("trae el catálogo del canvas y las dos ciudades, Montevideo con tres excepciones y Las Piedras con ninguna", () => {
    const d = crearDatosDePreciosSimulados();
    expect(d.items).toHaveLength(8);
    expect(d.ciudades.map((c) => c.nombre)).toEqual(["Montevideo", "Las Piedras"]);
    expect(Object.keys(d.excepciones[CIUDADES_SIMULADAS[0].id])).toHaveLength(3);
    expect(Object.keys(d.excepciones[CIUDADES_SIMULADAS[1].id])).toHaveLength(0);
  });

  it("cada llamada devuelve datos propios: modificar uno no contamina el siguiente", async () => {
    const a = crearDatosDePreciosSimulados();
    a.items[0].nombre = "otro";
    a.excepciones[CIUDADES_SIMULADAS[0].id] = {};
    const b = (await fuentePreciosSimulada.obtenerPrecios())!;
    expect(b.items[0].nombre).toBe("Salud y Hogar");
    expect(Object.keys(b.excepciones[CIUDADES_SIMULADAS[0].id])).toHaveLength(3);
  });

  it("las claves distinguen un producto de una colección y son únicas", () => {
    const claves = ITEMS_SIMULADOS.map((i) => i.clave);
    expect(new Set(claves).size).toBe(claves.length);
    expect(claves).toContain(claveDe("COLECCION", ITEMS_SIMULADOS[6].id));
  });

  describe("guardar valida como el servidor y no guarda nada", () => {
    const ciudad = CIUDADES_SIMULADAS[0].id;
    const item = ITEMS_SIMULADOS[0];
    const guardar = (c: string, cambios: Parameters<typeof fuentePreciosSimulada.guardarPrecios>[2]) => fuentePreciosSimulada.guardarPrecios("camp", c, cambios);

    it("acepta un precio entero, o null para quitar la excepción", async () => {
      expect(await guardar(ciudad, [{ tipo: "PRODUCTO", id: item.id, precio: 2700 }])).toEqual({ ok: true });
      expect(await guardar(ciudad, [{ tipo: "PRODUCTO", id: item.id, precio: null }])).toEqual({ ok: true });
    });

    it.each([0, -5, 12.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])("rechaza el precio %s", async (precio) => {
      expect(await guardar(ciudad, [{ tipo: "PRODUCTO", id: item.id, precio }])).toMatchObject({ ok: false, causa: "rechazado" });
    });

    it("rechaza una ciudad ajena, un item que no es del catálogo o una lista vacía", async () => {
      expect(await guardar("otra", [{ tipo: "PRODUCTO", id: item.id, precio: 100 }])).toMatchObject({ ok: false, causa: "rechazado" });
      expect(await guardar(ciudad, [{ tipo: "PRODUCTO", id: "nada", precio: 100 }])).toMatchObject({ ok: false, causa: "rechazado" });
      expect(await guardar(ciudad, [])).toMatchObject({ ok: false, causa: "rechazado" });
    });
  });
});
