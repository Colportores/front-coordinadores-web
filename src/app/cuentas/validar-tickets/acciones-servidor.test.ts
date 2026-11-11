import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccionesValidarTickets } from "@/datos/cuentas/validar";

const conectadas = vi.hoisted(() => ({ valor: null as AccionesValidarTickets | null }));

vi.mock("@/datos/cuentas/validar", () => ({
  get accionesValidarTickets() {
    return conectadas.valor;
  },
}));

const { crearAccionesValidarTickets } = await import("@/app/cuentas/validar-tickets/acciones-servidor");

const TICKET = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ok = { ok: true as const, valor: { resueltoEn: "2026-11-10T14:00:00Z", yaEstaba: false } };

function acciones() {
  return {
    validar: vi.fn(async () => ok),
    rechazar: vi.fn(async () => ok),
    enlaceDeFoto: vi.fn(async () => ({ ok: true as const, valor: "https://r2.example/x.jpg" })),
  };
}

afterEach(() => {
  conectadas.valor = null;
});

describe("server actions de la vista 29 (#170)", () => {
  it("de lo que manda el navegador solo pasan el id y el tipo (y el motivo)", async () => {
    const a = acciones();
    conectadas.valor = a;
    const servidor = crearAccionesValidarTickets();
    const desdeElNavegador = { id: TICKET, tipo: "deposito", monto: 1, colportorId: "otro", cifras: { enMano: 0, deuda: 0 } } as never;

    expect(await servidor.validar(desdeElNavegador)).toEqual(ok);
    expect(a.validar).toHaveBeenCalledWith({ id: TICKET, tipo: "deposito" });
    await servidor.rechazar(desdeElNavegador, "Foto ilegible");
    expect(a.rechazar).toHaveBeenCalledWith({ id: TICKET, tipo: "deposito" }, "Foto ilegible");
    expect(await servidor.enlaceDeFoto(TICKET)).toEqual({ ok: true, valor: "https://r2.example/x.jpg" });
  });

  it("un motivo o un id que no son texto llegan vacíos (la fuente los rechaza sin llamar a la base)", async () => {
    const a = acciones();
    conectadas.valor = a;
    const servidor = crearAccionesValidarTickets();

    await servidor.rechazar(null as never, 42 as never);
    expect(a.rechazar).toHaveBeenCalledWith({ id: undefined, tipo: undefined }, "");
    await servidor.enlaceDeFoto({} as never);
    expect(a.enlaceDeFoto).toHaveBeenCalledWith("");
  });

  it("sin Supabase no hay acciones del servidor: tira (la página usa las simuladas del navegador)", async () => {
    await expect(crearAccionesValidarTickets().validar({ id: TICKET, tipo: "deposito" })).rejects.toThrow(/no está conectada/);
  });
});
