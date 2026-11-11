import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DescargarInforme } from "@/datos/reportes/informe";

import { armarReporte } from "./armado";
import { armarCsv } from "../exportar/csv";
import { colportor, datosDePruebaConVentas, horasConstantes } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";

/**
 * QA de la vista 32 · exportar (PR #74, issue #62; el PDF, issue #84). Estos tests usan el módulo real `descargar.ts` (los del PR lo
 * reemplazan): lo único que se simula es el navegador (direcciones temporales y clic del enlace) y el servidor del informe.
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

  // Antes (QA #62, bloqueante) el cuadro de imprimir se llevaba el foco al marco oculto y lo dejaba caer al <body>. Ahora el
  // informe se baja como el CSV, sin marco: el foco no se mueve nunca.
  it("tras bajar el informe PDF, con éxito o con error, el foco sigue en «Informe PDF»", async () => {
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => "blob:qa-pdf");
    URL.revokeObjectURL = vi.fn();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const informe = vi
      .fn<DescargarInforme>()
      .mockResolvedValueOnce({ ok: false, causa: "sin-conexion" })
      .mockResolvedValue({ ok: true, pdfBase64: Buffer.from("%PDF-1.7 qa").toString("base64") });
    render(<ReporteHoras datos={datosDePruebaConVentas()} descargarInforme={informe} />);
    botonPdf().focus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión para descargar el informe PDF.");
    expect(botonPdf()).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(clic).toHaveBeenCalledTimes(1);
    expect(document.querySelector("p[role=status]")).toHaveTextContent("Se descargó «reportes-todas-las-ciudades-semanas-2026-10-21.pdf»");
    expect(botonPdf()).toHaveFocus();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("los bytes del PDF que baja el navegador son los que mandó el servidor, con su tipo", async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:qa-pdf";
    });
    URL.revokeObjectURL = vi.fn();
    const nombres: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      nombres.push(this.download);
    });
    const original = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff, 0xfe, 0x80]);
    const informe: DescargarInforme = async () => ({ ok: true, pdfBase64: Buffer.from(original).toString("base64") });
    render(<ReporteHoras datos={datosDePruebaConVentas()} descargarInforme={informe} />);

    await user.click(botonPdf());

    expect(nombres).toEqual(["reportes-todas-las-ciudades-semanas-2026-10-21.pdf"]);
    expect(blobs[0].type).toBe("application/pdf");
    expect([...(await leerBytes(blobs[0]))]).toEqual([...original]);
  });
});
