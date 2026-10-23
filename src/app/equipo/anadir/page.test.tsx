import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AnadirColportorPagina from "@/app/equipo/anadir/page";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("AnadirColportorPagina", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("arma la vista 23 con el título de la pestaña y los datos de la campaña", async () => {
    const jsx = await AnadirColportorPagina();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Añadir colportor" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Añadir colportor a Verano 2026" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ya en tu equipo" })).toBeInTheDocument();
  });

  it("al elegir otra campaña (la página se vuelve a pedir) la vista arranca de cero: nada de la búsqueda de la anterior (#70)", async () => {
    vi.spyOn(fuenteEquipoSimulada, "obtenerAnadirColportor")
      .mockResolvedValueOnce({ ...DATOS_ANADIR_COLPORTOR_SIMULADO, campaniaId: "campania-a", campania: "Campaña A" })
      .mockResolvedValueOnce({ ...DATOS_ANADIR_COLPORTOR_SIMULADO, campaniaId: "campania-b", campania: "Campaña B" });

    const { rerender } = render(<ProveedorModoDev activo={false}>{await AnadirColportorPagina()}</ProveedorModoDev>);
    const buscador = screen.getByRole("textbox", { name: "Buscar por email o nombre" });
    fireEvent.change(buscador, { target: { value: "ana" } });
    expect(buscador).toHaveValue("ana");

    rerender(<ProveedorModoDev activo={false}>{await AnadirColportorPagina()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { name: "Añadir colportor a Campaña B" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Buscar por email o nombre" })).toHaveValue("");
  });

  it("sin campaña en curso no arma el buscador: avisa y deja volver a Equipo", async () => {
    vi.spyOn(fuenteEquipoSimulada, "obtenerAnadirColportor").mockResolvedValueOnce(null);

    render(<ProveedorModoDev activo={false}>{await AnadirColportorPagina()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Añadir colportor" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No tenés una campaña en curso a la que añadir colportores.");
    expect(screen.getByRole("link", { name: "‹ Equipo" })).toHaveAttribute("href", "/equipo");
    expect(screen.queryByRole("textbox", { name: "Buscar por email o nombre" })).not.toBeInTheDocument();
  });

  it("un error al traer los datos llega al boundary de la ruta (no se pinta como «sin campaña»)", async () => {
    vi.spyOn(fuenteEquipoSimulada, "obtenerAnadirColportor").mockRejectedValueOnce(new Error("sin red"));

    await expect(AnadirColportorPagina()).rejects.toThrow("sin red");
  });

  it("en modo dev marca la sección con la HU-CAM-004", async () => {
    const jsx = await AnadirColportorPagina();
    const { container } = render(<ProveedorModoDev activo>{jsx}</ProveedorModoDev>);

    expect(container.querySelector('[data-hu="HU-CAM-004"]')).not.toBeNull();
  });
});
