import { describe, expect, it, vi } from "vitest";

import { fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { crearFuenteEquipoSupabase } from "@/datos/equipo/supabase";
import type { ClienteSupabase } from "@/datos/supabase/cliente";

const CAMPANIA = {
  id: "camp-1",
  nombre: "Campaña Montevideo (demo)",
  campania_ciudad: [{ ciudad: { id: "ciu-1", nombre: "Montevideo" } }],
};

const CON_ZONA = {
  usuario_id: "u-1",
  nombre: "Colportor",
  apellido: "Demo",
  zona_id: "z-1",
  zona_nombre: "Zona X",
  suspendido: false,
  email: "colportor.demo@example.com",
  estado: "ACTIVA",
};

const SIN_ZONA = { ...CON_ZONA, usuario_id: "u-2", nombre: "Ana", apellido: "", zona_id: null, zona_nombre: null, email: "ana@example.com" };

function clienteCon(campanias: unknown[], inscriptos: unknown[]) {
  const consultar = vi.fn(async () => campanias);
  const llamarRpc = vi.fn(async () => inscriptos);
  return { cliente: { consultar, llamarRpc } as unknown as ClienteSupabase, consultar, llamarRpc };
}

describe("fuenteEquipoSupabase", () => {
  it("lee la campaña vigente del coordinador y sus inscriptos con colportores_de_campania", async () => {
    const { cliente, consultar, llamarRpc } = clienteCon([CAMPANIA], [CON_ZONA]);

    await crearFuenteEquipoSupabase(cliente, fuenteEquipoSimulada).obtenerEquipo();

    expect(consultar).toHaveBeenCalledWith(expect.stringMatching(/^campania\?select=.*&limit=1$/));
    expect(llamarRpc).toHaveBeenCalledWith("colportores_de_campania", { p_campania_id: "camp-1" });
  });

  it("arma la región con las ciudades y una fila por inscripto, con su zona", async () => {
    const { cliente } = clienteCon([CAMPANIA], [CON_ZONA]);

    const equipo = await crearFuenteEquipoSupabase(cliente, fuenteEquipoSimulada).obtenerEquipo();

    expect(equipo.region).toBe("Montevideo");
    expect(equipo.colportores).toEqual([
      expect.objectContaining({
        id: "u-1",
        nombre: "Colportor Demo",
        ciudadId: "ciu-1",
        ciudadNombre: "Montevideo",
        zonas: ["Zona X"],
      }),
    ]);
    expect(equipo.sinZonaAsignada).toEqual([]);
  });

  it("lo que no tiene fuente real queda vacío o con «—», sin números inventados", async () => {
    const { cliente } = clienteCon([CAMPANIA], [CON_ZONA]);

    const equipo = await crearFuenteEquipoSupabase(cliente, fuenteEquipoSimulada).obtenerEquipo();

    expect(equipo.colportores[0]).toMatchObject({ horasSemana: "—", ventas: "—", ultimaSync: "—", sincronizacionVieja: false });
    expect(equipo.preciosPorCiudad).toEqual([]);
    expect(equipo.acompanamiento).toMatchObject({
      ultimosAcompanamientos: [],
      jornadasRecientes: [],
      jornadasAcompanadas: 0,
      jornadasTotales: 0,
    });
  });

  it("el inscripto sin zona aparece en la tabla como «Sin asignar» y en la lista de sin zona, con su correo", async () => {
    const { cliente } = clienteCon([CAMPANIA], [CON_ZONA, SIN_ZONA]);

    const equipo = await crearFuenteEquipoSupabase(cliente, fuenteEquipoSimulada).obtenerEquipo();

    expect(equipo.colportores.find((c) => c.id === "u-2")).toMatchObject({ nombre: "Ana", zonas: [] });
    expect(equipo.sinZonaAsignada).toEqual([{ id: "u-2", nombre: "Ana", nota: "ana@example.com" }]);
  });

  it("una campaña sin ciudades usa su propio nombre como región", async () => {
    const { cliente } = clienteCon([{ ...CAMPANIA, campania_ciudad: [] }], [CON_ZONA]);

    const equipo = await crearFuenteEquipoSupabase(cliente, fuenteEquipoSimulada).obtenerEquipo();

    expect(equipo.region).toBe("Campaña Montevideo (demo)");
    expect(equipo.colportores[0].ciudadNombre).toBe("Campaña Montevideo (demo)");
  });

  it("varias ciudades: la región las junta y los colportores quedan en la primera", async () => {
    const dos = {
      ...CAMPANIA,
      campania_ciudad: [...CAMPANIA.campania_ciudad, { ciudad: { id: "ciu-2", nombre: "Las Piedras" } }],
    };
    const { cliente } = clienteCon([dos], [CON_ZONA]);

    const equipo = await crearFuenteEquipoSupabase(cliente, fuenteEquipoSimulada).obtenerEquipo();

    expect(equipo.region).toBe("Montevideo, Las Piedras");
    expect(equipo.colportores[0].ciudadId).toBe("ciu-1");
  });

  it("sin campaña vigente devuelve el equipo vacío y no consulta inscriptos", async () => {
    const { cliente, llamarRpc } = clienteCon([], []);

    const equipo = await crearFuenteEquipoSupabase(cliente, fuenteEquipoSimulada).obtenerEquipo();

    expect(equipo.region).toBe("Sin campaña vigente");
    expect(equipo.colportores).toEqual([]);
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("un error de Supabase no se traga: llega a la página", async () => {
    const cliente = {
      consultar: vi.fn(async () => {
        throw new Error("Supabase respondió 500");
      }),
      llamarRpc: vi.fn(),
    } as unknown as ClienteSupabase;

    await expect(crearFuenteEquipoSupabase(cliente, fuenteEquipoSimulada).obtenerEquipo()).rejects.toThrow("500");
  });

  it("añadir e inscribir colportores siguen siendo los simulados", async () => {
    const simulada = {
      obtenerEquipo: vi.fn(),
      obtenerAnadirColportor: vi.fn(async () => ({ campaniaId: "x", campania: "x", candidatos: [], equipoActual: [] })),
      inscribirColportor: vi.fn(async () => ({ ok: true as const })),
    };
    const { cliente, consultar, llamarRpc } = clienteCon([], []);
    const fuente = crearFuenteEquipoSupabase(cliente, simulada);

    await fuente.obtenerAnadirColportor();
    await fuente.inscribirColportor("camp-1", "u-9");

    expect(simulada.obtenerAnadirColportor).toHaveBeenCalledOnce();
    expect(simulada.inscribirColportor).toHaveBeenCalledWith("camp-1", "u-9");
    expect(consultar).not.toHaveBeenCalled();
    expect(llamarRpc).not.toHaveBeenCalled();
  });
});
