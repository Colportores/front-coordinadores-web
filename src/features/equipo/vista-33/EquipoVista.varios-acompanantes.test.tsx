import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccionesEquipo } from "./acciones";
import { colportor, datosDePrueba } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";
import { jornadasAcompanadas } from "./modelo";

/**
 * Seguimiento #146 de #144: desde la 0177 (backend-supabase#254, «Dos acomp.») una jornada puede tener varios acompañantes y el
 * historial trae una fila por cada uno. La jornada se cuenta una sola vez; cada acompañante figura con su origen y su nota.
 */

const acciones: AccionesEquipo = {
  jornadasParaAcompanar: vi.fn(async () => ({ ok: true as const, jornadas: [] })),
  registrarAcompanamiento: vi.fn(),
  elegirCarrera: vi.fn(),
  asignarTipoDeBeca: vi.fn(),
};

const EMILIANO = colportor({
  id: "emiliano",
  nombre: "Emiliano Sosa",
  ciudadId: "riv",
  zonaActual: { id: "z-santa-isabel", nombre: "Santa Isabel", desde: "2026-10-06", desdeInicial: false },
  acompanamientos: [
    // La misma jornada, dos acompañantes: el teléfono marcó a Tomás y el coordinador sumó a Marta desde el panel.
    { jornadaId: "j-doble", dia: "2026-10-02", horas: 4.5, acompanante: "Tomás Ibarra", acompananteEsVos: false, origen: "COLPORTOR", nota: null },
    { jornadaId: "j-doble", dia: "2026-10-02", horas: 4.5, acompanante: "Marta Gómez", acompananteEsVos: false, origen: "COORDINADOR", cargadoPor: { esVos: true }, nota: "Vino de Salto." },
    { jornadaId: "j-sola", dia: "2026-09-08", horas: 5, acompanante: "Mariana Pérez", acompananteEsVos: true, origen: "COORDINADOR", cargadoPor: { esVos: true }, nota: null },
  ],
});

async function abrirAcompanamientos() {
  const datos = datosDePrueba({ colportores: [EMILIANO] });
  render(<EquipoVista datos={datos} acciones={acciones} />);
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
  await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
  return usuario;
}

afterEach(() => vi.restoreAllMocks());

describe("varios acompañantes en una misma jornada", () => {
  it("jornadasAcompanadas cuenta una vez cada jornada, no cada acompañante", () => {
    expect(EMILIANO.acompanamientos).toHaveLength(3);
    expect(jornadasAcompanadas(EMILIANO)).toBe(2);
    expect(jornadasAcompanadas(colportor({ id: "x", nombre: "Sin nada" }))).toBe(0);
  });

  it("el total del colportor y el de la campaña cuentan 2 jornadas acompañadas, no 3 filas", async () => {
    await abrirAcompanamientos();

    const fila = screen.getByRole("row", { name: /Emiliano Sosa/ });
    expect(within(fila).getAllByRole("cell").some((c) => c.textContent === "2")).toBe(true);
    expect(within(fila).getAllByRole("cell").some((c) => c.textContent === "3")).toBe(false);
    expect(screen.getByText(/2 acompañamientos en la campaña/)).toBeInTheDocument();
  });

  it("el historial muestra una fila por acompañante, cada una con su origen y su nota, sin claves repetidas", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const usuario = await abrirAcompanamientos();

    await usuario.click(screen.getByRole("button", { name: "Ver historial de Emiliano Sosa" }));

    const historial = screen.getByRole("region", { name: "Historial de acompañamientos de Emiliano Sosa" });
    const items = within(historial).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Tomás Ibarra");
    expect(items[0]).toHaveTextContent("lo marcó en el celular");
    expect(items[1]).toHaveTextContent("Marta Gómez");
    expect(items[1]).toHaveTextContent("Vino de Salto.");
    expect(items[2]).toHaveTextContent("Mariana Pérez (vos)");
    expect(error.mock.calls.filter(([mensaje]) => String(mensaje).includes("same key"))).toEqual([]);
  });
});
