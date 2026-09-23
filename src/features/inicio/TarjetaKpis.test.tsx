import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TABLERO_INICIO_SIMULADO } from "@/datos/inicio/simulado";
import { TarjetaKpis } from "@/features/inicio/TarjetaKpis";

describe("TarjetaKpis", () => {
  it("muestra las cuatro cifras de la región con su detalle", () => {
    render(<TarjetaKpis kpis={TABLERO_INICIO_SIMULADO.kpis} />);

    expect(screen.getByText("$U 612K")).toBeInTheDocument();
    expect(screen.getByText("▲ 9% semana")).toBeInTheDocument();
    expect(screen.getByText("11 / 14")).toBeInTheDocument();
    expect(screen.getByText("318")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("el más antiguo: hace 2 días")).toBeInTheDocument();
  });
});
