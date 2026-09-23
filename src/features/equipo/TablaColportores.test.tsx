import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DATOS_EQUIPO_SIMULADO } from "@/datos/equipo/simulado";
import { TablaColportores } from "@/features/equipo/TablaColportores";

describe("TablaColportores", () => {
  it("renderiza una fila por colportor con sus datos principales", () => {
    render(<TablaColportores colportores={DATOS_EQUIPO_SIMULADO.colportores} />);

    const fila = screen.getByRole("row", { name: /Diego Rocha/ });
    expect(within(fila).getByText("Cerro Norte")).toBeInTheDocument();
    expect(within(fila).getByText("28,4 h")).toBeInTheDocument();
    expect(within(fila).getByText("$U 84K")).toBeInTheDocument();
    expect(within(fila).getByText("78%")).toBeInTheDocument();
    expect(within(fila).getByText("hace 20 min")).toBeInTheDocument();
    expect(within(fila).getByRole("link", { name: "Ver cuenta de Diego Rocha" })).toHaveAttribute(
      "href",
      "/cuentas",
    );
  });

  it("filtra por zona al hacer click en un chip y actualiza el contador de 'todas las zonas'", async () => {
    const user = userEvent.setup();
    render(<TablaColportores colportores={DATOS_EQUIPO_SIMULADO.colportores} />);

    expect(screen.getByRole("button", { name: "Todas las zonas · 6" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(DATOS_EQUIPO_SIMULADO.colportores.length + 1); // + encabezado

    await user.click(screen.getByRole("button", { name: "Cerro Norte · 2" }));

    expect(screen.getByRole("row", { name: /Diego Rocha/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Joel Cabrera/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Melina Vázquez/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerro Norte · 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("alerta cuando la última sincronización es vieja", () => {
    render(<TablaColportores colportores={DATOS_EQUIPO_SIMULADO.colportores} />);

    const filaVieja = screen.getByRole("row", { name: /Pablo Ferreira/ });
    expect(within(filaVieja).getByText(/hace 4 días/)).toBeInTheDocument();
    expect(within(filaVieja).getByText(/alerta: sincronización desactualizada/)).toBeInTheDocument();

    const filaNormal = screen.getByRole("row", { name: /Diego Rocha/ });
    expect(within(filaNormal).queryByText(/alerta: sincronización desactualizada/)).not.toBeInTheDocument();
  });

  it("muestra un estado vacío cuando no hay colportores", () => {
    render(<TablaColportores colportores={[]} />);
    expect(screen.getByText("No hay colportores en esta zona.")).toBeInTheDocument();
  });
});
