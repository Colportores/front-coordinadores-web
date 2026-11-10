import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { crearFuenteReportesRpc } from "@/datos/reportes/rpc";
import type { ClienteRpc } from "@/datos/supabase/cliente";

import { ReporteHoras } from "./ReporteHoras";

/** QA del PR #171 (issue #167): lo que el coordinador ve en Reportes con las filas reales de las dos RPC (antes: «—»). */

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

const filaHoras = (dia: string) => ({
  ...base,
  periodo_inicio: dia,
  periodo_fin: dia,
  horas: 5,
  jornadas: 1,
  dias_trabajados: 1,
  jornadas_acompaniadas: 0,
  horas_anterior: 0,
  jornadas_anterior: 0,
});
const filaVentas = (dia: string, extra: Record<string, unknown> = {}) => ({
  ...base,
  periodo_inicio: dia,
  periodo_fin: dia,
  ventas: 2,
  monto_total: 380000,
  presentaciones: 7,
  ventas_anterior: 0,
  monto_anterior: 0,
  presentaciones_anterior: 0,
  cobrado: null,
  cobrado_anterior: null,
  ...extra,
});

async function datosReales() {
  const respuestas: Record<string, unknown> = {
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
    horas_por_ciudad_y_colportor: [
      filaHoras("2026-10-12"),
      filaHoras("2026-10-13"),
    ],
    ventas_por_ciudad_y_colportor: [
      filaVentas("2026-10-12"),
      filaVentas("2026-10-13", {
        ventas: 1,
        monto_total: 195050,
        presentaciones: 4,
      }),
    ],
    zonas_por_colportor: [],
  };
  const cliente = {
    llamarRpc: vi.fn(async (nombre: string) => respuestas[nombre]),
  } as unknown as ClienteRpc;
  const datos = await crearFuenteReportesRpc(
    cliente,
    async () => null,
    () => new Date("2026-10-21T13:00:00Z"),
  ).obtenerHoras();
  if (!datos) throw new Error("la fuente devolvió null");
  return datos;
}

describe("QA #167 · Reportes con datos de las RPC", () => {
  it("la fila del colportor muestra presentaciones, ventas y monto en $U (no «—») y no hay % por cobrar", async () => {
    render(<ReporteHoras datos={await datosReales()} />);

    const tabla = screen.getByRole("table");
    const fila = within(tabla)
      .getByRole("rowheader", { name: /Lucía Fernández/ })
      .closest("tr")!;
    const texto = fila.textContent ?? "";
    expect(texto).toContain("11"); // presentaciones 7 + 4; 3 ventas
    expect(texto).toContain("$U 5.751");
    expect(within(fila).queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText(/POR COBRAR/i)).not.toBeInTheDocument();
  });

  // Decisión del agente de decisiones (10/11, mapa §2, P1): Semanas rotula la semana completa y avisa de la que está en curso.
  it.skip("QA #167: Semanas dice «última semana completa» y avisa que la semana en curso se compara cuando termine (decisión P1, sin aplicar)", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={await datosReales()} />);
    await user.click(screen.getByRole("button", { name: "Semanas" }));

    expect(screen.getByText(/S\d+ · última semana completa/)).toBeInTheDocument();
    expect(screen.getByText(/La S\d+ está en curso: se compara cuando termine\./)).toBeInTheDocument();
  });
});
