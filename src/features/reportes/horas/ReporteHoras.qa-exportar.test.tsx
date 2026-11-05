import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { armarReporte } from "./armado";
import { armarCsv } from "../exportar/csv";
import { retirarDocumentoDeImpresion } from "../exportar/descargar";
import { colportor, datosDePruebaConVentas, horasConstantes } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";

/**
 * QA de la vista 32 · exportar (PR #74, issue #62). Estos tests usan el módulo real `descargar.ts` (los del PR lo
 * reemplazan): lo único que se simula es el navegador (direcciones temporales, clic del enlace y marco de impresión).
 */

const botonPdf = () => screen.getByRole("button", { name: /Informe PDF|Preparando informe/ });
const botonCsv = () => screen.getByRole("button", { name: /Datos CSV|Generando datos/ });

/** Lector mínimo de CSV (RFC 4180): comillas dobles, comas y saltos de línea dentro de una celda. */
function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ",") {
      fila.push(celda);
      celda = "";
    } else if (c === "\r" && texto[i + 1] === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
      i++;
    } else celda += c;
  }
  if (celda !== "" || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

function leerBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(new Uint8Array(lector.result as ArrayBuffer));
    lector.onerror = () => rechazar(lector.error);
    lector.readAsArrayBuffer(blob);
  });
}

describe("QA #62 · el archivo CSV que baja el navegador de verdad", () => {
  const originales = { crear: URL.createObjectURL, revocar: URL.revokeObjectURL };
  let blobs: Blob[];
  let nombres: string[];

  beforeEach(() => {
    blobs = [];
    nombres = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:qa";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      nombres.push(this.download);
    });
  });

  afterEach(() => {
    URL.createObjectURL = originales.crear;
    URL.revokeObjectURL = originales.revocar;
    vi.restoreAllMocks();
  });

  it("los bytes empiezan con la marca UTF-8 (EF BB BF) una sola vez, y las tildes salen en UTF-8", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);

    await user.click(botonCsv());

    expect(nombres).toEqual(["reportes-todas-las-ciudades-semanas-2026-10-21.csv"]);
    expect(blobs[0].type).toBe("text/csv;charset=utf-8");
    const bytes = await leerBytes(blobs[0]);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect([...bytes.slice(3, 6)]).not.toEqual([0xef, 0xbb, 0xbf]); // sin doble marca
    const texto = new TextDecoder("utf-8").decode(bytes.slice(3));
    expect(texto.startsWith("Ciudad,Colportor,Período,")).toBe(true); // «í» bien decodificada
    expect(texto).toContain("Bella Unión,");
  });

  it("nombres hostiles (coma, comillas, salto de línea, fórmulas, emoji, 5000 letras) vuelven iguales al leerlos como planilla", () => {
    const datos = datosDePruebaConVentas();
    const hostiles = [
      'Pérez, "Ana"',
      "línea1\nlínea2",
      "=HIPERVINCULO(\"http://malo\")",
      "+598 99 123 456",
      "-2+3",
      "@SUMA(A1)",
      "\t=cmd",
      "\r=cmd",
      "Ana 🌻🙂 Núñez",
      "  con espacios  ",
      "x".repeat(5000),
    ];
    datos.ciudades[0].colportores = hostiles.map((nombre, i) => colportor(`h${i}`, nombre, horasConstantes("2026-10-05", "2026-10-21", 6)));
    const csv = armarCsv(armarReporte(datos, { tipo: "ciudad", ciudadId: "rivera" }, "semana"));

    const filas = leerCsv(csv);
    expect(filas).toHaveLength(1 + hostiles.length);
    // Ninguna fila se corre de columna: todas tienen las 8 del encabezado.
    for (const fila of filas) expect(fila).toHaveLength(8);
    filas.slice(1).forEach((fila, i) => {
      const esperado = hostiles[i];
      const peligrosa = /^[=+\-@\t\r]/.test(esperado);
      expect(fila[1]).toBe(peligrosa ? `'${esperado}` : esperado);
      // Ninguna celda de texto queda empezando con algo que una planilla ejecutaría.
      for (const celda of [fila[0], fila[1], fila[2], fila[7]]) expect(celda).not.toMatch(/^[=+\-@\t\r]/);
    });
  });
});

describe("QA #62 · el foco y los avisos con el teclado", () => {
  const originales = { crear: URL.createObjectURL, revocar: URL.revokeObjectURL };
  afterEach(() => {
    URL.createObjectURL = originales.crear;
    URL.revokeObjectURL = originales.revocar;
    retirarDocumentoDeImpresion();
    vi.restoreAllMocks();
  });

  it("el aviso de éxito es una región viva que ya está en la página antes de exportar (se anuncia al aparecer el texto)", () => {
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    const vivas = [...document.querySelectorAll("p[role=status]")];
    expect(vivas).toHaveLength(1);
    expect(vivas[0]).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tras bajar un CSV, con éxito o con error, el foco sigue en «Datos CSV» y el aviso correcto es el único visible", async () => {
    const user = userEvent.setup();
    const crear = vi.fn<(blob: Blob) => string>(() => {
      throw new Error("sin memoria");
    });
    URL.createObjectURL = crear;
    URL.revokeObjectURL = vi.fn();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    botonCsv().focus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo generar el archivo CSV. El reporte sigue en pantalla: probá de nuevo.");
    expect(document.querySelector("p[role=status]")).toBeEmptyDOMElement();
    expect(botonCsv()).toHaveFocus();
    expect(botonCsv()).not.toHaveAttribute("aria-disabled");

    crear.mockImplementation(() => "blob:qa");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await user.keyboard(" ");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector("p[role=status]")).toHaveTextContent("Se descargó «reportes-todas-las-ciudades-semanas-2026-10-21.csv»");
    expect(botonCsv()).toHaveFocus();
  });

  // QA #62 (bloqueante): `imprimirDocumento` hace `ventana.focus()` sobre el marco oculto y, al terminar de imprimir,
  // retira el marco: el foco cae al <body> y quien usa el teclado pierde el lugar (WCAG 2.4.3). Reproducido en
  // Chromium real: antes de `print()` activeElement = IFRAME; tras `afterprint` = BODY.
  it("QA #62: tras imprimir el informe, el foco vuelve a «Informe PDF» (no cae al <body>)", async () => {
    const user = userEvent.setup();
    let alTerminar: (() => void) | undefined;
    let ventanaFalsa: unknown;
    vi.spyOn(HTMLIFrameElement.prototype, "srcdoc", "set").mockImplementation(() => {});
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(function (this: HTMLIFrameElement) {
      ventanaFalsa ??= {
        // Como en el navegador: enfocar la ventana del marco enfoca el marco.
        focus: () => this.focus(),
        print: () => {},
        addEventListener: (nombre: string, escucha: () => void) => {
          if (nombre === "afterprint") alTerminar = escucha;
        },
      };
      return ventanaFalsa as Window;
    });
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    botonPdf().focus();

    await user.keyboard("{Enter}");
    await act(async () => document.querySelector("iframe")!.dispatchEvent(new Event("load")));
    expect(document.activeElement?.tagName).toBe("IFRAME"); // el foco se fue al marco mientras se imprime

    act(() => alTerminar!()); // el cuadro de impresión se cerró
    expect(document.querySelector("iframe")).toBeNull();
    expect(botonPdf()).toHaveFocus();
  });
});
