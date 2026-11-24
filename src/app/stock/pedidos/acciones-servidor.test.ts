import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccionesPedidos } from "@/datos/stock/pedidos";

const conectadas = vi.hoisted(() => ({ valor: null as AccionesPedidos | null }));

vi.mock("@/datos/stock/pedidos", () => ({
  get accionesPedidos() {
    return conectadas.valor;
  },
}));

const { crearAccionesPedidos } = await import("@/app/stock/pedidos/acciones-servidor");

const PEDIDO = "dddddddd-dddd-4ddd-8ddd-000000000001";
const PRODUCTO = "ffffffff-ffff-4fff-8fff-00000000000a";
const resuelta = { ok: true as const, valor: { tipo: "pedido" as const, id: PEDIDO, estado: "AUTORIZADO" as const, resueltoEn: "2026-11-24T15:00:00Z", motivoDeRechazo: null } };

function acciones() {
  return {
    decidir: vi.fn(async () => resuelta),
    editarLimite: vi.fn(async (limite: number | null) => ({ ok: true as const, valor: { limiteDeDeuda: limite } })),
  };
}

afterEach(() => {
  conectadas.valor = null;
});

describe("server actions de la vista 35 (#215)", () => {
  it("de lo que manda el navegador solo pasan el tipo, el id, la acción y el motivo", async () => {
    const a = acciones();
    conectadas.valor = a;
    const servidor = crearAccionesPedidos();
    const desdeElNavegador = { tipo: "pedido", id: PEDIDO, accion: "rechazar", motivo: "Pedí menos", monto: 1, colportorId: "otro" } as never;

    expect(await servidor.decidir(desdeElNavegador)).toEqual(resuelta);
    expect(a.decidir).toHaveBeenCalledWith({ tipo: "pedido", id: PEDIDO, accion: "rechazar", motivo: "Pedí menos" });
  });

  it("al autorizar reducido pasan solo el id del producto y la cantidad de cada línea (ni nombres ni montos)", async () => {
    const a = acciones();
    conectadas.valor = a;
    await crearAccionesPedidos().decidir({
      tipo: "pedido",
      id: PEDIDO,
      accion: "autorizar",
      cantidades: [{ nombre: "Salud y Hogar", productoId: PRODUCTO, cantidad: 3, monto: 99 } as never],
    });

    expect(a.decidir).toHaveBeenCalledWith({
      tipo: "pedido",
      id: PEDIDO,
      accion: "autorizar",
      cantidades: [{ nombre: "", productoId: PRODUCTO, cantidad: 3 }],
    });
  });

  it("autorizar sin cantidades no inventa cantidades; unas cantidades que no son una lista llegan vacías (la fuente las rechaza)", async () => {
    const a = acciones();
    conectadas.valor = a;
    const servidor = crearAccionesPedidos();

    await servidor.decidir({ tipo: "pedido", id: PEDIDO, accion: "autorizar" });
    expect(a.decidir).toHaveBeenLastCalledWith({ tipo: "pedido", id: PEDIDO, accion: "autorizar" });
    await servidor.decidir({ tipo: "pedido", id: PEDIDO, accion: "autorizar", cantidades: "todo" } as never);
    expect(a.decidir).toHaveBeenLastCalledWith({ tipo: "pedido", id: PEDIDO, accion: "autorizar", cantidades: [] });
  });

  it("un motivo que no es texto llega vacío y una decisión nula no rompe", async () => {
    const a = acciones();
    conectadas.valor = a;
    const servidor = crearAccionesPedidos();

    await servidor.decidir({ tipo: "pedido", id: PEDIDO, accion: "rechazar", motivo: 42 } as never);
    expect(a.decidir).toHaveBeenLastCalledWith({ tipo: "pedido", id: PEDIDO, accion: "rechazar", motivo: "" });
    await servidor.decidir(null as never);
    expect(a.decidir).toHaveBeenLastCalledWith({ tipo: undefined, id: undefined, accion: undefined });
  });

  it("el límite pasa con la campaña; null lo quita; el 0 sigue siendo 0", async () => {
    const a = acciones();
    conectadas.valor = a;
    const servidor = crearAccionesPedidos();

    await servidor.editarLimite?.(35_000, "11111111-1111-4111-8111-111111111111");
    expect(a.editarLimite).toHaveBeenLastCalledWith(35_000, "11111111-1111-4111-8111-111111111111");
    await servidor.editarLimite?.(null, "11111111-1111-4111-8111-111111111111");
    expect(a.editarLimite).toHaveBeenLastCalledWith(null, "11111111-1111-4111-8111-111111111111");
    await servidor.editarLimite?.(0);
    expect(a.editarLimite).toHaveBeenLastCalledWith(0, undefined);
  });

  it("algo que no es un número ni null NUNCA se toma por «quitar el límite»: llega como NaN", async () => {
    const a = acciones();
    conectadas.valor = a;
    const servidor = crearAccionesPedidos();

    for (const raro of [undefined, "35000", {}, [], true]) {
      await servidor.editarLimite?.(raro as never, 42 as never);
      expect(a.editarLimite).toHaveBeenLastCalledWith(Number.NaN, undefined);
    }
  });

  it("sin Supabase no hay acciones del servidor: tira (la página usa las simuladas del navegador)", async () => {
    await expect(crearAccionesPedidos().decidir({ tipo: "pedido", id: PEDIDO, accion: "autorizar" })).rejects.toThrow(/no está conectada/);
    await expect(crearAccionesPedidos().editarLimite?.(1)).rejects.toThrow(/no está conectada/);
  });

  it("una fuente sin editarLimite avisa en vez de callarse", async () => {
    conectadas.valor = { decidir: vi.fn() };
    await expect(crearAccionesPedidos().editarLimite?.(1)).rejects.toThrow(/no puede editar el límite/);
  });
});
