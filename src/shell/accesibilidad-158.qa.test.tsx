import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { crearFuenteInicioSimulada } from "@/datos/inicio/simulado";
import { crearDatosDePreciosSimulados } from "@/datos/precios/simulado";
import type { CampaniaElegible, ResumenCoordinador } from "@/datos/shell/contrato";
import { olvidarAjustes } from "@/features/inicio/ajustes";
import { InicioVista } from "@/features/inicio/InicioVista";
import { datosDePrueba } from "@/features/reportes/horas/datos-de-prueba";
import { ReporteHoras } from "@/features/reportes/horas/ReporteHoras";
import { SelectorDeColportores } from "@/features/reportes/horas/SelectorDeColportores";
import { PreciosVista } from "@/features/stock/vista-27/PreciosVista";
import { fijarFlags } from "@/test/flags";

import { COOKIE_CAMPANIA_ELEGIDA } from "./campania-elegida";
import { SelectorDeCampania } from "./SelectorDeCampania";

/**
 * QA #158 (PR #163): los cambios de accesibilidad no deben cambiar el comportamiento con teclado ni agregar paradas de Tab,
 * y los `tabIndex={0}` que quedan (regiones con scroll) siguen alcanzables. axe en jsdom no mide contraste ni scroll real.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    rules: { "color-contrast": { enabled: false }, "scrollable-region-focusable": { enabled: false }, region: { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 70)).join(" | ")}`);
}

afterEach(() => {
  document.cookie = `${COOKIE_CAMPANIA_ELEGIDA}=; Max-Age=0; Path=/`;
});

const PRIMAVERA: CampaniaElegible = { id: "c1", nombre: "Primavera 2026", ciudades: ["Montevideo"], fechaInicio: "2026-09-15", fechaFin: "2026-12-15", estado: "en-curso" };
const VERANO: CampaniaElegible = { id: "c2", nombre: "Verano 2027", ciudades: ["Maldonado"], fechaInicio: "2027-01-04", fechaFin: null, estado: "por-empezar" };
const RESUMEN: ResumenCoordinador = { nombre: "Marta", iniciales: "MP", region: "Montevideo", campania: "Primavera 2026", campaniaId: "c1" };

describe("QA #158 · vista 37 · SelectorDeCampania", () => {
  async function abrir() {
    render(
      <>
        <button>antes</button>
        <SelectorDeCampania resumen={RESUMEN} pedirCampanias={async () => ({ ok: true, campanias: [PRIMAVERA, VERANO] })} />
        <button>despues</button>
      </>,
    );
    await act(async () => {
      fireEvent.click(document.querySelector("button[aria-haspopup='listbox']")!);
    });
    return screen.getByRole("listbox");
  }

  it("las opciones no son paradas de Tab (tabIndex -1) y el foco queda en la lista con aria-activedescendant", async () => {
    const lista = await abrir();
    expect(document.activeElement).toBe(lista);
    const opciones = within(lista).getAllByRole("option");
    expect(opciones).toHaveLength(2);
    for (const o of opciones) expect(o).toHaveAttribute("tabindex", "-1");
    expect(lista.getAttribute("aria-activedescendant")).toBe(opciones[0].id);
    await userEvent.tab();
    expect(document.activeElement).not.toBe(opciones[0]);
    expect(document.activeElement).not.toBe(opciones[1]);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("el clic con el mouse en una opción no le roba el foco a la lista (mousedown prevenido)", async () => {
    const lista = await abrir();
    const opcion = within(lista).getAllByRole("option")[1];
    expect(fireEvent.mouseDown(opcion)).toBe(false);
    expect(document.activeElement).toBe(lista);
  });

  it("Esc y flechas siguen funcionando con el envoltorio en role=presentation; axe limpio abierto y cerrado", async () => {
    const lista = await abrir();
    expect(lista.closest("[role='presentation']")).not.toBeNull();
    expect(await violaciones(document.body)).toEqual([]);
    await act(async () => {
      fireEvent.keyDown(lista, { key: "ArrowDown" });
    });
    expect(lista.getAttribute("aria-activedescendant")).toBe(within(lista).getAllByRole("option")[1].id);
    await act(async () => {
      fireEvent.keyDown(lista, { key: "Escape" });
    });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.querySelector("button[aria-haspopup='listbox']"));
    expect(await violaciones(document.body)).toEqual([]);
  });
});

describe("QA #158 · vista 32 · SelectorDeColportores", () => {
  const opciones = [
    { id: "a", nombre: "Ana", ciudad: "Rivera" },
    { id: "b", nombre: "Beto", ciudad: "Rivera" },
  ];
  function Caja() {
    const [elegidos, setElegidos] = useState<string[]>([]);
    return (
      <>
        <button>antes</button>
        <SelectorDeColportores opciones={opciones} elegidos={elegidos} alCambiar={setElegidos} />
        <button>despues</button>
      </>
    );
  }

  it("Esc cierra y devuelve el foco al botón; Tab hacia afuera cierra; axe limpio", async () => {
    render(<Caja />);
    const boton = screen.getByRole("button", { name: /Colportores:/ });
    await userEvent.click(boton);
    expect(screen.getByRole("group", { name: "Elegir colportores" })).toBeInTheDocument();
    expect(await violaciones(document.body)).toEqual([]);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Elegir colportores" })).not.toBeInTheDocument();
    expect(boton).toHaveFocus();

    await userEvent.click(boton);
    await act(async () => {
      screen.getByRole("button", { name: "despues" }).focus();
    });
    expect(screen.queryByRole("group", { name: "Elegir colportores" })).not.toBeInTheDocument();
  });

  it("marcar una casilla mantiene el panel abierto (el blur interno no lo cierra)", async () => {
    render(<Caja />);
    await userEvent.click(screen.getByRole("button", { name: /Colportores:/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Beto/ }));
    expect(screen.getByRole("group", { name: "Elegir colportores" })).toBeInTheDocument();
  });
});

describe("QA #158 · vista 27 · diálogo de cambios grandes", () => {
  it("foco inicial en «Volver a editar», Tab y Shift+Tab ciclan dentro, Esc vuelve y no guarda; axe limpio", async () => {
    render(<PreciosVista datos={crearDatosDePreciosSimulados()} acciones={{ guardarPrecios: vi.fn(async () => ({ ok: true as const })) }} />);
    await userEvent.click(screen.getByRole("tab", { name: /^Montevideo/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Precio de Salud y Hogar en Montevideo" }), { target: { value: "3600" } });
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    const dialogo = screen.getByRole("dialog", { name: "Revisá los cambios grandes" });
    const volver = within(dialogo).getByRole("button", { name: "Volver a editar" });
    const guardar = within(dialogo).getAllByRole("button").at(-1)!;
    expect(volver).toHaveFocus();
    expect(dialogo.parentElement).toHaveAttribute("role", "presentation");
    expect(await violaciones(document.body)).toEqual([]);
    await userEvent.tab({ shift: true });
    expect(guardar).toHaveFocus();
    await userEvent.tab();
    expect(volver).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Precio de Salud y Hogar en Montevideo" })).toHaveValue("3600");
  });
});

describe("QA #158 · regiones con scroll (tabIndex que se queda)", () => {
  it("vista 32: la región de la tabla de horas tiene nombre y está en el orden de Tab", () => {
    render(<ReporteHoras datos={datosDePrueba()} />);
    const regiones = screen.getAllByRole("region").filter((r) => r.getAttribute("tabindex") === "0");
    expect(regiones.length).toBeGreaterThan(0);
    for (const r of regiones) expect(r).toHaveAccessibleName();
  });

  it("vista 31: la región de la tabla de colportores tiene nombre y recibe el foco", async () => {
    fijarFlags({ modoDev: true });
    olvidarAjustes();
    const fuente = crearFuenteInicioSimulada(() => new Date("2026-10-21T13:40:00.000Z"));
    render(<InicioVista tablero={await fuente.obtenerTablero()} acciones={{ obtenerDia: vi.fn() }} />);
    await userEvent.click(screen.getByRole("button", { name: /^Rivera/ }));
    const region = screen.getByRole("region", { name: /^Colportores · / });
    expect(region).toHaveAttribute("tabindex", "0");
    region.focus();
    expect(region).toHaveFocus();
  });
});
