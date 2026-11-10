import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DescargarInforme } from "@/datos/reportes/informe";
import { MENSAJE_SESION_VENCIDA } from "@/lib/mensajes";

import type * as descargas from "../exportar/descargar";
import { descargarArchivo, descargarBytes } from "../exportar/descargar";
import { MOTIVO_COLPORTORES_ELEGIDOS, MOTIVO_RANGO } from "../exportar/useExportacion";
import { datosDePruebaConVentas } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";

// QA del «Informe PDF» baja el archivo de la Edge Function (issue #84, PR #166): casos límite que los tests del PR no cubren.

vi.mock("../exportar/descargar", async (importOriginal) => {
  const original = await importOriginal<typeof descargas>();
  return { ...original, descargarArchivo: vi.fn(), descargarBytes: vi.fn() };
});

const bajar = vi.mocked(descargarArchivo);
const bajarBytes = vi.mocked(descargarBytes);
const informe = vi.fn<DescargarInforme>();
const PDF_BASE64 = Buffer.from("%PDF-1.7 informe de prueba").toString("base64");
const SIN_CONEXION = "Necesitás conexión para descargar el informe PDF.";

const vista = () => render(<ReporteHoras datos={datosDePruebaConVentas()} descargarInforme={informe} />);
const botonPdf = () => screen.getByRole("button", { name: /Informe PDF|Preparando informe/ });
const botonCsv = () => screen.getByRole("button", { name: /Datos CSV|Generando datos/ });
const estaApagado = (boton: HTMLElement) => boton.getAttribute("aria-disabled") === "true";

