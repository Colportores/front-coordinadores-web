import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DatosHoras } from "@/datos/reportes/contrato";
import type { DescargarInforme, PedidoDeInforme } from "@/datos/reportes/informe";
import { crearHorasSimuladas } from "@/datos/reportes/simulado";

import type * as descargas from "../exportar/descargar";
import { descargarArchivo, descargarBytes } from "../exportar/descargar";
import { MOTIVO_COLPORTORES_ELEGIDOS, MOTIVO_RANGO, TOPE_DEL_INFORME_MS } from "../exportar/useExportacion";
import { colportor, datosDePrueba, datosDePruebaConVentas, horasConstantes } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";

// El navegador (bajar un archivo) se reemplaza; lo que se arma para eso se prueba entero.
vi.mock("../exportar/descargar", async (importOriginal) => {
  const original = await importOriginal<typeof descargas>();
  return { ...original, descargarArchivo: vi.fn(), descargarBytes: vi.fn() };
});

const bajar = vi.mocked(descargarArchivo);
const bajarBytes = vi.mocked(descargarBytes);
/** El servidor del panel: la Edge Function del informe, vista desde el navegador. */
const informe = vi.fn<DescargarInforme>();
const PDF_DE_PRUEBA = "%PDF-1.7 informe de prueba";
const PDF_BASE64 = Buffer.from(PDF_DE_PRUEBA).toString("base64");
const NOMBRE_DEL_PDF = "reportes-todas-las-ciudades-semanas-2026-10-21.pdf";
const SIN_CONEXION = "Necesitás conexión para descargar el informe PDF.";
const vista = (datos: DatosHoras = datosDePruebaConVentas()) => render(<ReporteHoras datos={datos} descargarInforme={informe} />);

const botonPdf = () => screen.getByRole("button", { name: /Informe PDF|Preparando informe/ });
const botonCsv = () => screen.getByRole("button", { name: /Datos CSV|Generando datos/ });
const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const estaApagado = (boton: HTMLElement) => boton.getAttribute("aria-disabled") === "true";
/** Espera a que los dos botones estén libres (el de CSV queda ocupado un rato después de bajar). */
const libres = () =>
  waitFor(
    () => {
      expect(estaApagado(botonPdf())).toBe(false);
      expect(estaApagado(botonCsv())).toBe(false);
    },
    { timeout: 3000 },
  );

type Resultado = Awaited<ReturnType<DescargarInforme>>;

