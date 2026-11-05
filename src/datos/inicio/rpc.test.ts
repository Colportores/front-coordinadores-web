import { describe, expect, it, vi } from "vitest";

import { pedirTablero } from "@/datos/inicio/pedir-tablero";
import { crearFuenteInicioRpc, RechazoDelTablero } from "@/datos/inicio/rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const OTRA = "22222222-2222-4222-8222-222222222222";
const RIVERA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BELLA_UNION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SALTO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const colportor = (id: string, extra: Record<string, unknown> = {}) => ({
  colportor_id: id,
  nombre: "Lucía",
  apellido: "Fernández",
  estado: "EN_JORNADA",
  horas: 2.8,
  presentaciones: 4,
  ventas: 2,
  monto_total: 435000,
  ultimo_push_at: "2026-10-21T13:28:00+00:00",
  ...extra,
});

/** Lo que devuelve `tablero_de_inicio()` (migraciones 0054 y 0055). */
const tablero = (cambios: Record<string, unknown> = {}) => ({
  fecha: "2026-10-21",
  es_hoy: true,
  calculado_a: "2026-10-21T13:40:00+00:00",
  total: { cantidad_colportores: 1, en_jornada: 1, horas: 2.8, presentaciones: 4, ventas: 2, monto_total: 435000 },
  ciudades: [
    { ciudad_id: BELLA_UNION, nombre: "Bella Unión", cantidad_colportores: 0, en_jornada: 0, horas: 0, presentaciones: 0, ventas: 0, monto_total: 0, colportores: [] },
    { ciudad_id: RIVERA, nombre: "Rivera", cantidad_colportores: 1, en_jornada: 1, horas: 2.8, presentaciones: 4, ventas: 2, monto_total: 435000, colportores: [colportor("u-1")] },
  ],
  sin_zona: [
    { colportor_id: "u-9", nombre: "Rocío", apellido: "Benítez", estado: "SIN_INICIAR", inscripcion_de_baja: false, inscripto_at: "2026-10-21T14:02:00+00:00", ultimo_push_at: null },
  ],
  pendientes: [],
  ...cambios,
});

const ciudadesDeCampania = [
  { campania_ciudad_id: "cc-1", ciudad_id: BELLA_UNION, nombre: "Bella Unión", departamento: "Artigas" },
  { campania_ciudad_id: "cc-2", ciudad_id: RIVERA, nombre: "Rivera", departamento: "Rivera" },
  { campania_ciudad_id: "cc-3", ciudad_id: SALTO, nombre: "Salto", departamento: null },
];

type Respuesta = unknown | ((argumentos: Record<string, unknown>) => unknown);

