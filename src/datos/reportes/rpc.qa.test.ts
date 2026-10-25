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
