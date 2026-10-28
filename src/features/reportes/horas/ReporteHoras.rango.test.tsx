import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ColportorHoras, DatosHoras } from "@/datos/reportes/contrato";

import { descargarArchivo, imprimirDocumento, retirarDocumentoDeImpresion } from "../exportar/descargar";
import { colportor, conAcompanamientos, datosDePruebaConVentas, horasConstantes } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";
import { TEXTO_SIN_COINCIDENCIAS, TEXTO_UNO_AL_MENOS } from "./SelectorDeColportores";

// El navegador (bajar un archivo, abrir la impresión) se reemplaza; lo que se arma para eso se prueba entero.
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

// Campaña del lunes 05/10 a hoy, miércoles 21/10. Del 12 al 17/10: 122 h en 22 días (5,5 por día), 4 acompañadas.
const datos = () => conAcompanamientos(datosDePruebaConVentas());
const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const desde = () => screen.getByLabelText("DESDE") as HTMLInputElement;
const hasta = () => screen.getByLabelText("HASTA") as HTMLInputElement;
const tarjeta = (nombre: string) => screen.getByRole("region", { name: nombre });
const botonDeColportores = () => screen.getByRole("button", { name: /^Colportores:/ });
const escribir = (campo: HTMLInputElement, valor: string) => fireEvent.change(campo, { target: { value: valor } });

async function abrirRango(d: DatosHoras = datos()) {
  const user = userEvent.setup();
  render(<ReporteHoras datos={d} />);
  await user.click(screen.getByRole("button", { name: "Rango" }));
  return user;
}

function elegirS2() {
  escribir(desde(), "2026-10-12");
  escribir(hasta(), "2026-10-17");
}

