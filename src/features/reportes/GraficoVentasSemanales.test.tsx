import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DATOS_REPORTES_SIMULADOS } from "@/datos/reportes/simulado";
import { GraficoVentasSemanales } from "@/features/reportes/GraficoVentasSemanales";

describe("GraficoVentasSemanales", () => {
  it("renderiza el título y un gráfico accesible con el resumen de los datos", () => {
    render(<GraficoVentasSemanales semanas={DATOS_REPORTES_SIMULADOS.ventasPorSemana} />);
    expect(screen.getByText("Ventas por semana · región")).toBeInTheDocument();
    const grafico = screen.getByRole("img", { name: /S1: \$U 200K/ });
    expect(grafico).toHaveAccessibleName(/S7: \$U 700K/);
    expect(grafico).toHaveAccessibleName(/S8: \$U 505K \(semana en curso/);
  });

  it("escala la altura de las barras según el monto de cada semana", () => {
    const { container } = render(<GraficoVentasSemanales semanas={DATOS_REPORTES_SIMULADOS.ventasPorSemana} />);
    const barras = container.querySelectorAll("[role='img'] > div > div:first-child");
    const alturas = Array.from(barras).map((b) => parseFloat((b as HTMLElement).style.height));
    // La semana de mayor monto (S7, 700) tiene la barra más alta (100%).
    expect(Math.max(...alturas)).toBe(100);
    // Las barras siguen el orden de los montos: S1 (200) más baja que S7 (700).
    expect(alturas[0]).toBeLessThan(alturas[6]);
  });

  it("muestra un estado vacío si no hay semanas para el período", () => {
    render(<GraficoVentasSemanales semanas={[]} />);
    expect(screen.getByText("Sin datos de ventas para el período.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
