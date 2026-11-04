import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import type { ResultadoDeGuardado } from "@/datos/precios";
import { crearDatosDePreciosSimulados } from "@/datos/precios/simulado";

import { PreciosVista } from "./PreciosVista";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** axe en jsdom no mide contraste (no hay layout): el contraste va en la corrida con navegador real. */
async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const acciones = (resultado: ResultadoDeGuardado = { ok: true }) => ({ guardarPrecios: vi.fn(async () => resultado) });
const pestana = (nombre: RegExp) => screen.getByRole("tab", { name: nombre });
const editar = (producto: string, valor: string, ciudad = "Montevideo") =>
  fireEvent.change(screen.getByRole("textbox", { name: `Precio de ${producto} en ${ciudad}` }), { target: { value: valor } });

describe("PreciosVista · accesibilidad (axe A/AA, sin contraste)", () => {
  it("General y las dos ciudades", async () => {
    const { container } = render(<PreciosVista datos={crearDatosDePreciosSimulados()} acciones={acciones()} />);
    expect(await violaciones(container)).toEqual([]);
    await userEvent.click(pestana(/^Montevideo/));
    expect(await violaciones(container)).toEqual([]);
    await userEvent.click(pestana(/^Las Piedras/));
    expect(await violaciones(container)).toEqual([]);
  });

  it("con cambios sin guardar, con un precio inválido y con el aviso de guardado", async () => {
    const { container } = render(<PreciosVista datos={crearDatosDePreciosSimulados()} acciones={acciones()} />);
    await userEvent.click(pestana(/^Montevideo/));
    editar("Salud y Hogar", "2700");
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "+ Excepción: Nuestros Hijos" }));
    editar("Nuestros Hijos", "1900,50");
    expect(await violaciones(container)).toEqual([]);

    editar("Nuestros Hijos", "2000");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText(/Guardamos 2 precios/);
    expect(await violaciones(container)).toEqual([]);
  });

  it("con el diálogo de cambio grande, con el error de guardado y sin conexión", async () => {
    const a = acciones({ ok: false, causa: "rechazado", mensaje: "Algún precio no es válido." });
    const { container } = render(<PreciosVista datos={crearDatosDePreciosSimulados()} acciones={a} />);
    await userEvent.click(pestana(/^Montevideo/));
    editar("Salud y Hogar", "3600");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Guardar igual" }));
    await screen.findByRole("alert");
    expect(await violaciones(container)).toEqual([]);

    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    fireEvent(window, new Event("offline"));
    expect(await violaciones(container)).toEqual([]);
  });

  it("sin precios, sin ciudades y con la alerta de un bonificable sin precio general", async () => {
    const sinPrecios = crearDatosDePreciosSimulados();
    sinPrecios.items = sinPrecios.items.map((i) => ({ ...i, precioGeneral: null }));
    const a = render(<PreciosVista datos={sinPrecios} acciones={acciones()} />);
    expect(await violaciones(a.container)).toEqual([]);
    a.unmount();

    const sinCiudades = crearDatosDePreciosSimulados();
    sinCiudades.ciudades = [];
    const b = render(<PreciosVista datos={sinCiudades} acciones={acciones()} />);
    expect(await violaciones(b.container)).toEqual([]);
    b.unmount();

    const sinGeneral = crearDatosDePreciosSimulados();
    sinGeneral.items = sinGeneral.items.map((i, n) => (n === 1 ? { ...i, precioGeneral: null } : i));
    const c = render(<PreciosVista datos={sinGeneral} acciones={acciones()} />);
    expect(await violaciones(c.container)).toEqual([]);
    await userEvent.click(pestana(/^Las Piedras/));
    expect(await violaciones(c.container)).toEqual([]);
  });
});
