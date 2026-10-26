import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import type { JornadaParaAcompanar, ResultadoAcompanamiento, ResultadoJornadas } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { colportor, datosDePrueba, HOY } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";

/**
 * HU-JOR-004 en la vista 33 (seguimiento #96 de #63): «Quién lo acompañó» («Yo» u «Otro colportor» de la campaña), la
 * nota opcional de hasta 500 caracteres, el origen y la nota en el historial, el rótulo de «Días sin acompañar» según
 * `contado_desde`, el aviso de CZ011 (más de 15 días del fin de la campaña) y la nota que no se guarda sobre un
 * acompañamiento que ya estaba registrado.
 */

const J1: JornadaParaAcompanar = { id: "j1", dia: "2026-10-20", horas: 5.5, acompanante: null, acompananteEsVos: false };
const J2: JornadaParaAcompanar = { id: "j2", dia: "2026-10-19", horas: 4, acompanante: "Tomás Ibarra", acompananteEsVos: false };
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

function crearAcciones(jornadas: JornadaParaAcompanar[] = [J1, J2, J3]) {
  const jornadasParaAcompanar = vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async (): Promise<ResultadoJornadas> => ({ ok: true, jornadas }));
  const registrarAcompanamiento = vi.fn<AccionesEquipo["registrarAcompanamiento"]>(async (id, datos) =>
    ok(jornadas.find((j) => j.id === id)?.dia ?? HOY, { nota: datos?.nota ?? null }),
  );
  return { jornadasParaAcompanar, registrarAcompanamiento } satisfies AccionesEquipo;
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrir(opciones: { acciones?: ReturnType<typeof crearAcciones>; datos?: ReturnType<typeof datosDePrueba>; nombre?: string } = {}) {
  const { acciones = crearAcciones(), datos = datosDePrueba(), nombre = "Florencia Pintos" } = opciones;
  const vista = render(<EquipoVista datos={datos} acciones={acciones} />);
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
  await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
  await usuario.click(screen.getByRole("button", { name: `Registrar acompañamiento de ${nombre}` }));
  return { ...vista, acciones, usuario };
}

const panel = (nombre = "Florencia Pintos") => within(screen.getByRole("region", { name: `Registrar acompañamiento de ${nombre}` }));
const botonDe = (cuando: string, nombre = "Florencia Pintos") =>
  screen.getByRole("button", { name: `Registrar acompañamiento en la jornada de ${nombre} del ${cuando}` });
const campoNota = () => screen.getByRole("textbox", { name: "Nota (opcional)" });
const fila = (nombre: RegExp | string) => screen.getByRole("row", { name: nombre });

async function elegirOtro(usuario: Usuario, nombre: string) {
  await usuario.click(screen.getByRole("radio", { name: "Otro colportor" }));
  await usuario.selectOptions(screen.getByRole("combobox", { name: "Colportor que acompañó" }), nombre);
}

