import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ListaTicketsPorValidar } from "@/datos/cuentas";
import { LISTA_TICKETS_POR_VALIDAR_SIMULADA } from "@/datos/cuentas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { TicketsPorValidar } from "@/features/cuentas/TicketsPorValidar";

describe("TicketsPorValidar", () => {
  describe("cuando hay tickets", () => {
    it("muestra cada ticket con colportor, monto, medio y fecha", () => {
      render(<TicketsPorValidar lista={LISTA_TICKETS_POR_VALIDAR_SIMULADA} />);

      expect(screen.getByText("Laura Suárez")).toBeInTheDocument();
      expect(screen.getByText("$U 18.500")).toBeInTheDocument();
      expect(screen.getByText(/depósito BROU · hoy 10:42 · recibo N° 0482/)).toBeInTheDocument();
      expect(screen.getByText("Diego Rocha")).toBeInTheDocument();
      expect(screen.getByText(/transferencia · ayer 18:03 · sin foto/)).toBeInTheDocument();
    });

    it("muestra el total pendiente en la insignia y el enlace a ver todos", () => {
      render(<TicketsPorValidar lista={LISTA_TICKETS_POR_VALIDAR_SIMULADA} />);

      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText("Ver los 4 tickets →")).toBeInTheDocument();
    });

    it("muestra validar y rechazar en el ticket con comprobante, y revisar en el que no tiene", () => {
      render(<TicketsPorValidar lista={LISTA_TICKETS_POR_VALIDAR_SIMULADA} />);

      expect(screen.getByRole("button", { name: /Validar/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Rechazar" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Revisar" })).toBeInTheDocument();
    });

    it("muestra el placeholder de foto solo en el ticket con comprobante cargado", () => {
      render(<TicketsPorValidar lista={LISTA_TICKETS_POR_VALIDAR_SIMULADA} />);

      expect(screen.getByText("[ foto ticket depósito ]")).toBeInTheDocument();
    });

    it("marca el ticket con comprobante con el chip de HU-CTA-006 en modo dev", () => {
      render(
        <ProveedorModoDev activo>
          <TicketsPorValidar lista={LISTA_TICKETS_POR_VALIDAR_SIMULADA} />
        </ProveedorModoDev>,
      );

      const chips = screen.getAllByTestId("chip-hu");
      expect(chips.some((chip) => chip.textContent?.includes("HU-CTA-006"))).toBe(true);
    });

    it("no muestra 'sin foto' cuando el ticket tiene foto pero todavía no tiene número de recibo", () => {
      const lista: ListaTicketsPorValidar = {
        tickets: [
          {
            id: "ticket-sin-recibo",
            colportor: "Ana Pereyra",
            monto: 5000,
            medio: "deposito",
            medioDetalle: "depósito Santander",
            fecha: "hoy 09:00",
            tieneFoto: true,
          },
        ],
        totalPendientes: 1,
      };

      render(<TicketsPorValidar lista={lista} />);

      expect(screen.getByText("depósito Santander · hoy 09:00")).toBeInTheDocument();
      expect(screen.queryByText(/sin foto/)).not.toBeInTheDocument();
      expect(screen.getByText("[ foto ticket depósito ]")).toBeInTheDocument();
    });
  });

  describe("cuando no hay tickets", () => {
    it("muestra el estado vacío y no muestra la insignia", () => {
      render(<TicketsPorValidar lista={{ tickets: [], totalPendientes: 0 }} />);

      expect(screen.getByText("No hay tickets pendientes de validar.")).toBeInTheDocument();
      expect(screen.queryByText("0")).not.toBeInTheDocument();
    });

    it("no muestra la insignia aunque totalPendientes sea mayor a cero", () => {
      render(<TicketsPorValidar lista={{ tickets: [], totalPendientes: 5 }} />);

      expect(screen.getByText("No hay tickets pendientes de validar.")).toBeInTheDocument();
      expect(screen.queryByText("5")).not.toBeInTheDocument();
    });
  });
});
