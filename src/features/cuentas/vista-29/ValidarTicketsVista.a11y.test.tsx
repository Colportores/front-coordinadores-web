import { act, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { armarValidacionSimulada } from "@/datos/cuentas/validar/simulado";
import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { ValidarTicketsVista } from "./ValidarTicketsVista";

/** axe en jsdom no mide contraste (no hay layout): el contraste va en la corrida con navegador real. */
async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const AHORA = new Date("2026-11-10T14:00:00.000Z");
const acciones = () => ({
  validar: vi.fn(async () => ({ ok: false as const, causa: "sin-conexion" as const })),
  rechazar: vi.fn(async () => ({ ok: false as const, causa: "sin-conexion" as const })),
  enlaceDeFoto: vi.fn(async () => ({ ok: true as const, valor: "data:image/svg+xml,foto" })),
});
const panel = () => screen.getByRole("region");
const abrir = (nombre: string) => act(async () => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^[^,]+, ${nombre}`) })));

afterEach(() => {
  reiniciarTrabajoPendiente();
});

describe("ValidarTicketsVista · accesibilidad (axe A/AA, sin contraste)", () => {
  it("29A·01 con el depósito y su foto, 36R·01 el retiro, 36R·06 el propio y lo resuelto", async () => {
    const { container } = render(<ValidarTicketsVista datos={armarValidacionSimulada(AHORA)} acciones={acciones()} />);
    expect(await violaciones(container)).toEqual([]);
    await abrir("Lucía Fernández");
    await act(async () => fireEvent.click(within(panel()).getByRole("button", { name: "Ver foto" })));
    expect(await violaciones(container)).toEqual([]);
    await abrir(String.raw`Marta Pérez \(vos\)`);
    expect(await violaciones(container)).toEqual([]);
    await abrir("Bruno Techera");
    expect(await violaciones(container)).toEqual([]);
  });

  it("29A·02 con el motivo vacío, 36R·07B con el error y 36R·08 con el motivo largo", async () => {
    const { container } = render(<ValidarTicketsVista datos={armarValidacionSimulada(AHORA)} acciones={acciones()} />);
    await abrir("Lucía Benítez");
    await act(async () => fireEvent.click(within(panel()).getByRole("button", { name: /^Rechazar/ })));
    await act(async () => fireEvent.click(within(panel()).getByRole("button", { name: "Confirmar rechazo" })));
    expect(await violaciones(container)).toEqual([]);
    const motivo = within(panel()).getByLabelText("MOTIVO DEL RECHAZO · OBLIGATORIO");
    await act(async () => fireEvent.change(motivo, { target: { value: "No recibí el efectivo" } }));
    await act(async () => fireEvent.click(within(panel()).getByRole("button", { name: "Confirmar rechazo" })));
    expect(await violaciones(container)).toEqual([]);
    await act(async () => fireEvent.change(motivo, { target: { value: "x".repeat(612) } }));
    expect(await violaciones(container)).toEqual([]);
  });

  it("sin nada por validar", async () => {
    const { container } = render(<ValidarTicketsVista datos={{ campaniaId: "c", ahora: AHORA.toISOString(), items: [] }} acciones={acciones()} />);
    expect(await violaciones(container)).toEqual([]);
  });
});
