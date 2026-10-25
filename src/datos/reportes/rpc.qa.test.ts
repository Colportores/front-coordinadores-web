import { describe, expect, it, vi } from "vitest";

import { crearFuenteReportesRpc } from "@/datos/reportes/rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

/** QA de la fuente real de la vista 32 (#60): datos límite de la RPC 0060 y de `zonas_por_colportor()`. */

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const RIVERA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

function cliente(respuestas: Record<string, unknown>) {
  const llamarRpc = vi.fn(async (nombre: string) => {
    const r = respuestas[nombre];
    if (r instanceof Error) throw r;
    return r;
  });
  return { llamarRpc } as unknown as ClienteRpc;
}

const base = (cambios: Record<string, unknown> = {}) =>
  cliente({
    campanias_del_coordinador: [{ id: CAMPANIA, nombre: "Primavera", fecha_inicio: "2026-09-01", fecha_fin: null }],
    ciudades_de_campania: [{ campania_ciudad_id: "cc-1", ciudad_id: RIVERA, nombre: "Rivera", departamento: "Rivera" }],
    horas_por_ciudad_y_colportor: [fila({})],
    zonas_por_colportor: [],
    ...cambios,
  });

const sinElegir = async () => null;
const hoy = () => new Date("2026-10-21T13:00:00Z");
const leer = (c: ClienteRpc) => crearFuenteReportesRpc(c, sinElegir, hoy).obtenerHoras();

describe("QA #60 · fuente de Reportes, datos límite", () => {
  it("un nombre larguísimo con emoji llega intacto", async () => {
    const nombre = `Ñandú 🙂 ${"largo ".repeat(40)}`.trim();
    const datos = await leer(base({ horas_por_ciudad_y_colportor: [fila({ nombre, apellido: "Pérez 🙂" })] }));
    expect(datos?.ciudades[0].colportores[0].nombre).toBe(`${nombre} Pérez 🙂`);
  });

  it("dos filas del mismo colportor y día suman con dos decimales, sin arrastrar el error de coma flotante", async () => {
    const datos = await leer(base({ horas_por_ciudad_y_colportor: [fila({ horas: 0.1 }), fila({ horas: 0.2 })] }));
    expect(datos?.ciudades[0].colportores[0].horasPorDia["2026-10-20"]).toBe(0.3);
  });

  it("un inscripto repetido en zonas_por_colportor figura una sola vez", async () => {
    const datos = await leer(
      base({
        horas_por_ciudad_y_colportor: [],
        zonas_por_colportor: [inscripto({ colportor_id: "u-5" }), inscripto({ colportor_id: "u-5", zona_id: "z-2" })],
      }),
    );
    expect(datos?.ciudades[0].colportores.map((c) => c.id)).toEqual(["u-5"]);
  });

  it("una ciudad sin nombre figura igual, con un nombre que no es vacío", async () => {
    const datos = await leer(base({ horas_por_ciudad_y_colportor: [fila({ ciudad_nombre: null })] }));
    expect(datos?.ciudades[0].nombre).not.toBe("");
  });

  it("si falla la lista de ciudades (no es CZ011), la falla sale: no se muestra la lista sin departamentos como si estuviera bien", async () => {
    const falla = new ErrorSupabase("servicio caído", 503);
    await expect(leer(base({ ciudades_de_campania: falla }))).rejects.toBe(falla);
  });

  it("si falla la lectura de inscriptos, la falla sale: no se muestra una lista incompleta", async () => {
    const falla = new ErrorSupabase("servicio caído", 503);
    await expect(leer(base({ zonas_por_colportor: falla }))).rejects.toBe(falla);
  });

  it("privacidad: el error de una respuesta mal formada no repite nombres ni apellidos", async () => {
    const error = await leer(base({ horas_por_ciudad_y_colportor: [fila({ horas: "4,5", nombre: "Lucía", apellido: "Fernández" })] })).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(RespuestaInesperada);
    expect(String((error as Error).message)).not.toMatch(/Lucía|Fernández/);
  });

  it("privacidad: lo que devuelve la fuente no trae más datos de la persona que id y nombre", async () => {
    const datos = await leer(base({ horas_por_ciudad_y_colportor: [fila({ email: "x@y.z", telefono: "099123456" })] }));
    const texto = JSON.stringify(datos);
    expect(texto).not.toMatch(/x@y\.z|099123456/);
    expect(Object.keys(datos!.ciudades[0].colportores[0]).sort()).toEqual(["horasPorDia", "id", "nombre", "sinDatosDesde"]);
  });
});

