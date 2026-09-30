import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DATOS_CIUDADES_SIMULADO } from "@/datos/ciudades/simulado";
import { ListaCiudades } from "@/features/ciudades/ListaCiudades";

describe("ListaCiudades", () => {
  it("muestra cada ciudad con sus zonas y los colportores de cada zona", () => {
    render(<ListaCiudades ciudades={DATOS_CIUDADES_SIMULADO.ciudades} />);

    const montevideo = within(screen.getByRole("region", { name: "Ciudad Montevideo" }));
    expect(montevideo.getByRole("heading", { name: "Montevideo" })).toBeInTheDocument();
    expect(montevideo.getByText("Cerro Norte · 2")).toBeInTheDocument();
    expect(montevideo.getByText("Diego Rocha")).toBeInTheDocument();
    expect(montevideo.getByText("Joel Cabrera")).toBeInTheDocument();
    expect(montevideo.getByText("Belvedere · 1")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ciudad Las Piedras" })).toBeInTheDocument();
  });

  it("lista los colportores «Sin asignar» de cada ciudad", () => {
    render(<ListaCiudades ciudades={DATOS_CIUDADES_SIMULADO.ciudades} />);

    const montevideo = within(screen.getByRole("region", { name: "Ciudad Montevideo" }));
    expect(montevideo.getByText("Sin asignar · 1")).toBeInTheDocument();
    expect(montevideo.getByText("Ana Martínez")).toBeInTheDocument();
    const lasPiedras = within(screen.getByRole("region", { name: "Ciudad Las Piedras" }));
    expect(lasPiedras.getByText("Laura Suárez")).toBeInTheDocument();
  });

  it("avisa cuando una zona no tiene colportores y cuando todos tienen zona", () => {
    render(<ListaCiudades ciudades={DATOS_CIUDADES_SIMULADO.ciudades} />);

    const lasPiedras = within(screen.getByRole("region", { name: "Ciudad Las Piedras" }));
    expect(lasPiedras.getByText("Centro · 0")).toBeInTheDocument();
    expect(lasPiedras.getByText("Sin colportores en esta zona.")).toBeInTheDocument();

    render(
      <ListaCiudades
        ciudades={[{ id: "c", nombre: "Canelones", zonas: [{ id: "z", nombre: "Norte", colportores: [] }], sinAsignar: [] }]}
      />,
    );
    const canelones = within(screen.getByRole("region", { name: "Ciudad Canelones" }));
    expect(canelones.getByText("Sin asignar · 0")).toBeInTheDocument();
    expect(canelones.getByText("Todos los colportores tienen zona.")).toBeInTheDocument();
  });

  it("avisa cuando una ciudad no tiene zonas", () => {
    render(<ListaCiudades ciudades={[{ id: "c", nombre: "Canelones", zonas: [], sinAsignar: [] }]} />);
    expect(screen.getByText("Esta ciudad todavía no tiene zonas.")).toBeInTheDocument();
  });

  it("muestra un estado vacío cuando la campaña no tiene ciudades", () => {
    render(<ListaCiudades ciudades={[]} />);
    expect(screen.getByText("Todavía no hay ciudades en esta campaña.")).toBeInTheDocument();
  });
});
