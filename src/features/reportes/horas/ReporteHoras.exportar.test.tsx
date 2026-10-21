import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatosHoras } from "@/datos/reportes/contrato";
import { crearHorasSimuladas } from "@/datos/reportes/simulado";

import { descargarArchivo, imprimirDocumento, retirarDocumentoDeImpresion } from "../exportar/descargar";
import { colportor, datosDePrueba, datosDePruebaConVentas, horasConstantes } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";

// El navegador (bajar un archivo, abrir la impresión) se reemplaza; lo que se arma para eso se prueba entero.
vi.mock("../exportar/descargar", () => ({
  descargarArchivo: vi.fn(),
  imprimirDocumento: vi.fn(),
  retirarDocumentoDeImpresion: vi.fn(),
}));

const bajar = vi.mocked(descargarArchivo);
const imprimir = vi.mocked(imprimirDocumento);

const botonPdf = () => screen.getByRole("button", { name: /Informe PDF|Preparando informe/ });
const botonCsv = () => screen.getByRole("button", { name: /Datos CSV|Generando datos/ });
const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const estaApagado = (boton: HTMLElement) => boton.getAttribute("aria-disabled") === "true";

/** Una promesa que se resuelve o rechaza cuando el test lo decide (el cuadro de impresión abierto). */
function pendiente() {
  let resolver!: () => void;
  let rechazar!: (e: Error) => void;
  const promesa = new Promise<void>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

beforeEach(() => {
  bajar.mockReset();
  imprimir.mockReset().mockResolvedValue(undefined);
  vi.mocked(retirarDocumentoDeImpresion).mockReset();
});

describe("ReporteHoras · Datos CSV (HU-REP-005)", () => {
  it("baja un CSV UTF-8 con lo que está en pantalla y dice cómo se llama el archivo", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);

    await user.click(botonCsv());

    expect(bajar).toHaveBeenCalledTimes(1);
    const [nombre, contenido, tipo] = bajar.mock.calls[0];
    expect(nombre).toBe("reportes-todas-las-ciudades-semanas-2026-10-21.csv");
    expect(tipo).toBe("text/csv;charset=utf-8");
    expect(contenido.startsWith("﻿Ciudad,Colportor,Período,Horas,Presentaciones,Ventas,Monto ($U),Nota\r\n")).toBe(true);
    expect(contenido).toContain("Rivera,Ana Silva,S2,36,30,12,9000,");
    expect(screen.getByRole("status")).toHaveTextContent("Se descargó «reportes-todas-las-ciudades-semanas-2026-10-21.csv» con lo que ves en pantalla.");
    expect(estaApagado(botonCsv())).toBe(false);
  });

  it("exporta el ámbito y la agrupación que se ven, no los de la primera carga", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(screen.getByRole("button", { name: "Días" }));

    await user.click(botonCsv());

    const [nombre, contenido] = bajar.mock.calls[0];
    expect(nombre).toBe("reportes-rivera-dias-2026-10-21.csv");
    const filas = contenido.split("\r\n").slice(1, -1);
    expect(filas.map((f) => f.split(",").slice(0, 2).join("|"))).toEqual(["Rivera|Ana Silva", "Rivera|Beto Techera"]);
  });

  it("con un colportor elegido, exporta sus períodos", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));

    await user.click(botonCsv());

    const [nombre, contenido] = bajar.mock.calls[0];
    expect(nombre).toBe("reportes-ana-silva-semanas-2026-10-21.csv");
    expect(contenido).toContain("Rivera,Ana Silva,S1");
  });

  it("si el navegador no puede bajarlo, avisa qué hacer y el botón sigue andando", async () => {
    const user = userEvent.setup();
    bajar.mockImplementationOnce(() => {
      throw new Error("sin espacio");
    });
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);

    await user.click(botonCsv());

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo generar el archivo CSV. El reporte sigue en pantalla: probá de nuevo.");
    expect(estaApagado(botonCsv())).toBe(false);
    expect(botonCsv()).not.toHaveAttribute("aria-busy");

    await user.click(botonCsv());
    expect(bajar).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Se descargó/);
  });

  it("dos clics seguidos bajan un solo archivo por clic, sin pisarse (el segundo ya es otro pedido)", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await act(async () => {
      botonCsv().click();
      botonCsv().click();
    });
    // Los dos clics caen en el mismo instante: el segundo se ignora mientras el primero se arma.
    expect(bajar).toHaveBeenCalledTimes(1);
    await user.click(botonCsv());
    expect(bajar).toHaveBeenCalledTimes(2);
  });
});

