import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AcompananteDelPanel,
  JornadaParaAcompanar,
  ResultadoAcompanamiento,
  ResultadoAcompanantes,
} from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { datosDePrueba, HOY } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";

/**
 * QA #162 (vista 33, «Quién lo acompañó» con coordinadores y administradores, seguimiento #161 de #146). El canvas 33 no dibuja
 * el panel de registro (solo el botón «Registrar acompañamiento»): el inventario son los casos de la casilla 1 del issue y las
 * decisiones del 06/11 (rótulos «Otra persona» / «Quién acompañó» / «Elegí quién acompañó»).
 * Los tests con `skip` documentan un hallazgo del QA: el implementador saca el `skip` cuando lo arregla.
 */
vi.setConfig({ testTimeout: 60_000 });

const J1: JornadaParaAcompanar = { id: "j1", dia: "2026-10-20", horas: 5.5, acompanante: null, acompananteEsVos: false };
const J2: JornadaParaAcompanar = { id: "j2", dia: "2026-10-17", horas: 3.2, acompanante: null, acompananteEsVos: false };

const MARTA: AcompananteDelPanel = { id: "usr-marta", nombre: "Marta Rivas" };
const ALICIA: AcompananteDelPanel = { id: "usr-alicia", nombre: "Alicia Benítez" };

const lista = (...acompanantes: AcompananteDelPanel[]): ResultadoAcompanantes => ({ ok: true, acompanantes });
const ok = (dia: string, acompanante: string): ResultadoAcompanamiento => ({
  ok: true,
  dia,
  acompanante,
  yaEstaba: false,
  origen: "COORDINADOR",
  nota: null,
});

function conDiferido<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

function crearAcciones(personas: () => Promise<ResultadoAcompanantes> = async () => lista(MARTA, ALICIA)) {
  const acompanantesDelPanel = vi.fn<NonNullable<AccionesEquipo["acompanantesDelPanel"]>>(personas);
  const jornadasParaAcompanar = vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async () => ({ ok: true, jornadas: [J1, J2] }));
  const registrarAcompanamiento = vi.fn<AccionesEquipo["registrarAcompanamiento"]>(async (id, datos) => {
    const nombre = [MARTA, ALICIA].find((p) => p.id === datos?.acompananteId)?.nombre ?? "Mariana Pérez";
    return ok([J1, J2].find((j) => j.id === id)?.dia ?? HOY, nombre);
  });
  const elegirCarrera = vi.fn<AccionesEquipo["elegirCarrera"]>(async () => ({ ok: false, mensaje: "No en este test." }));
  const asignarTipoDeBeca = vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(async () => ({ ok: false, mensaje: "No en este test." }));
  return { acompanantesDelPanel, jornadasParaAcompanar, registrarAcompanamiento, elegirCarrera, asignarTipoDeBeca } satisfies AccionesEquipo;
}

async function abrir(
  opciones: { acciones?: ReturnType<typeof crearAcciones>; datos?: ReturnType<typeof datosDePrueba>; colportor?: string } = {},
) {
  const { acciones = crearAcciones(), datos = datosDePrueba(), colportor = "Florencia Pintos" } = opciones;
  const vista = render(<EquipoVista datos={datos} acciones={acciones} />);
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
  await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
  await usuario.click(screen.getByRole("button", { name: `Registrar acompañamiento de ${colportor}` }));
  await screen.findByRole("list", { name: /Jornadas terminadas/ });
  return { ...vista, acciones, usuario };
}

const botonDe = (cuando: string) =>
  screen.getByRole("button", { name: `Registrar acompañamiento en la jornada de Florencia Pintos del ${cuando}` });
