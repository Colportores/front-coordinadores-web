import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { DatosAcompanamiento } from "@/datos/equipo/contrato";
import { DATOS_EQUIPO_SIMULADO } from "@/datos/equipo/simulado";
import { Acompanamientos } from "@/features/equipo/Acompanamientos";

const DATOS = DATOS_EQUIPO_SIMULADO.acompanamiento;

function sinDatos(cambios: Partial<DatosAcompanamiento>): DatosAcompanamiento {
  return { ...DATOS, ...cambios };
}

describe("Acompanamientos", () => {
  it("muestra los últimos acompañamientos con colportor, día y quién acompañó, y el % de la campaña", () => {
    render(<Acompanamientos datos={DATOS} />);

    const ultimos = within(screen.getByRole("list", { name: "Últimos acompañamientos" }));
    expect(ultimos.getAllByRole("listitem")).toHaveLength(3);
    expect(ultimos.getByText("Melina Vázquez · ayer")).toBeInTheDocument();
    expect(ultimos.getAllByText("Acompañó Coordinador de ejemplo")).toHaveLength(3);
    expect(screen.getByText("Jornadas acompañadas esta campaña")).toBeInTheDocument();
    expect(screen.getByText("21%")).toBeInTheDocument();
  });

  it("no lista las jornadas sin acompañar: solo aparecen al abrir el selector", () => {
    render(<Acompanamientos datos={DATOS} />);

    expect(screen.queryByText(/sin acompañamiento registrado/)).not.toBeInTheDocument();
    expect(screen.queryByText("Joel Cabrera · ayer")).not.toBeInTheDocument();
  });

  it("muestra un estado vacío cuando todavía no hay acompañamientos", () => {
    render(<Acompanamientos datos={sinDatos({ ultimosAcompanamientos: [], porcentajeJornadasAcompanadas: 0 })} />);

    expect(screen.getByText("Todavía no hay acompañamientos registrados.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Últimos acompañamientos" })).not.toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("«Registrar acompañamiento» abre un selector con las últimas jornadas del equipo", async () => {
    const user = userEvent.setup();
    render(<Acompanamientos datos={DATOS} />);

    await user.click(screen.getByRole("button", { name: "Registrar acompañamiento" }));

    const selector = within(screen.getByRole("group", { name: "Elegir la jornada a acompañar" }));
    expect(selector.getAllByRole("button", { name: /^Elegir jornada de/ })).toHaveLength(3);
    expect(selector.getByText("3,4 h · Cerro Norte")).toBeInTheDocument();
  });

  it("al elegir una jornada queda registrada arriba de todo, con aviso, y sale del selector", async () => {
    const user = userEvent.setup();
    render(<Acompanamientos datos={DATOS} />);

    await user.click(screen.getByRole("button", { name: "Registrar acompañamiento" }));
    await user.click(screen.getByRole("button", { name: "Elegir jornada de Joel Cabrera · ayer" }));

    expect(screen.getByRole("status")).toHaveTextContent("Acompañamiento registrado: jornada de Joel Cabrera · ayer.");
    expect(screen.queryByRole("group", { name: "Elegir la jornada a acompañar" })).not.toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Últimos acompañamientos" })).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Joel Cabrera · ayer");
    expect(items[0]).toHaveTextContent("Acompañó Coordinador de ejemplo");

    // La jornada ya registrada no se puede volver a elegir.
    await user.click(screen.getByRole("button", { name: "Registrar acompañamiento" }));
    expect(screen.queryByRole("button", { name: "Elegir jornada de Joel Cabrera · ayer" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Elegir jornada de/ })).toHaveLength(2);
  });

  it("doble toque sobre la misma jornada: se registra una sola vez", () => {
    render(<Acompanamientos datos={DATOS} />);

    fireEvent.click(screen.getByRole("button", { name: "Registrar acompañamiento" }));
    const jornada = screen.getByRole("button", { name: "Elegir jornada de Laura Suárez · ayer" });
    fireEvent.click(jornada);
    fireEvent.click(jornada);

    const items = within(screen.getByRole("list", { name: "Últimos acompañamientos" })).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(screen.getAllByText("Laura Suárez · ayer")).toHaveLength(1);
  });

  it("dos registros seguidos se conservan los dos", async () => {
    const user = userEvent.setup();
    render(<Acompanamientos datos={DATOS} />);

    await user.click(screen.getByRole("button", { name: "Registrar acompañamiento" }));
    await user.click(screen.getByRole("button", { name: "Elegir jornada de Joel Cabrera · ayer" }));
    await user.click(screen.getByRole("button", { name: "Registrar acompañamiento" }));
    await user.click(screen.getByRole("button", { name: "Elegir jornada de Pablo Ferreira · lun 28/09" }));

    const items = within(screen.getByRole("list", { name: "Últimos acompañamientos" })).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("Pablo Ferreira");
    expect(items[1]).toHaveTextContent("Joel Cabrera");
  });

  it("cancelar cierra el selector sin registrar nada", async () => {
    const user = userEvent.setup();
    render(<Acompanamientos datos={DATOS} />);

    await user.click(screen.getByRole("button", { name: "Registrar acompañamiento" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("group", { name: "Elegir la jornada a acompañar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Últimos acompañamientos" })).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Registrar acompañamiento" })).toBeInTheDocument();
  });

  it("sin jornadas recientes el selector lo avisa y se puede cancelar", async () => {
    const user = userEvent.setup();
    render(<Acompanamientos datos={sinDatos({ jornadasRecientes: [] })} />);

    await user.click(screen.getByRole("button", { name: "Registrar acompañamiento" }));

    expect(screen.getByText("No hay jornadas recientes para registrar.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("No hay jornadas recientes para registrar.")).not.toBeInTheDocument();
  });

  it("vuelve a abrir el selector después de un aviso y lo limpia", async () => {
    const user = userEvent.setup();
    render(<Acompanamientos datos={DATOS} />);

    await user.click(screen.getByRole("button", { name: "Registrar acompañamiento" }));
    await user.click(screen.getByRole("button", { name: "Elegir jornada de Joel Cabrera · ayer" }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Registrar acompañamiento" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
