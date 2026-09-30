import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
import { DATOS_EQUIPO_SIMULADO } from "@/datos/equipo/simulado";
import { PreciosPorCiudad } from "@/features/equipo/PreciosPorCiudad";

describe("PreciosPorCiudad", () => {
  it("muestra, por ciudad, el precio de cada producto frente al base, con 'Editar' marcado como no disponible", () => {
    render(<PreciosPorCiudad ciudades={DATOS_EQUIPO_SIMULADO.preciosPorCiudad} />);

    expect(screen.getByText("Precios por ciudad")).toBeInTheDocument();
    const montevideo = screen.getByRole("region", { name: "Precios de Montevideo" });
    expect(within(montevideo).getByText("Vida Sana · 3 tomos")).toBeInTheDocument();
    expect(within(montevideo).getByText("base $U 2.900")).toBeInTheDocument();
    expect(within(montevideo).getByText("$U 3.100")).toBeInTheDocument();
    const lasPiedras = screen.getByRole("region", { name: "Precios de Las Piedras" });
    expect(within(lasPiedras).getByText("$U 2.950")).toBeInTheDocument();
    const editar = screen.getByRole("button", { name: "Editar" });
    expect(editar).toHaveAttribute("aria-disabled", "true");
    expect(editar).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
  });

  it("ya no habla de zonas ni de delta-sync", () => {
    const { container } = render(<PreciosPorCiudad ciudades={DATOS_EQUIPO_SIMULADO.preciosPorCiudad} />);

    expect(screen.queryByText(/delta-sync/i)).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/zona/i);
  });

  it("muestra un estado vacío cuando no hay precios en ninguna ciudad", () => {
    render(<PreciosPorCiudad ciudades={[]} />);
    expect(screen.getByText("No hay precios configurados para esta campaña.")).toBeInTheDocument();
  });

  it("avisa cuando una ciudad no tiene precios", () => {
    render(<PreciosPorCiudad ciudades={[{ ciudadId: "c1", ciudadNombre: "Canelones", productos: [] }]} />);
    expect(screen.getByText("No hay precios configurados para esta ciudad.")).toBeInTheDocument();
  });
});
