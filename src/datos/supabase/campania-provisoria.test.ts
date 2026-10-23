import { describe, expect, it, vi } from "vitest";

import { campaniaProvisoria } from "@/datos/supabase/campania-provisoria";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

const clienteQueContesta = (respuesta: unknown) => {
  const llamarRpc = vi.fn(async () => {
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  });
  return { cliente: { llamarRpc } as unknown as ClienteRpc, llamarRpc };
};

describe("campaniaProvisoria", () => {
  it("es la primera de campanias_del_coordinador (las en curso vienen antes que las por empezar)", async () => {
    const { cliente, llamarRpc } = clienteQueContesta([
      { id: "c-1", nombre: "Verano 2026", tipo: "VERANO" },
      { id: "c-2", nombre: "Otoño 2027", tipo: "OTONO" },
    ]);

    expect(await campaniaProvisoria(cliente)).toEqual({ id: "c-1", nombre: "Verano 2026" });
    expect(llamarRpc).toHaveBeenCalledTimes(1);
    expect(llamarRpc).toHaveBeenCalledWith("campanias_del_coordinador", {});
  });

  it("devuelve la primera aunque todavía no haya empezado: qué hacer con eso lo decide cada vista", async () => {
    const { cliente } = clienteQueContesta([{ id: "c-3", nombre: "Verano 2027", tipo: "VERANO", estado: "POR_EMPEZAR" }]);

    expect(await campaniaProvisoria(cliente)).toEqual({ id: "c-3", nombre: "Verano 2027" });
  });

  it("sin ninguna campaña que no haya terminado es null", async () => {
    expect(await campaniaProvisoria(clienteQueContesta([]).cliente)).toBeNull();
  });

  it("una respuesta que no es una lista de campañas con id y nombre es inesperada", async () => {
    await expect(campaniaProvisoria(clienteQueContesta({ id: "c-1" }).cliente)).rejects.toBeInstanceOf(RespuestaInesperada);
    await expect(campaniaProvisoria(clienteQueContesta([{ id: "c-1" }]).cliente)).rejects.toBeInstanceOf(RespuestaInesperada);
    await expect(campaniaProvisoria(clienteQueContesta([{ nombre: "Verano" }]).cliente)).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("una falla de la red o del servicio NO es «sin campaña»: sale como excepción", async () => {
    const caida = new TypeError("fetch failed");
    const servicio = new ErrorSupabase("boom", 503);

    await expect(campaniaProvisoria(clienteQueContesta(caida).cliente)).rejects.toBe(caida);
    await expect(campaniaProvisoria(clienteQueContesta(servicio).cliente)).rejects.toBe(servicio);
  });
});

describe("campaniaProvisoria con una campaña elegida (#70)", () => {
  const lista = [
    { id: "c-1", nombre: "Verano 2026", tipo: "VERANO" },
    { id: "c-2", nombre: "Permanente 2026", tipo: "PERMANENTE" },
    { id: "c-3", nombre: "Verano 2027", tipo: "VERANO" },
  ];

  it("es la elegida si figura en la lista, aunque no sea la primera ni haya empezado", async () => {
    const { cliente } = clienteQueContesta(lista);
    expect(await campaniaProvisoria(cliente, "c-3")).toEqual({ id: "c-3", nombre: "Verano 2027" });
  });

  it("si la elegida ya no figura (terminó, se dio de baja o la cookie es ajena), vuelve a la primera", async () => {
    const { cliente } = clienteQueContesta(lista);
    expect(await campaniaProvisoria(cliente, "c-9")).toEqual({ id: "c-1", nombre: "Verano 2026" });
    expect(await campaniaProvisoria(cliente, "")).toEqual({ id: "c-1", nombre: "Verano 2026" });
  });

  it("sin elegir ninguna (null o undefined), es la primera", async () => {
    const { cliente } = clienteQueContesta(lista);
    expect(await campaniaProvisoria(cliente, null)).toEqual({ id: "c-1", nombre: "Verano 2026" });
    expect(await campaniaProvisoria(cliente, undefined)).toEqual({ id: "c-1", nombre: "Verano 2026" });
  });

  it("la elegida no inventa una campaña: sin lista sigue siendo null", async () => {
    const { cliente } = clienteQueContesta([]);
    expect(await campaniaProvisoria(cliente, "c-1")).toBeNull();
  });
});
