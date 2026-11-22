import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TableroDelDia } from "@/datos/inicio";
import { crearFuenteInicioSimulada } from "@/datos/inicio/simulado";
import { olvidarAjustes } from "@/features/inicio/ajustes";
import { InicioVista } from "@/features/inicio/InicioVista";
import { fijarFlags } from "@/test/flags";

/** Issue #187: «Asignar zona» en Inicio lleva a Ciudades con el colportor ya elegido. */

const fuente = crearFuenteInicioSimulada(() => new Date("2026-10-21T13:40:00.000Z"));

async function montar(tablero: TableroDelDia) {
  fijarFlags({ modoDev: true });
  olvidarAjustes();
  window.localStorage.setItem("inicio-ajustes", JSON.stringify({ seleccion: "todas" }));
  render(<InicioVista tablero={tablero} acciones={{ obtenerDia: vi.fn(async () => ({ ok: true as const, tablero })) }} />);
  return within(screen.getByRole("region", { name: "Pendientes de acción" }));
}

describe("Inicio · «Asignar zona» con el colportor elegido (#187)", () => {
  it("una sola persona sin zona: el botón de la tarjeta lleva a Ciudades con su id", async () => {
    const tablero = await fuente.obtenerTablero();
    const pendientes = await montar(tablero);

    expect(pendientes.getByRole("link", { name: "Asignar zona" })).toHaveAttribute("href", `/ciudades?colportor=${tablero.sinZona[0]!.id}`);
  });

  it("varias personas sin zona: cada una con su «Asignar zona» y sin botón general que no sabría a quién asignar", async () => {
    const base = await fuente.obtenerTablero();
    const otra = { ...base.sinZona[0]!, id: "usuario/con espacio&raro", nombre: "Tomás Ibarra" };
    const pendientes = await montar({ ...base, sinZona: [base.sinZona[0]!, otra] });

    const tarjeta = pendientes.getByRole("heading", { name: "2 colportores sin zona asignada" }).closest("article")!;
    const enlaces = within(tarjeta).getAllByRole("link");
    expect(enlaces.map((e) => e.getAttribute("aria-label"))).toEqual(["Asignar zona a Rocío Benítez", "Asignar zona a Tomás Ibarra"]);
    expect(enlaces[0]).toHaveAttribute("href", `/ciudades?colportor=${base.sinZona[0]!.id}`);
    // El id se escapa: no rompe la dirección ni agrega otros parámetros.
    expect(enlaces[1]).toHaveAttribute("href", "/ciudades?colportor=usuario%2Fcon%20espacio%26raro");
    expect(within(tarjeta).queryByRole("link", { name: "Asignar zona" })).not.toBeInTheDocument();
    // Lo visible de cada enlace está contenido en su nombre accesible (WCAG 2.5.3).
    for (const e of enlaces) expect(e).toHaveTextContent("Asignar zona");
  });
});