function clienteCon(respuestas: Record<string, Respuesta>) {
  const llamarRpc = vi.fn<(nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>>(async (nombre, argumentos) => {
    if (!(nombre in respuestas)) throw new Error(`Sin respuesta preparada para ${nombre}`);
    const respuesta = respuestas[nombre];
    if (respuesta instanceof Error) throw respuesta;
    if (typeof respuesta === "function") return (respuesta as (a: Record<string, unknown>) => unknown)(argumentos);
    return respuesta;
  });
  return { cliente: { llamarRpc } as unknown as ClienteRpc, llamarRpc };
}

function lecturas(cambios: Record<string, Respuesta> = {}) {
  return clienteCon({
    campanias_del_coordinador: [{ id: CAMPANIA, nombre: "Primavera", fecha_inicio: "2026-09-15", fecha_fin: null }],
    ciudades_de_campania: ciudadesDeCampania,
    tablero_de_inicio: tablero(),
    ...cambios,
  });
}

const sinElegir = async () => null;

describe("fuente de Inicio contra las RPC", () => {
  it("lee el día de la campaña elegida y le suma el departamento de cada ciudad", async () => {
    const { cliente, llamarRpc } = lecturas();

    const resultado = await crearFuenteInicioRpc(cliente, sinElegir).obtenerTablero();

    expect(resultado).toEqual({
      campaniaId: CAMPANIA,
      fecha: "2026-10-21",
      esHoy: true,
      calculadoA: "2026-10-21T13:40:00+00:00",
      ciudades: [
        { id: BELLA_UNION, nombre: "Bella Unión", departamento: "Artigas", colportores: [] },
        {
          id: RIVERA,
          nombre: "Rivera",
          departamento: "Rivera",
          colportores: [
            {
              id: "u-1",
              nombre: "Lucía Fernández",
              estado: "en-jornada",
              horas: 2.8,
              presentaciones: 4,
              ventas: 2,
              montoCentavos: 435000,
              ultimoPushAt: "2026-10-21T13:28:00+00:00",
            },
          ],
        },
      ],
      sinZona: [{ id: "u-9", nombre: "Rocío Benítez", estado: "sin-iniciar", deBaja: false, inscriptoAt: "2026-10-21T14:02:00+00:00", ultimoPushAt: null }],
      pendientes: [],
    });
    expect(llamarRpc).toHaveBeenCalledWith("tablero_de_inicio", { p_campania_id: CAMPANIA, p_fecha: null });
    expect(llamarRpc).toHaveBeenCalledWith("ciudades_de_campania", { p_campania_id: CAMPANIA });
  });

  it("para otro día manda p_fecha; con una campaña dada no pregunta cuál es", async () => {
    const { cliente, llamarRpc } = lecturas();

    await crearFuenteInicioRpc(cliente, sinElegir).obtenerTablero({ fecha: "2026-10-20", campaniaId: OTRA });

    expect(llamarRpc).toHaveBeenCalledWith("tablero_de_inicio", { p_campania_id: OTRA, p_fecha: "2026-10-20" });
    expect(llamarRpc).not.toHaveBeenCalledWith("campanias_del_coordinador", {});
  });

  it("usa la campaña que eligió en el topbar si figura en su lista", async () => {
    const { cliente, llamarRpc } = lecturas({
      campanias_del_coordinador: [
        { id: CAMPANIA, nombre: "Primavera", fecha_inicio: "2026-09-15", fecha_fin: null },
        { id: OTRA, nombre: "Verano", fecha_inicio: "2027-01-04", fecha_fin: null },
      ],
    });

    await crearFuenteInicioRpc(cliente, async () => OTRA).obtenerTablero();

    expect(llamarRpc).toHaveBeenCalledWith("tablero_de_inicio", { p_campania_id: OTRA, p_fecha: null });
  });

  it("sin campaña no hay tablero (y no se llama a la RPC)", async () => {
    const { cliente, llamarRpc } = lecturas({ campanias_del_coordinador: [] });

    expect(await crearFuenteInicioRpc(cliente, sinElegir).obtenerTablero()).toBeNull();
    expect(llamarRpc).not.toHaveBeenCalledWith("tablero_de_inicio", expect.anything());
  });

  it("los cuatro estados de la base y la baja del inscripto sin zona", async () => {
    const estados = ["EN_JORNADA", "SIN_CERRAR", "FINALIZADA", "SIN_INICIAR"];
    const { cliente } = lecturas({
      tablero_de_inicio: tablero({
        ciudades: [
          {
            ciudad_id: RIVERA,
            nombre: "Rivera",
            colportores: estados.map((estado, i) => colportor(`u-${i}`, { estado })),
          },
        ],
        sin_zona: [{ colportor_id: "u-b", nombre: "", apellido: "", estado: "SIN_CERRAR", inscripcion_de_baja: true, inscripto_at: "2026-10-01T10:00:00+00:00", ultimo_push_at: "2026-10-02T10:00:00+00:00" }],
      }),
    });

    const resultado = await crearFuenteInicioRpc(cliente, sinElegir).obtenerTablero();

    expect(resultado?.ciudades[0].colportores.map((c) => c.estado)).toEqual(["en-jornada", "sin-cerrar", "finalizada", "sin-iniciar"]);
    expect(resultado?.sinZona[0]).toMatchObject({ nombre: "Colportor sin nombre", estado: "sin-cerrar", deBaja: true });
  });

  it("una campaña terminada se lee sin departamentos (la base no los entrega: CZ011)", async () => {
    const { cliente } = lecturas({ ciudades_de_campania: new ErrorSupabase("Terminada", 400, "CZ011") });

    const resultado = await crearFuenteInicioRpc(cliente, sinElegir).obtenerTablero();

    expect(resultado?.ciudades.map((c) => c.departamento)).toEqual([null, null]);
  });

  it("una campaña que se dio de baja entre la lista y la lectura es «sin campaña», no un error", async () => {
    const { cliente } = lecturas({ tablero_de_inicio: new ErrorSupabase("No existe", 400, "CZ001") });

    expect(await crearFuenteInicioRpc(cliente, sinElegir).obtenerTablero()).toBeNull();
  });

  it("los rechazos traen el texto de la base; sin permiso, uno propio", async () => {
    const futuro = lecturas({ tablero_de_inicio: new ErrorSupabase("Ese día todavía no llegó. Elegí hoy o un día anterior.", 400, "22023") });
    await expect(crearFuenteInicioRpc(futuro.cliente, sinElegir).obtenerTablero({ fecha: "2030-01-01" })).rejects.toThrow(
      new RechazoDelTablero("Ese día todavía no llegó. Elegí hoy o un día anterior."),
    );

    const sinPermiso = lecturas({ tablero_de_inicio: new ErrorSupabase("permission denied", 403, "42501") });
    await expect(crearFuenteInicioRpc(sinPermiso.cliente, sinElegir).obtenerTablero()).rejects.toThrow(/Solo el coordinador de la campaña/);
  });

  it("una caída, un 5xx o la red no se toman por un día vacío: salen como excepción", async () => {
    for (const falla of [new ErrorSupabase("Bad gateway", 502), new ErrorSupabase("Límite", 429), new TypeError("fetch failed")]) {
      const { cliente } = lecturas({ tablero_de_inicio: falla });
      await expect(crearFuenteInicioRpc(cliente, sinElegir).obtenerTablero()).rejects.toBe(falla);
    }
  });

  it("lo que no tiene la forma del contrato falla con RespuestaInesperada", async () => {
    const casos: unknown[] = [
      null,
      tablero({ ciudades: "nada" }),
      tablero({ pendientes: null }),
      tablero({ es_hoy: "sí" }),
      tablero({ ciudades: [{ ciudad_id: RIVERA, nombre: "Rivera", colportores: [colportor("u-1", { estado: "VACACIONES" })] }] }),
      tablero({ ciudades: [{ ciudad_id: RIVERA, nombre: "Rivera", colportores: [colportor("u-1", { horas: "2,8" })] }] }),
    ];
    for (const caso of casos) {
      const { cliente } = lecturas({ tablero_de_inicio: caso });
      await expect(crearFuenteInicioRpc(cliente, sinElegir).obtenerTablero()).rejects.toBeInstanceOf(RespuestaInesperada);
    }
  });

  it("no manda a la base una fecha o una campaña mal formadas", async () => {
    const { cliente, llamarRpc } = lecturas();
    const fuente = crearFuenteInicioRpc(cliente, sinElegir);

    await expect(fuente.obtenerTablero({ fecha: "ayer" })).rejects.toBeInstanceOf(RechazoDelTablero);
    await expect(fuente.obtenerTablero({ campaniaId: "no-es-uuid" })).rejects.toBeInstanceOf(RechazoDelTablero);
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("lo que llegue en pendientes (V2, sin forma acordada) se ignora en vez de romper la pantalla", async () => {
    const { cliente } = lecturas({ tablero_de_inicio: tablero({ pendientes: [{ tipo: "ticket", algo: 1 }] }) });

    const resultado = await crearFuenteInicioRpc(cliente, sinElegir).obtenerTablero();

    expect(resultado?.pendientes).toEqual([]);
  });
});

describe("pedirTablero (lo que cruza la server action)", () => {
  const fuenteQueFalla = (error: unknown) => ({ obtenerTablero: vi.fn().mockRejectedValue(error) });

  it("devuelve el tablero", async () => {
    const { cliente } = lecturas();
    const resultado = await pedirTablero(crearFuenteInicioRpc(cliente, sinElegir), { fecha: "2026-10-20" });
    expect(resultado).toMatchObject({ ok: true, tablero: { fecha: "2026-10-21" } });
  });

  it("la red, un 5xx y el límite de tráfico son «sin conexión»", async () => {
    for (const error of [new TypeError("fetch failed"), new ErrorSupabase("Bad gateway", 502), new ErrorSupabase("Límite", 429)]) {
      expect(await pedirTablero(fuenteQueFalla(error), {})).toEqual({ ok: false, causa: "sin-conexion" });
    }
  });

  it("un rechazo trae su texto; otro rechazo de la base y una respuesta que no se entiende son «error»", async () => {
    expect(await pedirTablero(fuenteQueFalla(new RechazoDelTablero("Ese día todavía no llegó.")), {})).toEqual({
      ok: false,
      causa: "rechazo",
      mensaje: "Ese día todavía no llegó.",
    });
    expect(await pedirTablero(fuenteQueFalla(new ErrorSupabase("Duplicado", 409, "23505")), {})).toEqual({ ok: false, causa: "error" });
    expect(await pedirTablero(fuenteQueFalla(new RespuestaInesperada("tablero_de_inicio", "algo")), {})).toEqual({ ok: false, causa: "error" });
  });
});
