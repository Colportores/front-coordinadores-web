import { describe, expect, it, vi } from "vitest";

import { crearFuenteReportesRpc } from "@/datos/reportes/rpc";
import type { ClienteRpc } from "@/datos/supabase/cliente";

/** QA del PR #171 (issue #167): la fuente de Reportes con ventas, casos límite de los datos. */

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const RIVERA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const base = {
  ciudad_id: RIVERA,
  ciudad_nombre: "Rivera",
  colportor_id: "u-1",
  nombre: "Lucía",
  apellido: "Fernández",
  en_curso: false,
};
const horas = (dia: string) => ({
  ...base,
  periodo_inicio: dia,
  periodo_fin: dia,
  horas: 4,
  jornadas: 1,
  dias_trabajados: 1,
  jornadas_acompaniadas: 0,
  horas_anterior: 0,
  jornadas_anterior: 0,
});
const ventas = (dia: string, extra: Record<string, unknown> = {}) => ({
  ...base,
  periodo_inicio: dia,
  periodo_fin: dia,
  ventas: 1,
  monto_total: 100,
  presentaciones: 3,
  ventas_anterior: 0,
  monto_anterior: 0,
  presentaciones_anterior: 0,
  cobrado: null,
  cobrado_anterior: null,
  ...extra,
});

function fuente(respuestas: Record<string, unknown>) {
  const llamarRpc = vi.fn(async (nombre: string) => respuestas[nombre]);
  const cliente = { llamarRpc } as unknown as ClienteRpc;
  return crearFuenteReportesRpc(
    cliente,
    async () => null,
    () => new Date("2026-10-21T13:00:00Z"),
  );
}

const lecturas = (extra: Record<string, unknown>) => ({
  campanias_del_coordinador: [
    {
      id: CAMPANIA,
      nombre: "Primavera",
      fecha_inicio: "2026-09-01",
      fecha_fin: null,
    },
  ],
  ciudades_de_campania: [
    {
      campania_ciudad_id: "cc-1",
      ciudad_id: RIVERA,
      nombre: "Rivera",
      departamento: "Rivera",
    },
  ],
  horas_por_ciudad_y_colportor: [],
  ventas_por_ciudad_y_colportor: [],
  zonas_por_colportor: [],
  ...extra,
});

describe("QA #167 · Reportes: ventas por día", () => {
  it("los centavos no acumulan error de coma flotante (0,10 + 0,20 + 0,01 = 0,31)", async () => {
    const datos = await fuente(
      lecturas({
        horas_por_ciudad_y_colportor: [horas("2026-10-20")],
        ventas_por_ciudad_y_colportor: [
          ventas("2026-10-20", { monto_total: 10 }),
          ventas("2026-10-20", { monto_total: 20 }),
          ventas("2026-10-20", { monto_total: 1 }),
        ],
      }),
    ).obtenerHoras();

    expect(
      datos?.ciudades[0].colportores[0].ventasPorDia["2026-10-20"],
    ).toEqual({ presentaciones: 9, ventas: 3, monto: 0.31, cobrado: null });
  });

  it("un día con ventas y sin horas conserva las ventas y no inventa horas; el día con horas y sin ventas va en ceros", async () => {
    const datos = await fuente(
      lecturas({
        horas_por_ciudad_y_colportor: [horas("2026-10-19")],
        ventas_por_ciudad_y_colportor: [
          ventas("2026-10-20", { monto_total: 250000 }),
        ],
      }),
    ).obtenerHoras();

    const lucia = datos?.ciudades[0].colportores[0];
    expect(lucia?.horasPorDia).toEqual({ "2026-10-19": 4 });
    expect(lucia?.ventasPorDia["2026-10-20"]).toEqual({
      presentaciones: 3,
      ventas: 1,
      monto: 2500,
      cobrado: null,
    });
    expect(lucia?.ventasPorDia["2026-10-19"]).toEqual({
      presentaciones: 0,
      ventas: 0,
      monto: 0,
      cobrado: null,
    });
  });

  it("una venta de monto 0 (regalo) y sin presentaciones sigue siendo una venta: no se descarta como fila de comparación", async () => {
    const datos = await fuente(
      lecturas({
        horas_por_ciudad_y_colportor: [horas("2026-10-20")],
        ventas_por_ciudad_y_colportor: [
          ventas("2026-10-20", {
            ventas: 1,
            monto_total: 0,
            presentaciones: 0,
          }),
        ],
      }),
    ).obtenerHoras();

    expect(
      datos?.ciudades[0].colportores[0].ventasPorDia["2026-10-20"],
    ).toEqual({ presentaciones: 0, ventas: 1, monto: 0, cobrado: null });
  });

  it("una fila de ventas sin la columna `ventas` es un error, no ceros", async () => {
    const sinVentas: Record<string, unknown> = ventas("2026-10-20");
    delete sinVentas.ventas;
    await expect(
      fuente(
        lecturas({
          horas_por_ciudad_y_colportor: [horas("2026-10-20")],
          ventas_por_ciudad_y_colportor: [sinVentas],
        }),
      ).obtenerHoras(),
    ).rejects.toThrow();
  });

  it("`monto_total` en null es un error, no un 0 mudo", async () => {
    await expect(
      fuente(
        lecturas({
          horas_por_ciudad_y_colportor: [horas("2026-10-20")],
          ventas_por_ciudad_y_colportor: [
            ventas("2026-10-20", { monto_total: null }),
          ],
        }),
      ).obtenerHoras(),
    ).rejects.toThrow();
  });
});
