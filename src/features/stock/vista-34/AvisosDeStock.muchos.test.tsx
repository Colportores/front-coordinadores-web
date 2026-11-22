import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AvisosDeStock } from "./AvisosDeStock";
import type { AvisoDeStock } from "./modelo";

/**
 * Issue #192: la franja de avisos de stock con más de 25 avisos. La franja tiene un alto tope y desplaza: no se pierde
 * ningún aviso y cada botón nombra a su producto y su ciudad.
 */

const AVISOS: AvisoDeStock[] = Array.from({ length: 30 }, (_, i) => ({
  clave: `aviso-${i}`,
  ciudadId: `ciudad-${i}`,
  ciudadNombre: `Ciudad ${i}`,
  nombraCiudad: true,
  unidadClave: `unidad-${i}`,
  tipo: i % 2 === 0 ? "agotado" : "faltan",
  negrita: `Producto ${i}`,
  texto: i % 2 === 0 ? "se agotó" : "no alcanza para lo que hay por entregar",
  boton: i % 2 === 0 ? "Ver pedidos" : "Ver quién tiene",
}));

describe("AvisosDeStock · 30 avisos", () => {
  it("están todos, con el botón que corresponde y su producto y ciudad en el nombre", () => {
    render(<AvisosDeStock avisos={AVISOS} alVerQuienTiene={() => {}} />);
    const lista = screen.getByRole("list", { name: "Avisos de stock" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(30);
    expect(within(lista).getAllByRole("link", { name: /^Ver pedidos de Producto \d+ en Ciudad \d+$/ })).toHaveLength(15);
    expect(within(lista).getAllByRole("button", { name: /^Ver quién tiene Producto \d+ en Ciudad \d+$/ })).toHaveLength(15);
    expect(lista).toHaveClass("overflow-auto");
  });

  it("el botón de cada aviso responde por su aviso, también el último", async () => {
    const alVerQuienTiene = vi.fn();
    render(<AvisosDeStock avisos={AVISOS} alVerQuienTiene={alVerQuienTiene} />);
    await userEvent.click(screen.getByRole("button", { name: "Ver quién tiene Producto 29 en Ciudad 29" }));
    expect(alVerQuienTiene).toHaveBeenCalledTimes(1);
    expect(alVerQuienTiene).toHaveBeenCalledWith(AVISOS[29]);
  });
});
