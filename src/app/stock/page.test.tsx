import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PestanaStock from "@/app/stock/page";
import { fuenteStock } from "@/datos/stock";
import type * as ModuloStock from "@/datos/stock";
import { crearDatosDeStockSimulados } from "@/datos/stock/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

vi.mock("@/datos/stock", async (importOriginal) => {
  const original = await importOriginal<typeof ModuloStock>();
  return { ...original, fuenteStock: { obtenerStock: vi.fn() } };
});

const obtenerStock = vi.mocked(fuenteStock.obtenerStock);

describe("PestanaStock", () => {
  it("arma la vista 34 con el stock de la fuente", async () => {
    obtenerStock.mockResolvedValue(crearDatosDeStockSimulados());

    render(<ProveedorModoDev activo={false}>{await PestanaStock()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Stock" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Stock por producto en Todas las ciudades" })).toBeInTheDocument();
    expect(screen.queryByText(/casa editora/i)).not.toBeInTheDocument();
  });

  it("sin campaña dice por qué no hay nada que mirar", async () => {
    obtenerStock.mockResolvedValue(null);

    render(<ProveedorModoDev activo={false}>{await PestanaStock()}</ProveedorModoDev>);

    expect(screen.getByRole("status")).toHaveTextContent(
      "No tenés una campaña en curso ni por empezar. Cuando tengas una, vas a ver acá el stock de cada ciudad.",
    );
    expect(screen.queryByRole("navigation", { name: "Ciudades" })).not.toBeInTheDocument();
  });

  it("si la fuente falla, la página falla y Next muestra error.tsx (no se pinta una vista vacía)", async () => {
    obtenerStock.mockRejectedValue(new Error("sin red"));

    await expect(PestanaStock()).rejects.toThrow("sin red");
  });

  it("al elegir otra campaña la vista se reinicia: la clave es la campaña", async () => {
    obtenerStock.mockResolvedValue({ ...crearDatosDeStockSimulados(), campaniaId: "otra" });

    const jsx = await PestanaStock();
    const vista = JSON.stringify(jsx, (clave, valor) => (clave === "_owner" || clave === "_store" ? undefined : valor));

    expect(vista).toContain('"key":"otra"');
  });
});
