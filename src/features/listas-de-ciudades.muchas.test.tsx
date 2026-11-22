import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ColumnaDeCiudades } from "@/features/cuentas/ColumnaDeCiudades";
import { ListaDeCiudades as ListaDeEquipo, RielDeCiudades as RielDeEquipo } from "@/features/equipo/vista-33/ListaDeCiudades";
import { ListaDeCiudades as ListaDeReportes, RielDeCiudades as RielDeReportes } from "@/features/reportes/horas/ListaDeCiudades";
import { ListaDeCiudades as ListaDeStock, RielDeCiudades as RielDeStock } from "@/features/stock/vista-34/ListaDeCiudades";

/**
 * Issue #192: las listas de ciudades de Equipo (33), Reportes (32), Stock (34) y Cuentas (36) con más de 25 ciudades.
 * No se paginan (son el filtro de la vista y tienen que verse todas): lo que se prueba es que están todas, que cada una
 * se puede elegir y que la elegida queda a la vista cuando está más abajo del borde de la columna, tanto en la lista
 * como en la barra contraída.
 */

const CIUDADES = 30;
const ELEGIDA = 27;
const nombre = (i: number) => `Ciudad ${String(i).padStart(2, "0")}`;
const indices = Array.from({ length: CIUDADES }, (_, i) => i);

let alVer: ReturnType<typeof vi.fn>;
const original = Element.prototype.scrollIntoView;

beforeEach(() => {
  alVer = vi.fn();
  Element.prototype.scrollIntoView = alVer as unknown as Element["scrollIntoView"];
});

afterEach(() => {
  Element.prototype.scrollIntoView = original;
});

const ambito = (i: number) => ({ tipo: "ciudad" as const, ciudadId: `c-${i}` });
const todas = { tipo: "todas" as const };

function grupos<N>(nodo: (i: number) => N) {
  return [0, 1, 2].map((d) => ({
    clave: `d-${d}`,
    departamento: `Depto ${d}`,
    titulo: `DEPTO. ${d}`,
    nodos: indices.filter((i) => i % 3 === d).map(nodo),
  }));
}

const equipo = (elegida: number | null) => ({
  todas: { clave: "todas", ambito: todas, nombre: "Todas las ciudades", cantidad: 90, sinZona: 0, seleccionado: elegida === null },
  grupos: grupos((i) => ({ clave: `c-${i}`, ambito: ambito(i), nombre: nombre(i), cantidad: 3, sinZona: 0, seleccionado: i === elegida })),
});

const reportes = (elegida: number | null) => ({
  todas: { clave: "todas", ambito: todas, nombre: "Todas las ciudades", detalle: "90 colportores", seleccionado: elegida === null, hijos: [] },
  grupos: grupos((i) => ({ clave: `c-${i}`, ambito: ambito(i), nombre: nombre(i), detalle: "3 colportores", seleccionado: i === elegida, hijos: [] })),
});

const stock = (elegida: number | null) => ({
  todas: { clave: "todas", ambito: todas, nombre: "Todas las ciudades", detalle: "", seleccionado: elegida === null },
  grupos: grupos((i) => ({ clave: `c-${i}`, ambito: ambito(i), nombre: nombre(i), detalle: "sin avisos", seleccionado: i === elegida })),
});

const riel = (elegida: number) =>
  indices.map((i) => ({ clave: `c-${i}`, ambito: ambito(i), nombre: nombre(i), abreviatura: `C${i}`, seleccionado: i === elegida }));

const vistas = [
  { vista: "Equipo (33)", Lista: ListaDeEquipo, Riel: RielDeEquipo, lista: equipo, nombreDelBoton: (i: number) => new RegExp(`^${nombre(i)}, `) },
  { vista: "Reportes (32)", Lista: ListaDeReportes, Riel: RielDeReportes, lista: reportes, nombreDelBoton: (i: number) => new RegExp(`^${nombre(i)}`) },
  { vista: "Stock (34)", Lista: ListaDeStock, Riel: RielDeStock, lista: stock, nombreDelBoton: (i: number) => new RegExp(`^${nombre(i)}`) },
] as const;

