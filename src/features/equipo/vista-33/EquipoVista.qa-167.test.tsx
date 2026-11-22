import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { AccionesEquipo } from "./acciones";
import { colportor, datosDePrueba } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";

/** QA del PR #171 (issue #167), vista 33: los «sin zona» una sola vez y las cuentas suspendidas. */

const acciones: AccionesEquipo = {
  jornadasParaAcompanar: async () => ({ ok: true, jornadas: [] }),
  registrarAcompanamiento: async () => ({ ok: false, mensaje: "no" }),
  elegirCarrera: async () => ({ ok: false, mensaje: "no" }),
  asignarTipoDeBeca: async () => ({ ok: false, mensaje: "no" }),
};

function mostrar(datos = datosDePrueba()) {
  render(<EquipoVista datos={datos} acciones={acciones} />);
  return userEvent.setup();
}

const SIN_ZONA = { ciudadId: null, zonaActual: null } as const;

describe("QA #167 · Equipo: los «sin zona» se cuentan una sola vez", () => {
  it("al elegir una ciudad, el renglón no suma los sin zona pero la tabla de la ciudad los sigue mostrando al final", async () => {
    const usuario = mostrar();
    const nav = screen.getByRole("navigation", { name: "Ciudades" });

    await usuario.click(
      within(nav).getByRole("button", { name: "Rivera, 2 colportores" }),
    );

    expect(
      within(nav).getByRole("button", { name: "Rivera, 2 colportores" }),
    ).toHaveAttribute("aria-current", "true");
    // Solo el renglón de «Todas las ciudades» menciona a los sin zona.
    expect(within(nav).getAllByText(/sin zona/)).toHaveLength(1);
    const tabla = screen.getByRole("table");
    expect(
      within(tabla).getByRole("rowheader", { name: /Rocío Benítez/ }),
    ).toBeInTheDocument();
  });

  it("con varios sin zona, «Todas las ciudades» dice «N + M sin zona» y ninguna ciudad ni departamento lo repite", () => {
    const base = datosDePrueba();
    mostrar(
      datosDePrueba({
        colportores: [
          ...base.colportores,
          colportor({ id: "u1", nombre: "Uno Sosa", ...SIN_ZONA }),
          colportor({ id: "u2", nombre: "Dos Sosa", ...SIN_ZONA }),
        ],
      }),
    );
    const nav = screen.getByRole("navigation", { name: "Ciudades" });

    expect(
      within(nav).getByRole("button", {
        name: "Todas las ciudades, 4 colportores y 3 sin zona",
      }),
    ).toHaveTextContent("4 + 3 sin zona");
    expect(within(nav).getAllByText(/sin zona/)).toHaveLength(1);
    expect(screen.getByText("4 colportores + 3 sin zona")).toBeInTheDocument();
  });

  it("sin nadie sin zona no aparece «+ 0 sin zona» en ningún lado", () => {
    mostrar(
      datosDePrueba({
        colportores: datosDePrueba().colportores.filter(
          (c) => c.zonaActual !== null,
        ),
      }),
    );

    expect(screen.queryByText(/sin zona/i)).not.toBeInTheDocument();
  });
});

describe("QA #167 · Equipo: cuentas suspendidas sin zona", () => {
  it("la franja cuenta solo a las activas: 2 activas y 1 suspendida dicen «2 colportores…»", async () => {
    const usuario = mostrar(
      datosDePrueba({
        solicitudesPendientes: 0,
        colportores: [
          colportor({ id: "a", nombre: "Ana Sosa", ...SIN_ZONA }),
          colportor({ id: "b", nombre: "Beto Pérez", ...SIN_ZONA }),
          colportor({
            id: "s",
            nombre: "Sergio Píriz",
            ...SIN_ZONA,
            suspendido: true,
          }),
        ],
      }),
    );
    await usuario.click(
      screen.getByRole("button", { name: "Acompañamientos" }),
    );

    expect(
      within(
        screen.getByRole("list", { name: "Pendientes de acción" }),
      ).getByText("2 colportores no tienen zona asignada"),
    ).toBeInTheDocument();
  });

  it("solo suspendidos sin zona y una solicitud pendiente: la franja trae únicamente la solicitud", async () => {
    const usuario = mostrar(
      datosDePrueba({
        solicitudesPendientes: 1,
        colportores: [
          colportor({
            id: "s",
            nombre: "Sergio Píriz",
            ...SIN_ZONA,
            suspendido: true,
          }),
        ],
      }),
    );
    await usuario.click(
      screen.getByRole("button", { name: "Acompañamientos" }),
    );

    const franja = screen.getByRole("list", { name: "Pendientes de acción" });
    expect(within(franja).getAllByRole("listitem")).toHaveLength(1);
    expect(
      within(franja).getByText("1 persona pidió entrar a la campaña"),
    ).toBeInTheDocument();
  });

  it.skip("QA #167: la fila de una cuenta suspendida sin zona no ofrece «Asignar zona» (asignar_zona la rechaza; la franja ya no la cuenta)", () => {
    mostrar(
      datosDePrueba({
        colportores: [
          colportor({
            id: "s",
            nombre: "Sergio Píriz",
            ...SIN_ZONA,
            suspendido: true,
          }),
        ],
      }),
    );

    expect(
      screen.queryByRole("link", { name: "Asignar zona a Sergio Píriz" }),
    ).not.toBeInTheDocument();
  });
});
