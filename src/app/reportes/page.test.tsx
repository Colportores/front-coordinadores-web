import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ErrorReportes from "@/app/reportes/error";
import CargandoReportes from "@/app/reportes/loading";
import PestanaReportes from "@/app/reportes/page";
import { fuenteReportes } from "@/datos/reportes";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

describe("PestanaReportes (vista 32, HU-REP-001 y HU-REP-002)", () => {
  it("arma el reporte de horas con los datos simulados: todas las ciudades, por semanas", async () => {
    render(<ProveedorModoDev activo={false}>{await PestanaReportes()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { name: "Reportes", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Todas las ciudades", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("25 colportores · S7 contra S6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semanas", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "HORAS" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "PRESENTACIONES" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "VENTAS" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Ciudades" })).toBeInTheDocument();
    // el % por cobrar es V2: hasta que se conecte no se muestra
    expect(screen.queryByRole("region", { name: "% POR COBRAR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "% POR COBRAR" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "MONTO" })).toBeInTheDocument();
  });

  it("en modo dev marca la sección con la HU que implementa", async () => {
    render(<ProveedorModoDev activo>{await PestanaReportes()}</ProveedorModoDev>);
    expect(screen.getAllByText(/HU-REP-001/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/HU-REP-002/).length).toBe(2); // presentaciones y ventas
    const hu = (nombre: string) => screen.getByRole("region", { name: nombre }).closest("[data-hu]")?.getAttribute("data-hu");
    expect([hu("HORAS"), hu("PRESENTACIONES"), hu("VENTAS")]).toEqual(["HU-REP-001", "HU-REP-002", "HU-REP-002"]);
  });

  it("trae las acciones de exportar (HU-REP-005) listas para usar", async () => {
    render(<ProveedorModoDev activo={false}>{await PestanaReportes()}</ProveedorModoDev>);
    for (const nombre of ["Informe PDF", "Datos CSV"]) {
      expect(screen.getByRole("button", { name: nombre })).not.toHaveAttribute("aria-disabled");
    }
  });

  it("sin una campaña que consultar (la fuente devuelve null) lo dice, sin tabla ni selector", async () => {
    vi.spyOn(fuenteReportes, "obtenerHoras").mockResolvedValueOnce(null);
    render(<ProveedorModoDev activo={false}>{await PestanaReportes()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { name: "Reportes", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Todavía no tenés una campaña con horas para mostrar");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Semanas" })).not.toBeInTheDocument();
  });

  it("si la fuente falla, la página propaga el error para que lo atrape error.tsx", async () => {
    vi.spyOn(fuenteReportes, "obtenerHoras").mockRejectedValueOnce(new Error("sin conexión"));
    await expect(PestanaReportes()).rejects.toThrow("sin conexión");
  });
});

describe("estados de carga y error", () => {
  it("cargando: avisa qué se está cargando", () => {
    render(<CargandoReportes />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando las horas de la campaña…");
    expect(screen.getByRole("heading", { name: "Reportes", level: 1 })).toBeInTheDocument();
  });

  it("error: explica qué pasó y «Reintentar» vuelve a pedir los datos con retry, las veces que haga falta", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<ErrorReportes error={new Error("x")} retry={retry} />);

    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("No se pudieron cargar las horas de la campaña. Revisá tu conexión y probá de nuevo.");
    const boton = within(alerta).getByRole("button", { name: "Reintentar" });
    await user.click(boton);
    await user.click(boton);
    expect(retry).toHaveBeenCalledTimes(2);
  });
});
