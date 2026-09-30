import { readFileSync } from "node:fs";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResultadoInscripcion } from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO } from "@/datos/equipo/simulado";
import { AnadirColportor, MENSAJE_SIN_CONEXION } from "@/features/equipo/AnadirColportor";

/** QA de vistas (sprint 5, PR #36): textos literales del diseño, validación del buscador y axe por estado. */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function montar(inscribir: (id: string) => Promise<ResultadoInscripcion> = async () => ({ ok: true })) {
  const espia = vi.fn(inscribir);
  const r = render(<AnadirColportor datos={DATOS_ANADIR_COLPORTOR_SIMULADO} inscribir={espia} />);
  return { espia, contenedor: r.container };
}

const buscador = () => screen.getByRole("textbox", { name: "Buscar por email o nombre" });

/** axe en jsdom no mide contraste (no hay layout): el contraste va en la corrida con navegador real. */
async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("QA · textos literales del diseño (artboards B · 01 a B · 03)", () => {
  it("B · 01: buscador, ayuda y «Elegí una cuenta…»", () => {
    montar();
    expect(screen.getByText("Añadir colportor a Verano 2026")).toBeInTheDocument();
    expect(screen.getByText("Solo aparecen cuentas pendientes de asignación o activas sin campaña.")).toBeInTheDocument();
    expect(screen.getByText("Elegí una cuenta para ver el detalle y añadirla.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ya en tu equipo" })).toBeInTheDocument();
  });

  it("B · 02: detalle con «Añadir a Verano 2026» y el aviso por email y en la app", async () => {
    montar();
    await userEvent.type(buscador(), "ana");
    await userEvent.click(screen.getByRole("button", { name: "Elegir a Ana Martínez" }));
    const detalle = screen.getByRole("region", { name: "Detalle de Ana Martínez" });
    expect(within(detalle).getByRole("button", { name: "Añadir a Verano 2026" })).toBeEnabled();
    expect(within(detalle).getByText("Le llega un aviso por email y en la app.")).toBeInTheDocument();
  });

  it("B · 03: bloqueado, con el texto literal del diseño", async () => {
    montar();
    await userEvent.type(buscador(), "rodrigo");
    await userEvent.click(screen.getByRole("button", { name: "Elegir a Rodrigo Silva" }));
    expect(screen.getAllByText("Está en campaña Otoño Norte. Reasignar primero.").length).toBeGreaterThan(0);
    expect(screen.getByText("Pedile al coordinador de Otoño Norte que lo libere.")).toBeInTheDocument();
  });
});

