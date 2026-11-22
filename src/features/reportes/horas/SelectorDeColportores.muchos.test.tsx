import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { SelectorDeColportores, type OpcionDeColportor } from "./SelectorDeColportores";

/**
 * Issue #192: el selector de colportores de Reportes con más de 25 opciones. Es una lista con casillas y un buscador, sin
 * páginas: están todas, agrupadas por ciudad, y el buscador acota sin perder la elección.
 */

const OPCIONES: OpcionDeColportor[] = Array.from({ length: 40 }, (_, i) => ({
  id: `c-${i}`,
  nombre: `Colportor ${String(i).padStart(2, "0")}`,
  ciudad: i < 25 ? "Rivera" : "Salto",
}));

function Montado() {
  const [elegidos, setElegidos] = useState<string[]>([]);
  return <SelectorDeColportores opciones={OPCIONES} elegidos={elegidos} alCambiar={setElegidos} />;
}

describe("SelectorDeColportores · 40 colportores", () => {
  it("abre con las 40 casillas en sus ciudades y dice «Todos (40)»", async () => {
    render(<Montado />);
    expect(screen.getByRole("button", { name: /Colportores:/ })).toHaveTextContent("Todos (40)");
    await userEvent.click(screen.getByRole("button", { name: /Colportores:/ }));

    const panel = screen.getByRole("group", { name: "Elegir colportores" });
    expect(within(panel).getAllByRole("checkbox")).toHaveLength(40);
    expect(within(within(panel).getByRole("group", { name: "Rivera" })).getAllByRole("checkbox")).toHaveLength(25);
    expect(within(within(panel).getByRole("group", { name: "Salto" })).getAllByRole("checkbox")).toHaveLength(15);
    expect(within(panel).getByText("40 de 40 elegidos")).toBeInTheDocument();
  });

  it("buscar acota la lista; la elección sigue contando sobre las 40", async () => {
    render(<Montado />);
    await userEvent.click(screen.getByRole("button", { name: /Colportores:/ }));
    const panel = screen.getByRole("group", { name: "Elegir colportores" });

    await userEvent.type(within(panel).getByRole("searchbox"), "Colportor 3");
    // 30 a 39.
    expect(within(panel).getAllByRole("checkbox")).toHaveLength(10);

    // Con todos marcados, desmarcar uno deja 39 y el resumen lo dice sin importar el filtro.
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Colportor 35" }));
    expect(within(panel).getByText("39 de 40 elegidos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Colportores:/ })).toHaveTextContent("39 de 40");

    await userEvent.clear(within(panel).getByRole("searchbox"));
    expect(within(panel).getAllByRole("checkbox")).toHaveLength(40);
    expect(within(panel).getByRole("checkbox", { name: "Colportor 35" })).not.toBeChecked();
  });

  it("una búsqueda sin resultados lo dice y «Todos» vuelve a la lista completa", async () => {
    render(<Montado />);
    await userEvent.click(screen.getByRole("button", { name: /Colportores:/ }));
    const panel = screen.getByRole("group", { name: "Elegir colportores" });

    await userEvent.type(within(panel).getByRole("searchbox"), "zzz");
    expect(within(panel).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(panel).getByText(/Ningún colportor se llama así/)).toBeInTheDocument();

    await userEvent.clear(within(panel).getByRole("searchbox"));
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Colportor 00" }));
    expect(screen.getByRole("button", { name: /Colportores:/ })).toHaveTextContent("39 de 40");
    await userEvent.click(within(panel).getByRole("button", { name: "Todos" }));
    expect(screen.getByRole("button", { name: /Colportores:/ })).toHaveTextContent("Todos (40)");
  });
});
