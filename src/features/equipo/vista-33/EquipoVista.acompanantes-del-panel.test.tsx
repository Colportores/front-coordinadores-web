import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import type {
  AcompananteDelPanel,
  JornadaParaAcompanar,
  ResultadoAcompanamiento,
  ResultadoAcompanantes,
} from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { colportor, datosDePrueba, HOY } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";

/**
 * «Quién lo acompañó» con los coordinadores de cualquier campaña y los administradores (seguimiento #161 de #146): debajo
 * de los colportores de la campaña, con el rótulo de grupo «Coordinadores y administradores». Si la lista no llega, el
 * registro sigue andando con los colportores.
 */

const J1: JornadaParaAcompanar = { id: "j1", dia: "2026-10-20", horas: 5.5, acompanante: null, acompananteEsVos: false };
const J2: JornadaParaAcompanar = { id: "j2", dia: "2026-10-17", horas: 3.2, acompanante: null, acompananteEsVos: false };

const MARTA: AcompananteDelPanel = { id: "usr-marta", nombre: "Marta Rivas" };
const ALICIA: AcompananteDelPanel = { id: "usr-alicia", nombre: "Alicia Benítez" };
const TOMAS: AcompananteDelPanel = { id: "usr-tomas", nombre: "Tomás Ibarra" };

const ok = (dia: string, resto: Partial<Extract<ResultadoAcompanamiento, { ok: true }>> = {}): ResultadoAcompanamiento => ({
  ok: true,
  dia,
  acompanante: "Marta Rivas",
  yaEstaba: false,
  origen: "COORDINADOR",
  nota: null,
  ...resto,
});

const lista = (...acompanantes: AcompananteDelPanel[]): ResultadoAcompanantes => ({ ok: true, acompanantes });

function crearAcciones(personas: () => Promise<ResultadoAcompanantes> = async () => lista(TOMAS, MARTA, ALICIA)) {
  const acompanantesDelPanel = vi.fn<NonNullable<AccionesEquipo["acompanantesDelPanel"]>>(personas);
  const jornadasParaAcompanar = vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async () => ({ ok: true, jornadas: [J1, J2] }));
  const registrarAcompanamiento = vi.fn<AccionesEquipo["registrarAcompanamiento"]>(async (id) =>
    ok([J1, J2].find((j) => j.id === id)?.dia ?? HOY),
  );
  const elegirCarrera = vi.fn<AccionesEquipo["elegirCarrera"]>(async () => ({ ok: false, mensaje: "No en este test." }));
  const asignarTipoDeBeca = vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(async () => ({ ok: false, mensaje: "No en este test." }));
  return { acompanantesDelPanel, jornadasParaAcompanar, registrarAcompanamiento, elegirCarrera, asignarTipoDeBeca } satisfies AccionesEquipo;
}

async function abrir(opciones: { acciones?: ReturnType<typeof crearAcciones>; datos?: ReturnType<typeof datosDePrueba> } = {}) {
  const { acciones = crearAcciones(), datos = datosDePrueba() } = opciones;
  const vista = render(<EquipoVista datos={datos} acciones={acciones} />);
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
  await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
  await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
  await screen.findByRole("list", { name: /Jornadas terminadas/ });
  return { ...vista, acciones, usuario };
}

const botonDe = (cuando: string) =>
  screen.getByRole("button", { name: `Registrar acompañamiento en la jornada de Florencia Pintos del ${cuando}` });
const otroRadio = () => screen.getByRole("radio", { name: "Otro colportor" });
const selector = () => screen.getByRole("combobox", { name: "Colportor que acompañó" });
const grupo = () => within(selector()).getByRole("group", { name: "Coordinadores y administradores" });
const textos = (el: HTMLElement) => within(el).getAllByRole("option").map((o) => o.textContent);

