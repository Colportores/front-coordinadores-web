import { afterEach, describe, expect, it, vi } from "vitest";

import { crearBuscarServidor } from "@/app/equipo/anadir/buscar-servidor";
import { crearInscribirServidor } from "@/app/equipo/anadir/inscribir-servidor";
import { fuenteEquipo } from "@/datos/equipo";

/** Las server actions de la vista 23: la campaña queda atada a la acción y el navegador solo manda el resto. */
describe("server actions de la vista 23", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buscar manda a la fuente la campaña atada, el texto y el cursor, y devuelve lo que ella contesta", async () => {
    const respuesta = { ok: true as const, candidatos: [], hayMas: false };
    const espia = vi.spyOn(fuenteEquipo, "buscarCandidatos").mockResolvedValueOnce(respuesta);

    const resultado = await crearBuscarServidor("campania-1")("ana", "cursor-1");

    expect(resultado).toBe(respuesta);
    expect(espia).toHaveBeenCalledExactlyOnceWith("campania-1", "ana", "cursor-1");
  });

  it("inscribir manda a la fuente la campaña atada y la cuenta", async () => {
    const espia = vi.spyOn(fuenteEquipo, "inscribirColportor").mockResolvedValueOnce({ ok: true });

    const resultado = await crearInscribirServidor("campania-1")("usuario-1");

    expect(resultado).toEqual({ ok: true });
    expect(espia).toHaveBeenCalledExactlyOnceWith("campania-1", "usuario-1");
  });

  it("si la fuente falla (sin red, sesión vencida), el error sigue su camino: la vista dice «sin conexión»", async () => {
    vi.spyOn(fuenteEquipo, "buscarCandidatos").mockRejectedValueOnce(new Error("sin red"));

    await expect(crearBuscarServidor("campania-1")("ana", null)).rejects.toThrow("sin red");
  });
});
