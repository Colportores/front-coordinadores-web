import { beforeEach, describe, expect, it, vi } from "vitest";

const { asignarTipoDeBeca } = vi.hoisted(() => ({ asignarTipoDeBeca: vi.fn() }));
vi.mock("@/datos/equipo", () => ({ fuenteEquipo: { asignarTipoDeBeca } }));

import { crearAccionesEquipo } from "./acciones-servidor";

/** QA #95: el tipo de beca viene del navegador; solo valen media, completa y null («Sin beca»). */
describe("QA #95 · asignarTipoDeBeca en el servidor", () => {
  beforeEach(() => {
    asignarTipoDeBeca.mockReset();
    asignarTipoDeBeca.mockResolvedValue({ ok: true });
  });

  it.each<["media" | "completa" | null]>([["media"], ["completa"], [null]])("deja pasar %s a la fuente, con la campaña atada", async (tipo) => {
    await crearAccionesEquipo("camp-1").asignarTipoDeBeca("col-1", tipo);

    expect(asignarTipoDeBeca).toHaveBeenCalledExactlyOnceWith("camp-1", "col-1", tipo);
  });

  it.each([["MEDIA"], ["SIN_BECA"], [""], ["sin-beca"], [undefined], [0], [false], [{}], [["media"]]])(
    "rechaza %j con un aviso que dice qué hacer, sin tocar la fuente",
    async (tipo) => {
      const resultado = await crearAccionesEquipo("camp-1").asignarTipoDeBeca("col-1", tipo as never);

      expect(resultado).toEqual({ ok: false, mensaje: expect.stringContaining("Recargá la página") });
      expect(asignarTipoDeBeca).not.toHaveBeenCalled();
    },
  );
});