describe("el selector con los dos grupos", () => {
  it("los colportores de la campaña primero y, debajo, «Coordinadores y administradores» por orden alfabético", async () => {
    const { usuario } = await abrir();
    await waitFor(() => expect(otroRadio()).toBeEnabled());

    await usuario.click(otroRadio());

    expect(textos(selector())).toEqual([
      "Elegí un colportor",
      "Emiliano Sosa",
      "Federico Da Rosa",
      "Rocío Benítez",
      "Sofía Cabral",
      "Alicia Benítez",
      "Marta Rivas",
      "Tomás Ibarra",
    ]);
    expect(textos(grupo())).toEqual(["Alicia Benítez", "Marta Rivas", "Tomás Ibarra"]);
  });

  it("pide la lista una vez al abrir el registro", async () => {
    const { acciones } = await abrir();

    expect(acciones.acompanantesDelPanel).toHaveBeenCalledTimes(1);
  });

  it("registrar a nombre de un coordinador manda su id; el aviso, la jornada y el historial dicen su nombre", async () => {
    const { acciones, usuario } = await abrir();
    await waitFor(() => expect(otroRadio()).toBeEnabled());
    await usuario.click(otroRadio());
    await usuario.selectOptions(selector(), "Marta Rivas");

    await usuario.click(botonDe("mar 20/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledWith("j1", { acompananteId: "usr-marta" });
    expect(await screen.findByText("Acompañamiento registrado: jornada de Florencia Pintos, mar 20/10. Acompañó Marta Rivas.")).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: /Jornadas terminadas/ })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Acompañó Marta Rivas");
    expect(items[0]).not.toHaveTextContent("(vos)");
  });

  it("quien ya figura entre los colportores de la campaña no se repite en el grupo, ni se ofrece al dueño de la jornada", async () => {
    const acciones = crearAcciones(async () => lista({ id: "emiliano", nombre: "Emiliano Sosa" }, { id: "florencia", nombre: "Florencia Pintos" }, MARTA));
    const { usuario } = await abrir({ acciones });
    await waitFor(() => expect(otroRadio()).toBeEnabled());

    await usuario.click(otroRadio());

    expect(textos(selector()).filter((t) => t === "Emiliano Sosa")).toHaveLength(1);
    expect(textos(selector())).not.toContain("Florencia Pintos");
    expect(textos(grupo())).toEqual(["Marta Rivas"]);
  });

  it("sin coordinadores ni administradores (lista vacía) no hay grupo, como antes", async () => {
    const { usuario } = await abrir({ acciones: crearAcciones(async () => lista()) });
    await usuario.click(otroRadio());

    expect(within(selector()).queryByRole("group")).not.toBeInTheDocument();
    expect(textos(selector())).toEqual(["Elegí un colportor", "Emiliano Sosa", "Federico Da Rosa", "Rocío Benítez", "Sofía Cabral"]);
  });

  it("sin la acción (la vista de antes) tampoco hay grupo ni pide nada", async () => {
    const acciones = crearAcciones();
    const { acompanantesDelPanel: _sinUsar, ...sinLista } = acciones;
    void _sinUsar;
    const vista = render(<EquipoVista datos={datosDePrueba()} acciones={sinLista} />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    await usuario.click(otroRadio());

    expect(within(selector()).queryByRole("group")).not.toBeInTheDocument();
    vista.unmount();
  });

  it("si no hay otros colportores pero sí coordinadores, «Otro» se puede elegir; sin ninguno, no", async () => {
    const solo = datosDePrueba({ colportores: [colportor({ id: "florencia", nombre: "Florencia Pintos" })] });

    const con = await abrir({ datos: solo });
    await waitFor(() => expect(otroRadio()).toBeEnabled());
    await con.usuario.click(otroRadio());
    expect(textos(selector())).toEqual(["Elegí un colportor", "Alicia Benítez", "Marta Rivas", "Tomás Ibarra"]);
    expect(screen.queryByText("No hay otros colportores en esta campaña.")).not.toBeInTheDocument();
    con.unmount();

    await abrir({ datos: solo, acciones: crearAcciones(async () => lista()) });
    await waitFor(() => expect(otroRadio()).toBeDisabled());
    expect(screen.getByText("No hay otros colportores en esta campaña.")).toBeInTheDocument();
  });

  it("una lista larga (150 personas) y nombres larguísimos se arman sin romper el selector", async () => {
    const muchas = Array.from({ length: 150 }, (_, i) => ({ id: `usr-${i}`, nombre: `Coordinador ${String(i).padStart(3, "0")} ${"Apellido ".repeat(i === 7 ? 12 : 1)}`.trim() }));
    const { usuario } = await abrir({ acciones: crearAcciones(async () => lista(...muchas)) });
    await waitFor(() => expect(otroRadio()).toBeEnabled());

    await usuario.click(otroRadio());

    expect(textos(grupo())).toHaveLength(150);
    await usuario.selectOptions(selector(), muchas[149]!.nombre);
    expect(selector()).toHaveValue("usr-149");
  });
});

describe("cuando la lista no llega", () => {
  it("mientras carga, los colportores ya se pueden elegir y registrar", async () => {
    let liberar: (r: ResultadoAcompanantes) => void = () => {};
    const acciones = crearAcciones(() => new Promise((r) => (liberar = r)));
    const { usuario } = await abrir({ acciones });

    await usuario.click(otroRadio());
    expect(within(selector()).queryByRole("group")).not.toBeInTheDocument();
    await usuario.selectOptions(selector(), "Sofía Cabral");
    await usuario.click(botonDe("mar 20/10"));
    expect(acciones.registrarAcompanamiento).toHaveBeenCalledWith("j1", { acompananteId: "sofia" });

    // Y al llegar, el grupo aparece sin perder lo elegido.
    liberar(lista(MARTA));
    expect(await within(selector()).findByRole("group", { name: "Coordinadores y administradores" })).toBeInTheDocument();
    expect(selector()).toHaveValue("sofia");
  });

  it("un rechazo lo dice con su texto, deja elegir a los colportores y «Reintentar» trae el grupo", async () => {
    const respuestas: ResultadoAcompanantes[] = [{ ok: false, mensaje: "No se pudieron traer los coordinadores y administradores. Probá de nuevo más tarde." }, lista(MARTA)];
    const acciones = crearAcciones(async () => respuestas.shift() ?? lista());
    const { usuario } = await abrir({ acciones });
    await usuario.click(otroRadio());

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron traer los coordinadores y administradores. Probá de nuevo más tarde.");
    expect(screen.getByRole("alert")).toHaveTextContent("Mientras tanto podés elegir entre los colportores de la campaña.");
    await usuario.selectOptions(selector(), "Emiliano Sosa");

    await usuario.click(screen.getByRole("button", { name: "Reintentar traer los coordinadores y administradores" }));

    expect(await within(selector()).findByRole("group", { name: "Coordinadores y administradores" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(selector()).toHaveValue("emiliano");
    expect(acciones.acompanantesDelPanel).toHaveBeenCalledTimes(2);
  });

  it("una caída de conexión también se dice, sin tapar el registro con los colportores", async () => {
    const acciones = crearAcciones(async () => {
      throw new Error("sin red");
    });
    const { usuario } = await abrir({ acciones });
    await usuario.click(otroRadio());

    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para traer los coordinadores y administradores.");
    await usuario.selectOptions(selector(), "Federico Da Rosa");
    await usuario.click(botonDe("mar 20/10"));
    expect(acciones.registrarAcompanamiento).toHaveBeenCalledWith("j1", { acompananteId: "federico" });
  });

  it("con la lista caída y sin otros colportores, «Otro» sigue disponible para llegar al «Reintentar»", async () => {
    const solo = datosDePrueba({ colportores: [colportor({ id: "florencia", nombre: "Florencia Pintos" })] });
    const acciones = crearAcciones(async () => ({ ok: false, mensaje: "Sin permiso." }));
    const { usuario } = await abrir({ datos: solo, acciones });

    await waitFor(() => expect(otroRadio()).toBeEnabled());
    await usuario.click(otroRadio());

    expect(await screen.findByRole("alert")).toHaveTextContent("Sin permiso.");
    expect(screen.getByRole("button", { name: "Reintentar traer los coordinadores y administradores" })).toBeInTheDocument();
  });
});

describe("casos límite del registro a nombre de un coordinador", () => {
  it("un doble toque manda un solo registro", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockImplementation(() => new Promise(() => {}));
    const { usuario } = await abrir({ acciones });
    await waitFor(() => expect(otroRadio()).toBeEnabled());
    await usuario.click(otroRadio());
    await usuario.selectOptions(selector(), "Alicia Benítez");

    await usuario.dblClick(botonDe("mar 20/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledTimes(1);
    expect(acciones.registrarAcompanamiento).toHaveBeenCalledWith("j1", { acompananteId: "usr-alicia" });
  });

  it("si falla a mitad de la acción, el botón vuelve a habilitarse y lo elegido sigue ahí", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockRejectedValueOnce(new Error("sin red"));
    const { usuario } = await abrir({ acciones });
    await waitFor(() => expect(otroRadio()).toBeEnabled());
    await usuario.click(otroRadio());
    await usuario.selectOptions(selector(), "Tomás Ibarra");

    await usuario.click(botonDe("mar 20/10"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para registrar el acompañamiento.");
    expect(botonDe("mar 20/10")).toHaveAttribute("aria-disabled", "false");
    expect(selector()).toHaveValue("usr-tomas");

    await usuario.click(botonDe("mar 20/10"));
    expect(await screen.findByText(/Acompañamiento registrado/)).toBeInTheDocument();
  });

  it("dos jornadas seguidas a nombre de personas distintas llevan cada una la suya", async () => {
    const resolvers: Record<string, (r: ResultadoAcompanamiento) => void> = {};
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockImplementation((id) => new Promise((r) => (resolvers[id] = r)));
    const { usuario } = await abrir({ acciones });
    await waitFor(() => expect(otroRadio()).toBeEnabled());
    await usuario.click(otroRadio());

    await usuario.selectOptions(selector(), "Marta Rivas");
    await usuario.click(botonDe("mar 20/10"));
    await usuario.selectOptions(selector(), "Sofía Cabral");
    await usuario.click(botonDe("sáb 17/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenNthCalledWith(1, "j1", { acompananteId: "usr-marta" });
    expect(acciones.registrarAcompanamiento).toHaveBeenNthCalledWith(2, "j2", { acompananteId: "sofia" });
    resolvers.j1!(ok("2026-10-20", { acompanante: "Marta Rivas" }));
    resolvers.j2!(ok("2026-10-17", { acompanante: "Sofía Cabral" }));
    await waitFor(() => {
      const items = within(screen.getByRole("list", { name: /Jornadas terminadas/ })).getAllByRole("listitem");
      expect(items[0]).toHaveTextContent("Acompañó Marta Rivas");
      expect(items[1]).toHaveTextContent("Acompañó Sofía Cabral");
    });
  });

  it("cerrar el registro y volver a abrirlo pide la lista de nuevo y la muestra", async () => {
    const { acciones, usuario } = await abrir();
    await waitFor(() => expect(otroRadio()).toBeEnabled());

    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));
    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    await waitFor(() => expect(otroRadio()).toBeEnabled());
    await usuario.click(otroRadio());

    expect(acciones.acompanantesDelPanel).toHaveBeenCalledTimes(2);
    expect(textos(grupo())).toEqual(["Alicia Benítez", "Marta Rivas", "Tomás Ibarra"]);
  });

  it("cerrar el registro antes de que llegue la lista no deja nada colgado ni rompe al reabrir", async () => {
    let liberar: (r: ResultadoAcompanantes) => void = () => {};
    const acciones = crearAcciones(() => new Promise((r) => (liberar = r)));
    const { usuario } = await abrir({ acciones });

    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));
    liberar(lista(MARTA));

    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    expect(screen.getByRole("radio", { name: "Yo" })).toBeChecked();
  });
});

describe("accesibilidad del selector con grupo", () => {
  it("axe A/AA sin violaciones con el grupo, y con el aviso de la lista caída", async () => {
    vi.setConfig({ testTimeout: 60_000 });
    const corrida = async (contenedor: HTMLElement) =>
      (
        await axe.run(contenedor, {
          rules: { "color-contrast": { enabled: false } },
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
        })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

    const bien = await abrir();
    await waitFor(() => expect(otroRadio()).toBeEnabled());
    await bien.usuario.click(otroRadio());
    expect(await corrida(bien.container)).toEqual([]);
    bien.unmount();

    const mal = await abrir({ acciones: crearAcciones(async () => ({ ok: false, mensaje: "No se pudieron traer los coordinadores y administradores." })) });
    await mal.usuario.click(otroRadio());
    await screen.findByRole("alert");
    expect(await corrida(mal.container)).toEqual([]);
  });
});
