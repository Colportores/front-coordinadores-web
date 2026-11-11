import { describe, expect, it, vi } from "vitest";

import { crearFuenteEquipoSupabase } from "@/datos/equipo/supabase";
import type { ClienteSupabase } from "@/datos/supabase/cliente";

describe("fuenteEquipoSupabase", () => {
  it("la vista 33 va por las RPC de la pestaña y no por la tabla ni por datos simulados", async () => {
    const llamarRpc = vi.fn(async (nombre: string): Promise<unknown> => {
      if (nombre === "campanias_del_coordinador") return [];
      throw new Error(`RPC inesperada: ${nombre}`);
    });
    const consultar = vi.fn();
    const fuente = crearFuenteEquipoSupabase({ consultar, llamarRpc } as unknown as ClienteSupabase);

    expect(await fuente.obtenerEquipoPorCiudad()).toBeNull();
    expect(llamarRpc).toHaveBeenCalledWith("campanias_del_coordinador", {});
    expect(consultar).not.toHaveBeenCalled();
  });

  it("la vista de añadir colportores va por las RPC (`rpc.ts`), no por la tabla ni por datos simulados", async () => {
    const llamarRpc = vi.fn(async (nombre: string): Promise<unknown> => {
      if (nombre === "campanias_del_coordinador") return [];
      throw new Error(`RPC inesperada: ${nombre}`);
    });
    const consultar = vi.fn();
    const fuente = crearFuenteEquipoSupabase({ consultar, llamarRpc } as unknown as ClienteSupabase);

    expect(await fuente.obtenerAnadirColportor()).toBeNull();
    expect(llamarRpc).toHaveBeenCalledWith("campanias_del_coordinador", {});
    expect(consultar).not.toHaveBeenCalled();

    llamarRpc.mockImplementation(async (nombre: string): Promise<unknown> => {
      if (nombre === "inscribir_colportor") return {};
      throw new Error(`RPC inesperada: ${nombre}`);
    });
    const ana = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const campania = "11111111-1111-4111-8111-111111111111";
    expect(await fuente.inscribirColportor(campania, ana)).toEqual({ ok: true });
    expect(llamarRpc).toHaveBeenCalledWith("inscribir_colportor", { p_campania_id: campania, p_usuario_id: ana });
  });

  it("registrar un acompañamiento llama a agregar_acompaniamiento con la campaña y la jornada", async () => {
    const campania = "11111111-1111-4111-8111-111111111111";
    const jornada = "22222222-2222-4222-8222-222222222222";
    const llamarRpc = vi.fn(async (): Promise<unknown> => [
      { jornada_id: jornada, colportor_id: "c", dia: "2026-10-02", acompaniante_id: "a", acompaniante_nombre: "Mariana", acompaniante_apellido: "Pérez", ya_estaba: false, acompaniamiento_origen: "COORDINADOR", acompaniamiento_nota: null },
    ]);
    const fuente = crearFuenteEquipoSupabase({ consultar: vi.fn(), llamarRpc } as unknown as ClienteSupabase);

    expect(await fuente.registrarAcompanamiento(campania, jornada)).toEqual({
      ok: true,
      dia: "2026-10-02",
      acompanante: "Mariana Pérez",
      yaEstaba: false,
      origen: "COORDINADOR",
      nota: null,
    });
    expect(llamarRpc).toHaveBeenCalledWith("agregar_acompaniamiento", { p_campania_id: campania, p_jornada_id: jornada });
  });
});
