import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TABLERO_INICIO_SIMULADO } from "@/datos/inicio/simulado";
import { TarjetaPendientesAccion } from "@/features/inicio/TarjetaPendientesAccion";

function renderTarjeta() {
  return render(
    <TarjetaPendientesAccion pendientes={TABLERO_INICIO_SIMULADO.pendientes} mapa={TABLERO_INICIO_SIMULADO.mapaRegion} />,
  );
}

describe("TarjetaPendientesAccion", () => {
  it("muestra cada pendiente con su atajo a la pestaña que lo resuelve", () => {
    renderTarjeta();

    expect(screen.getByText("Ticket de depósito")).toBeInTheDocument();
    expect(screen.getByText("L. Suárez · $U 18.500 · foto adjunta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Validar" })).toHaveAttribute("href", "/cuentas");
    const autorizar = screen.getAllByRole("link", { name: "Autorizar" });
    expect(autorizar).toHaveLength(2);
    autorizar.forEach((enlace) => expect(enlace).toHaveAttribute("href", "/stock"));
    expect(screen.getByRole("link", { name: "Asignar zona" })).toHaveAttribute("href", "/equipo");
  });

  it("deja sin comportamiento los botones sin formulario diseñado", () => {
    renderTarjeta();

    const rechazar = screen.getAllByRole("button", { name: "Rechazar" });
    expect(rechazar.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Ver foto" })).toBeInTheDocument();
  });

  it("muestra el mini mapa de la región como placeholder", () => {
    renderTarjeta();

    expect(screen.getByText("MINI MAPA REGIÓN")).toBeInTheDocument();
    expect(screen.getByText("[ mapa OSM · zonas región ]")).toBeInTheDocument();
  });

  it("muestra un estado vacío cuando no hay pendientes", () => {
    render(<TarjetaPendientesAccion pendientes={[]} mapa={[]} />);

    expect(screen.getByText("No tenés pendientes por ahora.")).toBeInTheDocument();
  });
});
