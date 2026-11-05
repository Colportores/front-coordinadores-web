import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import { crearDatosDeStockSimulados } from "@/datos/stock/simulado";

import { StockVista } from "./StockVista";

/** axe en jsdom no mide contraste (no hay layout): el contraste va en la corrida con navegador real. */
async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const lista = () => within(screen.getByRole("navigation", { name: "Ciudades" }));
const tabla = () => within(screen.getByRole("table", { name: /^Stock por producto/ }));

describe("StockVista · accesibilidad (axe A/AA, sin contraste)", () => {
  it("la vista abierta, con una ciudad y con varias", async () => {
    const { container } = render(<StockVista datos={crearDatosDeStockSimulados()} />);
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(lista().getByRole("button", { name: /^Rivera/ }));
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(lista().getByRole("button", { name: /^Todo el departamento/ }));
    expect(await violaciones(container)).toEqual([]);
  });

  it("con filas abiertas y con la lista contraída", async () => {
    const { container } = render(<StockVista datos={crearDatosDeStockSimulados()} />);
    await userEvent.click(tabla().getByRole("button", { name: /La Gran Esperanza/ }));
    await userEvent.click(tabla().getByRole("button", { name: /Misioneros · todos/ }));
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Contraer ciudades" }));
    expect(await violaciones(container)).toEqual([]);
  });

  it("el estado no depende solo del color: lleva un símbolo y un texto", () => {
    render(<StockVista datos={crearDatosDeStockSimulados()} />);
    const estados = tabla().getAllByText(/Agotado en la ciudad|Faltan \d+ para entregar|Alcanza/);

    expect(estados.length).toBeGreaterThan(0);
    for (const e of estados) expect(e.previousElementSibling).toHaveAttribute("aria-hidden", "true");
  });

  it("los botones de la vista miden al menos 32 px de alto (objetivo táctil AA)", () => {
    const { container } = render(<StockVista datos={crearDatosDeStockSimulados()} />);
    for (const boton of container.querySelectorAll("button")) {
      expect(boton.className, boton.textContent ?? "").toMatch(/min-h-8|min-h-9|min-h-10|size-8/);
    }
  });
});
