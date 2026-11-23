import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import type { AcompanamientoDeColportor, JornadaParaAcompanar, ResultadoAcompanamiento, ResultadoJornadas } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { colportor, datosDePrueba, HOY } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";
import { acompanantesDeJornada, conAcompananteSumado } from "./modelo";

/**
 * «Sumar otro acompañante» (front-coordinadores-web#164, HU-JOR-004 con la 0177): Luis abre el registro de Ana, ve una jornada
 * que ya tiene a Daniel y le suma a Marta, coordinadora de otra campaña. La jornada muestra a los dos, el historial una fila
 * por cada uno, la jornada cuenta una sola vez, y nadie pisa a nadie. Lo que el canvas 33 no dibuja (un hueco chico de diseño,
 * decisión del 11/11) sale con los componentes de la vista: el botón «Sumar otro acompañante» en la fila de la jornada.
 */

const DANIEL = "Daniel Rey";
const MARTA = "Marta Gómez";
const LUIS = "Luis Vega";

const LIBRE: JornadaParaAcompanar = { id: "j1", dia: "2026-10-20", horas: 5.5, acompanante: null, acompananteEsVos: false };
const CON_DANIEL: JornadaParaAcompanar = {
  id: "j2",
  dia: "2026-10-19",
  horas: 4,
  acompanante: DANIEL,
  acompananteEsVos: false,
  acompanantes: [{ nombre: DANIEL, esVos: false }],
};
const OTRA_CON_DANIEL: JornadaParaAcompanar = { ...CON_DANIEL, id: "j3", dia: "2026-10-17", horas: 3.2 };

const DEL_PANEL = [
  { id: "marta", nombre: MARTA },
  { id: "luis", nombre: LUIS },
];

const ok = (dia: string, resto: Partial<Extract<ResultadoAcompanamiento, { ok: true }>> = {}): ResultadoAcompanamiento => ({
  ok: true,
  dia,
  acompanante: MARTA,
  yaEstaba: false,
  origen: "COORDINADOR",
  nota: null,
  ...resto,
});

/** El historial que ya trae la vista: Daniel en las jornadas j2 y j3 (lo marcó el colportor desde el celular). */
function historialDe(...jornadas: JornadaParaAcompanar[]): AcompanamientoDeColportor[] {
  return jornadas
    .filter((j) => j.acompanante !== null)
    .map((j) => ({ jornadaId: j.id, dia: j.dia, horas: j.horas, acompanante: DANIEL, acompananteEsVos: false, origen: "COLPORTOR", nota: null }));
}

function crearAcciones(jornadas: JornadaParaAcompanar[] = [LIBRE, CON_DANIEL]) {
  const jornadasParaAcompanar = vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async (): Promise<ResultadoJornadas> => ({ ok: true, jornadas }));
  const registrarAcompanamiento = vi.fn<AccionesEquipo["registrarAcompanamiento"]>(async (id) => ok(jornadas.find((j) => j.id === id)?.dia ?? HOY));
  const acompanantesDelPanel = vi.fn<NonNullable<AccionesEquipo["acompanantesDelPanel"]>>(async () => ({ ok: true, acompanantes: DEL_PANEL }));
  const elegirCarrera = vi.fn<AccionesEquipo["elegirCarrera"]>(async () => ({ ok: false, mensaje: "No en este test." }));
  const asignarTipoDeBeca = vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(async () => ({ ok: false, mensaje: "No en este test." }));
  return { jornadasParaAcompanar, registrarAcompanamiento, acompanantesDelPanel, elegirCarrera, asignarTipoDeBeca } satisfies AccionesEquipo;
}

async function abrir(opciones: { acciones?: ReturnType<typeof crearAcciones>; jornadas?: JornadaParaAcompanar[]; nombreLargo?: string } = {}) {
  const { jornadas = [LIBRE, CON_DANIEL], acciones = crearAcciones(jornadas), nombreLargo = "Ana López" } = opciones;
  const datos = datosDePrueba({
    colportores: [
      colportor({ id: "ana", nombre: nombreLargo, ciudadId: "riv", acompanamientos: historialDe(...jornadas) }),
      colportor({ id: "emiliano", nombre: "Emiliano Sosa", ciudadId: "riv" }),
    ],
  });
  const vista = render(<EquipoVista datos={datos} acciones={acciones} />);
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
  await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
  await usuario.click(screen.getByRole("button", { name: `Registrar acompañamiento de ${nombreLargo}` }));
  await screen.findByRole("list", { name: /Jornadas terminadas/ });
  return { ...vista, acciones, usuario, nombre: nombreLargo };
}

