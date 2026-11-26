import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import { crearAccionesSimuladas, crearDatosDeStockSimulados } from "@/datos/stock/simulado";

import { StockVista } from "./StockVista";

/** axe en jsdom no mide contraste (no hay layout): el contraste va en la corrida con navegador real. */
async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

describe("retoque 42B · accesibilidad (axe A/AA, sin contraste)", () => {
  it("con el aviso de pedidos, el número en la pestaña y la fila abierta con enlaces y ajustes", async () => {
    const { container } = render(<StockVista vistaInicial="producto" datos={crearDatosDeStockSimulados()} acciones={crearAccionesSimuladas()} />);
    await userEvent.click(within(screen.getByRole("navigation", { name: "Ciudades" })).getByRole("button", { name: /^Rivera/ }));
    await userEvent.click(within(screen.getByRole("table", { name: /^Stock por producto/ })).getByRole("button", { name: /El Deseado de Todas las Gentes/ }));
    expect(screen.getByRole("list", { name: /^Ajustes de stock de/ })).toBeInTheDocument();
    expect(await violaciones(container)).toEqual([]);
  });

  it("el formulario de «Pedir transferencia de materiales», vacío, con errores y con el aviso de lo armado", async () => {
    const { container } = render(<StockVista vistaInicial="producto" datos={crearDatosDeStockSimulados()} acciones={crearAccionesSimuladas()} />);
    await userEvent.click(screen.getByRole("button", { name: "Pedir transferencia de materiales" }));
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Pedir transferencia" }));
    expect(await violaciones(container)).toEqual([]);

    const dialogo = within(screen.getByRole("dialog"));
    await userEvent.selectOptions(dialogo.getByLabelText("QUIÉN DA LOS LIBROS"), "lucia-fernandez");
    await userEvent.selectOptions(dialogo.getByLabelText("QUIÉN LOS RECIBE"), "bruno-techera");
    await userEvent.selectOptions(dialogo.getByLabelText("Producto 1"), "ddg");
    await userEvent.type(dialogo.getByLabelText("Cantidad del producto 1"), "2");
    await userEvent.click(dialogo.getByRole("button", { name: "Pedir transferencia" }));
    expect(await screen.findByText(/Armaste la transferencia/)).toBeInTheDocument();
    expect(await violaciones(container)).toEqual([]);
  });

  it("los botones y los campos nuevos miden al menos 32 px de alto (objetivo táctil AA)", async () => {
    const { container } = render(<StockVista vistaInicial="producto" datos={crearDatosDeStockSimulados()} acciones={crearAccionesSimuladas()} />);
    await userEvent.click(screen.getByRole("button", { name: "Pedir transferencia de materiales" }));
    for (const control of container.querySelectorAll("button, select, input")) {
      expect(control.className, control.getAttribute("aria-label") ?? control.textContent ?? "").toMatch(/min-h-8|min-h-9|min-h-10|size-8/);
    }
  });
});