/** Una promesa que se resuelve o rechaza cuando el test lo decide (el informe todavía en el servidor). */
function pendiente() {
  let resolver!: (resultado?: Resultado) => void;
  let rechazar!: (e: Error) => void;
  const promesa = new Promise<Resultado>((res, rej) => {
    resolver = (resultado = { ok: true, pdfBase64: PDF_BASE64 }) => res(resultado);
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

beforeEach(() => {
  bajar.mockReset();
  bajarBytes.mockReset();
  informe.mockReset().mockResolvedValue({ ok: true, pdfBase64: PDF_BASE64 });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReporteHoras · Datos CSV (HU-REP-005)", () => {
  it("baja un CSV UTF-8 con lo que está en pantalla y dice cómo se llama el archivo", async () => {
    const user = userEvent.setup();
    vista();

    await user.click(botonCsv());

    expect(bajar).toHaveBeenCalledTimes(1);
    const [nombre, contenido, tipo] = bajar.mock.calls[0];
    expect(nombre).toBe("reportes-todas-las-ciudades-semanas-2026-10-21.csv");
    expect(tipo).toBe("text/csv;charset=utf-8");
    expect(contenido.startsWith("﻿Ciudad,Colportor,Período,Horas,Presentaciones,Ventas,Monto ($U),Nota\r\n")).toBe(true);
    expect(contenido).toContain("Rivera,Ana Silva,S2,36,30,12,9000,");
    expect(screen.getByRole("status")).toHaveTextContent("Se descargó «reportes-todas-las-ciudades-semanas-2026-10-21.csv» con lo que ves en pantalla.");
    expect(botonCsv()).toHaveTextContent("Generando datos…"); // pausa de doble clic
    await libres();
    expect(botonCsv()).toHaveTextContent("Datos CSV");
  });

  it("exporta el ámbito y la agrupación que se ven, no los de la primera carga", async () => {
    const user = userEvent.setup();
    vista();
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(screen.getByRole("button", { name: "Días" }));

    await user.click(botonCsv());
    await libres();

    const [nombre, contenido] = bajar.mock.calls[0];
    expect(nombre).toBe("reportes-rivera-dias-2026-10-21.csv");
    const filas = contenido.split("\r\n").slice(1, -1);
    expect(filas.map((f) => f.split(",").slice(0, 2).join("|"))).toEqual(["Rivera|Ana Silva", "Rivera|Beto Techera"]);
  });

  it("con un colportor elegido, exporta sus períodos", async () => {
    const user = userEvent.setup();
    vista();
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));

    await user.click(botonCsv());
    await libres();

    const [nombre, contenido] = bajar.mock.calls[0];
    expect(nombre).toBe("reportes-ana-silva-semanas-2026-10-21.csv");
    expect(contenido).toContain("Rivera,Ana Silva,S1");
  });

  it("si el navegador no puede bajarlo, avisa qué hacer y el botón sigue andando", async () => {
    const user = userEvent.setup();
    bajar.mockImplementationOnce(() => {
      throw new Error("sin espacio");
    });
    vista();

    await user.click(botonCsv());
    await libres();

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo generar el archivo CSV. El reporte sigue en pantalla: probá de nuevo.");
    expect(estaApagado(botonCsv())).toBe(false);
    expect(botonCsv()).not.toHaveAttribute("aria-busy");

    await user.click(botonCsv());
    await libres();
    expect(bajar).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Se descargó/);
  });

  it("un doble clic baja un solo archivo: el botón sigue ocupado ~600 ms aunque el CSV ya esté listo", async () => {
    const user = userEvent.setup();
    vista();

    await user.dblClick(botonCsv());
    expect(bajar).toHaveBeenCalledTimes(1);
    expect(botonCsv()).toHaveTextContent("Generando datos…");
    expect(estaApagado(botonPdf())).toBe(true);
    // el aviso de éxito ya está, aunque el botón siga en pausa
    expect(screen.getByRole("status")).toHaveTextContent(/^Se descargó/);

    await libres();
    expect(botonCsv()).toHaveTextContent("Datos CSV");
    // pasada la pausa, un clic nuevo es otro pedido: vuelve a bajar
    await user.click(botonCsv());
    expect(bajar).toHaveBeenCalledTimes(2);
  });

  it("si el CSV falla, el botón se libera enseguida para reintentar (sin la pausa)", async () => {
    const user = userEvent.setup();
    bajar.mockImplementationOnce(() => {
      throw new Error("x");
    });
    vista();
    await user.click(botonCsv());
    expect(estaApagado(botonCsv())).toBe(false);
    expect(botonCsv()).toHaveTextContent("Datos CSV");
  });
});

