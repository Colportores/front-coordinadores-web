import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RESUMEN_CUENTAS_SIMULADO } from "@/datos/cuentas/simulado";
import { ResumenCuentasEquipo } from "@/features/cuentas/ResumenCuentasEquipo";

describe("ResumenCuentasEquipo", () => {
  it("muestra el título y los KPI del equipo con los datos simulados", () => {
    render(<ResumenCuentasEquipo resumen={RESUMEN_CUENTAS_SIMULADO} />);

    expect(screen.getByRole("heading", { name: "Estado de cuenta del equipo" })).toBeInTheDocument();
    expect(screen.getByText("DEUDA TOTAL EQUIPO")).toBeInTheDocument();
    expect(screen.getByText("$U 214.300")).toBeInTheDocument();
    expect(screen.getByText("DEPOSITADO CAMPAÑA")).toBeInTheDocument();
    expect(screen.getByText("$U 398.700")).toBeInTheDocument();
  });
});
