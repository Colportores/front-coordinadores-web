import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AcompanamientoDeColportor, JornadaParaAcompanar, ResultadoAcompanamiento, ResultadoJornadas } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { colportor, datosDePrueba, HOY } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";

/**
 * QA de «Sumar otro acompañante» (front-coordinadores-web#164, PR #205): lo que el implementador no probó. Acciones superpuestas
 * sobre la MISMA jornada, el historial cuando el servidor ya devuelve lo que se sumó, «Yo» repetido, foco y avisos, la nota y
 * la falla de la carga inicial.
 */

const DANIEL = "Daniel Rey";
const MARTA = "Marta Gómez";
const LUIS = "Luis Vega";

const CON_DANIEL: JornadaParaAcompanar = {
  id: "j2",
  dia: "2026-10-19",
  horas: 4,
  acompanante: DANIEL,
  acompananteEsVos: false,
  acompanantes: [{ nombre: DANIEL, esVos: false }],
};
const CON_YO: JornadaParaAcompanar = {
  id: "j4",
  dia: "2026-10-16",
  horas: 3,
  acompanante: LUIS,
  acompananteEsVos: true,
  acompanantes: [{ nombre: LUIS, esVos: true }],
};

const DEL_PANEL = [
  { id: "marta", nombre: MARTA },
  { id: "tomas", nombre: "Tomás Ibarra" },
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

function historialDe(...jornadas: JornadaParaAcompanar[]): AcompanamientoDeColportor[] {
  return jornadas
    .filter((j) => j.acompanante !== null)
    .map((j) => ({
      jornadaId: j.id,
      dia: j.dia,
      horas: j.horas,
      acompanante: j.acompanante as string,
      acompananteEsVos: j.acompananteEsVos,
      origen: "COLPORTOR" as const,
      nota: null,
    }));
}

function crearAcciones(jornadas: JornadaParaAcompanar[]) {
  const jornadasParaAcompanar = vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async (): Promise<ResultadoJornadas> => ({ ok: true, jornadas }));
  const registrarAcompanamiento = vi.fn<AccionesEquipo["registrarAcompanamiento"]>(async (id) => ok(jornadas.find((j) => j.id === id)?.dia ?? HOY));
  const acompanantesDelPanel = vi.fn<NonNullable<AccionesEquipo["acompanantesDelPanel"]>>(async () => ({ ok: true, acompanantes: DEL_PANEL }));
  const elegirCarrera = vi.fn<AccionesEquipo["elegirCarrera"]>(async () => ({ ok: false, mensaje: "No en este test." }));
  const asignarTipoDeBeca = vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(async () => ({ ok: false, mensaje: "No en este test." }));
  return { jornadasParaAcompanar, registrarAcompanamiento, acompanantesDelPanel, elegirCarrera, asignarTipoDeBeca } satisfies AccionesEquipo;
}

function datosCon(jornadas: JornadaParaAcompanar[], extra: AcompanamientoDeColportor[] = []) {
  return datosDePrueba({
    colportores: [
      colportor({ id: "ana", nombre: "Ana López", ciudadId: "riv", acompanamientos: [...historialDe(...jornadas), ...extra] }),
      colportor({ id: "emiliano", nombre: "Emiliano Sosa", ciudadId: "riv" }),
    ],
  });
}

async function abrir(jornadas: JornadaParaAcompanar[], acciones = crearAcciones(jornadas)) {
  const vista = render(<EquipoVista datos={datosCon(jornadas)} acciones={acciones} />);
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
  await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
  await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Ana López" }));
  await screen.findByRole("list", { name: /Jornadas terminadas/ });
  return { ...vista, acciones, usuario };
}

const botonSumar = (cuando: string) => screen.getByRole("button", { name: `Sumar otro acompañante en la jornada de Ana López del ${cuando}` });
const itemDe = (cuando: string) =>
  within(screen.getByRole("list", { name: /Jornadas terminadas/ })).getAllByRole("listitem").find((li) => li.textContent?.includes(cuando)) as HTMLElement;
const campoNota = () => screen.getByRole("textbox", { name: "Nota (opcional)" });

async function elegir(usuario: ReturnType<typeof userEvent.setup>, nombre: string) {
  await usuario.click(screen.getByRole("radio", { name: "Otra persona" }));
  await usuario.selectOptions(screen.getByRole("combobox", { name: "Quién acompañó" }), nombre);
}