describe("ReporteHoras · Informe PDF (HU-REP-005, issue #84: lo arma el servidor)", () => {
  const pedidoDe = (n = 0): PedidoDeInforme => informe.mock.calls[n][0];

  it("pide el informe de lo que se ve (ciudad y agrupación) y baja el .pdf que llega", async () => {
    const user = userEvent.setup();
    vista();
    await user.click(within(lista()).getByRole("button", { name: /^Artigas/ }));
    await user.click(screen.getByRole("button", { name: "Meses" }));

    await user.click(botonPdf());

    expect(informe).toHaveBeenCalledTimes(1);
    expect(pedidoDe()).toEqual({ ambito: { tipo: "ciudad", ciudadId: "artigas" }, granularidad: "mes" });
    expect(bajarBytes).toHaveBeenCalledTimes(1);
    const [nombre, contenido, tipo] = bajarBytes.mock.calls[0];
    expect(nombre).toBe("reportes-artigas-meses-2026-10-21.pdf");
    expect(tipo).toBe("application/pdf");
    expect(new TextDecoder().decode(contenido as Uint8Array)).toBe(PDF_DE_PRUEBA);
    expect(screen.getByRole("status")).toHaveTextContent("Se descargó «reportes-artigas-meses-2026-10-21.pdf» con lo que ves en pantalla.");
    expect(botonPdf()).toHaveTextContent("Informe PDF");
    expect(estaApagado(botonPdf())).toBe(false);
  });

  it("no hay cuadro de imprimir: ni se abre un marco ni se pide imprimir", async () => {
    const user = userEvent.setup();
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {});
    vista();
    await user.click(botonPdf());
    expect(imprimir).not.toHaveBeenCalled();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("pide cada ámbito como lo entiende la función: todas, departamento, ciudad y colportor", async () => {
    const user = userEvent.setup();
    vista();
    await user.click(botonPdf());
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(botonPdf());
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));
    await user.click(screen.getByRole("button", { name: "Días" }));
    await user.click(botonPdf());

    expect(pedidoDe(0)).toEqual({ ambito: { tipo: "todas" }, granularidad: "semana" });
    expect(pedidoDe(1)).toEqual({ ambito: { tipo: "ciudad", ciudadId: "rivera" }, granularidad: "semana" });
    expect(pedidoDe(2)).toEqual({ ambito: { tipo: "colportor", colportorId: "ana" }, granularidad: "dia" });
  });

  it("mientras se prepara, el botón lo dice y los dos quedan sin acción, sin perder el foco", async () => {
    const user = userEvent.setup();
    const servidor = pendiente();
    informe.mockReturnValueOnce(servidor.promesa);
    vista();

    await user.click(botonPdf());

    expect(botonPdf()).toHaveTextContent("Preparando informe…");
    expect(botonPdf()).toHaveAttribute("aria-busy", "true");
    expect(botonPdf()).toHaveFocus();
    expect(estaApagado(botonPdf())).toBe(true);
    expect(estaApagado(botonCsv())).toBe(true);
    expect(bajarBytes).not.toHaveBeenCalled();

    await act(async () => servidor.resolver());
    expect(botonPdf()).toHaveTextContent("Informe PDF");
    expect(estaApagado(botonPdf())).toBe(false);
    expect(estaApagado(botonCsv())).toBe(false);
    expect(bajarBytes).toHaveBeenCalledTimes(1);
  });

  it("doble clic y un CSV en el medio no piden dos informes ni bajan nada de más", async () => {
    const user = userEvent.setup();
    const servidor = pendiente();
    informe.mockReturnValueOnce(servidor.promesa);
    vista();

    await user.dblClick(botonPdf());
    await user.click(botonCsv());
    expect(informe).toHaveBeenCalledTimes(1);
    expect(bajar).not.toHaveBeenCalled();
    expect(bajarBytes).not.toHaveBeenCalled();

    await act(async () => servidor.resolver());
    expect(bajarBytes).toHaveBeenCalledTimes(1);
    await user.click(botonCsv());
    await libres();
    expect(bajar).toHaveBeenCalledTimes(1);
    expect(informe).toHaveBeenCalledTimes(1);
  });

  it("si la función rechaza, muestra su texto, destraba los botones y el reintento anda", async () => {
    const user = userEvent.setup();
    informe.mockResolvedValueOnce({ ok: false, causa: "rechazado", mensaje: "No pudimos leer los reportes. Esperá unos minutos y volvé a intentar." });
    vista();

    await user.click(botonPdf());

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos leer los reportes. Esperá unos minutos y volvé a intentar.");
    expect(bajarBytes).not.toHaveBeenCalled();
    expect(botonPdf()).toHaveTextContent("Informe PDF");
    expect(botonPdf()).not.toHaveAttribute("aria-busy");
    expect(estaApagado(botonPdf())).toBe(false);
    expect(estaApagado(botonCsv())).toBe(false);

    await user.click(botonPdf());
    expect(informe).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Se descargó/);
  });

  it("un rechazo sin texto usa el de la vista y dice qué hacer", async () => {
    const user = userEvent.setup();
    informe.mockResolvedValueOnce({ ok: false, causa: "rechazado" });
    vista();
    await user.click(botonPdf());
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo preparar el informe PDF. El reporte sigue en pantalla: probá de nuevo.");
  });

  it("si el servidor no llega a Supabase (sin-conexion), avisa que hace falta conexión y se puede reintentar", async () => {
    const user = userEvent.setup();
    informe.mockResolvedValueOnce({ ok: false, causa: "sin-conexion" });
    vista();
    await user.click(botonPdf());
    expect(screen.getByRole("alert")).toHaveTextContent(SIN_CONEXION);
    expect(estaApagado(botonPdf())).toBe(false);
    await user.click(botonPdf());
    expect(screen.getByRole("status")).toHaveTextContent(/^Se descargó/);
  });

  it("si el pedido ni llega al servidor del panel (la red se cayó), también es falta de conexión y no queda trabado", async () => {
    const user = userEvent.setup();
    informe.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vista();
    await user.click(botonPdf());
    expect(screen.getByRole("alert")).toHaveTextContent(SIN_CONEXION);
    expect(botonPdf()).not.toHaveAttribute("aria-busy");
    expect(estaApagado(botonPdf())).toBe(false);
    expect(estaApagado(botonCsv())).toBe(false);
  });

  it("si el archivo que llega no se puede bajarBytes (base64 roto), termina en el aviso de error y no queda trabado", async () => {
    const user = userEvent.setup();
    informe.mockResolvedValueOnce({ ok: true, pdfBase64: "***" });
    vista();
    await user.click(botonPdf());
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo preparar el informe PDF.");
    expect(bajarBytes).not.toHaveBeenCalled();
    expect(estaApagado(botonPdf())).toBe(false);
  });

  it("si el navegador no puede bajarBytes el archivo, avisa y el botón sigue andando", async () => {
    const user = userEvent.setup();
    bajarBytes.mockImplementationOnce(() => {
      throw new Error("sin espacio");
    });
    vista();
    await user.click(botonPdf());
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo preparar el informe PDF.");
    expect(estaApagado(botonPdf())).toBe(false);
  });

  describe("sin respuesta del servidor", () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    it("a la hora de espera avisa que no se pudo, destraba el botón y un informe que llega tarde no se baja", async () => {
      const servidor = pendiente();
      informe.mockReturnValueOnce(servidor.promesa);
      vista();

      await act(async () => fireEvent.click(botonPdf()));
      expect(botonPdf()).toHaveTextContent("Preparando informe…");
      await act(async () => vi.advanceTimersByTime(TOPE_DEL_INFORME_MS));

      expect(screen.getByRole("alert")).toHaveTextContent("No se pudo preparar el informe PDF.");
      expect(botonPdf()).toHaveTextContent("Informe PDF");
      expect(estaApagado(botonPdf())).toBe(false);

      await act(async () => servidor.resolver());
      expect(bajarBytes).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("si se cambia el filtro mientras se prepara, el informe es el que se pidió y el aviso viejo no se muestra", async () => {
    const user = userEvent.setup();
    const servidor = pendiente();
    informe.mockReturnValueOnce(servidor.promesa);
    vista();

    await user.click(botonPdf());
    await user.click(screen.getByRole("button", { name: "Días" }));
    await act(async () => servidor.resolver());

    expect(pedidoDe()).toEqual({ ambito: { tipo: "todas" }, granularidad: "semana" });
    expect(bajarBytes.mock.calls[0][0]).toBe(NOMBRE_DEL_PDF);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(estaApagado(botonPdf())).toBe(false);
  });

  it("salir de la vista mientras se prepara no baja nada después ni deja nada colgado", async () => {
    const user = userEvent.setup();
    const servidor = pendiente();
    informe.mockReturnValueOnce(servidor.promesa);
    const { unmount } = vista();
    await user.click(botonPdf());

    unmount();
    await act(async () => servidor.resolver());
    expect(bajarBytes).not.toHaveBeenCalled();

    // volver a entrar: todo en reposo, sin avisos de la visita anterior
    vista();
    expect(estaApagado(botonPdf())).toBe(false);
    expect(estaApagado(botonCsv())).toBe(false);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ReporteHoras · Informe PDF sin conexión (issue #84)", () => {
  const sinRed = () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
  };
  const conRed = () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  };

  it("sin conexión el botón queda sin acción, dice por qué y no llama al servidor; «Datos CSV» sigue andando", async () => {
    const user = userEvent.setup();
    vista();
    sinRed();

    expect(estaApagado(botonPdf())).toBe(true);
    expect(botonPdf()).toHaveAccessibleDescription(SIN_CONEXION);
    expect(screen.getByText(SIN_CONEXION)).toBeInTheDocument();
    await user.click(botonPdf());
    expect(informe).not.toHaveBeenCalled();
    expect(bajarBytes).not.toHaveBeenCalled();

    expect(estaApagado(botonCsv())).toBe(false);
    expect(botonCsv()).not.toHaveAccessibleDescription(SIN_CONEXION);
    await user.click(botonCsv());
    expect(bajar).toHaveBeenCalledTimes(1);
  });

  it("al volver la conexión el botón se habilita y el aviso se va", async () => {
    const user = userEvent.setup();
    vista();
    sinRed();
    expect(estaApagado(botonPdf())).toBe(true);

    conRed();
    expect(estaApagado(botonPdf())).toBe(false);
    expect(screen.queryByText(SIN_CONEXION)).not.toBeInTheDocument();
    await user.click(botonPdf());
    expect(informe).toHaveBeenCalledTimes(1);
  });

  it("si se corta la conexión mientras se prepara, el pedido que falla termina en el aviso y destraba el botón", async () => {
    const user = userEvent.setup();
    const servidor = pendiente();
    informe.mockReturnValueOnce(servidor.promesa);
    vista();
    await user.click(botonPdf());

    sinRed();
    await act(async () => servidor.rechazar(new TypeError("Failed to fetch")));

    expect(screen.getAllByText(SIN_CONEXION).length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent(SIN_CONEXION);
    expect(botonPdf()).not.toHaveAttribute("aria-busy");
    expect(estaApagado(botonCsv())).toBe(false);
  });
});

describe("ReporteHoras · Informe PDF que el servidor todavía no arma (issue #84)", () => {
  it("con un rango de fechas el botón queda sin acción y dice qué hacer; el CSV sirve y al volver a Semanas el PDF también", async () => {
    const user = userEvent.setup();
    vista();
    await user.click(screen.getByRole("button", { name: "Rango" }));

    expect(estaApagado(botonPdf())).toBe(true);
    expect(botonPdf()).toHaveAccessibleDescription(MOTIVO_RANGO);
    await user.click(botonPdf());
    expect(informe).not.toHaveBeenCalled();
    expect(estaApagado(botonCsv())).toBe(false);

    await user.click(screen.getByRole("button", { name: "Semanas" }));
    expect(estaApagado(botonPdf())).toBe(false);
    expect(screen.queryByText(MOTIVO_RANGO)).not.toBeInTheDocument();
    await user.click(botonPdf());
    expect(informe).toHaveBeenCalledTimes(1);
  });

  it("con colportores elegidos tampoco se pide: el PDF saldría con otros colportores que la pantalla", async () => {
    const user = userEvent.setup();
    vista();
    await user.click(screen.getByRole("button", { name: /^Colportores:/ }));
    await user.click(screen.getByRole("checkbox", { name: "Beto Techera" }));
    await user.keyboard("{Escape}");

    expect(estaApagado(botonPdf())).toBe(true);
    expect(botonPdf()).toHaveAccessibleDescription(MOTIVO_COLPORTORES_ELEGIDOS);
    await user.click(botonPdf());
    expect(informe).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^Colportores:/ }));
    await user.click(screen.getByRole("checkbox", { name: "Beto Techera" })); // vuelve a «todos»
    await user.keyboard("{Escape}");
    expect(estaApagado(botonPdf())).toBe(false);
  });

  it("sin servidor detrás (sitio de prueba) el informe no se inventa: avisa y no baja nada", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.click(botonPdf());
    expect(screen.getByRole("alert")).toHaveTextContent("lo arma el servidor del panel");
    expect(bajarBytes).not.toHaveBeenCalled();
    expect(estaApagado(botonPdf())).toBe(false);
  });
});

