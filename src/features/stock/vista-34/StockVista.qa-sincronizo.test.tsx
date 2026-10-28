import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ColportorDeStock, DatosDeStock } from "@/datos/stock/contrato";
import { crearDatosDeStockSimulados } from "@/datos/stock/simulado";
import { fechaYHoraEnMontevideo } from "@/lib/momento";

import { StockVista } from "./StockVista";
import { textoDeSincronizacion } from "./modelo";

// QA del PR #104 (issue #92): «Sincronizó el 22/10 a las 18:30» en la fila abierta del colportor (decisión de Cristian
// del 25/10, «Fecha stock»). Lo que los tests del implementador no cubren.

const col = (id: string, nombre: string, ultimoDatoAt: string | null, tiene = 3): ColportorDeStock => ({
  id,
  nombre,
  ciudadId: "riv",
  ultimoDatoAt,
  existencias: [{ productoId: "l1", tiene, porEntregar: 0, entregados: 0, devueltos: 0, porCobrar: 0 }],
});
const datos = (...colportores: ColportorDeStock[]): DatosDeStock => ({
  campaniaId: "c",
  ciudades: [{ id: "riv", nombre: "Rivera", departamento: "Rivera" }],
  productos: [{ id: "l1", nombre: "Libro uno", tipo: "LIBRO", nota: null }],
  colportores,
});
const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const tabla = () => screen.getByRole("table", { name: /^Stock por producto en/ });
const abrirFila = async () => {
  await userEvent.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
  await userEvent.click(within(tabla()).getByRole("button", { name: /Libro uno/ }));
  return screen.getByRole("table", { name: /^Quién tiene Libro uno/ });
};

describe("PR #104 · texto literal de la decisión del 25/10", () => {
  it("«Sincronizó el 22/10 a las 18:30» sale con ese texto exacto (día/mes, 24 h, sin año ni «hs»)", async () => {
    render(<StockVista datos={datos(col("ana", "Ana", "2026-10-22T21:30:00Z"))} />);
    const quien = await abrirFila();
    expect(within(quien).getByText("Sincronizó el 22/10 a las 18:30")).toBeInTheDocument();
  });

  it("la fecha es la de Montevideo (UTC-3) aunque la marca venga con otro desfase o con milisegundos", () => {
    expect(textoDeSincronizacion("2026-10-22T18:30:00-03:00")).toBe("Sincronizó el 22/10 a las 18:30");
    expect(textoDeSincronizacion("2026-10-22T23:30:00+02:00")).toBe("Sincronizó el 22/10 a las 18:30");
    expect(textoDeSincronizacion("2026-10-22T21:30:00.123456Z")).toBe("Sincronizó el 22/10 a las 18:30");
  });

  it("minutos y horas de un dígito llevan cero adelante (09:05, 00:00) y no aparece «24:00»", () => {
    expect(fechaYHoraEnMontevideo("2026-03-05T12:05:00Z")).toBe("05/03 a las 09:05");
    expect(fechaYHoraEnMontevideo("2026-03-05T03:00:00Z")).toBe("05/03 a las 00:00");
  });

  it("el cambio de año se escribe con la fecha de Montevideo (1/1 02:00 UTC es 31/12 23:00 allá)", () => {
    expect(fechaYHoraEnMontevideo("2027-01-01T02:00:00Z")).toBe("31/12 a las 23:00");
  });

  it("valores ilegibles dicen «Todavía no sincronizó» y nunca «Invalid Date», «NaN» ni «undefined»", () => {
    for (const malo of ["", "   ", "ayer", "no-es-fecha", "2026-13-45T99:99:99Z"]) {
      const t = textoDeSincronizacion(malo);
      expect(t, JSON.stringify(malo)).toBe("Todavía no sincronizó");
      expect(t).not.toMatch(/invalid|nan|undefined|null/i);
    }
  });
});

describe("PR #104 · la fila abierta con la línea nueva", () => {
  it("el nombre sigue siendo el encabezado de fila y la fecha vive en el mismo encabezado (se lee junto al número)", async () => {
    render(<StockVista datos={datos(col("ana", "Ana Pérez", "2026-10-22T21:30:00Z"))} />);
    const quien = await abrirFila();
    const cabecera = within(quien).getByRole("rowheader", { name: /^Ana Pérez/ });
    expect(cabecera).toHaveTextContent("Ana Pérez");
    expect(cabecera).toHaveTextContent("Sincronizó el 22/10 a las 18:30");
    // La línea no está escondida de los lectores de pantalla ni de la vista.
    expect(cabecera.querySelector("[aria-hidden='true']")).toBeNull();
    expect(cabecera.querySelector(".sr-only, .hidden")).toBeNull();
  });

  it("dos colportores con fechas distintas y uno sin dato: cada fila lleva la suya, sin cruzarse", async () => {
    render(
      <StockVista
        datos={datos(col("ana", "Ana", "2026-10-22T21:30:00Z"), col("beto", "Beto", "2026-10-19T13:05:00Z"), col("cris", "Cris", null))}
      />,
    );
    const quien = await abrirFila();
    const fila = (n: string) => within(quien).getByRole("rowheader", { name: new RegExp(`^${n}`) }).closest("tr")!;
    expect(fila("Ana")).toHaveTextContent("Sincronizó el 22/10 a las 18:30");
    expect(fila("Beto")).toHaveTextContent("Sincronizó el 19/10 a las 10:05");
    expect(fila("Cris")).toHaveTextContent("Todavía no sincronizó");
  });

  it("un colportor sin existencias (tiene 0) no aparece, así que tampoco su fecha (no se inventa una fila)", async () => {
    render(<StockVista datos={datos(col("ana", "Ana", "2026-10-22T21:30:00Z"), col("cero", "Cero", "2026-10-20T12:00:00Z", 0))} />);
    const quien = await abrirFila();
    expect(within(quien).queryByText(/^Cero/)).toBeNull();
  });

  it("la línea no agrega plata ni datos de clientes: solo la fecha (R-RP01)", async () => {
    render(<StockVista datos={datos(col("ana", "Ana", "2026-10-22T21:30:00Z"))} />);
    const quien = await abrirFila();
    expect(quien.textContent).not.toMatch(/\$|UYU|cliente/i);
  });

  it("con la fuente simulada de hoy: Natalia Vidal lleva días sin señal y Nicolás Viera nunca sincronizó, sin repetir fecha entre todos", async () => {
    const ahora = new Date("2026-10-27T15:00:00Z");
    const sim = crearDatosDeStockSimulados(ahora);
    const fechas = sim.colportores.map((c) => c.ultimoDatoAt);
    expect(sim.colportores.find((c) => c.nombre === "Nicolás Viera")!.ultimoDatoAt).toBeNull();
    const natalia = sim.colportores.find((c) => c.nombre === "Natalia Vidal")!.ultimoDatoAt!;
    expect(ahora.getTime() - new Date(natalia).getTime()).toBeGreaterThan(72 * 3_600_000);
    // Nada en el futuro respecto de «ahora» (un dato recibido mañana no existe).
    for (const f of fechas.filter((x): x is string => x !== null)) expect(new Date(f).getTime()).toBeLessThanOrEqual(ahora.getTime());
  });
});
