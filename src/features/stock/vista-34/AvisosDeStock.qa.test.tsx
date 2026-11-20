import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AvisosDeStock } from "./AvisosDeStock";
import type { AvisoDeStock } from "./modelo";

/**
 * QA de #192 (PR #193): la franja de avisos de Stock tiene un alto tope (148 px) y con muchos avisos desplaza sin decir
 * cuántos hay. «Decisión del orquestador (19/11)», P4: la franja lleva el título «1 aviso» / «N avisos», con la región
 * desplazable enfocable y anunciada al lector, y se hace en #193 antes del merge.
 */

const aviso = (i: number): AvisoDeStock => ({
  clave: `aviso-${i}`,
  ciudadId: `ciudad-${i}`,
  ciudadNombre: `Ciudad ${i}`,
  nombraCiudad: true,
  unidadClave: `unidad-${i}`,
  tipo: "agotado",
  negrita: `Producto ${i}`,
  texto: "se agotó",
  boton: "Ver pedidos",
});

const avisos = (n: number) => Array.from({ length: n }, (_, i) => aviso(i));

describe("AvisosDeStock · cuenta de avisos (decisión P4)", () => {
  it.skip("QA #192: con 30 avisos la franja dice «30 avisos» (hoy desplaza sin decir cuántos hay)", () => {
    render(<AvisosDeStock avisos={avisos(30)} alVerQuienTiene={() => {}} />);
    expect(screen.getByText("30 avisos")).toBeInTheDocument();
  });

  it.skip("QA #192: con un solo aviso el título va en singular, «1 aviso»", () => {
    render(<AvisosDeStock avisos={avisos(1)} alVerQuienTiene={() => {}} />);
    expect(screen.getByText("1 aviso")).toBeInTheDocument();
    expect(screen.queryByText("1 avisos")).not.toBeInTheDocument();
  });

  it.skip("QA #192: la región desplazable es enfocable con teclado y su nombre accesible lleva la cuenta", () => {
    render(<AvisosDeStock avisos={avisos(30)} alVerQuienTiene={() => {}} />);
    const region = screen.getByRole("list", { name: /30 avisos/ });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("sin avisos no se pinta nada (ni título ni franja vacía)", () => {
    const { container } = render(<AvisosDeStock avisos={[]} alVerQuienTiene={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("con muchos avisos siguen estando todos y la lista conserva su nombre «Avisos de stock»", () => {
    render(<AvisosDeStock avisos={avisos(150)} alVerQuienTiene={() => {}} />);
    const lista = screen.getByRole("list", { name: /Avisos de stock/ });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(150);
  });
});