type Resultado = Awaited<ReturnType<DescargarInforme>>;
function pendiente() {
  let resolver!: (resultado?: Resultado) => void;
  let rechazar!: (e: Error) => void;
  const promesa = new Promise<Resultado>((res, rej) => {
    resolver = (resultado = { ok: true, pdfBase64: PDF_BASE64 }) => res(resultado);
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

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

beforeEach(() => {
  bajar.mockReset();
  bajarBytes.mockReset();
  informe.mockReset().mockResolvedValue({ ok: true, pdfBase64: PDF_BASE64 });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("QA #84 · cambiar el filtro mientras se arma el informe", () => {
  it.skip("QA #84: si el servidor rechaza el informe después de cambiar el filtro, el error se pierde y no se ve ningún aviso", async () => {
    const user = userEvent.setup();
    const servidor = pendiente();
    informe.mockReturnValueOnce(servidor.promesa);
    vista();

    await user.click(botonPdf());
    await user.click(screen.getByRole("button", { name: "Días" }));
    await act(async () => servidor.resolver({ ok: false, causa: "rechazado", mensaje: "No se pudo armar el informe. Probá de nuevo en unos minutos." }));

    // La persona apretó «Informe PDF», no bajó nada y el botón se destrabó: tiene que enterarse de que falló.
    expect(bajarBytes).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo armar el informe");
  });

  it.skip("QA #84: sin conexión a mitad del pedido y con otro filtro, tampoco se avisa que hace falta conexión", async () => {
    const user = userEvent.setup();
    const servidor = pendiente();
    informe.mockReturnValueOnce(servidor.promesa);
    vista();

    await user.click(botonPdf());
    await user.click(screen.getByRole("button", { name: "Meses" }));
    await act(async () => servidor.resolver({ ok: false, causa: "sin-conexion" }));

    expect(screen.getByRole("alert")).toHaveTextContent(SIN_CONEXION);
  });

  it("si el informe sale bien con otro filtro, baja el archivo del pedido y los botones quedan libres", async () => {
    const user = userEvent.setup();
    const servidor = pendiente();
    informe.mockReturnValueOnce(servidor.promesa);
    vista();

    await user.click(botonPdf());
    await user.click(screen.getByRole("button", { name: "Meses" }));
    // un segundo clic mientras tanto (con el filtro nuevo) no pide otro informe ni pisa el primero
    await user.click(botonPdf());
    expect(informe).toHaveBeenCalledTimes(1);
    await act(async () => servidor.resolver());

    expect(bajarBytes).toHaveBeenCalledTimes(1);
    expect(bajarBytes.mock.calls[0][0]).toBe("reportes-todas-las-ciudades-semanas-2026-10-21.pdf");
    expect(estaApagado(botonPdf())).toBe(false);
    expect(estaApagado(botonCsv())).toBe(false);
  });
});

describe("QA #84 · la sesión venció con la pantalla abierta", () => {
  it.skip("QA #84: el rechazo del proxy (sesión vencida) se muestra como «sin conexión», que reintentar no arregla", async () => {
    const user = userEvent.setup();
    // Así llega un 401 del proxy a una server action (src/auth/sesion-vencida.ts): un Error con la marca del motivo.
    informe.mockRejectedValueOnce(new Error("panel-acceso:vencida"));
    vista();

    await user.click(botonPdf());

    const alerta = screen.getByRole("alert");
    expect(alerta).not.toHaveTextContent("conexión");
    expect(alerta).toHaveTextContent(MENSAJE_SESION_VENCIDA);
  });
});

describe("QA #84 · avisos con texto del servidor", () => {
  it("un mensaje del servidor con marcado, muy largo y sin espacios se muestra como texto y se parte dentro del aviso", async () => {
    const user = userEvent.setup();
    const largo = `<img src=x onerror="alert(1)"> ${"a".repeat(5000)}`;
    informe.mockResolvedValueOnce({ ok: false, causa: "rechazado", mensaje: largo });
    const { container } = vista();

    await user.click(botonPdf());

    const alerta = screen.getByRole("alert");
    expect(alerta.textContent).toBe(largo);
    expect(container.querySelector("img")).toBeNull();
    expect(alerta.parentElement?.className).toContain("wrap-anywhere");
    expect(estaApagado(botonPdf())).toBe(false);
  });

  it("el error del PDF no se mezcla con el del CSV ni con el de éxito, y el reintento borra el aviso anterior", async () => {
    const user = userEvent.setup();
    informe.mockResolvedValueOnce({ ok: false, causa: "rechazado", mensaje: "Primer error." });
    vista();
    await user.click(botonPdf());
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    await user.click(botonPdf());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Se descargó «.*\.pdf»/);
  });
});

describe("QA #84 · la conexión va y viene", () => {
  it("al cortarse la conexión a mitad del pedido el aviso es una sola alerta y el motivo del botón se lee una vez", async () => {
    const user = userEvent.setup();
    const servidor = pendiente();
    informe.mockReturnValueOnce(servidor.promesa);
    vista();
    await user.click(botonPdf());

    sinRed();
    await act(async () => servidor.rechazar(new TypeError("Failed to fetch")));

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    // el botón se describe con el motivo, no con la alerta (que sería leída dos veces)
    expect(botonPdf()).toHaveAccessibleDescription(SIN_CONEXION);
  });

  it.skip("QA #84: al volver la conexión, la alerta de «sin conexión» de un pedido viejo sigue en pantalla con el botón ya habilitado", async () => {
    const user = userEvent.setup();
    const servidor = pendiente();
    informe.mockReturnValueOnce(servidor.promesa);
    vista();
    await user.click(botonPdf());
    sinRed();
    await act(async () => servidor.rechazar(new TypeError("Failed to fetch")));

    conRed();

    expect(estaApagado(botonPdf())).toBe(false);
    expect(screen.queryByText(SIN_CONEXION)).not.toBeInTheDocument();
  });

  it("sin conexión, un clic en «Informe PDF» y Enter con el foco no piden nada, y el foco queda en el botón", async () => {
    const user = userEvent.setup();
    vista();
    sinRed();

    botonPdf().focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(botonPdf());

    expect(informe).not.toHaveBeenCalled();
    expect(botonPdf()).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("el informe sale y vuelve a cortarse: dos ciclos seguidos no dejan el botón ocupado", async () => {
    const user = userEvent.setup();
    informe.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ ok: true, pdfBase64: PDF_BASE64 });
    vista();

    await user.click(botonPdf());
    expect(screen.getByRole("alert")).toHaveTextContent(SIN_CONEXION);
    expect(estaApagado(botonPdf())).toBe(false);

    await user.click(botonPdf());
    expect(bajarBytes).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("QA #84 · los motivos del botón sin acción", () => {
  async function violaciones(raiz: Element) {
    const r = await axe.run(raiz, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  }

  it("cada motivo (sin conexión, rango, colportores elegidos) describe al botón, el botón sigue en el orden de Tab y axe no marca nada", async () => {
    const user = userEvent.setup();
    const { container } = vista();

    sinRed();
    expect(botonPdf()).toHaveAccessibleDescription(SIN_CONEXION);
    expect(await violaciones(container)).toEqual([]);
    conRed();

    await user.click(screen.getByRole("button", { name: "Rango" }));
    expect(botonPdf()).toHaveAccessibleDescription(MOTIVO_RANGO);
    expect(botonPdf().tabIndex).toBe(0);
    expect(await violaciones(container)).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Semanas" }));
    await user.click(screen.getByRole("button", { name: /^Colportores:/ }));
    await user.click(screen.getByRole("checkbox", { name: "Beto Techera" }));
    await user.keyboard("{Escape}");
    expect(botonPdf()).toHaveAccessibleDescription(MOTIVO_COLPORTORES_ELEGIDOS);
    expect(await violaciones(container)).toEqual([]);
  });

  it("sin conexión y con rango a la vez, el botón dice el motivo del filtro (lo que se arregla primero), no dos textos juntos", async () => {
    const user = userEvent.setup();
    vista();
    await user.click(screen.getByRole("button", { name: "Rango" }));
    sinRed();

    expect(botonPdf()).toHaveAccessibleDescription(MOTIVO_RANGO);
    expect(screen.queryByText(SIN_CONEXION)).not.toBeInTheDocument();
  });

  it("los motivos no se anuncian solos: el motivo de sin conexión y el de rango son texto fijo, no una alerta", async () => {
    const user = userEvent.setup();
    vista();
    sinRed();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    conRed();
    await user.click(screen.getByRole("button", { name: "Rango" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
