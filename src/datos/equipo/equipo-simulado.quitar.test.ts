import { describe, expect, it } from "vitest";

import { crearEquipoSimulado } from "@/datos/equipo/equipo-simulado";

/** #184 (HU-CAM-005): la fuente simulada sabe quitar a alguien de la campaña y lo recuerda. */
describe("fuente simulada · quitar de la campaña", () => {
  it("marca que sabe quitar, y quien se quita deja de figurar en la siguiente lectura", async () => {
    const fuente = crearEquipoSimulado();
    const antes = await fuente.obtenerEquipoPorCiudad();
    if (!antes) throw new Error("la simulada siempre tiene campaña");
    const [primero] = antes.colportores;

    expect(antes.sePuedeQuitar).toBe(true);
    expect(await fuente.quitarDeCampania(antes.campaniaId, primero.id)).toEqual({ ok: true });

    const despues = await fuente.obtenerEquipoPorCiudad();
    expect(despues?.colportores.map((c) => c.id)).not.toContain(primero.id);
    expect(despues?.colportores).toHaveLength(antes.colportores.length - 1);
  });

  it("un segundo pedido por la misma persona no es un error: ya no estaba", async () => {
    const fuente = crearEquipoSimulado();
    const datos = await fuente.obtenerEquipoPorCiudad();
    const id = datos!.colportores[0].id;

    await fuente.quitarDeCampania(datos!.campaniaId, id);

    expect(await fuente.quitarDeCampania(datos!.campaniaId, id)).toEqual({ ok: true, yaEstaba: true });
  });

  it("alguien que no está en la campaña se rechaza con un aviso que dice qué hacer", async () => {
    const fuente = crearEquipoSimulado();

    expect(await fuente.quitarDeCampania("campania", "no-existe")).toEqual({ ok: false, mensaje: expect.stringContaining("Recargá la página") });
  });
});