describe.each(vistas)("$vista · más de 25 ciudades", ({ Lista, Riel, lista, nombreDelBoton }) => {
  it("están las 30 en la lista y la última se puede elegir", async () => {
    const alElegir = vi.fn();
    render(<Lista lista={lista(null) as never} alElegir={alElegir} alContraer={() => {}} />);
    const columna = screen.getByRole("navigation", { name: "Ciudades" });
    // Las 30 ciudades más «Todas las ciudades» y el botón de contraer.
    expect(within(columna).getAllByRole("button")).toHaveLength(CIUDADES + 2);

    await userEvent.click(within(columna).getByRole("button", { name: nombreDelBoton(29) }));
    expect(alElegir).toHaveBeenCalledWith(ambito(29));
  });

  it("la elegida, más abajo del borde, queda a la vista", () => {
    render(<Lista lista={lista(ELEGIDA) as never} alElegir={() => {}} alContraer={() => {}} />);
    const elegida = within(screen.getByRole("navigation", { name: "Ciudades" })).getByRole("button", { name: nombreDelBoton(ELEGIDA) });
    expect(alVer).toHaveBeenCalledWith({ block: "nearest" });
    expect(alVer.mock.contexts.at(-1)).toBe(elegida);
  });

  it("al cambiar la elegida se vuelve a mostrar, y sin cambio no se mueve nada", () => {
    const { rerender } = render(<Lista lista={lista(2) as never} alElegir={() => {}} alContraer={() => {}} />);
    alVer.mockClear();
    rerender(<Lista lista={lista(2) as never} alElegir={() => {}} alContraer={() => {}} />);
    expect(alVer).not.toHaveBeenCalled();
    rerender(<Lista lista={lista(ELEGIDA) as never} alElegir={() => {}} alContraer={() => {}} />);
    expect(alVer).toHaveBeenCalledTimes(1);
  });

  it("la barra contraída trae las 30 y deja a la vista la elegida", () => {
    render(<Riel items={riel(ELEGIDA) as never} alElegir={() => {}} alExpandir={() => {}} />);
    const columna = screen.getByRole("navigation", { name: "Ciudades" });
    expect(within(columna).getAllByRole("button")).toHaveLength(CIUDADES + 1);
    expect(alVer.mock.contexts.at(-1)).toBe(within(columna).getByRole("button", { name: nombre(ELEGIDA) }));
  });
});

describe("Cuentas (36) · más de 25 ciudades", () => {
  const elementos = [
    { tipo: "ciudad" as const, clave: "todas", nombre: "Todas las ciudades", sigla: "Todas", pendientes: 0, porDecidir: 0, seleccion: { tipo: "todas" as const } },
    { tipo: "grupo" as const, clave: "grupo:Depto", etiqueta: "DEPTO. DEPTO" },
    ...indices.map((i) => ({
      tipo: "ciudad" as const,
      clave: `ciudad:c-${i}`,
      nombre: nombre(i),
      sigla: `C${i}`,
      pendientes: i % 4,
      porDecidir: 0,
      seleccion: { tipo: "ciudad" as const, ciudadId: `c-${i}` },
    })),
  ];
  const seleccionada = { tipo: "ciudad" as const, ciudadId: `c-${ELEGIDA}` };

  for (const contraida of [false, true]) {
    it(`${contraida ? "contraída" : "expandida"}: las 30 se ven y la elegida queda a la vista`, async () => {
      const alElegir = vi.fn();
      render(<ColumnaDeCiudades elementos={elementos} seleccionada={seleccionada} contraida={contraida} alElegir={alElegir} alAlternar={() => {}} />);
      const columna = document.getElementById("columna-ciudades")!;
      const ciudades = within(columna).getAllByRole("button", { name: /^Ciudad \d\d/ });
      expect(ciudades).toHaveLength(CIUDADES);
      const elegida = within(columna).getByRole("button", { pressed: true });
      expect(elegida).toHaveAccessibleName(new RegExp(`^${nombre(ELEGIDA)}`));
      expect(alVer.mock.contexts.at(-1)).toBe(elegida);

      await userEvent.click(ciudades[29]);
      expect(alElegir).toHaveBeenCalledWith({ tipo: "ciudad", ciudadId: "c-29" });
    });
  }

  it("al contraer o expandir la columna, la elegida se vuelve a mostrar", () => {
    const { rerender } = render(<ColumnaDeCiudades elementos={elementos} seleccionada={seleccionada} contraida={false} alElegir={() => {}} alAlternar={() => {}} />);
    alVer.mockClear();
    rerender(<ColumnaDeCiudades elementos={elementos} seleccionada={seleccionada} contraida alElegir={() => {}} alAlternar={() => {}} />);
    expect(alVer).toHaveBeenCalledTimes(1);
  });
});
