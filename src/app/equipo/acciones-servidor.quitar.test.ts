import { beforeEach, describe, expect, it, vi } from "vitest";

const { quitarDeCampania } = vi.hoisted(() => ({ quitarDeCampania: vi.fn() }));
vi.mock("@/datos/equipo", () => ({ fuenteEquipo: { quitarDeCampania } }));

import { crearAccionesEquipo } from "./acciones-servidor";

/** #184: «Quitar de la campaña» en el servidor lleva la campaña atada; el navegador solo dice a quién. */
describe("#184 · quitarDeCampania en el servidor", () => {
  beforeEach(() => {
    quitarDeCampania.mockReset();
    quitarDeCampania.mockResolvedValue({ ok: true });
  });

  it("le pasa a la fuente la campaña de la página y el colportor", async () => {
    const resultado = await crearAccionesEquipo("camp-1").quitarDeCampania!("col-1");

    expect(resultado).toEqual({ ok: true });
    expect(quitarDeCampania).toHaveBeenCalledExactlyOnceWith("camp-1", "col-1");
  });

  it("una falla de la fuente sale como excepción (la vista la muestra como falta de conexión)", async () => {
    quitarDeCampania.mockRejectedValueOnce(new Error("Failed to fetch"));

    await expect(crearAccionesEquipo("camp-1").quitarDeCampania!("col-1")).rejects.toThrow("Failed to fetch");
  });
});