const botonSumar = (cuando: string, nombre = "Ana López") => screen.getByRole("button", { name: `Sumar otro acompañante en la jornada de ${nombre} del ${cuando}` });
const botonRegistrar = (cuando: string, nombre = "Ana López") => screen.getByRole("button", { name: `Registrar acompañamiento en la jornada de ${nombre} del ${cuando}` });
const itemDe = (cuando: string) => within(screen.getByRole("list", { name: /Jornadas terminadas/ })).getAllByRole("listitem").find((li) => li.textContent?.includes(cuando)) as HTMLElement;
const campoNota = () => screen.getByRole("textbox", { name: "Nota (opcional)" });

async function elegir(usuario: ReturnType<typeof userEvent.setup>, nombre: string) {
  await usuario.click(screen.getByRole("radio", { name: "Otra persona" }));
  await usuario.selectOptions(screen.getByRole("combobox", { name: "Quién acompañó" }), nombre);
}

describe("la jornada que ya tiene acompañante ofrece sumar otro", () => {
  it("la libre sigue con «Registrar»; la acompañada dice quién y ofrece «Sumar otro acompañante»", async () => {
    await abrir();

    expect(botonRegistrar("mar 20/10")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sumar otro acompañante en la jornada de Ana López del mar 20\/10/ })).not.toBeInTheDocument();
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañó ${DANIEL}`);
    expect(botonSumar("lun 19/10")).toHaveTextContent("Sumar otro acompañante");
    expect(screen.queryByRole("button", { name: /Registrar acompañamiento en la jornada de Ana López del lun 19\/10/ })).not.toBeInTheDocument();
  });

  it("la etiqueta accesible contiene el texto visible del botón (WCAG 2.5.3)", async () => {
    await abrir();

    expect(botonSumar("lun 19/10").getAttribute("aria-label")).toContain(botonSumar("lun 19/10").textContent);
  });

  it("una jornada con dos acompañantes los nombra a los dos (con «(vos)» donde corresponde) y todavía admite sumar uno más", async () => {
    const dos: JornadaParaAcompanar = {
      ...CON_DANIEL,
      acompanante: `${DANIEL} y Mariana Pérez (vos)`,
      acompananteEsVos: false,
      acompanantes: [
        { nombre: DANIEL, esVos: false },
        { nombre: "Mariana Pérez", esVos: true },
      ],
    };
    await abrir({ jornadas: [LIBRE, dos] });

    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañaron ${DANIEL} y Mariana Pérez (vos)`);
    expect(botonSumar("lun 19/10")).toBeInTheDocument();
  });

  it("sin la lista (una fuente que no separa) se lee el único nombre de siempre", async () => {
    const vieja: JornadaParaAcompanar = { id: "j9", dia: "2026-10-19", horas: 4, acompanante: "Tomás Ibarra", acompananteEsVos: true };
    await abrir({ jornadas: [vieja] });

    expect(itemDe("lun 19/10")).toHaveTextContent("Acompañó Tomás Ibarra (vos)");
  });
});