describe("QA #205 · acciones superpuestas sobre la misma jornada", () => {
  it("un segundo «Sumar» a la misma jornada con otra persona, antes de que conteste el primero, no se manda ni pisa al primero; después se puede sumar", async () => {
    let resolver: (r: ResultadoAcompanamiento) => void = () => {};
    const acciones = crearAcciones([CON_DANIEL]);
    acciones.registrarAcompanamiento.mockImplementationOnce(() => new Promise((r) => (resolver = r)));
    const { usuario } = await abrir([CON_DANIEL], acciones);
    await elegir(usuario, MARTA);
    fireEvent.click(botonSumar("lun 19/10"));
    await usuario.selectOptions(screen.getByRole("combobox", { name: "Quién acompañó" }), "Tomás Ibarra");
    fireEvent.click(botonSumar("lun 19/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledTimes(1);
    expect(botonSumar("lun 19/10")).toHaveTextContent("Sumando…");
    await act(async () => resolver(ok("2026-10-19", { acompanante: MARTA })));
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañaron ${DANIEL} y ${MARTA}`);

    // El formulario sigue diciendo Tomás: ahora sí se suma, y los tres quedan.
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-19", { acompanante: "Tomás Ibarra" }));
    await usuario.click(botonSumar("lun 19/10"));
    expect(await screen.findByText(/Sumaste a Tomás Ibarra/)).toBeInTheDocument();
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañaron ${DANIEL}, ${MARTA} y Tomás Ibarra`);
  });

  it("con el teclado: Enter dos veces seguidas sobre «Sumar» (aria-disabled) manda una sola vez", async () => {
    let resolver: (r: ResultadoAcompanamiento) => void = () => {};
    const acciones = crearAcciones([CON_DANIEL]);
    acciones.registrarAcompanamiento.mockImplementationOnce(() => new Promise((r) => (resolver = r)));
    const { usuario } = await abrir([CON_DANIEL], acciones);
    await elegir(usuario, MARTA);
    botonSumar("lun 19/10").focus();

    await usuario.keyboard("{Enter}{Enter}");

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledTimes(1);
    await act(async () => resolver(ok("2026-10-19")));
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañaron ${DANIEL} y ${MARTA}`);
  });
});

describe("QA #205 · el historial cuando el servidor ya devuelve lo que se sumó", () => {
  it("al recargar los datos con la fila de Marta no se duplica en el historial ni cambia el conteo", async () => {
    const acciones = crearAcciones([CON_DANIEL]);
    const { usuario, rerender } = await abrir([CON_DANIEL], acciones);
    await elegir(usuario, MARTA);
    await usuario.click(botonSumar("lun 19/10"));
    await screen.findByText(/Sumaste a Marta Gómez/);

    const delServidor: AcompanamientoDeColportor = { jornadaId: "j2", dia: "2026-10-19", horas: 4, acompanante: MARTA, acompananteEsVos: false, origen: "COORDINADOR", cargadoPor: { esVos: true }, nota: null };
    rerender(<EquipoVista datos={datosCon([CON_DANIEL], [delServidor])} acciones={acciones} />);
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Ana López" }));

    const filas = within(screen.getByRole("region", { name: "Historial de acompañamientos de Ana López" })).getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    expect(screen.getByText(/1 acompañamiento en la campaña/)).toBeInTheDocument();
  });

  it("sumarse uno mismo y recargar con el «(vos)» del servidor tampoco duplica la fila", async () => {
    const acciones = crearAcciones([CON_DANIEL]);
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-19", { acompanante: LUIS }));
    const { usuario, rerender } = await abrir([CON_DANIEL], acciones);
    await usuario.click(botonSumar("lun 19/10"));
    await screen.findByText(/Te sumaste a la jornada de Ana López/);

    const delServidor: AcompanamientoDeColportor = { jornadaId: "j2", dia: "2026-10-19", horas: 4, acompanante: LUIS, acompananteEsVos: true, origen: "COORDINADOR", cargadoPor: { esVos: true }, nota: null };
    rerender(<EquipoVista datos={datosCon([CON_DANIEL], [delServidor])} acciones={acciones} />);
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Ana López" }));

    expect(within(screen.getByRole("region", { name: "Historial de acompañamientos de Ana López" })).getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("QA #205 · «Yo» repetido y carreras con el servidor", () => {
  it("sumarse a una jornada donde ya figura uno mismo dice «ya figuraba a tu nombre» y no repite el «(vos)»", async () => {
    const acciones = crearAcciones([CON_YO]);
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-16", { acompanante: LUIS, yaEstaba: true, origen: "COLPORTOR" }));
    const { usuario } = await abrir([CON_YO], acciones);

    await usuario.click(botonSumar("vie 16/10"));

    expect(await screen.findByText(/Esa jornada ya figuraba a tu nombre: Ana López, vie 16\/10\./)).toBeInTheDocument();
    expect(itemDe("vie 16/10")).toHaveTextContent(`Acompañó ${LUIS} (vos)`);
    expect(itemDe("vie 16/10")).not.toHaveTextContent("Acompañaron");
  });

  it("si la base responde que la jornada cambió (recargar), la lista se vuelve a pedir y el aviso queda en la jornada", async () => {
    const acciones = crearAcciones([CON_DANIEL]);
    const conMarta: JornadaParaAcompanar = {
      ...CON_DANIEL,
      acompanante: `${DANIEL} y ${MARTA}`,
      acompanantes: [
        { nombre: DANIEL, esVos: false },
        { nombre: MARTA, esVos: false },
      ],
    };
    acciones.jornadasParaAcompanar.mockResolvedValueOnce({ ok: true, jornadas: [CON_DANIEL] }).mockResolvedValue({ ok: true, jornadas: [conMarta] });
    acciones.registrarAcompanamiento.mockResolvedValueOnce({ ok: false, mensaje: "La jornada cambió. Revisá cómo quedó.", recargar: true });
    const { usuario } = await abrir([CON_DANIEL], acciones);
    await elegir(usuario, MARTA);

    await usuario.click(botonSumar("lun 19/10"));

    expect(await screen.findByText("La jornada cambió. Revisá cómo quedó.")).toBeInTheDocument();
    expect(await screen.findByText(`Acompañaron ${DANIEL} y ${MARTA}`)).toBeInTheDocument();
    expect(botonSumar("lun 19/10")).toHaveAttribute("aria-disabled", "false");
  });
});

describe("QA #205 · foco, avisos y nota", () => {
  it("al sumar bien, el aviso es un status y el foco va a la fila de la jornada; el botón sigue ahí", async () => {
    const { usuario } = await abrir([CON_DANIEL]);
    await elegir(usuario, MARTA);

    await usuario.click(botonSumar("lun 19/10"));

    const aviso = await screen.findByText(/Sumaste a Marta Gómez a la jornada de Ana López, lun 19\/10\./);
    expect(aviso).toHaveAttribute("role", "status");
    expect(document.activeElement).toBe(itemDe("lun 19/10"));
    expect(botonSumar("lun 19/10")).toBeInTheDocument();
  });

  it("al fallar, el aviso es un alert dentro de la fila y el foco no se va al body", async () => {
    const acciones = crearAcciones([CON_DANIEL]);
    acciones.registrarAcompanamiento.mockRejectedValueOnce(new Error("sin red"));
    const { usuario } = await abrir([CON_DANIEL], acciones);
    await elegir(usuario, MARTA);

    await usuario.click(botonSumar("lun 19/10"));

    const alerta = await within(itemDe("lun 19/10")).findByRole("alert");
    expect(alerta).toHaveTextContent("Necesitás conexión para registrar el acompañamiento. Revisá la conexión y probá de nuevo.");
    expect(document.activeElement).not.toBe(document.body);
  });

  it("una nota de solo espacios no se manda y una con espacios alrededor se manda recortada, también al sumar", async () => {
    const { acciones, usuario } = await abrir([CON_DANIEL]);
    await elegir(usuario, MARTA);
    await usuario.type(campoNota(), "   ");
    await usuario.click(botonSumar("lun 19/10"));
    await screen.findByText(/Sumaste a Marta Gómez/);
    expect(acciones.registrarAcompanamiento).toHaveBeenLastCalledWith("j2", { acompananteId: "marta" });

    await usuario.type(campoNota(), "  Con emoji 🙂 y <b>html</b>  ");
    await usuario.selectOptions(screen.getByRole("combobox", { name: "Quién acompañó" }), "Tomás Ibarra");
    await usuario.click(botonSumar("lun 19/10"));
    await screen.findByText(/Sumaste a Marta Gómez|Sumaste a/);
    expect(acciones.registrarAcompanamiento).toHaveBeenLastCalledWith("j2", { acompananteId: "tomas", nota: "Con emoji 🙂 y <b>html</b>" });
  });

  it("un nombre de acompañante con HTML se muestra como texto", async () => {
    const raro: JornadaParaAcompanar = { ...CON_DANIEL, acompanante: "<img src=x onerror=alert(1)>", acompanantes: [{ nombre: "<img src=x onerror=alert(1)>", esVos: false }] };
    await abrir([raro]);

    expect(itemDe("lun 19/10").querySelector("img")).toBeNull();
    expect(itemDe("lun 19/10")).toHaveTextContent("Acompañó <img src=x onerror=alert(1)>");
  });
});

describe("QA #205 · la carga inicial falla y se reintenta", () => {
  it("sin conexión al pedir las jornadas: aviso con Reintentar; al reintentar aparecen las acompañadas con «Sumar»", async () => {
    const acciones = crearAcciones([CON_DANIEL]);
    acciones.jornadasParaAcompanar.mockRejectedValueOnce(new Error("sin red"));
    render(<EquipoVista datos={datosCon([CON_DANIEL])} acciones={acciones} />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Ana López" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/Necesitás conexión para/);
    await usuario.click(within(alerta).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("button", { name: /^Sumar otro acompañante en la jornada de Ana López/ })).toBeInTheDocument();
  });

  it("una jornada sola, acompañada, con la lista de acompañantes del panel caída: «Yo» sigue sumando", async () => {
    const acciones = crearAcciones([CON_DANIEL]);
    acciones.acompanantesDelPanel.mockRejectedValue(new Error("sin red"));
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-19", { acompanante: LUIS }));
    const { usuario } = await abrir([CON_DANIEL], acciones);

    await usuario.click(botonSumar("lun 19/10"));

    expect(await screen.findByText(/Te sumaste a la jornada de Ana López, lun 19\/10\./)).toBeInTheDocument();
    expect(itemDe("lun 19/10")).toHaveTextContent(`Acompañaron ${DANIEL} y ${LUIS} (vos)`);
  });
});
