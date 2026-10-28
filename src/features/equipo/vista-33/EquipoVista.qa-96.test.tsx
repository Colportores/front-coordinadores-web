import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { JornadaParaAcompanar, ResultadoAcompanamiento, ResultadoJornadas } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { datosDePrueba, HOY } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";

/**
 * QA #96 (PR #97), vista 33 · HU-JOR-004. Casos límite que no estaban cubiertos por los tests del implementador:
 * nota de solo espacios, «ya figuraba» con espacios, cerrar el panel con un registro en vuelo, el foco al cerrar, el
 * texto de la base (22023) sin perder lo escrito y el grupo «Quién lo acompañó» para el lector de pantalla.
 */

const J1: JornadaParaAcompanar = { id: "j1", dia: "2026-10-20", horas: 5.5, acompanante: null, acompananteEsVos: false };
const J3: JornadaParaAcompanar = { id: "j3", dia: "2026-10-17", horas: 3.2, acompanante: null, acompananteEsVos: false };

const ok = (dia: string, resto: Partial<Extract<ResultadoAcompanamiento, { ok: true }>> = {}): ResultadoAcompanamiento => ({
  ok: true,
  dia,
  acompanante: "Mariana Pérez",
  yaEstaba: false,
  origen: "COORDINADOR",
  nota: null,
  ...resto,
});

function crearAcciones(jornadas: JornadaParaAcompanar[] = [J1, J3]) {
  const jornadasParaAcompanar = vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async (): Promise<ResultadoJornadas> => ({ ok: true, jornadas }));
  const registrarAcompanamiento = vi.fn<AccionesEquipo["registrarAcompanamiento"]>(async (id, datos) =>
    ok(jornadas.find((j) => j.id === id)?.dia ?? HOY, { nota: datos?.nota ?? null }),
  );
  const elegirCarrera = vi.fn<AccionesEquipo["elegirCarrera"]>(async () => ({ ok: false, mensaje: "No en este test." }));
  const asignarTipoDeBeca = vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(async () => ({ ok: false, mensaje: "No en este test." }));
  return { jornadasParaAcompanar, registrarAcompanamiento, elegirCarrera, asignarTipoDeBeca } satisfies AccionesEquipo;
}

async function abrir(acciones = crearAcciones(), nombre = "Florencia Pintos") {
  const vista = render(<EquipoVista datos={datosDePrueba()} acciones={acciones} />);
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
  await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
  await usuario.click(screen.getByRole("button", { name: `Registrar acompañamiento de ${nombre}` }));
  await screen.findByRole("list", { name: /Jornadas terminadas/ });
  return { ...vista, acciones, usuario };
}

const botonDe = (cuando: string, nombre = "Florencia Pintos") =>
  screen.getByRole("button", { name: `Registrar acompañamiento en la jornada de ${nombre} del ${cuando}` });
const campoNota = () => screen.getByRole("textbox", { name: "Nota (opcional)" });

describe("QA #96 · nota con solo espacios", () => {
  it("una nota de solo espacios no se manda, el campo queda vacío al registrar y el contador vuelve a 0", async () => {
    const { usuario, acciones } = await abrir();
    await usuario.type(campoNota(), "     ");
    await usuario.click(botonDe("mar 20/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledWith("j1", {});
    expect(campoNota()).toHaveValue("");
    expect(screen.getByText("0 de 500 caracteres")).toBeInTheDocument();
  });

  it("«ya figuraba» con una nota de solo espacios no avisa de una nota perdida", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-20", { yaEstaba: true, origen: "COLPORTOR" }));
    const { usuario } = await abrir(acciones);
    await usuario.type(campoNota(), "   ");
    await usuario.click(botonDe("mar 20/10"));

    const aviso = await screen.findByText(/Esa jornada ya figuraba a tu nombre/);
    expect(aviso).toHaveTextContent("Esa jornada ya figuraba a tu nombre: Florencia Pintos, mar 20/10.");
    expect(aviso).not.toHaveTextContent("La nota no se guardó");
  });
});

describe("QA #96 · texto de la base sin perder lo escrito", () => {
  it("22023 (nota demasiado larga para el servidor): el texto de la base sale en la jornada, la nota y «Otro colportor» siguen y se puede reintentar", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce({ ok: false, mensaje: "La nota admite hasta 280 caracteres y esta tiene 400. Acortala; no pongas datos de clientes." });
    const { usuario } = await abrir(acciones);
    await usuario.click(screen.getByRole("radio", { name: "Otro colportor" }));
    await usuario.selectOptions(screen.getByRole("combobox", { name: "Colportor que acompañó" }), "Sofía Cabral");
    await usuario.click(campoNota());
    await usuario.paste("x".repeat(400));
    await usuario.click(botonDe("mar 20/10"));

    expect(await screen.findByRole("alert")).toHaveTextContent("La nota admite hasta 280 caracteres");
    expect(campoNota()).toHaveValue("x".repeat(400));
    expect(screen.getByRole("combobox", { name: "Colportor que acompañó" })).toHaveValue("sofia");
    expect(botonDe("mar 20/10")).toHaveAttribute("aria-disabled", "false");

    await usuario.click(botonDe("mar 20/10"));
    expect(acciones.registrarAcompanamiento).toHaveBeenCalledTimes(2);
  });
});

describe("QA #96 · cerrar el panel", () => {
  it("cerrar con un registro en vuelo no lo pierde: al contestar, la fila suma el acompañamiento y el historial lo muestra", async () => {
    let resolver: (r: ResultadoAcompanamiento) => void = () => {};
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockImplementation(() => new Promise((r) => (resolver = r)));
    const { usuario } = await abrir(acciones);
    await usuario.type(campoNota(), "Una nota");
    await usuario.click(botonDe("mar 20/10"));
    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("region", { name: /Registrar acompañamiento de/ })).not.toBeInTheDocument();

    await act(async () => resolver(ok("2026-10-20", { nota: "Una nota" })));

    expect(within(screen.getByRole("row", { name: /^Florencia Pintos/ })).getByRole("cell", { name: "1" })).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Florencia Pintos" }));
    const historial = screen.getByRole("region", { name: "Historial de acompañamientos de Florencia Pintos" });
    expect(historial).toHaveTextContent("Una nota");
    expect(historial).toHaveTextContent("cargado desde el panel");
  });

  it("al cerrar, el foco vuelve al botón «Registrar acompañamiento» de esa fila", async () => {
    const { usuario } = await abrir();
    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" })).toHaveFocus();
  });
});

describe("QA #96 · lector de pantalla", () => {
  it("«Yo» y «Otro colportor» forman un grupo con nombre «QUIÉN LO ACOMPAÑÓ» y las jornadas son una lista con nombre", async () => {
    await abrir();
    const grupo = screen.getByRole("group", { name: /QUIÉN LO ACOMPAÑÓ/ });
    expect(within(grupo).getByRole("radio", { name: "Yo" })).toBeChecked();
    expect(within(grupo).getByRole("radio", { name: "Otro colportor" })).not.toBeChecked();
    expect(screen.getByRole("list", { name: "Jornadas terminadas de Florencia Pintos" })).toBeInTheDocument();
  });
});
