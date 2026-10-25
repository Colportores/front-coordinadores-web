import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";

import { PedidosVista } from "./PedidosVista";

/** axe en jsdom no mide contraste (no hay layout): el contraste va en la corrida con navegador real. */
async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const AHORA = new Date("2026-10-22T18:00:00-03:00");
const datos = () => crearDatosDePedidosSimulados(AHORA);
const acciones = () => ({ decidir: vi.fn(async () => ({ ok: false as const, causa: "sin-conexion" as const })) });
const pestana = (nombre: RegExp) => screen.getByRole("tab", { name: nombre });

describe("PedidosVista · accesibilidad (axe A/AA, sin contraste)", () => {
  it("las tres pantallas del canvas: por autorizar, transferencia y despachados", async () => {
    const { container } = render(<PedidosVista datos={datos()} acciones={acciones()} />);
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(pestana(/^Transferencias/));
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(pestana(/^Despachados/));
    expect(await violaciones(container)).toEqual([]);
  });

  it("con el motivo abierto, con el error de motivo vacío, con un aviso de falla y con la lista contraída", async () => {
    const { container } = render(<PedidosVista datos={datos()} acciones={acciones()} />);
    await userEvent.click(screen.getByRole("button", { name: /^Rechazar/ }));
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(await violaciones(container)).toEqual([]);

    await userEvent.type(screen.getByRole("textbox"), "No");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await screen.findByText(/Necesitás conexión/);
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Contraer ciudades" }));
    expect(await violaciones(container)).toEqual([]);
  });

  it("sin pedidos y con una pestaña vacía", async () => {
    const { container } = render(<PedidosVista datos={{ ...datos(), pedidos: [], transferencias: [] }} acciones={acciones()} />);
    expect(await violaciones(container)).toEqual([]);
  });

  it("el estado no depende solo del color: cada fila lleva su texto en el nombre", () => {
    render(<PedidosVista datos={datos()} acciones={acciones()} />);
    const filas = within(screen.getByRole("list", { name: /^Pedidos de/ })).getAllByRole("button");

    expect(filas.length).toBe(4);
    for (const f of filas) expect(f).toHaveAccessibleName(/Por autorizar|Supera el límite/);
  });

  it("los pasos dicen en qué estado está cada uno además del ✓", () => {
    render(<PedidosVista datos={datos()} acciones={acciones()} />);
    const pasos = within(screen.getByRole("list", { name: "Estado del pedido" })).getAllByRole("listitem");

    expect(pasos[0]).toHaveTextContent("Por autorizar (estado actual)");
    expect(pasos[1]).toHaveTextContent("Autorizado (falta)");
  });

  it("los botones y las pestañas miden al menos 24 px de alto (objetivo táctil AA)", () => {
    const { container } = render(<PedidosVista datos={datos()} acciones={acciones()} />);
    for (const boton of container.querySelectorAll("button")) {
      expect(boton.className, boton.textContent ?? "").toMatch(/min-h-6|min-h-8|min-h-9|min-h-10|min-h-14|size-8/);
    }
  });

  it("con Tab se llega a la lista de ciudades, a las pestañas, a la bandeja y a Autorizar y Rechazar, sin saltar ni atrapar", async () => {
    render(<PedidosVista datos={datos()} acciones={acciones()} />);
    const visitados: string[] = [];
    for (let i = 0; i < 30; i++) {
      await userEvent.tab();
      const el = document.activeElement as HTMLElement;
      visitados.push(el.getAttribute("aria-label") ?? el.textContent ?? "");
    }
    expect(visitados[0]).toBe("Contraer ciudades");
    expect(visitados.some((v) => v.startsWith("Por autorizar"))).toBe(true);
    expect(visitados.some((v) => v.startsWith("#231,"))).toBe(true);
    expect(visitados.some((v) => v.startsWith("Autorizar el pedido #231"))).toBe(true);
    expect(visitados.some((v) => v.startsWith("Rechazar el pedido #231"))).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });
});