describe("sumar a Marta a la jornada de Daniel", () => {
  it("manda a Marta (del grupo «Coordinadores y administradores») y no toca a Daniel: la jornada y el historial muestran a los dos", async () => {
    const { acciones, usuario } = await abrir();
    await usuario.type(campoNota(), "Vino de Salto.");
    await elegir(usuario, MARTA);
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-19", { nota: "Vino de Salto." }));

    await usuario.click(botonSumar("lun 19/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledWith("j2", { acompananteId: "marta", nota: "Vino de Salto." });
    expect(await screen.findByText(`Sumaste a ${MARTA} a la jornada de Ana López, lun 19/10.`)).toBeInTheDocument();
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañaron ${DANIEL} y ${MARTA}`);
    expect(campoNota()).toHaveValue("");
    // Debajo del selector, el grupo de coordinación sigue ofreciendo a Marta: se puede sumar a quien se quiera en otra jornada.
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Ana López" }));
    const historial = within(screen.getByRole("region", { name: "Historial de acompañamientos de Ana López" }));
    const filas = historial.getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent(DANIEL);
    expect(filas[0]).toHaveTextContent("lo marcó en el celular");
    expect(filas[1]).toHaveTextContent(MARTA);
    expect(filas[1]).toHaveTextContent("cargado por vos");
    expect(filas[1]).toHaveTextContent("Vino de Salto.");
    // La jornada cuenta una sola vez aunque tenga dos acompañantes.
    expect(screen.getByText(/1 acompañamiento en la campaña/)).toBeInTheDocument();
  });

  it("sumarse uno mismo («Yo») dice «Te sumaste» y deja el «(vos)» en su nombre", async () => {
    const { acciones, usuario } = await abrir();
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-19", { acompanante: "Mariana Pérez" }));

    await usuario.click(botonSumar("lun 19/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledWith("j2", {});
    expect(await screen.findByText("Te sumaste a la jornada de Ana López, lun 19/10.")).toBeInTheDocument();
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañaron ${DANIEL} y Mariana Pérez (vos)`);
  });

  it("si esa persona ya figuraba no se duplica: avisa «ya figuraba», sin repetirla en la jornada ni en el historial", async () => {
    const { acciones, usuario } = await abrir();
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-19", { acompanante: DANIEL, yaEstaba: true, origen: "COLPORTOR" }));
    await elegir(usuario, MARTA);

    await usuario.click(botonSumar("lun 19/10"));

    expect(await screen.findByText(`Esa jornada ya figuraba a nombre de ${DANIEL}: Ana López, lun 19/10.`)).toBeInTheDocument();
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañó ${DANIEL}`);
    expect(itemDe("lun 19/10")).not.toHaveTextContent("Acompañaron");
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Ana López" }));
    expect(within(screen.getByRole("region", { name: /Historial de acompañamientos de Ana López/ })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("al sumar a alguien que ya figuraba con una nota escrita, avisa que la nota no se guardó", async () => {
    const { acciones, usuario } = await abrir();
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-19", { acompanante: DANIEL, yaEstaba: true, origen: "COLPORTOR" }));
    await usuario.type(campoNota(), "Una nota");

    await usuario.click(botonSumar("lun 19/10"));

    expect(await screen.findByRole("alert")).toHaveTextContent("La nota no se guardó");
  });

  it("tres acompañantes se leen «A, B y C» y una segunda suma sobre la misma jornada se acumula", async () => {
    const { acciones, usuario } = await abrir();
    acciones.registrarAcompanamiento
      .mockResolvedValueOnce(ok("2026-10-19", { acompanante: MARTA }))
      .mockResolvedValueOnce(ok("2026-10-19", { acompanante: LUIS }));
    await elegir(usuario, MARTA);
    await usuario.click(botonSumar("lun 19/10"));
    await screen.findByText(/Sumaste a Marta Gómez/);

    await usuario.selectOptions(screen.getByRole("combobox", { name: "Quién acompañó" }), LUIS);
    await usuario.click(botonSumar("lun 19/10"));

    expect(await screen.findByText(`Sumaste a ${LUIS} a la jornada de Ana López, lun 19/10.`)).toBeInTheDocument();
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañaron ${DANIEL}, ${MARTA} y ${LUIS}`);
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Ana López" }));
    expect(within(screen.getByRole("region", { name: /Historial de acompañamientos de Ana López/ })).getAllByRole("listitem")).toHaveLength(3);
  });

  it("«Otra persona» sin elegir a nadie no manda nada, también al sumar", async () => {
    const { acciones, usuario } = await abrir();
    await usuario.click(screen.getByRole("radio", { name: "Otra persona" }));

    await usuario.click(botonSumar("lun 19/10"));

    expect(acciones.registrarAcompanamiento).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Elegí al colportor que acompañó, o cambiá a «Yo».");
  });
});