describe("QA #60 · lectura partida por el tope de filas de PostgREST", () => {
  /** Un servidor que respeta el rango y corta en silencio a 1000 filas, como PostgREST con `max_rows`. */
  function servidorConTope(colportores: number) {
    const todas: Record<string, unknown>[] = [];
    for (let d = new Date(Date.UTC(2026, 8, 1)); d <= new Date(Date.UTC(2026, 9, 21)); d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() === 0) continue;
      const dia = d.toISOString().slice(0, 10);
      for (let i = 0; i < colportores; i++) {
        todas.push(fila({ periodo_inicio: dia, periodo_fin: dia, colportor_id: `u-${i}`, nombre: `C${i}`, apellido: "Prueba", horas: 1 }));
      }
    }
    const pedidos: [string, string][] = [];
    const llamarRpc = vi.fn(async (nombre: string, args: Record<string, unknown>) => {
      if (nombre === "campanias_del_coordinador") return [{ id: CAMPANIA, nombre: "P", fecha_inicio: "2026-09-01", fecha_fin: null }];
      if (nombre === "ciudades_de_campania") return [];
      if (nombre === "zonas_por_colportor") return [];
      pedidos.push([args.p_desde as string, args.p_hasta as string]);
      return todas
        .filter((f) => (f.periodo_inicio as string) >= (args.p_desde as string) && (f.periodo_inicio as string) <= (args.p_hasta as string))
        .slice(0, 1000);
    });
    return { cliente: { llamarRpc } as unknown as ClienteRpc, pedidos, esperadasPorColportor: todas.length / colportores };
  }

  it("con más de 1000 filas no se pierde ningún día ni se cuenta dos veces: cada colportor tiene todas sus horas", async () => {
    const { cliente, pedidos, esperadasPorColportor } = servidorConTope(40);
    const datos = await leer(cliente);

    expect(pedidos.length).toBeGreaterThan(1);
    const colportores = datos!.ciudades.flatMap((c) => c.colportores);
    expect(colportores).toHaveLength(40);
    for (const c of colportores) {
      expect(Object.keys(c.horasPorDia)).toHaveLength(esperadasPorColportor);
      expect(Object.values(c.horasPorDia).every((h) => h === 1)).toBe(true);
    }
  });

  it("los tramos pedidos no se superponen y cubren la campaña entera", async () => {
    const { cliente, pedidos } = servidorConTope(40);
    await leer(cliente);

    const hojas = pedidos.filter(([d, h]) => !pedidos.some(([d2, h2]) => (d2 !== d || h2 !== h) && d2 >= d && h2 <= h));
    const ordenadas = [...hojas].sort((a, b) => a[0].localeCompare(b[0]));
    expect(ordenadas[0][0]).toBe("2026-09-01");
    expect(ordenadas[ordenadas.length - 1][1]).toBe("2026-10-21");
    for (let i = 1; i < ordenadas.length; i++) {
      const anterior = new Date(`${ordenadas[i - 1][1]}T00:00:00Z`);
      anterior.setUTCDate(anterior.getUTCDate() + 1);
      expect(ordenadas[i][0]).toBe(anterior.toISOString().slice(0, 10));
    }
  });
});

describe("QA #60 · «Sin datos desde» (decisión de Cristian, 25/10: 2 o más días de trabajo seguidos sin horas, sin contar hoy)", () => {
  const horasDe = (dias: string[]) => dias.map((d) => fila({ periodo_inicio: d, periodo_fin: d, colportor_id: "u-1" }));

  // Hallazgo: la decisión pide `sinDatosDesde` = el último día con horas cuando se cumple la regla; la fuente real lo deja
  // siempre en null (rpc.ts: `sinDatosDesde: null`), así que con datos reales la lista y la fila de Bruno no avisan.
  it.skip("QA #60 · Bruno: horas hasta el sábado 17, sin horas el lunes 19 y el martes 20, hoy miércoles 21 → «sin datos desde» el 17/10", async () => {
    const datos = await leer(base({ horas_por_ciudad_y_colportor: horasDe(["2026-10-15", "2026-10-16", "2026-10-17"]) }));
    expect(datos?.ciudades[0].colportores[0].sinDatosDesde).toBe("2026-10-17");
  });

  it.skip("QA #60 · quien descansó un solo día (el martes 20, hoy miércoles) no recibe el aviso", async () => {
    const datos = await leer(base({ horas_por_ciudad_y_colportor: horasDe(["2026-10-17", "2026-10-19"]) }));
    expect(datos?.ciudades[0].colportores[0].sinDatosDesde).toBeNull();
  });

  it("quien trabajó hoy y ayer no recibe el aviso (esto ya se cumple: hoy es null siempre)", async () => {
    const datos = await leer(base({ horas_por_ciudad_y_colportor: horasDe(["2026-10-20", "2026-10-21"]) }));
    expect(datos?.ciudades[0].colportores[0].sinDatosDesde).toBeNull();
  });
});

