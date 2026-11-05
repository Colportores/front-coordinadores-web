import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { crearFuenteInicioSimulada } from "@/datos/inicio/simulado";
import { olvidarAjustes } from "@/features/inicio/ajustes";
import { InicioVista, type AccionesInicio } from "@/features/inicio/InicioVista";
import { fijarFlags } from "@/test/flags";

/** axe en jsdom no mide contraste (no hay layout): el contraste va en la corrida con navegador real. */
async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const fuente = crearFuenteInicioSimulada(() => new Date("2026-10-21T13:40:00.000Z"));

async function montar(acciones: AccionesInicio = { obtenerDia: vi.fn(async (fecha) => ({ ok: true as const, tablero: await fuente.obtenerTablero({ fecha }) })) }) {
  fijarFlags({ modoDev: true });
  olvidarAjustes();
  return render(<InicioVista tablero={await fuente.obtenerTablero()} acciones={acciones} />);
}

describe("InicioVista · accesibilidad (axe A/AA, sin contraste)", () => {
  it("la vista abierta, con una ciudad y con varias", async () => {
    const { container } = await montar();
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: /^Rivera/ }));
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: /^Todo el departamento/ }));
    expect(await violaciones(container)).toEqual([]);
  });

  it("con las dos columnas colapsadas", async () => {
    const { container } = await montar();
    await userEvent.click(screen.getByRole("button", { name: "Contraer ciudades" }));
    await userEvent.click(screen.getByRole("button", { name: "Contraer pendientes" }));
    expect(await violaciones(container)).toEqual([]);
  });

  it("cargando un día y con el aviso de falla", async () => {
    const { container } = await montar({ obtenerDia: async () => ({ ok: false, causa: "sin-conexion" }) });
    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    await screen.findByRole("alert");
    expect(await violaciones(container)).toEqual([]);
  });

  it("los botones de los extremos y del día miden al menos 32 px de alto y ancho (objetivo táctil AA)", async () => {
    const { container } = await montar();
    for (const boton of container.querySelectorAll("button[data-foco], [aria-label='Día'] button")) {
      expect(boton.className).toMatch(/size-8|h-8|min-h-8/);
    }
  });
});
