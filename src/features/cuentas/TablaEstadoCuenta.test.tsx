import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FILAS_ESTADO_CUENTA_SIMULADAS } from "@/datos/cuentas/simulado";
import { TablaEstadoCuenta } from "@/features/cuentas/TablaEstadoCuenta";

describe("TablaEstadoCuenta", () => {
  describe("con filas", () => {
    it("muestra cada colportor con sus montos", () => {
      render(<TablaEstadoCuenta filas={FILAS_ESTADO_CUENTA_SIMULADAS} />);

      expect(screen.getByText("Diego Rocha")).toBeInTheDocument();
      expect(screen.getByText("$U 31.200")).toBeInTheDocument();
      expect(screen.getByText("$U 78.400")).toBeInTheDocument();
      expect(screen.getByText("10 jun")).toBeInTheDocument();
    });

    it("marca con el ícono de alerta el último depósito atrasado", () => {
      render(<TablaEstadoCuenta filas={FILAS_ESTADO_CUENTA_SIMULADAS} />);

      expect(screen.getByText("⚠ 29 may")).toBeInTheDocument();
    });

    it("marca el ticket pendiente cuando todavía no hay depósito confirmado", () => {
      render(<TablaEstadoCuenta filas={FILAS_ESTADO_CUENTA_SIMULADAS} />);

      expect(screen.getByText("ticket pend.")).toBeInTheDocument();
    });
  });

  describe("cuando no hay filas", () => {
    it("muestra el estado vacío", () => {
      render(<TablaEstadoCuenta filas={[]} />);

      expect(screen.getByText("Ningún colportor tiene estado de cuenta todavía.")).toBeInTheDocument();
    });
  });
});
