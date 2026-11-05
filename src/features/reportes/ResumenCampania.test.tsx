import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DATOS_REPORTES_SIMULADOS } from "@/datos/reportes/simulado";
import { ResumenCampania } from "@/features/reportes/ResumenCampania";

describe("ResumenCampania", () => {
  it("renderiza el título y los cinco agregados de la campaña", () => {
    render(<ResumenCampania resumen={DATOS_REPORTES_SIMULADOS.resumenCampania} />);
    expect(screen.getByText("Resumen de campaña")).toBeInTheDocument();
    expect(screen.getByText("2.214 h")).toBeInTheDocument();
    expect(screen.getByText("784")).toBeInTheDocument();
    expect(screen.getByText("3.196")).toBeInTheDocument();
    expect(screen.getByText("21%")).toBeInTheDocument();
    expect(screen.getByText("71%")).toBeInTheDocument();
  });
});