describe("ReporteHoras · rango de fechas libre", () => {
  it("«Rango» se suma a Días, Semanas y Meses y arranca con el mes en curso hasta hoy", async () => {
    await abrirRango();

    expect(screen.getByRole("button", { name: "Rango", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semanas", pressed: false })).toBeInTheDocument();
    expect(desde().value).toBe("2026-10-05"); // el mes empieza antes de la campaña: arranca el primer día de la campaña
    expect(hasta().value).toBe("2026-10-21");
    expect(desde()).toHaveAttribute("min", "2026-10-05");
    expect(hasta()).toHaveAttribute("max", "2026-10-21");
    expect(screen.getByText("4 colportores · Del 05/10/2026 al 21/10/2026")).toBeInTheDocument();
  });

  it("muestra total de horas, promedio por día trabajado y jornadas con acompañamiento del rango elegido", async () => {
    await abrirRango();
    elegirS2();

    expect(within(tarjeta("HORAS")).getByText("122")).toBeInTheDocument();
    expect(within(tarjeta("HORAS")).getByText("Del 12/10/2026 al 17/10/2026")).toBeInTheDocument();
    expect(within(tarjeta("PROMEDIO POR DÍA")).getByText("5,5")).toBeInTheDocument();
    expect(within(tarjeta("PROMEDIO POR DÍA")).getByText("22 días trabajados (sumando colportores)")).toBeInTheDocument();
    expect(within(tarjeta("JORNADAS CON ACOMPAÑAMIENTO")).getByText("4")).toBeInTheDocument();
    expect(within(tarjeta("VENTAS")).getByText("40")).toBeInTheDocument();
    // sin gráfico de barras ni tendencia: no hay período anterior
    expect(within(tarjeta("HORAS")).queryByRole("img")).not.toBeInTheDocument();
  });

  it("la tabla trae las columnas nuevas y una fila por colportor", async () => {
    await abrirRango();
    elegirS2();

    const tabla = screen.getByRole("table");
    for (const nombre of ["HORAS", "DÍAS TRABAJADOS", "PROMEDIO POR DÍA", "CON ACOMPAÑAMIENTO"]) {
      expect(within(tabla).getByRole("columnheader", { name: nombre })).toBeInTheDocument();
    }
    const ana = within(tabla).getByRole("row", { name: /Ana Silva/ });
    expect(within(ana).getAllByRole("cell").map((c) => c.textContent)).toEqual(["36,0", "6", "6,0", "2", "30", "12", "$U 9.000"]);
  });

  it("cambiar el rango recalcula todo; Beto, que dejó de sincronizar, sale con guion y desde cuándo", async () => {
    await abrirRango();
    escribir(desde(), "2026-10-16");
    escribir(hasta(), "2026-10-21");

    const beto = within(screen.getByRole("table")).getByRole("row", { name: /Beto Techera/ });
    expect(beto).toHaveTextContent("sin datos desde el 15/10");
    expect(within(beto).getAllByRole("cell")[0]).toHaveTextContent("—");
  });

  it("un rango sin datos (un domingo) dice que no hay datos y no inventa ceros", async () => {
    await abrirRango();
    escribir(desde(), "2026-10-18");
    escribir(hasta(), "2026-10-18");

    expect(within(tarjeta("HORAS")).getByText("—")).toBeInTheDocument();
    expect(within(tarjeta("HORAS")).getByText("Sin datos en estos días")).toBeInTheDocument();
  });

  it("«desde» después de «hasta»: avisa qué pasó y qué hacer, sin cifras, y se recupera al corregirlo", async () => {
    await abrirRango();
    escribir(desde(), "2026-10-17");
    escribir(hasta(), "2026-10-12");

    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("La fecha «desde» (17/10/2026) es posterior a «hasta» (12/10/2026). Cambiá una de las dos para ver el reporte.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "HORAS" })).not.toBeInTheDocument();
    expect(desde()).toHaveAttribute("aria-invalid", "true");
    expect(desde()).toHaveAccessibleDescription(/es posterior a «hasta»/);
    expect(hasta()).toHaveAttribute("aria-invalid", "true");
    // exportar queda apagado y dice por qué
    expect(screen.getByRole("button", { name: "Datos CSV" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Corregí las fechas del rango para poder exportar.")).toBeInTheDocument();

    escribir(desde(), "2026-10-12");
    escribir(hasta(), "2026-10-17");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(tarjeta("HORAS")).getByText("122")).toBeInTheDocument();
    expect(desde()).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: "Datos CSV" })).not.toHaveAttribute("aria-disabled");
  });

  it("una fecha borrada pide completar las dos", async () => {
    await abrirRango();
    escribir(hasta(), "");

    expect(screen.getByRole("alert")).toHaveTextContent("Elegí desde qué día y hasta qué día querés ver el reporte.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("fechas fuera de la campaña: dice entre qué fechas se puede", async () => {
    await abrirRango();
    escribir(desde(), "2026-09-01");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "El rango tiene que estar dentro de la campaña, del 05/10/2026 al 21/10/2026. Corregí las fechas para ver el reporte.",
    );
    escribir(desde(), "2026-10-05");
    escribir(hasta(), "2026-10-30");
    expect(screen.getByRole("alert")).toHaveTextContent("del 05/10/2026 al 21/10/2026");
  });

  it("volver a Semanas y reentrar a Rango conserva las fechas que se habían puesto", async () => {
    const user = await abrirRango();
    elegirS2();

    await user.click(screen.getByRole("button", { name: "Semanas" }));
    expect(screen.queryByLabelText("DESDE")).not.toBeInTheDocument();
    expect(screen.getByText("4 colportores · S2 contra S1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rango" }));
    expect(desde().value).toBe("2026-10-12");
    expect(hasta().value).toBe("2026-10-17");
  });

  it("un colportor elegido de la lista se ve por día en el rango y se vuelve a su ciudad", async () => {
    const user = await abrirRango();
    elegirS2();

    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));

    expect(screen.getByRole("heading", { level: 2, name: "Ana Silva" })).toBeInTheDocument();
    const filas = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(filas).toHaveLength(6);
    expect(filas[1]).toHaveTextContent("mar 13/10");
    await user.click(screen.getByRole("button", { name: "‹ Rivera" }));
    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
    expect(desde().value).toBe("2026-10-12");
  });

  it("no tiene violaciones de accesibilidad con el rango, con un aviso ni con el selector de colportores abierto", async () => {
    const user = await abrirRango();
    const reglas = { runOnly: { type: "tag" as const, values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } };
    const violaciones = async () => (await axe.run(document.body, reglas)).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

    expect(await violaciones()).toEqual([]);
    await user.click(botonDeColportores());
    expect(await violaciones()).toEqual([]);
    await user.keyboard("{Escape}");
    escribir(desde(), "2026-10-20");
    escribir(hasta(), "2026-10-10");
    expect(await violaciones()).toEqual([]);
  });
});