describe("ReporteHoras · el aviso de la exportación", () => {
  it("se va solo cuando cambia lo que se ve (otra ciudad, otra agrupación)", async () => {
    const user = userEvent.setup();
    vista();

    await user.click(botonCsv());
    await libres();
    expect(screen.getByRole("status")).toHaveTextContent(/^Se descargó/);
    await user.click(screen.getByRole("button", { name: "Días" }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await user.click(botonCsv());
    await libres();
    expect(screen.getByRole("status")).toHaveTextContent(/^Se descargó/);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("un pedido nuevo borra el aviso anterior", async () => {
    const user = userEvent.setup();
    bajar.mockImplementationOnce(() => {
      throw new Error("x");
    });
    vista();
    await user.click(botonCsv());
    await libres();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(botonPdf());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Se descargó «reportes-todas-las-ciudades-semanas-2026-10-21\.pdf»/);
  });
});

describe("ReporteHoras · exportar con datos límite", () => {
  it("sin colportores no hay qué exportar: los botones quedan sin acción y se dice por qué", async () => {
    const user = userEvent.setup();
    const vacio: DatosHoras = { ...datosDePrueba(), ciudades: [] };
    vista(vacio);

    for (const boton of [botonPdf(), botonCsv()]) {
      expect(estaApagado(boton)).toBe(true);
      expect(boton).toHaveAccessibleDescription("No hay colportores para exportar en este reporte.");
      await user.click(boton);
    }
    expect(screen.getByText("No hay colportores para exportar en este reporte.")).toBeInTheDocument();
    expect(bajar).not.toHaveBeenCalled();
    expect(informe).not.toHaveBeenCalled();
  });

  it("una ciudad sin colportores tampoco exporta, y al volver a una con colportores sí", async () => {
    const user = userEvent.setup();
    const datos = datosDePruebaConVentas();
    datos.ciudades.push({ id: "tranqueras", nombre: "Tranqueras", departamento: "Rivera", colportores: [] });
    vista(datos);

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
    vista(datos);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));

    await user.click(botonCsv());
    await libres();
    await user.click(botonPdf());

    expect(bajar.mock.calls[0][1].split("\r\n")).toHaveLength(502); // encabezado + 500 + línea final vacía
    // El informe lo arma el servidor con las mismas cuentas: el panel le pide el mismo ámbito, sin mandarle los 500 nombres.
    expect(informe).toHaveBeenCalledWith({ ambito: { tipo: "ciudad", ciudadId: "rivera" }, granularidad: "semana" });
    expect(bajar).toHaveBeenCalledTimes(1);
    expect(bajarBytes).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("textos largos: el archivo se nombra corto y el aviso se parte en vez de salirse", async () => {
    const user = userEvent.setup();
    const datos = datosDePruebaConVentas();
    datos.ciudades[0].nombre = "San Antonio de las Cañas del Departamento de Rivera Norte, barrio Cerro Largo y alrededores";
    vista(datos);
    await user.click(within(lista()).getByRole("button", { name: /^San Antonio/ }));

    await user.click(botonCsv());
    await libres();

    expect(bajar.mock.calls[0][0].length).toBeLessThan(80);
    expect(bajar.mock.calls[0][0]).toMatch(/^reportes-san-antonio-de-las-canas-.*-semanas-2026-10-21\.csv$/);
    expect(screen.getByRole("status").parentElement).toHaveClass("wrap-anywhere");
  });

  it("los datos del canvas (25 colportores) salen sin error", async () => {
    const user = userEvent.setup();
    vista(crearHorasSimuladas());
    await user.click(botonCsv());
    await libres();
    await user.click(botonPdf());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(bajar.mock.calls[0][1].split("\r\n")).toHaveLength(27);
  });

  it("el CSV no pide nada a la red: anda sin conexión", async () => {
    const user = userEvent.setup();
    const red = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("fetch", red);
    try {
      vista();
      await user.click(botonCsv());
      await libres();
      expect(red).not.toHaveBeenCalled();
      expect(bajar).toHaveBeenCalledTimes(1);
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
    vista();
    botonPdf().focus();
    await user.keyboard("{Enter}");
    expect(informe).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(botonCsv()).toHaveFocus();
    await user.keyboard(" ");
    expect(bajar).toHaveBeenCalledTimes(1);
  });

  it("no tiene violaciones con el aviso de éxito, el de error, ocupado ni sin nada que exportar", async () => {
    const user = userEvent.setup();
    const abierto = pendiente();
    informe.mockReturnValueOnce(abierto.promesa);
    const { container, unmount } = vista();
    expect(await violaciones(container)).toEqual([]);

    await user.click(botonCsv());
    await libres();
    expect(await violaciones(container)).toEqual([]);

    await user.click(botonPdf());
    expect(await violaciones(container)).toEqual([]); // ocupado
    await act(async () => abierto.rechazar(new Error("x")));
    expect(await violaciones(container)).toEqual([]); // con error
    unmount();

    const { container: vacio } = vista({ ...datosDePrueba(), ciudades: [] });
    expect(await violaciones(vacio)).toEqual([]);
  });
});
