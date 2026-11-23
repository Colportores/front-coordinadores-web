import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";

import { PedidosVista } from "./PedidosVista";
import { hrefPedidos, hrefTransferencias, pestanaDeUrl } from "./preseleccion";

// «Ver pedidos» y «Ver transferencias» de la vista 34 (#91): la vista 35 abre en esa ciudad y en esa pestaña.

const AHORA = new Date("2026-10-22T18:00:00-03:00");
const acciones = { decidir: vi.fn() };

describe("enlaces desde Stock", () => {
  it("«Ver pedidos» lleva la ciudad; sin ciudad, la vista abre como siempre", () => {
    expect(hrefPedidos("rivera")).toBe("/stock/pedidos?ciudad=rivera");
    expect(hrefPedidos("bella unión/1")).toBe("/stock/pedidos?ciudad=bella%20uni%C3%B3n%2F1");
    expect(hrefPedidos(null)).toBe("/stock/pedidos");
    expect(hrefPedidos()).toBe("/stock/pedidos");
  });

  it("«Ver transferencias» pide la pestaña; cualquier otro valor no cambia nada", () => {
    expect(hrefTransferencias()).toBe("/stock/pedidos?pestana=transferencias");
    expect(pestanaDeUrl("transferencias")).toBe("TRF");
    for (const otro of [null, "", "TRF", "autorizados", "<script>"]) expect(pestanaDeUrl(otro)).toBeNull();
  });
});

describe("la vista 35 abierta desde Stock", () => {
  it("con la ciudad pedida abre en ella", () => {
    render(<PedidosVista datos={crearDatosDePedidosSimulados(AHORA)} acciones={acciones} ciudadInicialId="artigas" />);
    expect(screen.getByRole("heading", { level: 2, name: "Artigas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Por autorizar/ })).toHaveAttribute("aria-selected", "true");
  });

  it("con una ciudad que no existe abre en todas, sin romperse", () => {
    render(<PedidosVista datos={crearDatosDePedidosSimulados(AHORA)} acciones={acciones} ciudadInicialId="fantasma" />);
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
  });

  it("con la pestaña «Transferencias» abre en ella", () => {
    render(<PedidosVista datos={crearDatosDePedidosSimulados(AHORA)} acciones={acciones} pestanaInicial="TRF" />);
    expect(screen.getByRole("tab", { name: /^Transferencias/ })).toHaveAttribute("aria-selected", "true");
  });

  it("sin nada pedido, como siempre", () => {
    render(<PedidosVista datos={crearDatosDePedidosSimulados(AHORA)} acciones={acciones} />);
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
  });
});