describe("casos límite al sumar", () => {
  it("doble toque: una sola llamada, el botón dice «Sumando…» y queda deshabilitado hasta que contesta", async () => {
    let resolver: (r: ResultadoAcompanamiento) => void = () => undefined;
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockImplementation(() => new Promise((r) => (resolver = r)));
    const { usuario } = await abrir({ acciones });
    await elegir(usuario, MARTA);

    fireEvent.click(botonSumar("lun 19/10"));
    fireEvent.click(botonSumar("lun 19/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledTimes(1);
    expect(botonSumar("lun 19/10")).toHaveTextContent("Sumando…");
    expect(botonSumar("lun 19/10")).toHaveAttribute("aria-disabled", "true");
    await act(async () => resolver(ok("2026-10-19")));
    expect(botonSumar("lun 19/10")).toHaveTextContent("Sumar otro acompañante");
    expect(botonSumar("lun 19/10")).toHaveAttribute("aria-disabled", "false");
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañaron ${DANIEL} y ${MARTA}`);
  });

  it("si falla a mitad (sin conexión) el botón se vuelve a habilitar, lo escrito queda y el reintento sale bien", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockRejectedValueOnce(new Error("sin red"));
    const { usuario } = await abrir({ acciones });
    await elegir(usuario, MARTA);
    await usuario.type(campoNota(), "Para la otra");

    await usuario.click(botonSumar("lun 19/10"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para registrar el acompañamiento.");
    expect(botonSumar("lun 19/10")).toHaveAttribute("aria-disabled", "false");
    expect(botonSumar("lun 19/10")).toHaveTextContent("Sumar otro acompañante");
    expect(campoNota()).toHaveValue("Para la otra");
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañó ${DANIEL}`);
    expect(itemDe("lun 19/10")).not.toHaveTextContent("Acompañaron");

    await usuario.click(botonSumar("lun 19/10"));
    expect(await screen.findByText(/Sumaste a Marta Gómez/)).toBeInTheDocument();
    expect(acciones.registrarAcompanamiento).toHaveBeenCalledTimes(2);
  });

  it("un rechazo de la base se muestra en la jornada, sin cambiar la lista, y el botón queda disponible", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce({ ok: false, mensaje: "Ese colportor no está inscripto en esta campaña. Elegí a alguien de su equipo." });
    const { usuario } = await abrir({ acciones });
    await elegir(usuario, MARTA);

    await usuario.click(botonSumar("lun 19/10"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ese colportor no está inscripto en esta campaña.");
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañó ${DANIEL}`);
    expect(botonSumar("lun 19/10")).toHaveAttribute("aria-disabled", "false");
  });

  it("dos jornadas acompañadas sumadas una tras otra antes de que conteste la primera: cada una lleva a su persona y nada se pisa", async () => {
    const resolvers: Record<string, (r: ResultadoAcompanamiento) => void> = {};
    const acciones = crearAcciones([CON_DANIEL, OTRA_CON_DANIEL]);
    acciones.registrarAcompanamiento.mockImplementation((id) => new Promise((r) => (resolvers[id] = r)));
    const { usuario } = await abrir({ acciones, jornadas: [CON_DANIEL, OTRA_CON_DANIEL] });
    await elegir(usuario, MARTA);
    fireEvent.click(botonSumar("lun 19/10"));
    await usuario.selectOptions(screen.getByRole("combobox", { name: "Quién acompañó" }), LUIS);
    fireEvent.click(botonSumar("sáb 17/10"));

    expect(acciones.registrarAcompanamiento.mock.calls).toEqual([
      ["j2", { acompananteId: "marta" }],
      ["j3", { acompananteId: "luis" }],
    ]);
    await act(async () => resolvers.j3(ok("2026-10-17", { acompanante: LUIS })));
    await act(async () => resolvers.j2(ok("2026-10-19", { acompanante: MARTA })));

    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañaron ${DANIEL} y ${MARTA}`);
    expect(itemDe("sáb 17/10")).toHaveTextContent(`Acompañaron ${DANIEL} y ${LUIS}`);
    expect(botonSumar("lun 19/10")).toHaveAttribute("aria-disabled", "false");
    expect(botonSumar("sáb 17/10")).toHaveAttribute("aria-disabled", "false");
  });

  it("volver atrás y reentrar: el panel pide las jornadas de nuevo y muestra lo que dice la fuente", async () => {
    const acciones = crearAcciones();
    const { usuario } = await abrir({ acciones });
    await elegir(usuario, MARTA);
    await usuario.click(botonSumar("lun 19/10"));
    await screen.findByText(/Sumaste a Marta Gómez/);
    // La fuente ya tiene a los dos: lo que vuelve al reentrar es lo guardado.
    acciones.jornadasParaAcompanar.mockResolvedValueOnce({
      ok: true,
      jornadas: [
        LIBRE,
        {
          ...CON_DANIEL,
          acompanante: `${DANIEL} y ${MARTA}`,
          acompanantes: [
            { nombre: DANIEL, esVos: false },
            { nombre: MARTA, esVos: false },
          ],
        },
      ],
    });

    await usuario.click(within(screen.getByRole("region", { name: "Registrar acompañamiento de Ana López" })).getByRole("button", { name: "Cerrar" }));
    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Ana López" }));
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    expect(acciones.jornadasParaAcompanar).toHaveBeenCalledTimes(2);
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañaron ${DANIEL} y ${MARTA}`);
    expect(screen.getByRole("radio", { name: "Yo" })).toBeChecked();
    expect(campoNota()).toHaveValue("");
  });

  it("al cerrar el panel mientras espera, el historial igual anota a quien se sumó", async () => {
    let resolver: (r: ResultadoAcompanamiento) => void = () => undefined;
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockImplementation(() => new Promise((r) => (resolver = r)));
    const { usuario } = await abrir({ acciones });
    await elegir(usuario, MARTA);
    fireEvent.click(botonSumar("lun 19/10"));

    await usuario.click(within(screen.getByRole("region", { name: "Registrar acompañamiento de Ana López" })).getByRole("button", { name: "Cerrar" }));
    await act(async () => resolver(ok("2026-10-19")));
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Ana López" }));

    const historial = within(screen.getByRole("region", { name: "Historial de acompañamientos de Ana López" }));
    expect(historial.getAllByRole("listitem")).toHaveLength(2);
    expect(historial.getByText(MARTA)).toBeInTheDocument();
  });

  it("con 60 jornadas todas acompañadas, cada una ofrece sumar y la lista no se rompe", async () => {
    const muchas = Array.from({ length: 60 }, (_, i): JornadaParaAcompanar => ({
      ...CON_DANIEL,
      id: `jm${i}`,
      dia: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
    }));
    await abrir({ jornadas: muchas });

    expect(screen.getAllByRole("button", { name: /^Sumar otro acompañante en la jornada de Ana López/ })).toHaveLength(60);
    expect(screen.getByText(/Todas sus jornadas terminadas ya tienen acompañante/)).toBeInTheDocument();
  });

  it("un nombre larguísimo sin espacios sigue legible: el texto no se pierde ni se parte el botón", async () => {
    const largo = "Marta".repeat(40);
    const acciones = crearAcciones();
    acciones.acompanantesDelPanel.mockResolvedValue({ ok: true, acompanantes: [{ id: "larga", nombre: largo }] });
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-19", { acompanante: largo }));
    const { usuario } = await abrir({ acciones });
    await elegir(usuario, largo);

    await usuario.click(botonSumar("lun 19/10"));

    expect(await screen.findByText(`Sumaste a ${largo} a la jornada de Ana López, lun 19/10.`)).toBeInTheDocument();
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañaron ${DANIEL} y ${largo}`);
    expect(botonSumar("lun 19/10")).toHaveTextContent("Sumar otro acompañante");
  });

  it("pasados 15 días del fin de la campaña no se ofrece sumar: el panel dice por qué", async () => {
    const jornadas = [LIBRE, CON_DANIEL];
    const acciones = crearAcciones(jornadas);
    const datos = datosDePrueba({
      campaniaFin: "2026-09-01",
      colportores: [colportor({ id: "ana", nombre: "Ana López", ciudadId: "riv", acompanamientos: historialDe(...jornadas) })],
    });
    render(<EquipoVista datos={datos} acciones={acciones} />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Ana López" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/La campaña terminó hace más de 15 días/);
    expect(screen.queryByRole("button", { name: /Sumar otro acompañante/ })).not.toBeInTheDocument();
    expect(acciones.jornadasParaAcompanar).not.toHaveBeenCalled();
  });
});

describe("accesibilidad", () => {
  it("la lista con «Sumar otro acompañante» no tiene violaciones de axe", async () => {
    const { container } = await abrir();

    const resultado = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });

    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("modelo: la jornada con un acompañante más", () => {
  it("acompanantesDeJornada devuelve la lista, el único nombre de siempre o nada", () => {
    expect(acompanantesDeJornada(LIBRE)).toEqual([]);
    expect(acompanantesDeJornada({ id: "x", dia: "2026-10-01", horas: 1, acompanante: "Tomás", acompananteEsVos: true })).toEqual([{ nombre: "Tomás", esVos: true }]);
    expect(acompanantesDeJornada(CON_DANIEL)).toEqual([{ nombre: DANIEL, esVos: false }]);
  });

  it("conAcompananteSumado arma el texto, no repite a quien ya estaba y no muta la jornada original", () => {
    const con2 = conAcompananteSumado(CON_DANIEL, { nombre: MARTA, esVos: false });
    expect(con2).toMatchObject({ acompanante: `${DANIEL} y ${MARTA}`, acompananteEsVos: false });
    expect(acompanantesDeJornada(con2)).toHaveLength(2);

    const con3 = conAcompananteSumado(con2, { nombre: "Mariana Pérez", esVos: true });
    expect(con3.acompanante).toBe(`${DANIEL}, ${MARTA} y Mariana Pérez (vos)`);

    expect(conAcompananteSumado(con3, { nombre: MARTA, esVos: false })).toEqual(con3);
    expect(CON_DANIEL.acompanantes).toHaveLength(1);

    const primera = conAcompananteSumado(LIBRE, { nombre: "Mariana Pérez", esVos: true });
    expect(primera).toMatchObject({ acompanante: "Mariana Pérez", acompananteEsVos: true });
  });
});
