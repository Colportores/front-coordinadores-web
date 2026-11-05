import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import PestanaEquipo from "@/app/equipo/page";
import { fuenteEquipo } from "@/datos/equipo";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import type { AccionesEquipo } from "@/features/equipo/vista-33/acciones";

/** Baja por el árbol de la página hasta el componente de la vista y devuelve sus props. */
function accionesDe(jsx: ReactElement): AccionesEquipo {
  let actual: unknown = jsx;
  while (isValidElement(actual)) {
    const props = actual.props as { acciones?: AccionesEquipo; children?: unknown };
    if (props.acciones) return props.acciones;
    actual = props.children;
  }
  throw new Error("No se encontró la vista dentro de la página");
}

describe("PestanaEquipo", () => {
  it("arma la vista 33 con el título de la pestaña, la lista de ciudades y la tabla de zonas", async () => {
    const jsx = await PestanaEquipo();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Equipo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Zonas de cada colportor" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ Añadir colportor" })).toHaveAttribute("href", "/equipo/anadir");
    expect(screen.getByRole("link", { name: "Cambiar zona de Emiliano Sosa" })).toHaveAttribute("href", "/ciudades");
  });

  it("muestra los acompañamientos del diseño: Emiliano Sosa hace 19 días y Florencia Pintos nunca", async () => {
    render(<ProveedorModoDev activo={false}>{await PestanaEquipo()}</ProveedorModoDev>);
    await userEvent.click(screen.getByRole("button", { name: /^Rivera/ }));
    await userEvent.click(screen.getByRole("button", { name: "Acompañamientos" }));

    expect(within(screen.getByRole("row", { name: /^Emiliano Sosa/ })).getByText("hace 19 días")).toBeInTheDocument();
    const florencia = within(screen.getByRole("row", { name: /^Florencia Pintos/ }));
    expect(florencia.getByText("Nunca")).toBeInTheDocument();
    expect(florencia.getByText("50 días desde el inicio")).toBeInTheDocument();
  });

  it("registra un acompañamiento desde la página, con las server actions atadas a la campaña", async () => {
    const jsx = await PestanaEquipo();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);
    const usuario = userEvent.setup();
    const registrar = vi.spyOn(fuenteEquipo, "registrarAcompanamiento");

    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    const lista = await screen.findByRole("list", { name: "Jornadas terminadas de Florencia Pintos" });
    await usuario.click(within(lista).getAllByRole("button", { name: /^Registrar acompañamiento en la jornada/ })[0]);

    expect(await screen.findByText(/Acompañamiento registrado: jornada de Florencia Pintos/)).toBeInTheDocument();
    expect(registrar).toHaveBeenCalledWith("campania-primavera-2026", expect.stringContaining("jor-col-florencia-pintos-"), {});
  });

  it("las acciones del servidor llevan la campaña de la página, no la que mande el navegador", async () => {
    const acciones = accionesDe(await PestanaEquipo());
    const jornadas = vi.spyOn(fuenteEquipo, "jornadasParaAcompanar");

    await acciones.jornadasParaAcompanar("col-florencia-pintos");

    expect(jornadas).toHaveBeenCalledWith("campania-primavera-2026", "col-florencia-pintos");
  });

  it("sin una campaña (la fuente devuelve null) lo dice y no arma la lista ni las tablas", async () => {
    vi.spyOn(fuenteEquipo, "obtenerEquipoPorCiudad").mockResolvedValueOnce(null);

    render(<ProveedorModoDev activo={false}>{await PestanaEquipo()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Equipo" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No tenés una campaña en curso ni por empezar.");
    expect(screen.queryByRole("navigation", { name: "Ciudades" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("si la fuente falla, la página falla (la ruta lo muestra con error.tsx) y no se toma por un equipo vacío", async () => {
    vi.spyOn(fuenteEquipo, "obtenerEquipoPorCiudad").mockRejectedValueOnce(new Error("sin red"));

    await expect(PestanaEquipo()).rejects.toThrow("sin red");
  });
});
