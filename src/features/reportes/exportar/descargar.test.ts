import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { descargarArchivo, imprimirDocumento, retirarDocumentoDeImpresion } from "./descargar";

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

describe("imprimirDocumento", () => {
  interface VentanaFalsa {
    focus: ReturnType<typeof vi.fn>;
    print: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
  }
  let ventana: VentanaFalsa;
  let srcdoc: string | undefined;

  const marco = () => document.querySelector("iframe");
  const cargar = () => marco()!.dispatchEvent(new Event("load"));
  const alTerminarDeImprimir = () => ventana.addEventListener.mock.calls.filter(([nombre]) => nombre === "afterprint").at(-1)![1]();

  beforeEach(() => {
    vi.useFakeTimers();
    srcdoc = undefined;
    ventana = { focus: vi.fn(), print: vi.fn(), addEventListener: vi.fn() };
    // Sin navegación real: la carga del documento la dispara cada test.
    vi.spyOn(HTMLIFrameElement.prototype, "srcdoc", "set").mockImplementation((valor: string) => {
      srcdoc = valor;
    });
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(() => ventana as unknown as Window);
  });

  afterEach(() => {
    retirarDocumentoDeImpresion();
    vi.useRealTimers();
  });

  it("carga el documento en un marco oculto y, cuando está listo, abre el cuadro de impresión", async () => {
    const hecho = imprimirDocumento("<p>informe</p>");
    expect(srcdoc).toBe("<p>informe</p>");
    expect(marco()).toHaveAttribute("aria-hidden", "true");
    expect(ventana.print).not.toHaveBeenCalled();

    cargar();
    await hecho;
    expect(ventana.focus).toHaveBeenCalled();
    expect(ventana.print).toHaveBeenCalledTimes(1);
  });

  it("retira el marco cuando el navegador avisa que terminó de imprimir", async () => {
    const hecho = imprimirDocumento("x");
    cargar();
    await hecho;
    expect(marco()).not.toBeNull();
    alTerminarDeImprimir();
    expect(marco()).toBeNull();
  });

  it("si el navegador nunca avisa, lo retira a los 5 minutos", async () => {
    const hecho = imprimirDocumento("x");
    cargar();
    await hecho;
    vi.advanceTimersByTime(4 * 60_000);
    expect(marco()).not.toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(marco()).toBeNull();
  });

  it("si el navegador no deja imprimir, rechaza y no deja el marco", async () => {
    ventana.print.mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const hecho = imprimirDocumento("x");
    cargar();
    await expect(hecho).rejects.toThrow("bloqueado");
    expect(marco()).toBeNull();
  });

  it("si el marco no tiene ventana, rechaza", async () => {
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(() => null);
    const hecho = imprimirDocumento("x");
    cargar();
    await expect(hecho).rejects.toThrow();
    expect(marco()).toBeNull();
  });

  it("si el documento no carga en 10 segundos, rechaza y retira el marco", async () => {
    const hecho = imprimirDocumento("x");
    const rechazo = expect(hecho).rejects.toThrow("no cargó a tiempo");
    vi.advanceTimersByTime(9_999);
    expect(marco()).not.toBeNull();
    vi.advanceTimersByTime(1);
    await rechazo;
    expect(marco()).toBeNull();
    expect(ventana.print).not.toHaveBeenCalled();
  });

  it("una carga que llega tarde, después de rechazar, no imprime nada", async () => {
    const hecho = imprimirDocumento("x");
    const rechazo = expect(hecho).rejects.toThrow();
    const viejo = marco()!;
    vi.advanceTimersByTime(10_000);
    await rechazo;
    viejo.dispatchEvent(new Event("load"));
    expect(ventana.print).not.toHaveBeenCalled();
  });

  it("dos veces seguidas deja un solo marco: el nuevo reemplaza al anterior", async () => {
    const primero = imprimirDocumento("uno");
    cargar();
    await primero;
    const segundo = imprimirDocumento("dos");
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    expect(srcdoc).toBe("dos");
    cargar();
    await segundo;
    expect(ventana.print).toHaveBeenCalledTimes(2);
  });

  it("devuelve el foco al botón que lo tenía, esté en el marco o ya caído al <body>", async () => {
    const boton = document.createElement("button");
    document.body.appendChild(boton);
    ventana.focus.mockImplementation(() => marco()!.focus());
    for (const cae of [false, true]) {
      boton.focus();
      const hecho = imprimirDocumento("x");
      cargar();
      await hecho;
      expect(document.activeElement).toBe(marco());
      if (cae) (document.activeElement as HTMLElement).blur();
      alTerminarDeImprimir();
      expect(document.activeElement).toBe(boton);
    }
    boton.remove();
  });

  it("si la persona ya movió el foco a otro lado, no se lo quita", async () => {
    const boton = document.createElement("button");
    const otro = document.createElement("button");
    document.body.append(boton, otro);
    ventana.focus.mockImplementation(() => marco()!.focus());
    boton.focus();
    const hecho = imprimirDocumento("x");
    cargar();
    await hecho;
    otro.focus();
    alTerminarDeImprimir();
    expect(document.activeElement).toBe(otro);
    boton.remove();
    otro.remove();
  });

  it("si la pantalla se cierra mientras carga, se retira el marco y no se imprime", async () => {
    const hecho = imprimirDocumento("x");
    retirarDocumentoDeImpresion();
    await expect(hecho).resolves.toBeUndefined();
    expect(marco()).toBeNull();
    vi.advanceTimersByTime(20_000); // ni el límite de carga la vuelve un error
    expect(ventana.print).not.toHaveBeenCalled();
  });
});
