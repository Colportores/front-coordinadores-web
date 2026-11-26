import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ColportorDeStock, DatosDeStock, ExistenciaDeStock } from "@/datos/stock/contrato";
import { crearDatosDeStockSimulados } from "@/datos/stock/simulado";

import { StockVista } from "./StockVista";

// Issue #217 (Cristian, «Stock 42B», 24/11): Stock abre con la tabla por colportor y las pestañas Stock | Pedidos | Transferencias,
// como 42B·01. La tabla por producto queda a un toque («Por producto»).

const ex = (productoId: string, tiene: number): ExistenciaDeStock => ({ productoId, tiene, porEntregar: 0, entregados: 0, devueltos: 0, porCobrar: 0 });
const col = (id: string, ciudadId: string | null, ...existencias: ExistenciaDeStock[]): ColportorDeStock => ({
  id,
  nombre: id,
  ciudadId,
  ultimoDatoAt: null,
  existencias: existencias.length > 0 ? existencias : [ex("l1", 3)],
});
const chico = (parcial: Partial<DatosDeStock> = {}): DatosDeStock => ({
  campaniaId: "c",
  ciudades: [
    { id: "riv", nombre: "Rivera", departamento: "Rivera" },
    { id: "art", nombre: "Artigas", departamento: "Artigas" },
  ],
  productos: [{ id: "l1", nombre: "Libro uno", tipo: "LIBRO", nota: null }],
  colportores: [col("ana", "riv"), col("beto", "art")],
  pedidosPorAutorizar: [{ ciudadId: "riv", pedidos: 2 }],
  ...parcial,
});

const porColportor = () => screen.queryByRole("table", { name: /^Stock por colportor en/ });
const porProducto = () => screen.queryByRole("table", { name: /^Stock por producto en/ });
const vista = (nombre: string) => within(screen.getByRole("group", { name: "Ver el stock" })).getByRole("button", { name: nombre });
const ciudad = (nombre: RegExp) => userEvent.click(within(screen.getByRole("navigation", { name: "Ciudades" })).getByRole("button", { name: nombre }));

describe("#217 · Stock abre por colportor (42B·01)", () => {
  it("abre con la tabla por colportor, «Por colportor» marcado y las tres pestañas Stock | Pedidos | Transferencias", () => {
    render(<StockVista datos={chico()} />);
    expect(porColportor()).toBeInTheDocument();
    expect(porProducto()).not.toBeInTheDocument();
    expect(vista("Por colportor")).toHaveAttribute("aria-pressed", "true");
    expect(vista("Por producto")).toHaveAttribute("aria-pressed", "false");
    const pestanas = screen.getByRole("navigation", { name: "Secciones de Stock" });
    expect(within(pestanas).getByText("Stock")).toHaveAttribute("aria-current", "page");
    expect(within(pestanas).getByRole("link", { name: /^Pedidos/ })).toBeVisible();
    expect(within(pestanas).getByRole("link", { name: "Transferencias" })).toBeVisible();
    expect(screen.getByText("2 colportores · lo que tiene cada uno")).toBeInTheDocument();
  });

  it("la tabla por producto queda a un toque y se vuelve a la de colportor con otro", async () => {
    render(<StockVista datos={chico()} />);
    await userEvent.click(vista("Por producto"));
    expect(porProducto()).toBeInTheDocument();
    expect(porColportor()).not.toBeInTheDocument();
    await userEvent.click(vista("Por colportor"));
    expect(porColportor()).toBeInTheDocument();
  });

  it("dos toques seguidos en «Por producto» la dejan puesta, sin trabar nada", async () => {
    render(<StockVista datos={chico()} />);
    await act(async () => {
      fireEvent.click(vista("Por producto"));
      fireEvent.click(vista("Por producto"));
    });
    expect(porProducto()).toBeInTheDocument();
    expect(vista("Por producto")).toHaveAttribute("aria-pressed", "true");
  });

  it("cambiar de ciudad mantiene la vista elegida", async () => {
    render(<StockVista datos={chico()} />);
    await ciudad(/^Rivera/);
    expect(porColportor()).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
    await userEvent.click(vista("Por producto"));
    await ciudad(/^Artigas/);
    expect(porProducto()).toBeInTheDocument();
  });

  it("«Ver quién tiene» de un aviso pasa a «Por producto» y abre esa fila (el aviso habla de un producto)", async () => {
    const porEntregar: ExistenciaDeStock = { ...ex("l1", 1), porEntregar: 3 };
    render(<StockVista datos={chico({ colportores: [col("ana", "riv", porEntregar)] })} />);
    expect(porColportor()).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Ver quién tiene/ }));
    expect(porProducto()).toBeInTheDocument();
    expect(within(porProducto()!).getByRole("button", { name: /Libro uno/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("al volver a la vista desde otra pestaña (se monta de nuevo) abre otra vez por colportor", async () => {
    const { unmount } = render(<StockVista datos={chico()} />);
    await userEvent.click(vista("Por producto"));
    unmount();
    render(<StockVista datos={chico()} />);
    expect(porColportor()).toBeInTheDocument();
  });

  it("sin colportores o sin productos no hay tabla, solo el aviso de siempre", () => {
    const { unmount } = render(<StockVista datos={chico({ colportores: [] })} />);
    expect(porColportor()).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Todavía no hay colportores en esta campaña");
    unmount();
    render(<StockVista datos={chico({ productos: [] })} />);
    expect(screen.getByRole("status")).toHaveTextContent("todavía no tiene productos");
  });

  it("con 400 colportores abre por colportor y responde", () => {
    const muchos = Array.from({ length: 400 }, (_, i) => col(`colportor-${i}`, i % 2 ? "riv" : "art"));
    render(<StockVista datos={chico({ colportores: muchos })} />);
    expect(within(porColportor()!).getAllByRole("row").length).toBeGreaterThan(400);
  });

  it("con los datos simulados abre por colportor y la pastilla «Pedidos» lleva el número de lo que espera", () => {
    render(<StockVista datos={crearDatosDeStockSimulados()} />);
    expect(porColportor()).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Secciones de Stock" })).getByRole("link", { name: /^Pedidos/ })).toBeVisible();
  });
});
