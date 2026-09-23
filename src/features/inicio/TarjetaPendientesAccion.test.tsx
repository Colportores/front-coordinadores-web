import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
import { TABLERO_INICIO_SIMULADO } from "@/datos/inicio/simulado";
import { TarjetaPendientesAccion } from "@/features/inicio/TarjetaPendientesAccion";
import { fijarFlags } from "@/test/flags";

function renderTarjeta() {
  return render(
    <TarjetaPendientesAccion pendientes={TABLERO_INICIO_SIMULADO.pendientes} mapa={TABLERO_INICIO_SIMULADO.mapaRegion} />,
  );
}

describe("TarjetaPendientesAccion", () => {
  it("muestra cada pendiente con su atajo a la pestaña que lo resuelve, cuando esa pestaña está visible", () => {
    fijarFlags({ modoDev: true });
    renderTarjeta();

    expect(screen.getByText("Ticket de depósito")).toBeInTheDocument();
    expect(screen.getByText("L. Suárez · $U 18.500 · foto adjunta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Validar" })).toHaveAttribute("href", "/cuentas");
    const autorizar = screen.getAllByRole("link", { name: "Autorizar" });
    expect(autorizar).toHaveLength(2);
    autorizar.forEach((enlace) => expect(enlace).toHaveAttribute("href", "/stock"));
    expect(screen.getByRole("link", { name: "Asignar zona" })).toHaveAttribute("href", "/equipo");
  });

  it("deja el atajo marcado como no disponible, sin link, cuando la pestaña destino no está visible", () => {
    fijarFlags({ modoDev: false });
    renderTarjeta();

    // Stock y Cuentas siguen al modo dev: apagadas acá, sin link a un 404.
    const validar = screen.getByRole("button", { name: "Validar" });
    expect(validar).toHaveAttribute("aria-disabled", "true");
    expect(validar).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
    expect(screen.queryByRole("link", { name: "Validar" })).not.toBeInTheDocument();
    const autorizar = screen.getAllByRole("button", { name: "Autorizar" });
    expect(autorizar).toHaveLength(2);
    autorizar.forEach((boton) => expect(boton).toHaveAttribute("aria-disabled", "true"));
    expect(screen.queryByRole("link", { name: "Autorizar" })).not.toBeInTheDocument();

    // Equipo no tiene flag propio: siempre visible, sigue siendo un link.
    expect(screen.getByRole("link", { name: "Asignar zona" })).toHaveAttribute("href", "/equipo");
  });

  it("deja sin comportamiento y marcados los botones sin formulario diseñado", () => {
    fijarFlags({ modoDev: true });
    renderTarjeta();

    const rechazar = screen.getAllByRole("button", { name: "Rechazar" });
    expect(rechazar.length).toBeGreaterThan(0);
    rechazar.forEach((boton) => {
      expect(boton).toHaveAttribute("aria-disabled", "true");
      expect(boton).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
    });
    const verFoto = screen.getByRole("button", { name: "Ver foto" });
    expect(verFoto).toHaveAttribute("aria-disabled", "true");
    expect(verFoto).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
  });

  it("muestra el mini mapa de la región como placeholder", () => {
    fijarFlags({ modoDev: true });
    renderTarjeta();

    expect(screen.getByText("MINI MAPA REGIÓN")).toBeInTheDocument();
    expect(screen.getByText("[ mapa OSM · zonas región ]")).toBeInTheDocument();
  });

  it("muestra un estado vacío cuando no hay pendientes", () => {
    render(<TarjetaPendientesAccion pendientes={[]} mapa={[]} />);

    expect(screen.getByText("No tenés pendientes por ahora.")).toBeInTheDocument();
  });
});