describe("ReporteHoras · Informe PDF (HU-REP-005)", () => {
  it("abre la impresión con el informe: marca, filtros aplicados, cifras y tabla", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Artigas/ }));
    await user.click(screen.getByRole("button", { name: "Meses" }));

    await user.click(botonPdf());

    expect(imprimir).toHaveBeenCalledTimes(1);
    const doc = new DOMParser().parseFromString(imprimir.mock.calls[0][0], "text/html");
    expect(doc.title).toBe("reportes-artigas-meses-2026-10-21");
    expect(doc.querySelector("h1")?.textContent).toBe("Artigas");
    expect(Array.from(doc.querySelectorAll("dl.filtros dd")).map((d) => d.textContent)).toEqual([
      "Artigas",
      "Meses",
      expect.any(String),
      "21/10/2026",
    ]);
    expect(doc.querySelector("tbody th")?.textContent).toBe("Carla Rey");
    expect(screen.getByRole("status")).toHaveTextContent("Se abrió el informe para imprimir. Elegí «Guardar como PDF» como destino para quedarte con el archivo.");
  });

  it("mientras se prepara, el botón lo dice y los dos quedan sin acción, sin perder el foco", async () => {
    const user = userEvent.setup();
    const abierto = pendiente();
    imprimir.mockReturnValueOnce(abierto.promesa);
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);

    await user.click(botonPdf());

    expect(botonPdf()).toHaveTextContent("Preparando informe…");
    expect(botonPdf()).toHaveAttribute("aria-busy", "true");
    expect(botonPdf()).toHaveFocus();
    expect(estaApagado(botonPdf())).toBe(true);
    expect(estaApagado(botonCsv())).toBe(true);

    await act(async () => abierto.resolver());
    expect(botonPdf()).toHaveTextContent("Informe PDF");
    expect(estaApagado(botonPdf())).toBe(false);
    expect(estaApagado(botonCsv())).toBe(false);
  });

  it("doble clic y un CSV en el medio no abren dos informes ni bajan nada", async () => {
    const user = userEvent.setup();
    const abierto = pendiente();
    imprimir.mockReturnValueOnce(abierto.promesa);
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);

    await user.click(botonPdf());
    await user.click(botonPdf());
    await user.click(botonCsv());
    expect(imprimir).toHaveBeenCalledTimes(1);
    expect(bajar).not.toHaveBeenCalled();

    await act(async () => abierto.resolver());
    await user.click(botonCsv());
    expect(bajar).toHaveBeenCalledTimes(1);
  });

  it("si falla a mitad, avisa qué hacer, destraba los botones y el reintento anda", async () => {
    const user = userEvent.setup();
    const abierto = pendiente();
    imprimir.mockReturnValueOnce(abierto.promesa);
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);

    await user.click(botonPdf());
    await act(async () => abierto.rechazar(new Error("no cargó")));

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo preparar el informe PDF. El reporte sigue en pantalla: probá de nuevo.");
    expect(botonPdf()).toHaveTextContent("Informe PDF");
    expect(botonPdf()).not.toHaveAttribute("aria-busy");
    expect(estaApagado(botonPdf())).toBe(false);
    expect(estaApagado(botonCsv())).toBe(false);

    await user.click(botonPdf());
    expect(imprimir).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Se abrió el informe/);
  });

  it("si el informe no se puede ni armar, también termina en el aviso (y no queda trabado)", async () => {
    const user = userEvent.setup();
    imprimir.mockImplementationOnce(() => {
      throw new Error("explotó");
    });
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.click(botonPdf());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(estaApagado(botonPdf())).toBe(false);
  });

  it("si se cambia el filtro mientras se prepara, el informe es el que se pidió y el aviso viejo no se muestra", async () => {
    const user = userEvent.setup();
    const abierto = pendiente();
    imprimir.mockReturnValueOnce(abierto.promesa);
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);

    await user.click(botonPdf());
    await user.click(screen.getByRole("button", { name: "Días" }));
    await act(async () => abierto.resolver());

    const doc = new DOMParser().parseFromString(imprimir.mock.calls[0][0], "text/html");
    expect(doc.querySelectorAll("dl.filtros dd")[1].textContent).toBe("Semanas");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(estaApagado(botonPdf())).toBe(false);
  });

  it("salir de la vista mientras se prepara no deja nada colgado ni avisa de más", async () => {
    const user = userEvent.setup();
    const abierto = pendiente();
    imprimir.mockReturnValueOnce(abierto.promesa);
    const { unmount } = render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.click(botonPdf());

    unmount();
    expect(retirarDocumentoDeImpresion).toHaveBeenCalled();
    await act(async () => abierto.resolver());

    // volver a entrar: todo en reposo, sin avisos de la visita anterior
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    expect(estaApagado(botonPdf())).toBe(false);
    expect(estaApagado(botonCsv())).toBe(false);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ReporteHoras · el aviso de la exportación", () => {
  it("se va solo cuando cambia lo que se ve (otra ciudad, otra agrupación)", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);

    await user.click(botonCsv());
    expect(screen.getByRole("status")).toHaveTextContent(/^Se descargó/);
    await user.click(screen.getByRole("button", { name: "Días" }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await user.click(botonCsv());
    expect(screen.getByRole("status")).toHaveTextContent(/^Se descargó/);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("un pedido nuevo borra el aviso anterior", async () => {
    const user = userEvent.setup();
    bajar.mockImplementationOnce(() => {
      throw new Error("x");
    });
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.click(botonCsv());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(botonPdf());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Se abrió el informe/);
  });
});

describe("ReporteHoras · exportar con datos límite", () => {
  it("sin colportores no hay qué exportar: los botones quedan sin acción y se dice por qué", async () => {
    const user = userEvent.setup();
    const vacio: DatosHoras = { ...datosDePrueba(), ciudades: [] };
    render(<ReporteHoras datos={vacio} />);

    for (const boton of [botonPdf(), botonCsv()]) {
      expect(estaApagado(boton)).toBe(true);
      expect(boton).toHaveAccessibleDescription("No hay colportores para exportar en este reporte.");
      await user.click(boton);
    }
    expect(screen.getByText("No hay colportores para exportar en este reporte.")).toBeInTheDocument();
    expect(bajar).not.toHaveBeenCalled();
    expect(imprimir).not.toHaveBeenCalled();
  });

  it("una ciudad sin colportores tampoco exporta, y al volver a una con colportores sí", async () => {
    const user = userEvent.setup();
    const datos = datosDePruebaConVentas();
    datos.ciudades.push({ id: "tranqueras", nombre: "Tranqueras", departamento: "Rivera", colportores: [] });
    render(<ReporteHoras datos={datos} />);

    await user.click(within(lista()).getByRole("button", { name: /Tranqueras/ }));
    expect(estaApagado(botonCsv())).toBe(true);
    await user.click(within(lista()).getByRole("button", { name: /Todas las ciudades/ }));
    expect(estaApagado(botonCsv())).toBe(false);
    expect(screen.queryByText("No hay colportores para exportar en este reporte.")).not.toBeInTheDocument();
  });

  it("una lista larga (500 colportores) se exporta entera a los dos formatos", async () => {
    const user = userEvent.setup();
    const datos = datosDePruebaConVentas();
    datos.ciudades[0].colportores = Array.from({ length: 500 }, (_, i) =>
      colportor(`c${i}`, `Colportor ${i}`, horasConstantes("2026-10-05", "2026-10-21", 6)),
    );
    render(<ReporteHoras datos={datos} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));

    await user.click(botonCsv());
    await user.click(botonPdf());

    expect(bajar.mock.calls[0][1].split("\r\n")).toHaveLength(502); // encabezado + 500 + línea final vacía
    const doc = new DOMParser().parseFromString(imprimir.mock.calls[0][0], "text/html");
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(500);
  });

  it("textos largos: el archivo se nombra corto y el aviso se parte en vez de salirse", async () => {
    const user = userEvent.setup();
    const datos = datosDePruebaConVentas();
    datos.ciudades[0].nombre = "San Antonio de las Cañas del Departamento de Rivera Norte, barrio Cerro Largo y alrededores";
    render(<ReporteHoras datos={datos} />);
    await user.click(within(lista()).getByRole("button", { name: /^San Antonio/ }));

    await user.click(botonCsv());

    expect(bajar.mock.calls[0][0].length).toBeLessThan(80);
    expect(bajar.mock.calls[0][0]).toMatch(/^reportes-san-antonio-de-las-canas-.*-semanas-2026-10-21\.csv$/);
    expect(screen.getByRole("status").parentElement).toHaveClass("wrap-anywhere");
  });

  it("los datos del canvas (25 colportores) salen sin error", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={crearHorasSimuladas()} />);
    await user.click(botonCsv());
    await user.click(botonPdf());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(bajar.mock.calls[0][1].split("\r\n")).toHaveLength(27);
  });

  it("exportar no pide nada a la red: anda sin conexión", async () => {
    const user = userEvent.setup();
    const red = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("fetch", red);
    try {
      render(<ReporteHoras datos={datosDePruebaConVentas()} />);
      await user.click(botonCsv());
      await user.click(botonPdf());
      expect(red).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("ReporteHoras · exportar, teclado y accesibilidad", () => {
  async function violaciones(raiz: Element) {
    const r = await axe.run(raiz, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  }

  it("los botones se alcanzan con Tab y se activan con Enter y con Espacio", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    botonPdf().focus();
    await user.keyboard("{Enter}");
    expect(imprimir).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(botonCsv()).toHaveFocus();
    await user.keyboard(" ");
    expect(bajar).toHaveBeenCalledTimes(1);
  });

  it("no tiene violaciones con el aviso de éxito, el de error, ocupado ni sin nada que exportar", async () => {
    const user = userEvent.setup();
    const abierto = pendiente();
    imprimir.mockReturnValueOnce(abierto.promesa);
    const { container, unmount } = render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    expect(await violaciones(container)).toEqual([]);

    await user.click(botonCsv());
    expect(await violaciones(container)).toEqual([]);

    await user.click(botonPdf());
    expect(await violaciones(container)).toEqual([]); // ocupado
    await act(async () => abierto.rechazar(new Error("x")));
    expect(await violaciones(container)).toEqual([]); // con error
    unmount();

    const { container: vacio } = render(<ReporteHoras datos={{ ...datosDePrueba(), ciudades: [] }} />);
    expect(await violaciones(vacio)).toEqual([]);
  });
});