describe("ReporteHoras · elegir colportores", () => {
  it("arranca con todos y deja elegir uno o varios; las cifras salen solo de los elegidos", async () => {
    const user = await abrirRango();
    elegirS2();
    expect(botonDeColportores()).toHaveTextContent("Colportores: Todos (4)");
    expect(botonDeColportores()).toHaveAttribute("aria-expanded", "false");

    await user.click(botonDeColportores());
    expect(botonDeColportores()).toHaveAttribute("aria-expanded", "true");
    const grupo = screen.getByRole("group", { name: "Elegir colportores" });
    expect(within(grupo).getAllByRole("checkbox")).toHaveLength(4);
    for (const casilla of within(grupo).getAllByRole("checkbox")) expect(casilla).toBeChecked();
    expect(screen.getByText("4 de 4 elegidos")).toBeInTheDocument();

    await user.click(within(grupo).getByRole("checkbox", { name: "Beto Techera" }));
    await user.click(within(grupo).getByRole("checkbox", { name: "Darío Viera" }));

    expect(botonDeColportores()).toHaveTextContent("Colportores: 2 de 4");
    expect(screen.getByText("2 de 4 elegidos")).toBeInTheDocument();
    expect(within(tarjeta("HORAS")).getByText("66")).toBeInTheDocument(); // Ana 36 + Carla 30
    expect(within(tarjeta("JORNADAS CON ACOMPAÑAMIENTO")).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("2 colportores · Del 12/10/2026 al 17/10/2026")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("Beto Techera")).not.toBeInTheDocument();
  });

  it("también filtra en Días, Semanas y Meses", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datos()} />);
    await user.click(botonDeColportores());
    await user.click(screen.getByRole("checkbox", { name: "Ana Silva" }));
    await user.click(screen.getByRole("checkbox", { name: "Beto Techera" }));

    // S2: Carla 30 + Darío 24
    expect(within(tarjeta("HORAS")).getByText("54")).toBeInTheDocument();
    expect(screen.getByText("2 colportores · S2 contra S1")).toBeInTheDocument();
  });

  it("«Todos» vuelve a ver a todos", async () => {
    const user = await abrirRango();
    await user.click(botonDeColportores());
    await user.click(screen.getByRole("checkbox", { name: "Ana Silva" }));
    expect(botonDeColportores()).toHaveTextContent("Colportores: 3 de 4");

    await user.click(screen.getByRole("button", { name: "Todos" }));

    expect(botonDeColportores()).toHaveTextContent("Colportores: Todos (4)");
    expect(screen.getByRole("checkbox", { name: "Ana Silva" })).toBeChecked();
  });

  it("marcar a todos de a uno vuelve a «Todos» (sin filtro escondido)", async () => {
    const user = await abrirRango();
    await user.click(botonDeColportores());
    await user.click(screen.getByRole("checkbox", { name: "Ana Silva" }));
    await user.click(screen.getByRole("checkbox", { name: "Ana Silva" }));

    expect(botonDeColportores()).toHaveTextContent("Colportores: Todos (4)");
  });

  it("no deja sin ningún colportor: la última casilla queda marcada y se dice por qué", async () => {
    const user = await abrirRango();
    await user.click(botonDeColportores());
    for (const nombre of ["Beto Techera", "Carla Rey", "Darío Viera"]) await user.click(screen.getByRole("checkbox", { name: nombre }));
    expect(botonDeColportores()).toHaveTextContent("Colportores: 1 de 4");

    await user.click(screen.getByRole("checkbox", { name: "Ana Silva" }));

    expect(screen.getByRole("checkbox", { name: "Ana Silva" })).toBeChecked();
    expect(screen.getByText(TEXTO_UNO_AL_MENOS)).toBeInTheDocument();
    expect(botonDeColportores()).toHaveTextContent("Colportores: 1 de 4");
    // el reporte sigue siendo el de Ana, no el de todos
    expect(screen.getByRole("heading", { level: 2, name: "Ana Silva" })).toBeInTheDocument();
    // y el aviso se va con la siguiente casilla
    await user.click(screen.getByRole("checkbox", { name: "Carla Rey" }));
    expect(screen.queryByText(TEXTO_UNO_AL_MENOS)).not.toBeInTheDocument();
  });

  it("uno solo elegido se ve como ese colportor, por período, sin botón para volver", async () => {
    const user = await abrirRango();
    elegirS2();
    await user.click(botonDeColportores());
    for (const nombre of ["Ana Silva", "Beto Techera", "Darío Viera"]) await user.click(screen.getByRole("checkbox", { name: nombre }));

    expect(screen.getByRole("heading", { level: 2, name: "Carla Rey" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^‹/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(7);
  });

  it("el buscador filtra por nombre sin tildes ni mayúsculas y avisa si no hay coincidencias", async () => {
    const user = await abrirRango();
    await user.click(botonDeColportores());
    const grupo = screen.getByRole("group", { name: "Elegir colportores" });

    await user.type(within(grupo).getByRole("searchbox"), "dario");
    expect(within(grupo).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label") ?? c.parentElement?.textContent)).toEqual(["Darío Viera"]);

    await user.clear(within(grupo).getByRole("searchbox"));
    await user.type(within(grupo).getByRole("searchbox"), "zzz");
    expect(within(grupo).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(grupo).getByText(TEXTO_SIN_COINCIDENCIAS)).toBeInTheDocument();
  });

  it("Esc cierra el panel y devuelve el foco al botón; salir con Tab también lo cierra", async () => {
    const user = await abrirRango();
    await user.click(botonDeColportores());
    await user.click(screen.getByRole("searchbox"));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Elegir colportores" })).not.toBeInTheDocument();
    expect(botonDeColportores()).toHaveFocus();

    await user.click(botonDeColportores());
    await user.click(screen.getByRole("button", { name: "Rango", pressed: true }));
    expect(screen.queryByRole("group", { name: "Elegir colportores" })).not.toBeInTheDocument();
  });

  it("al cambiar de ciudad en la lista la elección se vacía; con un colportor de la lista no hay casillas", async () => {
    const user = await abrirRango();
    await user.click(botonDeColportores());
    await user.click(screen.getByRole("checkbox", { name: "Ana Silva" }));
    await user.keyboard("{Escape}");
    expect(botonDeColportores()).toHaveTextContent("Colportores: 3 de 4");

    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    expect(botonDeColportores()).toHaveTextContent("Colportores: Todos (2)");
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));
    expect(screen.queryByRole("button", { name: /^Colportores:/ })).not.toBeInTheDocument();
  });

  it("una ciudad con un solo colportor no ofrece elegir", async () => {
    const user = await abrirRango();
    await user.click(within(lista()).getByRole("button", { name: /^Artigas/ }));
    expect(screen.queryByRole("button", { name: /^Colportores:/ })).not.toBeInTheDocument();
  });

  it("agrupa las casillas por ciudad y aguanta una lista larga con nombres largos", async () => {
    const muchos: ColportorHoras[] = Array.from({ length: 300 }, (_, i) =>
      colportor(`c${i}`, `${i % 7 === 0 ? "Maria de los Angeles Fernandez Gonzalez de la Cruz " : "Colportor "}${i}`, horasConstantes("2026-10-05", "2026-10-21", 5)),
    );
    const base = datos();
    const grande: DatosHoras = { ...base, ciudades: [{ ...base.ciudades[0], colportores: muchos }, base.ciudades[1]] };
    const user = await abrirRango(grande);

    await user.click(botonDeColportores());
    const grupo = screen.getByRole("group", { name: "Elegir colportores" });
    expect(within(grupo).getAllByRole("checkbox")).toHaveLength(301);
    expect(botonDeColportores()).toHaveTextContent("Colportores: Todos (301)");
    expect(within(grupo).getAllByRole("group").map((g) => g.querySelector("legend")?.textContent)).toEqual(["Rivera", "Artigas"]);

    await user.type(within(grupo).getByRole("searchbox"), "Colportor 29");
    expect(within(grupo).getAllByRole("checkbox")).toHaveLength(10); // 29, 290 al 293 y 295 al 299 (el 294 lleva el nombre largo)
  });
});

