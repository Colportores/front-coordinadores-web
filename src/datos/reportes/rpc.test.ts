import { describe, expect, it, vi } from "vitest";

import { crearFuenteReportesRpc, ID_SIN_ZONA, NOMBRE_SIN_ZONA, sinDatosDesde, TOPE_DIAS, TOPE_FILAS } from "@/datos/reportes/rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";
import { diasEntre, sumarDias } from "@/lib/dias";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const OTRA = "22222222-2222-4222-8222-222222222222";
const RIVERA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ARTIGAS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BELLA_UNION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** Una fila de `horas_por_ciudad_y_colportor()` (migración 0060), agrupada por día. */
const fila = (extra: Record<string, unknown>) => ({
  periodo_inicio: "2026-10-20",
  periodo_fin: "2026-10-20",
  ciudad_id: RIVERA,
  ciudad_nombre: "Rivera",
  colportor_id: "u-1",
  nombre: "Lucía",
  apellido: "Fernández",
  horas: 4.5,
  jornadas: 1,
  dias_trabajados: 1,
  jornadas_acompaniadas: 0,
  en_curso: false,
  horas_anterior: 3,
  jornadas_anterior: 1,
  ...extra,
});

const ciudadesDeCampania = [
  { campania_ciudad_id: "cc-1", ciudad_id: RIVERA, nombre: "Rivera", departamento: "Rivera" },
  { campania_ciudad_id: "cc-2", ciudad_id: ARTIGAS, nombre: "Artigas", departamento: "Artigas" },
  { campania_ciudad_id: "cc-3", ciudad_id: BELLA_UNION, nombre: "Bella Unión", departamento: "Artigas" },
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
    campanias_del_coordinador: [{ id: CAMPANIA, nombre: "Primavera", fecha_inicio: "2026-09-01", fecha_fin: null }],
    ciudades_de_campania: ciudadesDeCampania,
    horas_por_ciudad_y_colportor: [fila({})],
    zonas_por_colportor: [],
    ...cambios,
  });
}

/** Una fila de `zonas_por_colportor()` (0047/0062): todos los inscriptos de la campaña, con o sin zona. */
const inscripto = (extra: Record<string, unknown>) => ({
  colportor_id: "u-1",
  nombre: "Lucía",
  apellido: "Fernández",
  ciudad_id: RIVERA,
  ciudad_nombre: "Rivera",
  zona_id: "z-1",
  zona_nombre: "Centro",
  ...extra,
});

const sinElegir = async () => null;
// 21/10/2026 a las 10:00 en Montevideo.
const hoy = () => new Date("2026-10-21T13:00:00Z");

