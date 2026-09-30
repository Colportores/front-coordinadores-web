import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DATOS_EQUIPO_SIMULADO } from "@/datos/equipo/simulado";
import { TablaColportores } from "@/features/equipo/TablaColportores";
import { fijarFlags } from "@/test/flags";

describe("TablaColportores", () => {
  it("renderiza una fila por colportor con sus datos principales", () => {
    fijarFlags({ modoDev: true });
    render(<TablaColportores colportores={DATOS_EQUIPO_SIMULADO.colportores} />);

    const fila = screen.getByRole("row", { name: /Diego Rocha/ });
    expect(within(fila).getByText("Montevideo")).toBeInTheDocument();
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

  it("no muestra el acceso a la cuenta cuando la pestaña Cuentas está oculta (staging y producción)", () => {
    fijarFlags({ modoDev: false });
    render(<TablaColportores colportores={DATOS_EQUIPO_SIMULADO.colportores} />);

    expect(screen.queryByRole("link", { name: "Ver cuenta de Diego Rocha" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cuenta")).not.toBeInTheDocument();
  });

  it("tiene las columnas Ciudad y Zonas, y ya no la columna Zona", () => {
    render(<TablaColportores colportores={DATOS_EQUIPO_SIMULADO.colportores} />);

    expect(screen.getByRole("columnheader", { name: "Ciudad" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Zonas" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Zona" })).not.toBeInTheDocument();
  });

  it("muestra todas las zonas del colportor, o «Sin asignar» si no tiene", () => {
    render(<TablaColportores colportores={DATOS_EQUIPO_SIMULADO.colportores} />);

    expect(within(screen.getByRole("row", { name: /Noelia Acosta/ })).getByText("La Teja, Paso de la Arena")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Laura Suárez/ })).getByText("Sin asignar")).toBeInTheDocument();
  });

  it("filtra por ciudad al hacer click en un chip y actualiza el contador de 'todas las ciudades'", async () => {
    const user = userEvent.setup();
    render(<TablaColportores colportores={DATOS_EQUIPO_SIMULADO.colportores} />);

    expect(screen.getByRole("group", { name: "Filtrar equipo por ciudad" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Todas las ciudades · 6" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(DATOS_EQUIPO_SIMULADO.colportores.length + 1); // + encabezado

    await user.click(screen.getByRole("button", { name: "Las Piedras · 1" }));

    expect(screen.getByRole("row", { name: /Laura Suárez/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Diego Rocha/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Las Piedras · 1" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Montevideo · 5" }));
    expect(screen.getByRole("row", { name: /Diego Rocha/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Laura Suárez/ })).not.toBeInTheDocument();
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
    expect(screen.getByText("No hay colportores en esta ciudad.")).toBeInTheDocument();
  });
});
