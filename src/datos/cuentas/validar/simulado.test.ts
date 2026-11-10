import { describe, expect, it } from "vitest";

import { armarValidacionSimulada, crearAccionesDeValidacionSimuladas } from "./simulado";

const AHORA = new Date("2026-11-10T14:00:00.000Z");
const item = (id: string) => armarValidacionSimulada(AHORA).items.find((x) => x.id === id)!;

describe("validación simulada (vista 29)", () => {
  it("trae depósitos y retiros, ninguno con datos de clientes", () => {
    const { items } = armarValidacionSimulada(AHORA);
    expect(new Set(items.map((x) => x.tipo))).toEqual(new Set(["deposito", "retiro"]));
    for (const x of items) expect(Object.keys(x).some((k) => /cliente/i.test(k))).toBe(false);
    expect(items.filter((x) => x.esVos)).toHaveLength(1);
  });

  it("validar dos veces lo mismo responde que ya estaba; decidir lo contrario se rechaza", async () => {
    const acciones = crearAccionesDeValidacionSimuladas();
    const r1 = await acciones.validar(item("lucia-benitez-retiro"));
    expect(r1).toMatchObject({ ok: true, valor: { yaEstaba: false } });
    expect(await acciones.validar(item("lucia-benitez-retiro"))).toMatchObject({ ok: true, valor: { yaEstaba: true } });
    const r3 = await acciones.rechazar(item("lucia-benitez-retiro"), "No recibí el efectivo");
    expect(r3.ok).toBe(false);
  });

  it("el motivo se recorta y no puede ir vacío ni pasar de 500", async () => {
    const acciones = crearAccionesDeValidacionSimuladas();
    expect((await acciones.rechazar(item("lucia-fernandez-por-validar"), "   ")).ok).toBe(false);
    expect((await acciones.rechazar(item("lucia-fernandez-por-validar"), "x".repeat(501))).ok).toBe(false);
    expect((await acciones.rechazar(item("lucia-fernandez-por-validar"), "  Foto ilegible  ")).ok).toBe(true);
  });

  it("la foto de ejemplo es una imagen embebida", async () => {
    const r = await crearAccionesDeValidacionSimuladas().enlaceDeFoto("lucia-fernandez-por-validar");
    expect(r.ok && r.valor.startsWith("data:image/svg+xml")).toBe(true);
  });
});