describe("fuente de Reportes (horas) contra las RPC", () => {
  it("pide las horas día por día desde el primer día de la campaña hasta hoy, sin filtros", async () => {
    const { cliente, llamarRpc } = lecturas();

    await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(llamarRpc).toHaveBeenCalledWith("horas_por_ciudad_y_colportor", {
      p_campania_id: CAMPANIA,
      p_desde: "2026-09-01",
      p_hasta: "2026-10-21",
      p_agrupar: "dia",
      p_ciudad_id: null,
      p_colportor_ids: null,
    });
    expect(llamarRpc).toHaveBeenCalledWith("ciudades_de_campania", { p_campania_id: CAMPANIA });
  });

  it("toma el día de hoy de Montevideo aunque en UTC ya sea el día siguiente", async () => {
    const { cliente, llamarRpc } = lecturas();

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, () => new Date("2026-10-22T01:30:00Z")).obtenerHoras();

    expect(datos?.hoy).toBe("2026-10-21");
    expect(llamarRpc).toHaveBeenCalledWith("horas_por_ciudad_y_colportor", expect.objectContaining({ p_hasta: "2026-10-21" }));
  });

  it("arma ciudades y colportores con las horas de cada día y el departamento de cada ciudad", async () => {
    const { cliente } = lecturas({
      horas_por_ciudad_y_colportor: [
        fila({ periodo_inicio: "2026-10-19", horas: 3.25 }),
        fila({ periodo_inicio: "2026-10-20", horas: 4.5 }),
        fila({ periodo_inicio: "2026-10-20", colportor_id: "u-2", nombre: "Bruno", apellido: "Techera", horas: 2 }),
        fila({ periodo_inicio: "2026-10-20", ciudad_id: ARTIGAS, ciudad_nombre: "Artigas", colportor_id: "u-3", nombre: "Sofía", apellido: "Cabral", horas: 6 }),
      ],
    });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(datos).toEqual({
      inicioCampania: "2026-09-01",
      finCampania: null,
      hoy: "2026-10-21",
      ciudades: [
        {
          id: ARTIGAS,
          nombre: "Artigas",
          departamento: "Artigas",
          colportores: [{ id: "u-3", nombre: "Sofía Cabral", horasPorDia: { "2026-10-20": 6 }, sinDatosDesde: null }],
        },
        {
          id: RIVERA,
          nombre: "Rivera",
          departamento: "Rivera",
          colportores: [
            { id: "u-1", nombre: "Lucía Fernández", horasPorDia: { "2026-10-19": 3.25, "2026-10-20": 4.5 }, sinDatosDesde: null },
            { id: "u-2", nombre: "Bruno Techera", horasPorDia: { "2026-10-20": 2 }, sinDatosDesde: null },
          ],
        },
      ],
    });
  });

  it("un día sin jornadas cerradas no es un día de 0 horas: no figura (la fila de 0 es solo para la comparación)", async () => {
    const { cliente } = lecturas({
      horas_por_ciudad_y_colportor: [
        fila({ periodo_inicio: "2026-10-19", horas: 5 }),
        fila({ periodo_inicio: "2026-10-20", horas: 0, jornadas: 0, horas_anterior: 5, jornadas_anterior: 1 }),
      ],
    });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(datos?.ciudades[0].colportores[0].horasPorDia).toEqual({ "2026-10-19": 5 });
  });

  it("un colportor que solo tiene filas de comparación sigue en la lista, sin días con datos", async () => {
    const { cliente } = lecturas({
      horas_por_ciudad_y_colportor: [fila({ horas: 0, jornadas: 0 })],
    });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(datos?.ciudades[0].colportores).toEqual([{ id: "u-1", nombre: "Lucía Fernández", horasPorDia: {}, sinDatosDesde: null }]);
  });

  it("los colportores sin zona (ciudad nula) van en un solo grupo «Sin zona asignada», al final", async () => {
    const { cliente } = lecturas({
      horas_por_ciudad_y_colportor: [
        fila({ ciudad_id: null, ciudad_nombre: null, colportor_id: "u-9", nombre: "Diego", apellido: "Machado", horas: 20 }),
        fila({ periodo_inicio: "2026-10-19", ciudad_id: null, ciudad_nombre: null, colportor_id: "u-9", nombre: "Diego", apellido: "Machado", horas: 1.5 }),
        fila({ ciudad_id: null, ciudad_nombre: null, colportor_id: "u-8", nombre: "Ana", apellido: "Zapata", horas: 3 }),
        fila({}),
      ],
    });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(datos?.ciudades.map((c) => c.nombre)).toEqual(["Rivera", NOMBRE_SIN_ZONA]);
    const sinZona = datos?.ciudades[1];
    expect(sinZona).toMatchObject({ id: ID_SIN_ZONA, departamento: null });
    expect(sinZona?.colportores).toEqual([
      { id: "u-9", nombre: "Diego Machado", horasPorDia: { "2026-10-20": 20, "2026-10-19": 1.5 }, sinDatosDesde: null },
      { id: "u-8", nombre: "Ana Zapata", horasPorDia: { "2026-10-20": 3 }, sinDatosDesde: null },
    ]);
  });

  it("pide también los inscriptos de la campaña para completar la lista", async () => {
    const { cliente, llamarRpc } = lecturas();

    await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(llamarRpc).toHaveBeenCalledWith("zonas_por_colportor", { p_campania_id: CAMPANIA });
  });

  it("un inscripto que todavía no cerró ninguna jornada figura en su ciudad, sin horas (guion)", async () => {
    const { cliente } = lecturas({
      zonas_por_colportor: [
        inscripto({}),
        inscripto({ colportor_id: "u-5", nombre: "Rocío", apellido: "Benítez" }),
      ],
    });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(datos?.ciudades).toHaveLength(1);
    expect(datos?.ciudades[0].colportores).toEqual([
      { id: "u-5", nombre: "Rocío Benítez", horasPorDia: {}, sinDatosDesde: null },
      { id: "u-1", nombre: "Lucía Fernández", horasPorDia: { "2026-10-20": 4.5 }, sinDatosDesde: null },
    ]);
  });

  it("un inscripto sin horas y sin zona va al grupo «Sin zona asignada»; con el mismo grupo que quien sí tiene horas", async () => {
    const { cliente } = lecturas({
      horas_por_ciudad_y_colportor: [fila({ ciudad_id: null, ciudad_nombre: null, colportor_id: "u-9", nombre: "Diego", apellido: "Machado" })],
      zonas_por_colportor: [
        inscripto({ colportor_id: "u-9", nombre: "Diego", apellido: "Machado", ciudad_id: null, ciudad_nombre: null, zona_id: null, zona_nombre: null }),
        inscripto({ colportor_id: "u-8", nombre: "Ana", apellido: "Zapata", ciudad_id: null, ciudad_nombre: null, zona_id: null, zona_nombre: null }),
      ],
    });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(datos?.ciudades.map((c) => c.id)).toEqual([ID_SIN_ZONA]);
    expect(datos?.ciudades[0].colportores).toEqual([
      { id: "u-9", nombre: "Diego Machado", horasPorDia: { "2026-10-20": 4.5 }, sinDatosDesde: null },
      { id: "u-8", nombre: "Ana Zapata", horasPorDia: {}, sinDatosDesde: null },
    ]);
  });

  it("una ciudad cuyos colportores no tienen horas todavía figura igual, con su departamento", async () => {
    const { cliente } = lecturas({
      horas_por_ciudad_y_colportor: [],
      zonas_por_colportor: [
        inscripto({ colportor_id: "u-7", nombre: "Gonzalo", apellido: "Méndez", ciudad_id: BELLA_UNION, ciudad_nombre: "Bella Unión" }),
      ],
    });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(datos?.ciudades).toEqual([
      {
        id: BELLA_UNION,
        nombre: "Bella Unión",
        departamento: "Artigas",
        colportores: [{ id: "u-7", nombre: "Gonzalo Méndez", horasPorDia: {}, sinDatosDesde: null }],
      },
    ]);
  });

  it("quien ya figura por sus horas no se duplica ni se mueve de ciudad aunque la lista de inscriptos diga otra", async () => {
    const { cliente } = lecturas({
      zonas_por_colportor: [inscripto({ ciudad_id: ARTIGAS, ciudad_nombre: "Artigas" })],
    });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(datos?.ciudades.map((c) => c.nombre)).toEqual(["Rivera"]);
    expect(datos?.ciudades[0].colportores).toHaveLength(1);
  });

  it("sin ninguna fila, devuelve la campaña con la lista de ciudades vacía (no es «sin campaña»)", async () => {
    const { cliente } = lecturas({ horas_por_ciudad_y_colportor: [] });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(datos).toEqual({ inicioCampania: "2026-09-01", finCampania: null, hoy: "2026-10-21", ciudades: [] });
  });

  it("una ciudad que no figura en la lista de la campaña queda sin departamento", async () => {
    const { cliente } = lecturas({ ciudades_de_campania: [] });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(datos?.ciudades[0].departamento).toBeNull();
  });

  it("una campaña terminada se lee hasta su último día, y sus ciudades quedan sin departamento (CZ011)", async () => {
    const { cliente, llamarRpc } = lecturas({
      campanias_del_coordinador: [{ id: CAMPANIA, nombre: "Verano", fecha_inicio: "2026-01-05", fecha_fin: "2026-03-14" }],
      ciudades_de_campania: new ErrorSupabase("La campaña terminó", 400, "CZ011"),
    });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(llamarRpc).toHaveBeenCalledWith(
      "horas_por_ciudad_y_colportor",
      expect.objectContaining({ p_desde: "2026-01-05", p_hasta: "2026-03-14" }),
    );
    expect(datos?.finCampania).toBe("2026-03-14");
    expect(datos?.ciudades[0].departamento).toBeNull();
  });

  it("con la campaña elegida en el topbar, lee esa y no la primera", async () => {
    const { cliente, llamarRpc } = lecturas({
      campanias_del_coordinador: [
        { id: CAMPANIA, nombre: "Primavera", fecha_inicio: "2026-09-01", fecha_fin: null },
        { id: OTRA, nombre: "Invierno", fecha_inicio: "2026-06-01", fecha_fin: null },
      ],
    });

    await crearFuenteReportesRpc(cliente, async () => OTRA, hoy).obtenerHoras();

    expect(llamarRpc).toHaveBeenCalledWith("horas_por_ciudad_y_colportor", expect.objectContaining({ p_campania_id: OTRA, p_desde: "2026-06-01" }));
  });

  it("sin campañas que consultar devuelve null, sin pedir las horas", async () => {
    const { cliente, llamarRpc } = lecturas({ campanias_del_coordinador: [] });

    expect(await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras()).toBeNull();
    expect(llamarRpc).not.toHaveBeenCalledWith("horas_por_ciudad_y_colportor", expect.anything());
  });

  it("una campaña que todavía no empezó es «sin campaña con horas»: no se pide un rango al revés", async () => {
    const { cliente, llamarRpc } = lecturas({
      campanias_del_coordinador: [{ id: CAMPANIA, nombre: "Verano", fecha_inicio: "2026-11-02", fecha_fin: null }],
    });

    expect(await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras()).toBeNull();
    expect(llamarRpc).not.toHaveBeenCalledWith("horas_por_ciudad_y_colportor", expect.anything());
  });

  it("si la campaña desaparece entre una llamada y la otra (CZ001) devuelve null", async () => {
    const { cliente } = lecturas({ horas_por_ciudad_y_colportor: new ErrorSupabase("La campaña no existe", 400, "CZ001") });

    expect(await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras()).toBeNull();
  });

  it("una caída de red o de servicio sale como excepción: nunca se toma por «sin horas»", async () => {
    const caida = lecturas({ horas_por_ciudad_y_colportor: new TypeError("fetch failed") });
    await expect(crearFuenteReportesRpc(caida.cliente, sinElegir, hoy).obtenerHoras()).rejects.toThrow("fetch failed");

    const servicio = lecturas({ horas_por_ciudad_y_colportor: new ErrorSupabase("Bad gateway", 502) });
    await expect(crearFuenteReportesRpc(servicio.cliente, sinElegir, hoy).obtenerHoras()).rejects.toBeInstanceOf(ErrorSupabase);

    const inscriptosCaidos = lecturas({ zonas_por_colportor: new TypeError("fetch failed") });
    await expect(crearFuenteReportesRpc(inscriptosCaidos.cliente, sinElegir, hoy).obtenerHoras()).rejects.toThrow("fetch failed");

    const departamentosCaidos = lecturas({ ciudades_de_campania: new TypeError("fetch failed") });
    await expect(crearFuenteReportesRpc(departamentosCaidos.cliente, sinElegir, hoy).obtenerHoras()).rejects.toThrow("fetch failed");
  });

  it("un rechazo de la base (sin permiso, rango inválido) sale como excepción para que lo atrape error.tsx", async () => {
    const { cliente } = lecturas({ horas_por_ciudad_y_colportor: new ErrorSupabase("sin permiso", 403, "42501") });

    await expect(crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras()).rejects.toMatchObject({ codigo: "42501" });
  });

  it("una respuesta con otra forma es un error, no datos a medias", async () => {
    const noEsLista = lecturas({ horas_por_ciudad_y_colportor: { horas: 1 } });
    await expect(crearFuenteReportesRpc(noEsLista.cliente, sinElegir, hoy).obtenerHoras()).rejects.toBeInstanceOf(RespuestaInesperada);

    const horasEnTexto = lecturas({ horas_por_ciudad_y_colportor: [fila({ horas: "4.5" })] });
    await expect(crearFuenteReportesRpc(horasEnTexto.cliente, sinElegir, hoy).obtenerHoras()).rejects.toBeInstanceOf(RespuestaInesperada);

    const diaInvalido = lecturas({ horas_por_ciudad_y_colportor: [fila({ periodo_inicio: "20/10/2026" })] });
    await expect(crearFuenteReportesRpc(diaInvalido.cliente, sinElegir, hoy).obtenerHoras()).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("un colportor sin nombre ni apellido figura igual", async () => {
    const { cliente } = lecturas({ horas_por_ciudad_y_colportor: [fila({ nombre: "", apellido: "" })] });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(datos?.ciudades[0].colportores[0].nombre).toBe("Colportor sin nombre");
  });
});

describe("fuente de Reportes (horas): el tope de filas de PostgREST", () => {
  type Pedido = { p_desde: string; p_hasta: string };

  /**
   * Una RPC que se comporta como PostgREST con `max_rows`: devuelve una fila por día × colportor, ordenada por día, y
   * corta en silencio en `TOPE_FILAS`; rechaza los rangos de más de 366 días como la migración 0060 (22023).
   */
  function rpcConTope(colportores: number) {
    const pedidos: Pedido[] = [];
    const respuesta = (argumentos: Record<string, unknown>) => {
      const { p_desde: desde, p_hasta: hasta } = argumentos as Pedido;
      pedidos.push({ p_desde: desde, p_hasta: hasta });
      if (diasEntre(desde, hasta) + 1 > TOPE_DIAS) throw new ErrorSupabase("El rango es demasiado largo", 400, "22023");
      const todas: Record<string, unknown>[] = [];
      for (let d = 0; d <= diasEntre(desde, hasta); d++) {
        for (let c = 0; c < colportores; c++) {
          todas.push(fila({ periodo_inicio: sumarDias(desde, d), colportor_id: `u-${c}`, nombre: `Col${c}`, apellido: "Prueba", horas: 1 }));
        }
      }
      return todas.slice(0, TOPE_FILAS);
    };
    return { pedidos, respuesta };
  }

  it("con más de 1000 filas en el rango, parte el pedido y no pierde los días más nuevos", async () => {
    // 25 colportores desde el 01/09 hasta el 21/10: 51 días x 25 = 1275 filas, más que el tope.
    const { pedidos, respuesta } = rpcConTope(25);
    const { cliente } = lecturas({ horas_por_ciudad_y_colportor: respuesta });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(pedidos.length).toBeGreaterThan(1);
    const colportores = datos?.ciudades[0].colportores ?? [];
    expect(colportores).toHaveLength(25);
    for (const c of colportores) {
      expect(Object.keys(c.horasPorDia)).toHaveLength(51);
      expect(c.horasPorDia["2026-10-21"]).toBe(1);
      expect(c.horasPorDia["2026-09-01"]).toBe(1);
    }
  });

  it("los tramos cubren el rango entero sin superponerse y ninguno llega al tope", async () => {
    const { pedidos, respuesta } = rpcConTope(25);
    const { cliente } = lecturas({ horas_por_ciudad_y_colportor: respuesta });

    await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    const hojas = pedidos.filter((p) => (diasEntre(p.p_desde, p.p_hasta) + 1) * 25 < TOPE_FILAS);
    const ordenadas = [...hojas].sort((a, b) => (a.p_desde < b.p_desde ? -1 : 1));
    expect(ordenadas[0].p_desde).toBe("2026-09-01");
    expect(ordenadas[ordenadas.length - 1].p_hasta).toBe("2026-10-21");
    for (let i = 1; i < ordenadas.length; i++) expect(ordenadas[i].p_desde).toBe(sumarDias(ordenadas[i - 1].p_hasta, 1));
  });

  it("si la respuesta no llega al tope, es un solo pedido", async () => {
    const { pedidos, respuesta } = rpcConTope(3);
    const { cliente } = lecturas({ horas_por_ciudad_y_colportor: respuesta });

    await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(pedidos).toEqual([{ p_desde: "2026-09-01", p_hasta: "2026-10-21" }]);
  });

  it("una campaña de más de 366 días se pide en tramos de hasta 366 días (la RPC rechaza el rango entero)", async () => {
    const { pedidos, respuesta } = rpcConTope(1);
    const { cliente } = lecturas({
      campanias_del_coordinador: [{ id: CAMPANIA, nombre: "Larga", fecha_inicio: "2025-07-01", fecha_fin: null }],
      horas_por_ciudad_y_colportor: respuesta,
    });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    expect(pedidos.length).toBeGreaterThan(1);
    for (const p of pedidos) expect(diasEntre(p.p_desde, p.p_hasta) + 1).toBeLessThanOrEqual(TOPE_DIAS);
    const dias = Object.keys(datos?.ciudades[0].colportores[0].horasPorDia ?? {});
    expect(dias).toHaveLength(diasEntre("2025-07-01", "2026-10-21") + 1);
  });

  it("un solo día con el tope de filas no se puede partir: sale como error, no como datos a medias", async () => {
    const { cliente } = lecturas({
      campanias_del_coordinador: [{ id: CAMPANIA, nombre: "Hoy", fecha_inicio: "2026-10-21", fecha_fin: null }],
      horas_por_ciudad_y_colportor: () => Array.from({ length: TOPE_FILAS }, (_, i) => fila({ colportor_id: `u-${i}` })),
    });

    await expect(crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras()).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("una falla en uno de los tramos sale como excepción", async () => {
    const { respuesta } = rpcConTope(25);
    let llamadas = 0;
    const { cliente } = lecturas({
      horas_por_ciudad_y_colportor: (argumentos: Record<string, unknown>) => {
        llamadas++;
        if (llamadas === 3) throw new TypeError("fetch failed");
        return respuesta(argumentos);
      },
    });

    await expect(crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras()).rejects.toThrow("fetch failed");
  });
});

describe("«sin datos desde» (decisión de Cristian del 25/10: 2 días de trabajo, lunes a sábado, sin contar hoy)", () => {
  // 2026-10-17 es sábado; 21/10 (hoy en estos tests) es miércoles.
  const horas = (...dias: string[]) => Object.fromEntries(dias.map((d) => [d, 4]));
  const HOY = "2026-10-21";

  it("Bruno: horas el sábado 17, sin horas lunes 19 y martes 20: el miércoles 21 avisa desde el 17", () => {
    expect(sinDatosDesde(horas("2026-10-16", "2026-10-17"), HOY, HOY)).toBe("2026-10-17");
  });

  it("el domingo no cuenta: sábado con horas y domingo + lunes sin horas son un solo día de trabajo", () => {
    expect(sinDatosDesde(horas("2026-10-17"), "2026-10-20", "2026-10-20")).toBeNull();
    expect(sinDatosDesde(horas("2026-10-17"), "2026-10-21", "2026-10-21")).toBe("2026-10-17");
  });

  it("quien descansó un solo día no avisa", () => {
    expect(sinDatosDesde(horas("2026-10-19"), HOY, HOY)).toBeNull();
    expect(sinDatosDesde(horas("2026-10-17"), "2026-10-20", "2026-10-20")).toBeNull();
  });

  it("hoy no cuenta aunque todavía no tenga horas", () => {
    expect(sinDatosDesde(horas("2026-10-19"), HOY, HOY)).toBeNull();
    expect(sinDatosDesde(horas("2026-10-18"), "2026-10-20", "2026-10-20")).toBeNull();
  });

  it("con horas ayer o hoy, nunca avisa", () => {
    expect(sinDatosDesde(horas("2026-10-20"), HOY, HOY)).toBeNull();
    expect(sinDatosDesde(horas("2026-10-21"), HOY, HOY)).toBeNull();
  });

  it("cuenta desde el último día con horas, no desde el primero", () => {
    expect(sinDatosDesde(horas("2026-10-01", "2026-10-20"), HOY, HOY)).toBeNull();
  });

  it("quien nunca tuvo horas queda en null", () => {
    expect(sinDatosDesde({}, HOY, HOY)).toBeNull();
  });

  it("en una campaña terminada no cuenta los días posteriores a su último día", () => {
    expect(sinDatosDesde(horas("2026-03-10"), HOY, "2026-03-12")).toBe("2026-03-10");
    expect(sinDatosDesde(horas("2026-03-10"), HOY, "2026-03-11")).toBeNull();
  });

  it("la fuente lo pone en cada colportor según sus horas", async () => {
    const { cliente } = lecturas({
      horas_por_ciudad_y_colportor: [
        fila({ periodo_inicio: "2026-10-16", colportor_id: "u-2", nombre: "Bruno", apellido: "Techera" }),
        fila({ periodo_inicio: "2026-10-17", colportor_id: "u-2", nombre: "Bruno", apellido: "Techera" }),
        fila({ periodo_inicio: "2026-10-17" }),
        fila({ periodo_inicio: "2026-10-20" }),
      ],
    });

    const datos = await crearFuenteReportesRpc(cliente, sinElegir, hoy).obtenerHoras();

    const porId = Object.fromEntries((datos?.ciudades[0].colportores ?? []).map((c) => [c.id, c.sinDatosDesde]));
    expect(porId).toEqual({ "u-1": null, "u-2": "2026-10-17" });
  });
});
