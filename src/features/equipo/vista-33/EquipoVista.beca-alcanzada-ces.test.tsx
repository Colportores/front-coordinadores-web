import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BecaDeColportor, DatosEquipoPorCiudad } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { colportor, datosDePrueba } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";
import { olvidarUnidadDeAvance } from "./unidad-de-avance";

vi.setConfig({ testTimeout: 30_000 });

/**
 * «Beca alcanz.» (Cristian, 28/10, #122): el Estado de la beca sale de la compra a la CES de bonificables. Los libros son
 * otra forma de ver el avance: en esa medida no se dice «meta alcanzada» si los libros no llegaron.
 */

const sistemas = { id: "sis", nombre: "Ingeniería en Sistemas", elegidaEl: "2026-09-01" };
const META_MEDIA = { libros: 120, monto: 180000 };

/** Juan: 100 de 120 libros, pero $U 185.000 de compra a la CES de una meta de $U 180.000. */
const JUAN: BecaDeColportor = { carrera: sistemas, apuntaA: "media", meta: META_MEDIA, avance: { libros: 100, monto: 185000 } };
/** Sofía: 130 de 120 libros, pero solo $U 150.000 de compra a la CES. */
const SOFIA: BecaDeColportor = { carrera: sistemas, apuntaA: "media", meta: META_MEDIA, avance: { libros: 130, monto: 150000 } };

function datos(): DatosEquipoPorCiudad {
  const d = datosDePrueba();
  d.colportores.push(colportor({ id: "juan", nombre: "Juan Techera" }), colportor({ id: "sofia", nombre: "Sofía Ramos" }));
  d.becas!.porColportor.juan = JUAN;
  d.becas!.porColportor.sofia = SOFIA;
  return d;
}

const acciones = {
  jornadasParaAcompanar: vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async () => ({ ok: true, jornadas: [] })),
  registrarAcompanamiento: vi.fn<AccionesEquipo["registrarAcompanamiento"]>(),
  elegirCarrera: vi.fn<AccionesEquipo["elegirCarrera"]>(),
  asignarTipoDeBeca: vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(),
} satisfies AccionesEquipo;

const fila = (nombre: RegExp) => screen.getByRole("row", { name: nombre });

async function abrirBecas() {
  const usuario = userEvent.setup();
  render(<EquipoVista datos={datos()} acciones={acciones} />);
  await usuario.click(screen.getByRole("button", { name: "Becas" }));
  return usuario;
}

beforeEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
});

afterEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
});

describe("el Estado de la beca sale de la compra a la CES", () => {
  it("Juan, con 100 de 120 libros y la compra a la CES por encima de la meta, figura «Media alcanzada»", async () => {
    await abrirBecas();

    expect(within(fila(/^Juan Techera/)).getByText("Media alcanzada")).toBeInTheDocument();
  });

  it("en «Libros bonificables», si los libros no llegaron el texto dice cuántos faltan y no «meta alcanzada»", async () => {
    await abrirBecas();

    const juan = within(fila(/^Juan Techera/));
    expect(juan.getByText(/100 de 120 libros · le faltan 20 · 83 %/)).toBeInTheDocument();
    expect(juan.queryByText(/meta alcanzada/)).not.toBeInTheDocument();
  });

  it("en «Compra a la CES» el texto de Juan coincide con su Estado: «meta alcanzada»", async () => {
    const usuario = await abrirBecas();
    await usuario.click(within(screen.getByRole("group", { name: "Ver avance en" })).getByRole("button", { name: "Compra a la CES" }));

    const juan = within(fila(/^Juan Techera/));
    expect(juan.getByText(/\$U 185\.000 de \$U 180\.000 · meta alcanzada · 103 %/)).toBeInTheDocument();
    expect(juan.getByText("Media alcanzada")).toBeInTheDocument();
  });

  it("los libros solos no alcanzan la beca: Sofía, con 130 de 120 libros y poca compra, sigue «En progreso»", async () => {
    const usuario = await abrirBecas();
    expect(within(fila(/^Sofía Ramos/)).getByText("En progreso")).toBeInTheDocument();

    await usuario.click(within(screen.getByRole("group", { name: "Ver avance en" })).getByRole("button", { name: "Compra a la CES" }));
    const sofia = within(fila(/^Sofía Ramos/));
    expect(sofia.getByText(/\$U 150\.000 de \$U 180\.000 · le faltan \$U 30\.000 · 83 %/)).toBeInTheDocument();
    expect(sofia.queryByText(/meta alcanzada/)).not.toBeInTheDocument();
  });
});
