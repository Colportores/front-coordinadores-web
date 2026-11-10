import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { bytesDeBase64, descargarArchivo, descargarBytes } from "./descargar";

describe("descargarArchivo", () => {
  let crear: Mock<(blob: Blob) => string>;
  let revocar: Mock<(direccion: string) => void>;
  // jsdom no trae las direcciones temporales de archivos: se ponen a mano y se devuelven como estaban.
  const originales = { crear: URL.createObjectURL, revocar: URL.revokeObjectURL };

  beforeEach(() => {
    vi.useFakeTimers();
    crear = vi.fn<(blob: Blob) => string>(() => "blob:prueba");
    revocar = vi.fn<(direccion: string) => void>();
    URL.createObjectURL = crear;
    URL.revokeObjectURL = revocar;
  });

  afterEach(() => {
    URL.createObjectURL = originales.crear;
    URL.revokeObjectURL = originales.revocar;
    vi.useRealTimers();
  });

  it("baja un archivo con ese nombre y ese tipo, y no deja el enlace en la página", () => {
    let enlace: HTMLAnchorElement | undefined;
    let estabaEnLaPagina = false;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      enlace = document.querySelector("a[download]") as HTMLAnchorElement;
      estabaEnLaPagina = document.body.contains(enlace);
    });

    descargarArchivo("reportes.csv", "a,b\r\n", "text/csv;charset=utf-8");

    expect(estabaEnLaPagina).toBe(true);
    expect(enlace?.download).toBe("reportes.csv");
    expect(enlace?.getAttribute("href")).toBe("blob:prueba");
    expect(document.body.contains(enlace!)).toBe(false);
    const blob = crear.mock.calls[0][0];
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(blob.size).toBe(Buffer.byteLength("a,b\r\n"));
  });

  it("suelta la dirección temporal a los 30 segundos", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    descargarArchivo("reportes.csv", "x", "text/csv");
    expect(revocar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(revocar).toHaveBeenCalledWith("blob:prueba");
  });

  it("si el navegador no puede armar el archivo, lanza (y no deja basura)", () => {
    crear.mockImplementation(() => {
      throw new Error("sin memoria");
    });
    expect(() => descargarArchivo("reportes.csv", "x", "text/csv")).toThrow("sin memoria");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("si el clic falla, lanza, quita el enlace y suelta la dirección igual", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() => descargarArchivo("reportes.csv", "x", "text/csv")).toThrow("bloqueado");
    expect(document.querySelector("a[download]")).toBeNull();
    vi.advanceTimersByTime(30_000);
    expect(revocar).toHaveBeenCalled();
  });
});

describe("descargarBytes (el PDF)", () => {
  const originales = { crear: URL.createObjectURL, revocar: URL.revokeObjectURL };
  afterEach(() => {
    URL.createObjectURL = originales.crear;
    URL.revokeObjectURL = originales.revocar;
    vi.restoreAllMocks();
  });

  it("baja los bytes tal cual, con el tipo del PDF", () => {
    const crear = vi.fn<(blob: Blob) => string>(() => "blob:pdf");
    URL.createObjectURL = crear;
    URL.revokeObjectURL = vi.fn();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    descargarBytes("reportes.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0x00]), "application/pdf");

    expect(clic).toHaveBeenCalledTimes(1);
    expect(crear.mock.calls[0][0].type).toBe("application/pdf");
    expect(crear.mock.calls[0][0].size).toBe(7);
  });
});

describe("bytesDeBase64", () => {
  it("devuelve los mismos bytes, también los que no son texto", () => {
    const originales = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect([...bytesDeBase64(Buffer.from(originales).toString("base64"))]).toEqual([...originales]);
  });

  it("un texto vacío son cero bytes y un base64 roto lanza", () => {
    expect(bytesDeBase64("")).toHaveLength(0);
    expect(() => bytesDeBase64("***no es base64***")).toThrow();
  });
});
