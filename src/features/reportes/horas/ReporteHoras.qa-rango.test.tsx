import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatosHoras } from "@/datos/reportes/contrato";

import { descargarArchivo, imprimirDocumento, retirarDocumentoDeImpresion } from "../exportar/descargar";
import { colportor, conAcompanamientos, datosDePruebaConVentas, horasConstantes } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";

// QA de #107 (vista 32, rango libre y colportores a elegir): casos límite que el PR no prueba.
vi.mock("../exportar/descargar", () => ({
  descargarArchivo: vi.fn(),
  imprimirDocumento: vi.fn(),
  retirarDocumentoDeImpresion: vi.fn(),
}));

const bajar = vi.mocked(descargarArchivo);

beforeEach(() => {
  bajar.mockReset();
  vi.mocked(imprimirDocumento).mockReset().mockResolvedValue(undefined);
  vi.mocked(retirarDocumentoDeImpresion).mockReset();
});

const datos = () => conAcompanamientos(datosDePruebaConVentas());
const desde = () => screen.getByLabelText("DESDE") as HTMLInputElement;
const hasta = () => screen.getByLabelText("HASTA") as HTMLInputElement;
const tarjeta = (nombre: string) => screen.getByRole("region", { name: nombre });
const botonDeColportores = () => screen.getByRole("button", { name: /^Colportores:/ });
const escribir = (campo: HTMLInputElement, valor: string) => fireEvent.change(campo, { target: { value: valor } });

async function abrirRango(d: DatosHoras = datos()) {
  const user = userEvent.setup();
  const vista = render(<ReporteHoras datos={d} />);
  await user.click(screen.getByRole("button", { name: "Rango" }));
  return { user, vista };
}

/** Elige solo a Ana desde las casillas (desmarca a los demás) y cierra el panel. */
async function soloAna(user: ReturnType<typeof userEvent.setup>) {
  await user.click(botonDeColportores());
  for (const nombre of ["Beto Techera", "Carla Rey", "Darío Viera"]) await user.click(screen.getByRole("checkbox", { name: nombre }));
  await user.keyboard("{Escape}");
}

