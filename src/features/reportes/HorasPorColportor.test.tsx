import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DATOS_REPORTES_SIMULADOS } from "@/datos/reportes/simulado";
import { HorasPorColportor } from "@/features/reportes/HorasPorColportor";

describe("HorasPorColportor", () => {
  it("renderiza el título, cada colportor y sus horas", () => {
    render(<HorasPorColportor colportores={DATOS_REPORTES_SIMULADOS.horasPorColportor} />);
    expect(screen.getByText("Horas por colportor · esta semana")).toBeInTheDocument();
    expect(screen.getByText("Melina Vázquez")).toBeInTheDocument();
    expect(screen.getByText("31,0 h")).toBeInTheDocument();
    expect(screen.getByText("Pablo Ferreira")).toBeInTheDocument();
    expect(screen.getByText("11,5 h")).toBeInTheDocument();
  });

  it("expone un resumen accesible que marca a quien está por debajo del mínimo", () => {
    render(<HorasPorColportor colportores={DATOS_REPORTES_SIMULADOS.horasPorColportor} />);
    const grafico = screen.getByRole("img", { name: /Melina Vázquez: 31,0 h/ });
    expect(grafico).toHaveAccessibleName(/Pablo Ferreira: 11,5 h \(por debajo del mínimo esperado\)/);
  });

  it("escala el ancho de las barras según las horas de cada colportor", () => {
    const { container } = render(<HorasPorColportor colportores={DATOS_REPORTES_SIMULADOS.horasPorColportor} />);
    const barras = container.querySelectorAll("[role='img'] > div > div:last-child > div");
    const anchos = Array.from(barras).map((b) => parseFloat((b as HTMLElement).style.width));
    expect(Math.max(...anchos)).toBe(100);
    expect(anchos[anchos.length - 1]).toBeLessThan(anchos[0]);
  });

  it("muestra un estado vacío si no hay colportores con horas registradas", () => {
    render(<HorasPorColportor colportores={[]} />);
    expect(screen.getByText("Sin datos de horas para el período.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
