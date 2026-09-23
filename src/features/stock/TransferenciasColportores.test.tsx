import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DATOS_STOCK_SIMULADO } from "@/datos/stock/simulado";
import { TransferenciasColportores } from "@/features/stock/TransferenciasColportores";

describe("TransferenciasColportores", () => {
  it("muestra el título y cada transferencia con origen, destino, producto y cantidad", () => {
    render(<TransferenciasColportores transferencias={DATOS_STOCK_SIMULADO.transferencias} />);

    expect(screen.getByText("Transferencias entre colportores")).toBeInTheDocument();
    expect(screen.getByText("Diego Rocha")).toBeInTheDocument();
    expect(screen.getByText("Joel Cabrera")).toBeInTheDocument();
    expect(screen.getByText("El Deseado de Todas…")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Melina Vázquez")).toBeInTheDocument();
    expect(screen.getByText("Noelia Acosta")).toBeInTheDocument();
    expect(screen.getByText("Vida Sana · 3 tomos")).toBeInTheDocument();
  });

  it("ofrece autorizar/rechazar la transferencia pendiente y muestra el estado de la ya resuelta", () => {
    render(<TransferenciasColportores transferencias={DATOS_STOCK_SIMULADO.transferencias} />);

    expect(screen.getByRole("button", { name: "Autorizar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeInTheDocument();
    expect(screen.getByText(/Autorizada · 08 jun/i)).toBeInTheDocument();
  });

  it("muestra un estado vacío cuando no hay transferencias", () => {
    render(<TransferenciasColportores transferencias={[]} />);

    expect(screen.getByText("No hay transferencias entre colportores.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