describe("QA #107 · un colportor elegido con un rango sin días de trabajo", () => {
  it.skip("QA #107: un domingo con un solo colportor elegido: la tabla y exportar dicen «no hay colportores» (tendrían que decir que el rango no tiene días de trabajo)", async () => {
    const { user } = await abrirRango();
    await soloAna(user);
    escribir(desde(), "2026-10-18"); // domingo
    escribir(hasta(), "2026-10-18");

    expect(within(tarjeta("HORAS")).getByText("Sin datos en estos días")).toBeInTheDocument();
    // El colportor está elegido y existe: decir que no hay colportores es falso y no dice qué hacer.
    expect(screen.queryByText("Todavía no hay colportores para mostrar acá.")).not.toBeInTheDocument();
    expect(screen.queryByText("No hay colportores para exportar en este reporte.")).not.toBeInTheDocument();
  });

  it("un rango de un solo día de trabajo con un colportor elegido da una fila y exporta", async () => {
    const { user } = await abrirRango();
    await soloAna(user);
    escribir(desde(), "2026-10-13");
    escribir(hasta(), "2026-10-13");

    const filas = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toHaveTextContent("mar 13/10");
    expect(within(tarjeta("JORNADAS CON ACOMPAÑAMIENTO")).getByText("1")).toBeInTheDocument();
    expect(within(tarjeta("PROMEDIO POR DÍA")).getByText("1 día trabajado")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Datos CSV" }));
    expect(bajar).toHaveBeenCalledTimes(1);
  });

  it("hoy (en curso) como único día del rango con un colportor: la fila dice «en curso»", async () => {
    const { user } = await abrirRango();
    await soloAna(user);
    escribir(desde(), "2026-10-21");
    escribir(hasta(), "2026-10-21");

    expect(within(screen.getByRole("table")).getAllByRole("row")[1]).toHaveTextContent("en curso");
  });
});

describe("QA #107 · coherencia de cifras y exportación con colportores elegidos", () => {
  it("la tarjeta de horas es la suma de la columna Horas de la tabla (rango de dos semanas, tres elegidos)", async () => {
    const { user } = await abrirRango();
    await user.click(botonDeColportores());
    await user.click(screen.getByRole("checkbox", { name: "Darío Viera" }));
    await user.keyboard("{Escape}");
    escribir(desde(), "2026-10-05");
    escribir(hasta(), "2026-10-17");

    const encabezados = within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent);
    const col = encabezados.findIndex((t) => t?.startsWith("HORAS"));
    const suma = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .filter((r) => !/colportor/.test(r.textContent ?? "") || r.querySelectorAll("td").length > 1)
      .map((r) => Number((r.querySelectorAll("td, th")[col]?.textContent ?? "").replace(/[^\d,]/g, "").replace(",", ".")))
      .filter((n) => !Number.isNaN(n))
      .reduce((a, b) => a + b, 0);
    const total = Number(within(tarjeta("HORAS")).getAllByText(/^\d+$/)[0].textContent);
    expect(suma).toBe(total);
  });

  it.skip("QA #107: el informe PDF de una selección de colportores dice «Ver: Todas las ciudades» sin decir que es una selección (el CSV sí trae solo a los elegidos)", async () => {
    const { user } = await abrirRango();
    await user.click(botonDeColportores());
    await user.click(screen.getByRole("checkbox", { name: "Carla Rey" }));
    await user.click(screen.getByRole("checkbox", { name: "Darío Viera" }));
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Datos CSV" }));
    const contenido = bajar.mock.calls[0][1] as string;
    expect(contenido).toContain("Ana Silva");
    expect(contenido).toContain("Beto Techera");
    expect(contenido).not.toContain("Carla Rey");
    expect(contenido).not.toContain("Darío Viera");

    await waitFor(() => expect(screen.getByRole("button", { name: "Informe PDF" })).not.toHaveAttribute("aria-disabled", "true"), { timeout: 3000 });
    await user.click(screen.getByRole("button", { name: "Informe PDF" }));
    const html = vi.mocked(imprimirDocumento).mock.calls[0][0];
    // El informe se usa para liquidar viáticos: tiene que decir que no es toda la ciudad.
    expect(html).toMatch(/2 de 4 colportores|colportores elegidos|selección/i);
  });

  it("volver a Meses con un rango al revés no deja ningún aviso ni exportar apagado", async () => {
    const { user } = await abrirRango();
    escribir(desde(), "2026-10-17");
    escribir(hasta(), "2026-10-12");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Meses" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Datos CSV" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("QA #107 · exportar una selección", () => {
  it("el CSV con colportores elegidos trae solo a los elegidos", async () => {
    const { user } = await abrirRango();
    await user.click(botonDeColportores());
    await user.click(screen.getByRole("checkbox", { name: "Carla Rey" }));
    await user.click(screen.getByRole("checkbox", { name: "Darío Viera" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Datos CSV" }));
    const contenido = bajar.mock.calls[0][1] as string;
    expect(contenido).toContain("Ana Silva");
    expect(contenido).toContain("Beto Techera");
    expect(contenido).not.toContain("Carla Rey");
    expect(contenido).not.toContain("Darío Viera");
  });
});

describe("QA #107 · límites del rango y fechas raras", () => {
  it("los extremos de la campaña valen; un día antes o después no", async () => {
    await abrirRango();
    escribir(desde(), "2026-10-05");
    escribir(hasta(), "2026-10-21");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    escribir(desde(), "2026-10-04");
    expect(screen.getByRole("alert")).toHaveTextContent("dentro de la campaña");
    escribir(desde(), "2026-10-05");
    escribir(hasta(), "2026-10-22");
    expect(screen.getByRole("alert")).toHaveTextContent("dentro de la campaña");
  });

  it("años extremos (0001 y 9999) se rechazan con el aviso, sin cifras", async () => {
    await abrirRango();
    escribir(desde(), "0001-01-01");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    escribir(desde(), "2026-10-05");
    escribir(hasta(), "9999-12-31");
    expect(screen.getByRole("alert")).toHaveTextContent("dentro de la campaña");
  });

  it("una campaña terminada limita el rango a su último día", async () => {
    const terminada: DatosHoras = { ...datos(), finCampania: "2026-10-17" };
    await abrirRango(terminada);
    expect(hasta().value).toBe("2026-10-17");
    expect(hasta()).toHaveAttribute("max", "2026-10-17");
    escribir(hasta(), "2026-10-20");
    expect(screen.getByRole("alert")).toHaveTextContent("del 05/10/2026 al 17/10/2026");
  });
});

describe("QA #107 · selector de colportores: entradas raras y reentrada", () => {
  it("un texto pegado larguísimo con emoji en el buscador no rompe ni se repite en el aviso", async () => {
    const { user } = await abrirRango();
    await user.click(botonDeColportores());
    const buscador = screen.getByRole("searchbox");
    const largo = `${"Ñandú😀".repeat(800)}`;
    await user.click(buscador);
    await user.paste(largo);

    expect(screen.getByText("Ningún colportor se llama así. Probá con otra parte del nombre.")).toBeInTheDocument();
    expect(screen.queryByText(largo)).not.toBeInTheDocument();
    // «Todos» sigue a mano y los espacios solos no filtran
    await user.clear(buscador);
    await user.type(buscador, "   ");
    expect(within(screen.getByRole("group", { name: "Elegir colportores" })).getAllByRole("checkbox")).toHaveLength(4);
  });

  it("caracteres de expresión regular en el buscador se buscan tal cual", async () => {
    const { user } = await abrirRango();
    await user.click(botonDeColportores());
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "(.*)[" } });
    expect(screen.getByText("Ningún colportor se llama así. Probá con otra parte del nombre.")).toBeInTheDocument();
  });

  it("cerrar y volver a abrir el panel arranca sin búsqueda ni aviso viejo, con la elección conservada", async () => {
    const { user } = await abrirRango();
    await user.click(botonDeColportores());
    await user.type(screen.getByRole("searchbox"), "zzz");
    await user.click(screen.getByRole("button", { name: "Todos" }));
    await user.keyboard("{Escape}");
    await user.click(botonDeColportores());
    expect(screen.getByRole("searchbox")).toHaveValue("");

    await user.click(screen.getByRole("checkbox", { name: "Ana Silva" }));
    await user.keyboard("{Escape}");
    expect(botonDeColportores()).toHaveTextContent("3 de 4");
    await user.click(botonDeColportores());
    expect(screen.getByRole("checkbox", { name: "Ana Silva" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Beto Techera" })).toBeChecked();
  });

  it("la última casilla no se desmarca aunque se toque dos veces seguidas, y el aviso es un anuncio", async () => {
    const { user } = await abrirRango();
    await soloAna(user);
    await user.click(botonDeColportores());
    const ana = screen.getByRole("checkbox", { name: "Ana Silva" });
    await user.dblClick(ana);
    expect(ana).toBeChecked();
    expect(screen.getByText(/Tiene que quedar al menos un colportor/)).toHaveAttribute("aria-live", "polite");
  });

  it("si los datos se recargan y los elegidos ya no están, vuelve a «Todos» sin reporte vacío", async () => {
    const { user, vista } = await abrirRango();
    await user.click(botonDeColportores());
    await user.click(screen.getByRole("checkbox", { name: "Ana Silva" }));
    await user.keyboard("{Escape}");

    const otro = datos();
    const sinRivera: DatosHoras = { ...otro, ciudades: [otro.ciudades[1], otro.ciudades[2]] };
    vista.rerender(<ReporteHoras datos={sinRivera} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByRole("row").length).toBeGreaterThan(2);
  });
});

describe("QA #107 · accesibilidad del rango", () => {
  it("axe sin violaciones con un solo colportor elegido, en una fila por día y con un rango de un día", async () => {
    const { user } = await abrirRango();
    await soloAna(user);
    escribir(desde(), "2026-10-13");
    escribir(hasta(), "2026-10-13");
    const resultado = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(resultado.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  });

  it("los campos de fecha tienen nombre y el aviso de rango es un alert que los describe", async () => {
    await abrirRango();
    escribir(hasta(), "2026-10-10");
    escribir(desde(), "2026-10-20");
    expect(desde()).toHaveAccessibleName("DESDE");
    expect(hasta()).toHaveAccessibleName("HASTA");
    expect(desde()).toHaveAccessibleDescription(/posterior a «hasta»/);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("300 colportores con nombres largos: el reporte del rango sigue armando la tabla", async () => {
    const base = datos();
    const muchos = Array.from({ length: 300 }, (_, i) =>
      colportor(`m${i}`, `${"Nombre larguísimo sin espacios".replace(/ /g, "")}${i}`, horasConstantes("2026-10-05", "2026-10-21", 5)),
    );
    const grande: DatosHoras = { ...base, ciudades: [{ ...base.ciudades[0], colportores: muchos }, base.ciudades[1]] };
    await abrirRango(grande);
    expect(within(screen.getByRole("table")).getAllByRole("row").length).toBeGreaterThan(300);
  });
});
