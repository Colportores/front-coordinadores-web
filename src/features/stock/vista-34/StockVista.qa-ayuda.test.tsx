import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import type { ColportorDeStock, DatosDeStock, ExistenciaDeStock } from "@/datos/stock/contrato";
import { crearDatosDeStockSimulados } from "@/datos/stock/simulado";

import { StockVista } from "./StockVista";

// QA del PR #120 (issue #109): la ayuda del encabezado «POR COBRAR» como descripción accesible, sin elemento visual nuevo
// (decisión del orquestador del 28/10, P2). Lo que los tests del implementador no cubren.

const AYUDA = "Unidades entregadas que todavía no se pagaron, en proporción al saldo de cada venta.";

const ex = (productoId: string, p: Partial<ExistenciaDeStock> = {}): ExistenciaDeStock => ({
  productoId,
  tiene: 1,
  porEntregar: 0,
  entregados: 3,
  devueltos: 1,
  porCobrar: 2,
  ...p,
});
const col = (id: string, ciudadId: string | null, ...existencias: ExistenciaDeStock[]): ColportorDeStock => ({
  id,
  nombre: id,
  ciudadId,
  ultimoDatoAt: null,
  existencias,
});
const datos = (): DatosDeStock => ({
  campaniaId: "c",
  ciudades: [{ id: "riv", nombre: "Rivera", departamento: "Rivera" }],
  productos: [
    { id: "l1", nombre: "Libro uno", tipo: "LIBRO", nota: null },
    { id: "r1", nombre: "Revista A", tipo: "REVISTA", nota: null },
  ],
  colportores: [col("ana", "riv", ex("l1"), ex("r1"))],
});

const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const tabla = () => screen.getByRole("table", { name: /^Stock por producto en/ });
const encabezadosConAyuda = (t: HTMLElement) =>
  within(t)
    .getAllByRole("columnheader")
    .filter((h) => h.hasAttribute("title") || h.getAttribute("aria-describedby"))
    .map((h) => h.textContent);

describe("PR #120 · ayuda de «POR COBRAR»", () => {
  it("la tabla de productos tiene la ayuda en un solo encabezado (POR COBRAR) con el texto literal, y su nombre no cambia", () => {
    render(<StockVista datos={datos()} />);
    const t = tabla();
    expect(encabezadosConAyuda(t)).toEqual(["POR COBRAR"]);
    const h = within(t).getByRole("columnheader", { name: "POR COBRAR" });
    expect(h).toHaveAccessibleDescription(AYUDA);
    expect(h).toHaveAccessibleName("POR COBRAR");
  });

  it("el detalle de un libro, el de una categoría de revistas y el de una ciudad elegida llevan la misma ayuda, en un solo encabezado", async () => {
    render(<StockVista datos={datos()} />);
    await userEvent.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    for (const nombre of [/Libro uno/, /Revista A/]) {
      await userEvent.click(within(tabla()).getByRole("button", { name: nombre }));
      const quien = screen.getByRole("table", { name: /^Quién tiene/ });
      expect(encabezadosConAyuda(quien)).toEqual(["POR COBRAR"]);
      expect(within(quien).getByRole("columnheader", { name: "POR COBRAR" })).toHaveAccessibleDescription(AYUDA);
      await userEvent.click(within(tabla()).getByRole("button", { name: nombre }));
    }
  });

  it("con la fuente simulada, en todas las ciudades y con las filas de cada tipo abiertas, todo «POR COBRAR» de la vista tiene la ayuda", async () => {
    const { container } = render(<StockVista datos={crearDatosDeStockSimulados()} />);
    await userEvent.click(within(tabla()).getByRole("button", { name: /La Gran Esperanza/ }));
    await userEvent.click(within(tabla()).getByRole("button", { name: /Misioneros · todos/ }));
    const todos = Array.from(container.querySelectorAll("th")).filter((h) => h.textContent === "POR COBRAR");
    expect(todos.length).toBeGreaterThanOrEqual(3);
    for (const h of todos) expect(h).toHaveAccessibleDescription(AYUDA);
  });

  it("no agrega texto visible: la ayuda no aparece como contenido, solo como descripción", () => {
    const { container } = render(<StockVista datos={datos()} />);
    expect(container.textContent).not.toContain(AYUDA);
    expect(screen.queryByText(AYUDA)).toBeNull();
  });

  it("axe A/AA sin violaciones con el detalle abierto y la ayuda puesta", async () => {
    const { container } = render(<StockVista datos={datos()} />);
    await userEvent.click(within(tabla()).getByRole("button", { name: /Libro uno/ }));
    const r = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});