describe("ReporteHoras · rango · exportar", () => {
  it("el CSV es el del rango: nombre con las fechas y las columnas nuevas", async () => {
    const user = await abrirRango();
    elegirS2();

    await user.click(screen.getByRole("button", { name: "Datos CSV" }));

    expect(bajar).toHaveBeenCalledTimes(1);
    const [nombre, contenido] = bajar.mock.calls[0];
    expect(nombre).toBe("reportes-todas-las-ciudades-rango-2026-10-12-a-2026-10-17.csv");
    const lineas = contenido.split("\r\n");
    expect(lineas[0]).toBe(
      "﻿Ciudad,Colportor,Período,Horas,Días trabajados,Promedio de horas por día trabajado,Jornadas con acompañamiento,Presentaciones,Ventas,Monto ($U),Nota",
    );
    expect(contenido).toContain("Rivera,Ana Silva,12/10/2026 al 17/10/2026,36,6,6,2,30,12,9000,");
    await waitFor(() => expect(screen.getByRole("button", { name: "Datos CSV" })).not.toHaveAttribute("aria-disabled", "true"), { timeout: 3000 });
  });

  it("el informe PDF dice el rango y no dibuja gráficos vacíos", async () => {
    const user = await abrirRango();
    elegirS2();

    await user.click(screen.getByRole("button", { name: "Informe PDF" }));

    const html = vi.mocked(imprimirDocumento).mock.calls[0][0];
    expect(html).toContain("<dt>Agrupado por</dt><dd>Rango de fechas</dd>");
    expect(html).toContain("<dt>Período</dt><dd>Del 12/10/2026 al 17/10/2026</dd>");
    expect(html).toContain("JORNADAS CON ACOMPAÑAMIENTO");
    expect(html).not.toContain('class="barras"');
  });
});
