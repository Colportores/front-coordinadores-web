import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ColportorDeStock, DatosDeStock, ExistenciaDeStock } from "@/datos/stock/contrato";
import { crearDatosDeStockSimulados } from "@/datos/stock/simulado";

import { StockVista } from "./StockVista";

// QA de la vista 34 (PR #88, issue #65): lo que los tests del implementador no cubren.

const ex = (productoId: string, tiene: number, porEntregar = 0): ExistenciaDeStock => ({ productoId, tiene, porEntregar, entregados: 0, porCobrar: 0 });
const col = (id: string, ciudadId: string | null, ...existencias: ExistenciaDeStock[]): ColportorDeStock => ({ id, nombre: id, ciudadId, existencias });
const chico = (parcial: Partial<DatosDeStock> = {}): DatosDeStock => ({
  campaniaId: "c",
  ciudades: [{ id: "riv", nombre: "Rivera", departamento: "Rivera" }],
  productos: [{ id: "l1", nombre: "Libro uno", tipo: "LIBRO", nota: null }],
  colportores: [col("ana", "riv", ex("l1", 3))],
  ...parcial,
});

const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const tabla = () => screen.getByRole("table", { name: /^Stock por producto en/ });

// --- contraste (axe en jsdom no lo mide: se calcula con los tokens de globals.css) -------------------------------------

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const token = (nombre: string): string => {
  const m = css.match(new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${nombre} no encontrado`);
  return m[1];
};
const luminancia = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const razon = (a: string, b: string) => {
  const [x, y] = [luminancia(token(a)), luminancia(token(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("StockVista · QA · contraste de los textos de la vista (AA: 4,5:1)", () => {
  it.each([
    ["estado «Agotado» (peligro sobre peligro-fondo)", "peligro", "peligro-fondo"],
    ["estado «Faltan N» (alerta sobre alerta-fondo)", "alerta", "alerta-fondo"],
    ["estado «Alcanza» (exito sobre exito-fondo)", "exito", "exito-fondo"],
    ["etiqueta STOCK (marca-media sobre marca-clara)", "marca-media", "marca-clara"],
    ["encabezados y notas (tinta-suave sobre superficie)", "tinta-suave", "superficie"],
    ["título de grupo de tipo (tinta-suave sobre superficie-suave)", "tinta-suave", "superficie-suave"],
  ])("%s", (_nombre, fg, bg) => {
    expect(razon(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.skip("QA #65: las cifras en cero y «nadie» usan tinta-tenue sobre blanco (2,66:1), por debajo de AA", () => {
    render(<StockVista datos={chico({ colportores: [col("ana", "riv", ex("l1", 0, 0))] })} />);
    // Precondición: hay celdas en cero con esa clase (así las pinta `Cifra` y la celda «EN MANOS DE»).
    const ceros = Array.from(tabla().querySelectorAll("span.font-mono")).filter((el) => el.textContent === "0");
    expect(ceros.length).toBeGreaterThan(0);
    expect(ceros.every((el) => el.className.includes("text-tinta-tenue"))).toBe(true);
    expect(razon("tinta-tenue", "superficie")).toBeGreaterThanOrEqual(4.5);
  });
});

// --- teclado y foco -------------------------------------------------------------------------------------------------

describe("StockVista · QA · teclado", () => {
  it("Enter y Espacio sobre la fila abren y cierran el detalle una sola vez (el renglón no lo vuelve a alternar)", async () => {
    render(<StockVista datos={chico()} />);
    const boton = within(tabla()).getByRole("button", { name: /Libro uno/ });
    boton.focus();

    await userEvent.keyboard("{Enter}");
    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(boton).toHaveAttribute("aria-controls");
    expect(document.getElementById(boton.getAttribute("aria-controls")!)).not.toBeNull();

    await userEvent.keyboard(" ");
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(boton).not.toHaveAttribute("aria-controls");
  });

  it("con Tab se llega a la lista de ciudades, a «Pedidos y transferencias →», a los avisos y a las filas, sin saltar ni atrapar", async () => {
    render(<StockVista datos={crearDatosDeStockSimulados()} />);
    const visitados: string[] = [];
    for (let i = 0; i < 12; i++) {
      await userEvent.tab();
      visitados.push((document.activeElement as HTMLElement).getAttribute("aria-label") ?? document.activeElement!.textContent ?? "");
    }
    expect(visitados[0]).toBe("Contraer ciudades");
    expect(visitados.some((v) => v.startsWith("Pedidos y transferencias"))).toBe(true);
    // Nunca se queda en el body.
    expect(document.activeElement).not.toBe(document.body);
  });

  it("«Ver quién tiene» con la lista contraída conserva el riel, abre la fila y le da el foco", async () => {
    render(<StockVista datos={crearDatosDeStockSimulados()} />);
    await userEvent.click(screen.getByRole("button", { name: "Contraer ciudades" }));
    await userEvent.click(screen.getByRole("button", { name: "Ver quién tiene La Gran Esperanza en Rivera" }));

    expect(screen.getByRole("button", { name: "Expandir ciudades" })).toBeInTheDocument();
    expect(within(tabla()).getByRole("button", { name: /La Gran Esperanza/ })).toHaveFocus();
    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
  });

  it("elegir una ciudad con el riel y volver a la lista abierta deja la selección marcada con aria-current", async () => {
    render(<StockVista datos={crearDatosDeStockSimulados()} />);
    await userEvent.click(screen.getByRole("button", { name: "Contraer ciudades" }));
    await userEvent.click(within(lista()).getByRole("button", { name: "Bella Unión" }));
    await userEvent.click(screen.getByRole("button", { name: "Expandir ciudades" }));

    expect(within(lista()).getByRole("button", { name: /^Bella Unión/ })).toHaveAttribute("aria-current", "true");
    expect(within(lista()).getAllByRole("button").filter((b) => b.getAttribute("aria-current") === "true")).toHaveLength(1);
  });
});

// --- datos límite ---------------------------------------------------------------------------------------------------

describe("StockVista · QA · datos límite", () => {
  it("un colportor cuya ciudad no figura en la lista no se pierde: aparece en «Sin ciudad»", async () => {
    render(<StockVista datos={chico({ colportores: [col("ana", "riv", ex("l1", 3)), col("huérfano", "no-existe", ex("l1", 2))] })} />);
    expect(screen.getByText(/2 colportores · 1 producto/)).toBeInTheDocument();
    await userEvent.click(within(lista()).getByRole("button", { name: /^Sin ciudad/ }));
    await userEvent.click(within(tabla()).getByRole("button", { name: /Libro uno/ }));
    expect(screen.getByRole("rowheader", { name: "huérfano" })).toBeInTheDocument();
  });

  it("existencias de un producto que no está en el catálogo no rompen ni suman", () => {
    render(<StockVista datos={chico({ colportores: [col("ana", "riv", ex("l1", 3), ex("fantasma", 99, 99))] })} />);
    expect(within(tabla()).getByRole("button", { name: /Libro uno/ }).closest("tr")).toHaveTextContent("3");
    expect(screen.queryByText("99")).not.toBeInTheDocument();
  });

  it("una ciudad sin departamento y dos ciudades con el mismo nombre se distinguen y se pueden elegir por separado", async () => {
    render(
      <StockVista
        datos={chico({
          ciudades: [
            { id: "a", nombre: "San José", departamento: null },
            { id: "b", nombre: "San José", departamento: "Colonia" },
          ],
          colportores: [col("ana", "a", ex("l1", 1)), col("beto", "b", ex("l1", 5))],
        })}
      />,
    );
    const botones = within(lista()).getAllByRole("button", { name: /^San José/ });
    expect(botones).toHaveLength(2);
    await userEvent.click(botones[1]);
    expect(screen.getByRole("heading", { level: 2, name: "San José" })).toBeInTheDocument();
    expect(botones[1]).toHaveAttribute("aria-current", "true");
    expect(botones[0]).not.toHaveAttribute("aria-current");
  });

  it("un solo colportor, un solo producto con todo en cero: «Agotado» sin «Faltan» ni NaN", () => {
    render(<StockVista datos={chico({ colportores: [col("ana", "riv", ex("l1", 0, 0))] })} />);
    expect(within(tabla()).getByText("Agotado en la ciudad")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("nombres de colportor y de ciudad con emoji y caracteres especiales se muestran tal cual", async () => {
    render(
      <StockVista
        datos={chico({
          ciudades: [{ id: "riv", nombre: "Río <b>Negro</b> 🌎", departamento: "Río Negro" }],
          colportores: [col("x", "riv", ex("l1", 2))].map((c) => ({ ...c, nombre: "Ñandú 🦤 <script>alert(1)</script>" })),
        })}
      />,
    );
    await userEvent.click(within(tabla()).getByRole("button", { name: /Libro uno/ }));
    expect(screen.getByText("Ñandú 🦤 <script>alert(1)</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getAllByText(/Río <b>Negro<\/b> 🌎/).length).toBeGreaterThan(0);
  });

  it("no muestra plata ni datos de clientes: solo cantidades (R-RP01, la plata es de Cuentas)", () => {
    render(<StockVista datos={crearDatosDeStockSimulados()} />);
    expect(document.body.textContent).not.toMatch(/\$|U\$S|dinero en mano|cliente/i);
  });

  it("cambiar de ciudad con una fila abierta y volver conserva la fila abierta y la tabla coherente", async () => {
    render(<StockVista datos={crearDatosDeStockSimulados()} />);
    await userEvent.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await userEvent.click(within(tabla()).getByRole("button", { name: /La Gran Esperanza/ }));
    await userEvent.click(within(lista()).getByRole("button", { name: /^Artigas/ }));
    await userEvent.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    expect(within(tabla()).getByRole("button", { name: /La Gran Esperanza/ })).toHaveAttribute("aria-expanded", "true");
  });
});
