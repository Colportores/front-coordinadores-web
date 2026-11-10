import { describe, expect, it } from "vitest";

import { armarCuentasSimuladas } from "@/datos/cuentas/simulado";
import { aplicarAlquiler, subtituloDeSeleccion, TODAS } from "@/features/cuentas/modelo";

/**
 * Una campaña sin alquiler (41B·01). Cristian, 10/11: una campaña no deja de cobrar alquiler a mitad de camino, así que
 * «no se cobra» es de una campaña que nunca cobró y el subtítulo no dice «la campaña dejó de cobrar alquiler el dd/mm».
 */
const AHORA = new Date("2026-11-04T15:00:00.000Z");

describe("la campaña sin alquiler", () => {
  it("el subtítulo es el de siempre: sin fecha de «dejó de cobrar»", () => {
    const datos = armarCuentasSimuladas(AHORA);
    const sinAlquiler = aplicarAlquiler(datos, 0);
    expect(subtituloDeSeleccion(sinAlquiler, TODAS)).toBe(subtituloDeSeleccion(datos, TODAS));
    expect(subtituloDeSeleccion(sinAlquiler, TODAS)).not.toMatch(/dejó de cobrar/);
  });

  it("pasar el alquiler a 0 no suma ningún dato nuevo a las cuentas", () => {
    const datos = armarCuentasSimuladas(AHORA);
    expect(Object.keys(aplicarAlquiler(datos, 0)).sort()).toEqual(Object.keys(datos).sort());
    expect(Object.keys(aplicarAlquiler(aplicarAlquiler(datos, 0), 5000)).sort()).toEqual(Object.keys(datos).sort());
  });

  it("los datos de ejemplo cobran alquiler: lo «por decidir» sale de las bajas, de a una", () => {
    const datos = armarCuentasSimuladas(AHORA);
    expect(datos.alquilerPorColportor).toBeGreaterThan(0);
    expect(datos.colportores.filter((c) => c.baja).length).toBeGreaterThan(0);
  });
});