const otroRadio = () => screen.getByRole("radio", { name: "Otra persona" });
const selector = () => screen.getByRole("combobox", { name: "Quién acompañó" });
const textos = (el: HTMLElement) => within(el).getAllByRole("option").map((o) => o.textContent);
const REINTENTAR = { name: "Reintentar traer los coordinadores y administradores" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("QA #162 · foco y reintentos de la lista de coordinadores", () => {
  it("QA #162: al tocar «Reintentar» (traer los coordinadores) el foco pasa al selector: el aviso y su botón se desmontan", async () => {
    const respuestas: ResultadoAcompanantes[] = [{ ok: false, mensaje: "No se pudieron traer los coordinadores y administradores. Probá de nuevo más tarde." }, lista(MARTA)];
    const acciones = crearAcciones(async () => respuestas.shift() ?? lista());
    const { usuario } = await abrir({ acciones });
    await usuario.click(otroRadio());
    const reintentar = await screen.findByRole("button", REINTENTAR);
    reintentar.focus();

    await usuario.click(reintentar);
    await within(selector()).findByRole("group", { name: "Coordinadores y administradores" });

    // El foco queda en el selector «Quién acompañó», nunca en el <body>.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(selector());
  });

  it("si «Reintentar» vuelve a fallar, el aviso reaparece con el botón habilitado y el tercer intento trae el grupo", async () => {
    const respuestas: (ResultadoAcompanantes | Error)[] = [
      { ok: false, mensaje: "No se pudieron traer los coordinadores y administradores. Probá de nuevo más tarde." },
      new Error("sin red"),
      lista(MARTA),
    ];
    const acciones = crearAcciones(async () => {
      const r = respuestas.shift() ?? lista();
      if (r instanceof Error) throw r;
      return r;
    });
    const { usuario } = await abrir({ acciones });
    await usuario.click(otroRadio());

    await usuario.click(await screen.findByRole("button", REINTENTAR));
    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para traer los coordinadores y administradores.");
    expect(screen.getByRole("button", REINTENTAR)).toBeEnabled();

    await usuario.click(screen.getByRole("button", REINTENTAR));
    expect(await within(selector()).findByRole("group", { name: "Coordinadores y administradores" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(acciones.acompanantesDelPanel).toHaveBeenCalledTimes(3);
  });

  it.skip("QA #162: con la lista caída y sin colportores, el aviso manda a elegir «entre los colportores de la campaña», que no hay", async () => {
    const solo = datosDePrueba({ colportores: [datosDePrueba().colportores.find((c) => c.id === "florencia")!] });
    const acciones = crearAcciones(async () => ({ ok: false, mensaje: "Sin permiso." }));
    const { usuario } = await abrir({ datos: solo, acciones });
    await waitFor(() => expect(otroRadio()).toBeEnabled());
    await usuario.click(otroRadio());

    // Sin colportores que elegir, «Mientras tanto podés elegir entre los colportores…» no dice la verdad.
    expect(await screen.findByRole("alert")).not.toHaveTextContent("Mientras tanto podés elegir entre los colportores de la campaña.");
  });

  it("con el aviso de la lista caída y sin elegir a nadie, registrar manda el foco al selector y el aviso de «Elegí…» no tapa al otro", async () => {
    const acciones = crearAcciones(async () => ({ ok: false, mensaje: "Sin permiso." }));
    const { usuario } = await abrir({ acciones });
    await usuario.click(otroRadio());
    await screen.findByRole("alert");

    await usuario.click(botonDe("mar 20/10"));

    expect(acciones.registrarAcompanamiento).not.toHaveBeenCalled();
    expect(selector()).toHaveFocus();
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Sin permiso."), "Elegí al colportor que acompañó, o cambiá a «Yo»."]),
    );
  });
});

describe("QA #162 · el selector con datos límite", () => {
  it("ordena sin importar mayúsculas ni tildes («álvaro» entre «Alicia» y «Beatriz»; «Ñandú» después de «Zoe» no)", async () => {
    const acciones = crearAcciones(async () =>
      lista(
        { id: "u1", nombre: "Zoe Paz" },
        { id: "u2", nombre: "Ñandú Gómez" },
        { id: "u3", nombre: "álvaro Díaz" },
        { id: "u4", nombre: "alicia Pérez" },
        { id: "u5", nombre: "Beatriz Soca" },
      ),
    );
    const { usuario } = await abrir({ acciones });
    await usuario.click(otroRadio());

    const grupo = within(selector()).getByRole("group", { name: "Coordinadores y administradores" });
    expect(textos(grupo)).toEqual(["alicia Pérez", "álvaro Díaz", "Beatriz Soca", "Ñandú Gómez", "Zoe Paz"]);
  });

  it("emoji, comillas y etiquetas en un nombre se muestran como texto y se registran con su id", async () => {
    const raro: AcompananteDelPanel = { id: "usr-raro", nombre: "😀 Ana <b>\"Z\"</b> & 'Co'" };
    const acciones = crearAcciones(async () => lista(raro));
    const { usuario } = await abrir({ acciones });
    await usuario.click(otroRadio());

    await usuario.selectOptions(selector(), raro.id);
    expect(within(selector()).getByRole("option", { name: raro.nombre })).toBeInTheDocument();
    expect(selector().querySelector("b")).toBeNull();
    await usuario.click(botonDe("mar 20/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledWith("j1", { acompananteId: "usr-raro" });
  });

  it("al abrir el registro de otro colportor se pide la lista de nuevo y ese colportor no figura entre las personas ofrecidas", async () => {
    const acciones = crearAcciones(async () => lista(MARTA, { id: "emiliano", nombre: "Emiliano Sosa" }));
    const primero = await abrir({ acciones, colportor: "Florencia Pintos" });
    await primero.usuario.click(otroRadio());
    expect(textos(selector())).toContain("Emiliano Sosa");
    primero.unmount();

    const segundo = await abrir({ acciones, colportor: "Emiliano Sosa" });
    await segundo.usuario.click(otroRadio());

    expect(acciones.acompanantesDelPanel).toHaveBeenCalledTimes(2);
    expect(textos(selector())).not.toContain("Emiliano Sosa");
    expect(textos(selector())).toContain("Florencia Pintos");
    expect(textos(selector())).toContain("Marta Rivas");
  });
});

describe("QA #162 · acciones superpuestas y recorrido completo", () => {
  it("dos registros en vuelo a nombre de personas distintas no se pisan: cada jornada lleva la suya y las dos quedan en la lista", async () => {
    const primero = conDiferido<ResultadoAcompanamiento>();
    const segundo = conDiferido<ResultadoAcompanamiento>();
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockImplementation((id) => (id === "j1" ? primero.promesa : segundo.promesa));
    const { usuario } = await abrir({ acciones });
    await usuario.click(otroRadio());

    await usuario.selectOptions(selector(), "Marta Rivas");
    await usuario.click(botonDe("mar 20/10"));
    await usuario.selectOptions(selector(), "Alicia Benítez");
    await usuario.click(botonDe("sáb 17/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenNthCalledWith(1, "j1", { acompananteId: "usr-marta" });
    expect(acciones.registrarAcompanamiento).toHaveBeenNthCalledWith(2, "j2", { acompananteId: "usr-alicia" });

    await act(async () => {
      segundo.resolver(ok("2026-10-17", "Alicia Benítez"));
      primero.resolver(ok("2026-10-20", "Marta Rivas"));
    });

    const items = within(screen.getByRole("list", { name: /Jornadas terminadas/ })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Acompañó Marta Rivas");
    expect(items[1]).toHaveTextContent("Acompañó Alicia Benítez");
  });

  it("después de registrar a nombre de un coordinador, cambiar a «Yo» y volver a «Otra persona» no manda el id viejo", async () => {
    const { acciones, usuario } = await abrir();
    await usuario.click(otroRadio());
    await usuario.selectOptions(selector(), "Marta Rivas");
    await usuario.click(botonDe("mar 20/10"));
    await screen.findByText(/Acompañamiento registrado/);

    await usuario.click(screen.getByRole("radio", { name: "Yo" }));
    await usuario.click(botonDe("sáb 17/10"));

    const [jornada, datos] = acciones.registrarAcompanamiento.mock.lastCall!;
    expect(jornada).toBe("j2");
    expect(datos?.acompananteId).toBeUndefined();
  });

  it("recorrido completo sin avisos de React ni escrituras en la consola (sin datos de nadie en logs)", async () => {
    const espiaError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const espiaAviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const espiaLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { usuario } = await abrir();
    await usuario.click(otroRadio());
    await usuario.selectOptions(selector(), "Alicia Benítez");
    await usuario.click(botonDe("mar 20/10"));
    await screen.findByText(/Acompañamiento registrado/);
    await usuario.click(screen.getByRole("radio", { name: "Yo" }));

    expect(espiaError).not.toHaveBeenCalled();
    expect(espiaAviso).not.toHaveBeenCalled();
    expect(espiaLog).not.toHaveBeenCalled();
  });
});