describe("«Quién lo acompañó» y la nota", () => {
  it("ofrece «Yo» (elegido) y «Otro colportor», y la nota con el aviso «Sin datos de clientes.» y su contador", async () => {
    await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    expect(screen.getByRole("group", { name: "QUIÉN LO ACOMPAÑÓ" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Yo" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Otro colportor" })).not.toBeChecked();
    expect(campoNota()).toHaveValue("");
    expect(campoNota()).toHaveAccessibleDescription(/Sin datos de clientes\..*0 de 500 caracteres/);
  });

  it("«Yo» sin nota manda solo la jornada, como antes: el servidor pone a quien tiene la sesión", async () => {
    const { acciones, usuario } = await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(botonDe("mar 20/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledWith("j1", {});
    expect(await screen.findByText("Acompañamiento registrado: jornada de Florencia Pintos, mar 20/10.")).toBeInTheDocument();
  });

  it("con una nota la manda recortada, y al guardarse el campo queda vacío para la siguiente", async () => {
    const { acciones, usuario } = await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.type(campoNota(), "  Trabajamos juntos el sector norte.  ");
    await usuario.click(botonDe("mar 20/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledWith("j1", { nota: "Trabajamos juntos el sector norte." });
    await screen.findByText(/Acompañamiento registrado/);
    expect(campoNota()).toHaveValue("");
  });

  it("«Otro colportor» ofrece a los demás de la campaña por orden alfabético, sin el dueño de la jornada, y lo manda", async () => {
    const { acciones, usuario } = await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(screen.getByRole("radio", { name: "Otro colportor" }));
    const selector = screen.getByRole("combobox", { name: "Colportor que acompañó" });
    expect(within(selector).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Elegí un colportor",
      "Emiliano Sosa",
      "Federico Da Rosa",
      "Rocío Benítez",
      "Sofía Cabral",
    ]);
    await usuario.selectOptions(selector, "Emiliano Sosa");
    await usuario.click(botonDe("mar 20/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledWith("j1", { acompananteId: "emiliano" });
  });

  it("registrado a nombre de otro: el aviso, la jornada y el historial dicen su nombre, sin «(vos)»", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-20", { acompanante: "Emiliano Sosa", nota: "Repasamos la colección." }));
    const { usuario } = await abrir({ acciones });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    await elegirOtro(usuario, "Emiliano Sosa");
    await usuario.type(campoNota(), "Repasamos la colección.");

    await usuario.click(botonDe("mar 20/10"));

    expect(await screen.findByText("Acompañamiento registrado: jornada de Florencia Pintos, mar 20/10. Acompañó Emiliano Sosa.")).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: /Jornadas terminadas/ })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Acompañó Emiliano Sosa");
    expect(items[0]).not.toHaveTextContent("(vos)");
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Florencia Pintos" }));
    const historial = within(screen.getByRole("region", { name: /Historial de acompañamientos de Florencia/ }));
    expect(historial.getByText("cargado desde el panel")).toBeInTheDocument();
    expect(historial.getByText("Repasamos la colección.")).toBeInTheDocument();
  });

  it("«Otro colportor» sin elegir a nadie no manda nada: lo dice en el campo y el foco va al selector", async () => {
    const { acciones, usuario } = await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    await usuario.click(screen.getByRole("radio", { name: "Otro colportor" }));

    await usuario.click(botonDe("mar 20/10"));

    expect(acciones.registrarAcompanamiento).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Elegí al colportor que acompañó, o cambiá a «Yo».");
    const selector = screen.getByRole("combobox", { name: "Colportor que acompañó" });
    expect(selector).toHaveFocus();
    expect(selector).toBeInvalid();
    // Elegir a alguien quita el aviso, y volver a «Yo» también.
    await usuario.selectOptions(selector, "Sofía Cabral");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si no hay otros colportores, «Otro colportor» no se puede elegir y lo dice", async () => {
    const datos = datosDePrueba({ colportores: [colportor({ id: "florencia", nombre: "Florencia Pintos" })] });
    await abrir({ datos });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    expect(screen.getByRole("radio", { name: "Otro colportor" })).toBeDisabled();
    expect(screen.getByText("No hay otros colportores en esta campaña.")).toBeInTheDocument();
  });

  it("la nota se frena en 500 caracteres, contados como letras: un texto pegado más largo se corta", async () => {
    const { usuario } = await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(campoNota());
    await usuario.paste("🙂".repeat(600));

    expect(Array.from((campoNota() as HTMLTextAreaElement).value)).toHaveLength(500);
    expect(campoNota()).toHaveAccessibleDescription(/500 de 500 caracteres/);
  });

  it("si falla a mitad de la acción, la nota y el acompañante siguen en el formulario y se puede reintentar", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockRejectedValueOnce(new Error("sin red"));
    const { usuario } = await abrir({ acciones });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    await elegirOtro(usuario, "Federico Da Rosa");
    await usuario.type(campoNota(), "Buena jornada");

    await usuario.click(botonDe("mar 20/10"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para registrar el acompañamiento.");
    expect(campoNota()).toHaveValue("Buena jornada");
    expect(screen.getByRole("combobox", { name: "Colportor que acompañó" })).toHaveValue("federico");
    expect(botonDe("mar 20/10")).toHaveAttribute("aria-disabled", "false");

    await usuario.click(botonDe("mar 20/10"));
    expect(await screen.findByText(/Acompañamiento registrado/)).toBeInTheDocument();
    expect(acciones.registrarAcompanamiento).toHaveBeenLastCalledWith("j1", { acompananteId: "federico", nota: "Buena jornada" });
  });

  it("dos jornadas seguidas llevan cada una lo que decía el formulario cuando se tocó: ninguna pisa a la otra", async () => {
    const resolvers: Record<string, (r: ResultadoAcompanamiento) => void> = {};
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockImplementation((id) => new Promise((r) => (resolvers[id] = r)));
    const { usuario } = await abrir({ acciones });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.type(campoNota(), "Primera");
    fireEvent.click(botonDe("mar 20/10"));
    await elegirOtro(usuario, "Sofía Cabral");
    await usuario.clear(campoNota());
    await usuario.type(campoNota(), "Segunda");
    fireEvent.click(botonDe("sáb 17/10"));

    expect(acciones.registrarAcompanamiento.mock.calls).toEqual([
      ["j1", { nota: "Primera" }],
      ["j3", { acompananteId: "sofia", nota: "Segunda" }],
    ]);
    await act(async () => resolvers.j3(ok("2026-10-17", { acompanante: "Sofía Cabral", nota: "Segunda" })));
    await act(async () => resolvers.j1(ok("2026-10-20", { nota: "Primera" })));
    const items = within(screen.getByRole("list", { name: /Jornadas terminadas/ })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Acompañó Mariana Pérez (vos)");
    expect(items[2]).toHaveTextContent("Acompañó Sofía Cabral");
    expect(within(fila(/^Florencia Pintos/)).getByRole("cell", { name: "2" })).toBeInTheDocument();
  });

  it("lo que se escribe después de tocar una jornada no se borra cuando contesta la primera", async () => {
    const resolvers: Record<string, (r: ResultadoAcompanamiento) => void> = {};
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockImplementation((id) => new Promise((r) => (resolvers[id] = r)));
    const { usuario } = await abrir({ acciones });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    await usuario.type(campoNota(), "Primera");
    fireEvent.click(botonDe("mar 20/10"));

    await usuario.clear(campoNota());
    await usuario.type(campoNota(), "Para la otra");
    await act(async () => resolvers.j1(ok("2026-10-20", { nota: "Primera" })));

    expect(campoNota()).toHaveValue("Para la otra");
  });

  it("volver atrás y reentrar: el panel vuelve a «Yo» y a la nota vacía", async () => {
    const { usuario } = await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    await elegirOtro(usuario, "Sofía Cabral");
    await usuario.type(campoNota(), "Algo");

    await usuario.click(panel().getByRole("button", { name: "Cerrar" }));
    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    expect(screen.getByRole("radio", { name: "Yo" })).toBeChecked();
    expect(campoNota()).toHaveValue("");
  });

  it("con 300 colportores en la campaña el selector los lista a todos", async () => {
    const muchos = Array.from({ length: 300 }, (_, i) => colportor({ id: `c${i}`, nombre: `Colportor ${String(i).padStart(3, "0")}`, ciudadId: "art" }));
    const datos = datosDePrueba({ colportores: [colportor({ id: "florencia", nombre: "Florencia Pintos" }), ...muchos] });
    const { usuario } = await abrir({ datos });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(screen.getByRole("radio", { name: "Otro colportor" }));

    expect(within(screen.getByRole("combobox", { name: "Colportor que acompañó" })).getAllByRole("option")).toHaveLength(301);
  });
});

describe("la nota sobre un acompañamiento que ya estaba registrado", () => {
  it("«ya figuraba» con una nota escrita: dice que la nota no se guardó y lo escrito queda para copiarlo, aunque no queden jornadas libres", async () => {
    const acciones = crearAcciones([J1, J2]);
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-20", { yaEstaba: true, origen: "COLPORTOR", nota: null }));
    const { usuario } = await abrir({ acciones });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    await usuario.type(campoNota(), "Trabajamos juntos");

    await usuario.click(botonDe("mar 20/10"));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(
      "Esa jornada ya figuraba a tu nombre: Florencia Pintos, mar 20/10. La nota no se guardó: un acompañamiento ya registrado no se cambia desde acá.",
    );
    // Ya no queda ninguna jornada libre, pero el campo sigue con lo escrito.
    expect(campoNota()).toHaveValue("Trabajamos juntos");
    expect(screen.getByText(/Todas sus jornadas terminadas ya figuran acompañadas/)).toBeInTheDocument();
  });

  it("«ya figuraba» sin nota no avisa de ninguna nota perdida", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-20", { yaEstaba: true, origen: "COLPORTOR" }));
    const { usuario } = await abrir({ acciones });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(botonDe("mar 20/10"));

    expect(await screen.findByText("Esa jornada ya figuraba a tu nombre: Florencia Pintos, mar 20/10.")).toBeInTheDocument();
    expect(screen.queryByText(/La nota no se guardó/)).not.toBeInTheDocument();
  });

  it("«ya figuraba» a nombre de otro colportor lo nombra, y también avisa de la nota", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-20", { yaEstaba: true, acompanante: "Sofía Cabral", origen: "COLPORTOR" }));
    const { usuario } = await abrir({ acciones });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    await elegirOtro(usuario, "Sofía Cabral");
    await usuario.type(campoNota(), "Nota");

    await usuario.click(botonDe("mar 20/10"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esa jornada ya figuraba a nombre de Sofía Cabral: Florencia Pintos, mar 20/10. La nota no se guardó",
    );
  });

  it("si la jornada ya está acompañada por todos lados no se ofrece el formulario ni la nota", async () => {
    const acciones = crearAcciones([J2]);
    await abrir({ acciones });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    expect(screen.queryByRole("textbox", { name: "Nota (opcional)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Yo" })).not.toBeInTheDocument();
    expect(screen.getByText(/Todas sus jornadas terminadas ya figuran acompañadas/)).toBeInTheDocument();
  });

  it("el origen y la nota que devuelve el servidor son los del historial, no los que se escribieron", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-20", { yaEstaba: true, origen: "COLPORTOR", nota: null }));
    const { usuario } = await abrir({ acciones });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    await usuario.type(campoNota(), "No se guarda");
    await usuario.click(botonDe("mar 20/10"));
    await screen.findByRole("alert");

    await usuario.click(screen.getByRole("button", { name: "Ver historial de Florencia Pintos" }));

    const historial = within(screen.getByRole("region", { name: /Historial de acompañamientos de Florencia/ }));
    expect(historial.getByText("lo marcó en el celular")).toBeInTheDocument();
    expect(historial.queryByText("No se guarda")).not.toBeInTheDocument();
  });
});

describe("el origen y la nota en el historial", () => {
  it("cada acompañamiento dice de dónde salió y su nota; sin dato, un guion que el lector de pantalla lee", async () => {
    const datos = datosDePrueba({
      colportores: [
        colportor({
          id: "ana",
          nombre: "Ana Prueba",
          acompanamientos: [
            { jornadaId: "a3", dia: "2026-10-12", horas: 4, acompanante: "Mariana Pérez", acompananteEsVos: true, origen: "COORDINADOR", nota: "Trabajamos juntos el sector norte de la zona." },
            { jornadaId: "a2", dia: "2026-10-05", horas: 5, acompanante: "Tomás Ibarra", acompananteEsVos: false, origen: "COLPORTOR", nota: null },
            { jornadaId: "a1", dia: "2026-09-08", horas: 5, acompanante: "Tomás Ibarra", acompananteEsVos: false, origen: null, nota: null },
          ],
        }),
      ],
    });
    render(<EquipoVista datos={datos} acciones={crearAcciones()} />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));

    await usuario.click(screen.getByRole("button", { name: "Ver historial de Ana Prueba" }));

    const filas = within(screen.getByRole("region", { name: /Historial de acompañamientos de Ana Prueba/ })).getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("Acompañó: Mariana Pérez (vos)");
    expect(filas[0]).toHaveTextContent("Origen: cargado desde el panel");
    expect(filas[0]).toHaveTextContent("Nota: Trabajamos juntos el sector norte de la zona.");
    expect(filas[1]).toHaveTextContent("Origen: lo marcó en el celular");
    expect(filas[1]).toHaveTextContent(/Nota: .*sin nota/);
    // Una jornada anterior al dato: no se inventa el origen.
    expect(filas[2]).toHaveTextContent(/Origen: .*sin dato/);
  });

  it("una nota de 500 caracteres sin espacios no rompe la fila: se corta en vez de ensanchar la tabla", async () => {
    const larga = "x".repeat(500);
    const datos = datosDePrueba({
      colportores: [
        colportor({
          id: "ana",
          nombre: "Ana Prueba",
          acompanamientos: [{ jornadaId: "a1", dia: "2026-10-12", horas: 4, acompanante: "Mariana Pérez", acompananteEsVos: true, origen: "COORDINADOR", nota: larga }],
        }),
      ],
    });
    render(<EquipoVista datos={datos} acciones={crearAcciones()} />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Ana Prueba" }));

    const nota = screen.getByText(larga);
    expect(nota.className).toContain("wrap-anywhere");
  });
});

describe("«Días sin acompañar» según desde cuándo se cuenta", () => {
  const conContadoDesde = (contadoDesde: string, hoy = HOY) =>
    datosDePrueba({ hoy, colportores: [colportor({ id: "g", nombre: "Gonzalo Méndez", contadoDesde })] });

  it("quien se sumó después del inicio: «Nunca» y «20 días desde que se sumó»", async () => {
    render(<EquipoVista datos={conContadoDesde("2026-10-01")} acciones={crearAcciones()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Acompañamientos" }));

    expect(within(fila(/^Gonzalo Méndez/)).getByText("Nunca")).toBeInTheDocument();
    expect(within(fila(/^Gonzalo Méndez/)).getByText("20 días desde que se sumó")).toBeInTheDocument();
  });

  it("quien está desde el principio: «50 días desde el inicio»", async () => {
    render(<EquipoVista datos={conContadoDesde("2026-09-01")} acciones={crearAcciones()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Acompañamientos" }));

    expect(within(fila(/^Gonzalo Méndez/)).getByText("50 días desde el inicio")).toBeInTheDocument();
  });

  it("el singular y el día 0: «1 día desde que se sumó» y «0 días desde que se sumó»", async () => {
    const { unmount } = render(<EquipoVista datos={conContadoDesde("2026-10-20")} acciones={crearAcciones()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Acompañamientos" }));
    expect(within(fila(/^Gonzalo Méndez/)).getByText("1 día desde que se sumó")).toBeInTheDocument();
    unmount();

    render(<EquipoVista datos={conContadoDesde(HOY)} acciones={crearAcciones()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Acompañamientos" }));
    expect(within(fila(/^Gonzalo Méndez/)).getByText("0 días desde que se sumó")).toBeInTheDocument();
  });

  it("la lista se ordena por lo que de verdad pasó: quien se sumó hace poco va después", async () => {
    const datos = datosDePrueba({
      colportores: [
        colportor({ id: "nuevo", nombre: "Aaa Nuevo", contadoDesde: "2026-10-15" }),
        colportor({ id: "viejo", nombre: "Zzz Viejo", contadoDesde: "2026-09-01" }),
      ],
    });
    render(<EquipoVista datos={datos} acciones={crearAcciones()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Acompañamientos" }));

    const nombres = within(screen.getByRole("table")).getAllByRole("rowheader").map((c) => c.textContent);
    expect(nombres).toEqual(["Zzz Viejo", "Aaa Nuevo"]);
  });
});

describe("pasaron más de 15 días del fin de la campaña (CZ011)", () => {
  async function conFin(campaniaFin: string) {
    const acciones = crearAcciones();
    const vista = await abrir({ acciones, datos: datosDePrueba({ campaniaFin }) });
    return { ...vista, acciones };
  }

  it("el día 16 no se registra nada: lo dice, no pide las jornadas y se puede cerrar", async () => {
    const { acciones, usuario } = await conFin("2026-10-05");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "La campaña terminó hace más de 15 días y sus acompañamientos quedan como están. Elegí una campaña en curso o que haya terminado hace 15 días o menos.",
    );
    expect(acciones.jornadasParaAcompanar).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Nota (opcional)" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "REGISTRAR ACOMPAÑAMIENTO · FLORENCIA PINTOS" })).toHaveFocus();

    await usuario.click(panel().getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("region", { name: /Registrar acompañamiento de/ })).not.toBeInTheDocument();
  });

  it("el día 15 todavía se registra", async () => {
    const { acciones } = await conFin("2026-10-06");

    expect(await screen.findByRole("list", { name: /Jornadas terminadas/ })).toBeInTheDocument();
    expect(acciones.jornadasParaAcompanar).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/terminó hace más de 15 días/)).not.toBeInTheDocument();
  });

  it("una campaña sin fecha de fin nunca vence", async () => {
    const acciones = crearAcciones();
    await abrir({ acciones, datos: datosDePrueba({ campaniaFin: null }) });

    expect(await screen.findByRole("list", { name: /Jornadas terminadas/ })).toBeInTheDocument();
  });

  it("si el servidor la rechaza igual (CZ011), el texto de la base se ve en la jornada y el botón vuelve a habilitarse", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce({
      ok: false,
      mensaje: "La campaña terminó hace más de 15 días y sus acompañamientos quedan como están.",
    });
    const { usuario } = await abrir({ acciones });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(botonDe("mar 20/10"));

    expect(await screen.findByRole("alert")).toHaveTextContent("La campaña terminó hace más de 15 días");
    expect(botonDe("mar 20/10")).toHaveAttribute("aria-disabled", "false");
  });
});

describe("accesibilidad del registro", () => {
  it("axe A/AA sin violaciones con «Otro colportor», la nota escrita y el aviso de la nota no guardada", async () => {
    vi.setConfig({ testTimeout: 60_000 });
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-20", { yaEstaba: true, origen: "COLPORTOR" }));
    const { usuario, container } = await abrir({ acciones });
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    await elegirOtro(usuario, "Emiliano Sosa");
    await usuario.type(campoNota(), "Una nota");
    await usuario.click(botonDe("mar 20/10"));
    await screen.findByRole("alert");

    const r = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
    });

    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