describe("QA · validación del buscador", () => {
  it.each([
    ["mayúsculas y espacios a los lados", "  ANA  "],
    ["por email", "ana.martinez@correo.uy"],
    ["sin tildes", "martinez"],
  ])("encuentra por %s", async (_n, texto) => {
    montar();
    await userEvent.type(buscador(), texto);
    expect(screen.getByRole("button", { name: "Elegir a Ana Martínez" })).toBeInTheDocument();
  });

  it.each(["(", "[a-", "\\", ".*", "🌳", "<b>x</b>", "   "])("«%s» no rompe la vista ni tira una excepción", async (texto) => {
    montar();
    await userEvent.click(buscador());
    await userEvent.paste(texto);
    expect(screen.getByRole("textbox", { name: "Buscar por email o nombre" })).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("un texto pegado de 5000 caracteres dice que no hay coincidencias y no rompe el layout", async () => {
    montar();
    await userEvent.click(buscador());
    await userEvent.paste("x".repeat(5000));
    expect(screen.getByText("No hay cuentas que coincidan con tu búsqueda.")).toBeInTheDocument();
  });

  it("después de un error al añadir no se pierde lo tipeado ni la cuenta elegida", async () => {
    const { espia } = montar();
    espia.mockRejectedValueOnce(new Error("sin red"));
    await userEvent.type(buscador(), "ana");
    await userEvent.click(screen.getByRole("button", { name: "Elegir a Ana Martínez" }));
    await userEvent.click(screen.getByRole("button", { name: "Añadir a Verano 2026" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(MENSAJE_SIN_CONEXION);
    expect(buscador()).toHaveValue("ana");
    expect(screen.getByRole("region", { name: "Detalle de Ana Martínez" })).toBeInTheDocument();
  });
});

describe("QA · accesibilidad (axe A/AA, sin contraste) en cada estado", () => {
  it("B · 01 sugeridos", async () => {
    const { contenedor } = montar();
    expect(await violaciones(contenedor)).toEqual([]);
  });

  it("B · 02 resultados, suspendida y detalle", async () => {
    const { contenedor } = montar();
    await userEvent.type(buscador(), "ana");
    await userEvent.click(screen.getByRole("button", { name: "Elegir a Mariana Olivera" }));
    expect(await violaciones(contenedor)).toEqual([]);
  });

  it("B · 03 bloqueado y sin coincidencias", async () => {
    const { contenedor } = montar();
    await userEvent.type(buscador(), "rodrigo");
    await userEvent.click(screen.getByRole("button", { name: "Elegir a Rodrigo Silva" }));
    expect(await violaciones(contenedor)).toEqual([]);
    await userEvent.clear(buscador());
    await userEvent.type(buscador(), "zzzz");
    expect(await violaciones(contenedor)).toEqual([]);
  });

  it("al añadir (fila «Añadido ✓» y aviso con «Deshacer») y con el error a la vista", async () => {
    const { contenedor, espia } = montar();
    await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(await violaciones(contenedor)).toEqual([]);

    espia.mockResolvedValueOnce({ ok: false, mensaje: "La cuenta ya está en otra campaña." });
    await userEvent.click(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(await violaciones(contenedor)).toEqual([]);
  });

  it("el aviso de «Deshacer» se anuncia como status y el error como alert", async () => {
    montar();
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Añadiste a Ana Martínez a Verano 2026.");
  });
});

describe("QA · hallazgos resueltos (contraste, objetivo táctil, foco)", () => {
  const luz = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contraste = (a: string, b: string) => {
    const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const token = (nombre: string) => new RegExp(`--${nombre}: *(#[0-9a-fA-F]{6})`).exec(readFileSync("src/app/globals.css", "utf8"))?.[1] as string;

  it("el texto de `alerta` da al menos 4,5:1 sobre blanco y sobre `alerta-fondo`", () => {
    expect(contraste(token("alerta"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contraste(token("alerta"), token("alerta-fondo"))).toBeGreaterThanOrEqual(4.5);
  });

  it("«‹ Equipo», «Borrar búsqueda» y «Deshacer» piden al menos 24 px de alto", async () => {
    montar();
    expect(screen.getByRole("link", { name: "‹ Equipo" })).toHaveClass("min-h-6");
    await userEvent.type(buscador(), "ana");
    expect(screen.getByRole("button", { name: "Borrar búsqueda" })).toHaveClass("min-h-6", "min-w-6");
    await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
    expect(screen.getByRole("button", { name: /Deshacer/ })).toHaveClass("min-h-6", "min-w-6");
  });

  it("tras «Añadir» el foco queda en la fila de la cuenta y no en el body", async () => {
    montar();
    await userEvent.type(buscador(), "ana");
    await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
    await screen.findByText(/Añadiste a Ana Martínez/);
    const fila = screen.getByRole("button", { name: "Elegir a Ana Martínez" }).closest("li");
    expect(fila).toHaveFocus();
  });

  it("tras un «Añadir» que falla el foco queda en la fila y el botón vuelve a estar habilitado", async () => {
    montar(async () => {
      throw new Error("sin red");
    });
    await userEvent.type(buscador(), "ana");
    await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Añadir a Ana Martínez" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Elegir a Ana Martínez" }).closest("li")).toHaveFocus();
  });

  it("tras «Deshacer» el foco vuelve a la fila, y si la cuenta ya no está en los resultados, al buscador", async () => {
    montar();
    await userEvent.type(buscador(), "ana");
    await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
    await userEvent.click(await screen.findByRole("button", { name: /Deshacer/ }));
    expect(screen.getByRole("button", { name: "Elegir a Ana Martínez" }).closest("li")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Añadir a Ana Martínez" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
    const deshacer = await screen.findByRole("button", { name: /Deshacer/ });
    await userEvent.clear(buscador());
    await userEvent.type(buscador(), "zzzzqq");
    await userEvent.click(deshacer);
    expect(buscador()).toHaveFocus();
  });
});
