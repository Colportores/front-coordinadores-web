import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { JornadaParaAcompanar, ResultadoAcompanamiento, ResultadoJornadas } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { colportor, datosDePrueba, HOY } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";

const J1: JornadaParaAcompanar = { id: "j1", dia: "2026-10-20", horas: 5.5, acompanante: null, acompananteEsVos: false };
const J2: JornadaParaAcompanar = { id: "j2", dia: "2026-10-19", horas: 4, acompanante: "Tomás Ibarra", acompananteEsVos: false };
const J3: JornadaParaAcompanar = { id: "j3", dia: "2026-10-17", horas: 3.2, acompanante: null, acompananteEsVos: false };

function ok(dia: string): ResultadoAcompanamiento {
  return { ok: true, dia, acompanante: "Mariana Pérez", yaEstaba: false, origen: null, nota: null };
}

function crearAcciones(jornadas: JornadaParaAcompanar[] = [J1, J2, J3]) {
  const jornadasParaAcompanar = vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async (): Promise<ResultadoJornadas> => ({ ok: true, jornadas }));
  const registrarAcompanamiento = vi.fn<AccionesEquipo["registrarAcompanamiento"]>(async (id): Promise<ResultadoAcompanamiento> =>
    ok(jornadas.find((j) => j.id === id)?.dia ?? HOY),
  );
  const elegirCarrera = vi.fn<AccionesEquipo["elegirCarrera"]>(async () => ({ ok: false, mensaje: "Sin becas en este test." }));
  const asignarTipoDeBeca = vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(async () => ({ ok: false, mensaje: "Sin becas en este test." }));
  return { jornadasParaAcompanar, registrarAcompanamiento, elegirCarrera, asignarTipoDeBeca } satisfies AccionesEquipo;
}

function mostrar(datos = datosDePrueba(), acciones: AccionesEquipo = crearAcciones()) {
  const resultado = render(<EquipoVista datos={datos} acciones={acciones} />);
  return { ...resultado, acciones, usuario: userEvent.setup() };
}

const fila = (nombre: RegExp | string) => screen.getByRole("row", { name: nombre });

async function irAAcompanamientos(usuario: ReturnType<typeof userEvent.setup>, ciudad?: string) {
  if (ciudad) await usuario.click(screen.getByRole("button", { name: new RegExp(`^${ciudad}`) }));
  await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
}

describe("EquipoVista · la lista de ciudades", () => {
  it("abre en todas las ciudades, con la pestaña «Zonas»", () => {
    mostrar();

    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByText("4 colportores + 1 sin zona")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zonas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("table", { name: "Zonas de cada colportor" })).toBeInTheDocument();
  });

  it("lista las ciudades por departamento, con la cantidad de colportores de cada una", () => {
    mostrar();
    const nav = screen.getByRole("navigation", { name: "Ciudades" });

    expect(within(nav).getByRole("heading", { name: "DEPTO. ARTIGAS" })).toBeInTheDocument();
    expect(within(nav).getByRole("heading", { name: "DEPTO. RIVERA" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Todas las ciudades, 4 colportores y 1 sin zona" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("button", { name: "Todo el departamento, 2 colportores y 1 sin zona" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Rivera, 2 colportores y 1 sin zona" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Bella Unión, 1 colportor y 1 sin zona" })).toBeInTheDocument();
    // Los que no tienen zona se suman a cada renglón: no tienen uno propio.
    expect(within(nav).queryByRole("button", { name: /^Sin zona asignada/ })).not.toBeInTheDocument();
  });

  it("elegir una ciudad muestra solo a sus colportores, sin cabeceras, con el departamento en el subtítulo", async () => {
    const { usuario } = mostrar();

    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));

    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
    expect(screen.getByText("2 colportores + 1 sin zona · Departamento Rivera")).toBeInTheDocument();
    expect(fila(/Emiliano Sosa/)).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Sofía Cabral/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Sin zona asignada")).toBeInTheDocument();
  });

  it("«Todo el departamento» junta sus ciudades, cada una con su cabecera", async () => {
    const { usuario } = mostrar();

    await usuario.click(screen.getByRole("button", { name: /^Todo el departamento/ }));

    expect(screen.getByRole("heading", { level: 2, name: "Departamento Artigas" })).toBeInTheDocument();
    const tabla = within(screen.getByRole("table"));
    expect(tabla.getByText("Artigas")).toBeInTheDocument();
    expect(tabla.getByText("Bella Unión")).toBeInTheDocument();
    expect(fila(/Sofía Cabral/)).toBeInTheDocument();
    expect(fila(/Federico Da Rosa/)).toBeInTheDocument();
  });

  it("quien no tiene zona aparece dentro de cada ciudad, al final y bajo «Sin zona asignada», y una sola vez en Todas", async () => {
    const { usuario } = mostrar();

    expect(screen.getAllByRole("row", { name: /Rocío Benítez/ })).toHaveLength(1);
    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    expect(fila(/Rocío Benítez/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: /^Bella Unión/ }));
    expect(fila(/Rocío Benítez/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: /^Todo el departamento/ }));
    expect(screen.getAllByRole("row", { name: /Rocío Benítez/ })).toHaveLength(1);
  });

  it("la lista se contrae a abreviaturas, el foco queda en el botón y se puede elegir desde ahí", async () => {
    const { usuario } = mostrar();

    await usuario.click(screen.getByRole("button", { name: "Contraer ciudades" }));

    expect(screen.getByRole("button", { name: "Expandir ciudades" })).toHaveFocus();
    expect(screen.queryByRole("heading", { name: "Ciudades" })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Bella Unión" }));
    expect(screen.getByRole("heading", { level: 2, name: "Bella Unión" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bella Unión" })).toHaveAttribute("aria-current", "true");

    await usuario.click(screen.getByRole("button", { name: "Expandir ciudades" }));
    expect(screen.getByRole("button", { name: "Contraer ciudades" })).toHaveFocus();
  });

  it("una ciudad sin colportores lo dice y dice qué hacer", async () => {
    const datos = datosDePrueba({ colportores: datosDePrueba().colportores.filter((c) => c.ciudadId !== "bu" && c.zonaActual !== null) });
    const { usuario } = mostrar(datos);

    await usuario.click(screen.getByRole("button", { name: /^Bella Unión/ }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Todavía no hay colportores en Bella Unión. Cuando asignes alguno a una de sus zonas, aparece acá.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("una campaña sin colportores manda a «+ Añadir colportor»", () => {
    mostrar(datosDePrueba({ colportores: [] }));

    expect(screen.getByRole("status")).toHaveTextContent("Todavía no hay colportores en esta campaña. Añadilos con «+ Añadir colportor».");
    expect(screen.getByRole("link", { name: "+ Añadir colportor" })).toHaveAttribute("href", "/equipo/anadir");
  });

  it("dos ciudades con el mismo nombre quedan cada una bajo su departamento y se eligen por separado", async () => {
    const datos = datosDePrueba({
      ciudades: [
        { id: "sj1", nombre: "San José", departamento: "San José" },
        { id: "sj2", nombre: "San José", departamento: "Flores" },
      ],
      colportores: [colportor({ id: "a", nombre: "Ana", ciudadId: "sj1" }), colportor({ id: "b", nombre: "Beto", ciudadId: "sj2" })],
    });
    const { usuario } = mostrar(datos);
    const nav = screen.getByRole("navigation", { name: "Ciudades" });

    expect(within(nav).getByRole("heading", { name: "DEPTO. FLORES" })).toBeInTheDocument();
    expect(within(nav).getByRole("heading", { name: "DEPTO. SAN JOSÉ" })).toBeInTheDocument();
    const botones = within(nav).getAllByRole("button", { name: /^San José/ });
    expect(botones).toHaveLength(2);

    await usuario.click(botones[0]);
    expect(screen.getByText("1 colportor · Departamento Flores")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Beto/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Ana/ })).not.toBeInTheDocument();
  });

  it("si la lista no trae departamentos, las ciudades van sin título", () => {
    const datos = datosDePrueba({
      ciudades: [
        { id: "riv", nombre: "Rivera", departamento: null },
        { id: "art", nombre: "Artigas", departamento: null },
      ],
    });
    mostrar(datos);
    const nav = screen.getByRole("navigation", { name: "Ciudades" });

    expect(within(nav).queryByRole("heading", { name: /DEPTO/ })).not.toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /^Artigas/ })).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: /Todo el departamento/ })).not.toBeInTheDocument();
  });
});

describe("EquipoVista · pendientes de acción", () => {
  it("en «Zonas» solo la solicitud: la colportora sin zona ya está en la tabla con su botón", () => {
    mostrar();
    const pendientes = screen.getByRole("list", { name: "Pendientes de acción" });

    expect(within(pendientes).getAllByRole("listitem")).toHaveLength(1);
    expect(within(pendientes).getByText("1 persona pidió entrar a la campaña")).toBeInTheDocument();
    expect(within(pendientes).getByRole("link", { name: "Revisar" })).toHaveAttribute("href", "/equipo/anadir");
  });

  it("en «Acompañamientos» suma el aviso de la colportora sin zona, que lleva a la vista 24", async () => {
    const { usuario } = mostrar();

    await irAAcompanamientos(usuario);
    const pendientes = screen.getByRole("list", { name: "Pendientes de acción" });

    expect(within(pendientes).getByText("Rocío Benítez no tiene zona asignada")).toBeInTheDocument();
    expect(within(pendientes).getByRole("link", { name: "Asignar zona" })).toHaveAttribute("href", "/ciudades");
    expect(within(pendientes).getByText("1 persona pidió entrar a la campaña")).toBeInTheDocument();
  });

  it("varias personas: el aviso va en plural; sin solicitudes, no hay aviso", async () => {
    const datos = datosDePrueba({
      solicitudesPendientes: 3,
      colportores: [
        colportor({ id: "a", nombre: "A", ciudadId: null, zonaActual: null }),
        colportor({ id: "b", nombre: "B", ciudadId: null, zonaActual: null }),
      ],
    });
    const { usuario } = mostrar(datos);

    await irAAcompanamientos(usuario);

    expect(screen.getByText("2 colportores no tienen zona asignada")).toBeInTheDocument();
    expect(screen.getByText("3 personas pidieron entrar a la campaña")).toBeInTheDocument();
  });

  it("sin nada pendiente no hay franja", () => {
    mostrar(datosDePrueba({ solicitudesPendientes: 0 }));

    expect(screen.queryByRole("list", { name: "Pendientes de acción" })).not.toBeInTheDocument();
  });

  it("en una ciudad el aviso de quien no tiene zona sigue, porque no tiene ciudad", async () => {
    const { usuario } = mostrar();

    await irAAcompanamientos(usuario, "Rivera");

    expect(screen.getByText("Rocío Benítez no tiene zona asignada")).toBeInTheDocument();
  });
});

describe("EquipoVista · pestaña Zonas", () => {
  it("muestra la zona de hoy desde cuándo la tiene, las anteriores con sus fechas y las casas en todas ellas", async () => {
    const { usuario } = mostrar();
    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    const emiliano = within(fila(/Emiliano Sosa/));

    expect(emiliano.getByText("Santa Isabel")).toBeInTheDocument();
    expect(emiliano.getByText("desde 06/10")).toBeInTheDocument();
    expect(emiliano.getByText("Bisso")).toBeInTheDocument();
    expect(emiliano.getByText("01/09 a 05/10")).toBeInTheDocument();
    expect(emiliano.getByText("340")).toBeInTheDocument();
    expect(emiliano.getByText("en todas sus zonas")).toBeInTheDocument();
    expect(emiliano.getByRole("link", { name: "Cambiar zona de Emiliano Sosa" })).toHaveAttribute("href", "/ciudades");
  });

  it("sin zonas anteriores muestra «—» y no dice «en todas sus zonas»", async () => {
    const { usuario } = mostrar();
    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    const florencia = within(fila(/Florencia Pintos/));

    expect(florencia.getByText("—")).toBeInTheDocument();
    expect(florencia.queryByText("en todas sus zonas")).not.toBeInTheDocument();
  });

  it("varias zonas anteriores van en el orden en que las tuvo, y una zona dada de baja se dice", async () => {
    const { usuario } = mostrar();
    await usuario.click(screen.getByRole("button", { name: /^Artigas/ }));
    const sofia = within(fila(/Sofía Cabral/));

    expect(sofia.getByText("Ayuí · Cuaró (dada de baja)")).toBeInTheDocument();
    expect(sofia.getByText("01/09 a 20/09 · 21/09 a 11/10")).toBeInTheDocument();
  });

  it("una zona que ya tenía cuando se empezó a guardar el historial dice «desde antes del…», sin inventar la fecha", async () => {
    const datos = datosDePrueba({
      colportores: [
        colportor({
          id: "i",
          nombre: "Inicial",
          zonaActual: { id: "z", nombre: "Centro", desde: "2026-10-15", desdeInicial: true },
          zonasAnteriores: [{ nombre: "Vieja", desde: "2026-10-15", hasta: "2026-10-16", eliminada: false, inicial: true }],
        }),
      ],
    });
    mostrar(datos);
    const inicial = within(fila(/Inicial/));

    expect(inicial.getByText("desde antes del 15/10")).toBeInTheDocument();
    expect(inicial.getByText("hasta el 16/10")).toBeInTheDocument();
  });

  it("la colportora sin zona figura con «Asignar zona» como acción principal", () => {
    mostrar();
    const rocio = within(fila(/Rocío Benítez/));

    expect(rocio.getByText("Sin zona")).toBeInTheDocument();
    expect(rocio.getByRole("link", { name: "Asignar zona a Rocío Benítez" })).toHaveAttribute("href", "/ciudades");
    expect(rocio.queryByRole("link", { name: /Cambiar zona/ })).not.toBeInTheDocument();
  });

  it("un colportor sin casas registradas muestra 0", () => {
    mostrar();

    expect(within(fila(/Rocío Benítez/)).getByText("0")).toBeInTheDocument();
  });
});

describe("EquipoVista · pestaña Acompañamientos", () => {
  it("cada colportor con su total, las semanas acompañadas y los días sin acompañar; los que hace más no acompañan, primero", async () => {
    const { usuario } = mostrar();
    await irAAcompanamientos(usuario, "Rivera");

    expect(screen.getAllByRole("rowheader").map((c) => c.textContent)).toEqual(["Florencia Pintos", "Emiliano Sosa", "Rocío Benítez"]);
    expect(screen.getByRole("columnheader", { name: "SEMANAS S1 A S8" })).toBeInTheDocument();
    expect(screen.getByText("2 colportores + 1 sin zona · Departamento Rivera · 2 acompañamientos en la campaña · ordenado por días sin acompañar")).toBeInTheDocument();

    const emiliano = within(fila(/Emiliano Sosa/));
    expect(emiliano.getByText("hace 19 días")).toBeInTheDocument();
    expect(emiliano.getByText("último: vie 02/10")).toBeInTheDocument();
    expect(emiliano.getByRole("cell", { name: "2" })).toBeInTheDocument();
    expect(emiliano.getByRole("img", { name: "Semanas con acompañamiento: S2, S5" })).toBeInTheDocument();
  });

  it("quien nunca fue acompañado dice «Nunca» y cuenta los días desde el inicio de la campaña", async () => {
    const { usuario } = mostrar();
    await irAAcompanamientos(usuario, "Rivera");
    const florencia = within(fila(/Florencia Pintos/));

    expect(florencia.getByText("Nunca")).toBeInTheDocument();
    expect(florencia.getByText("50 días desde el inicio")).toBeInTheDocument();
    expect(florencia.getByRole("img", { name: "Semanas con acompañamiento: ninguna semana" })).toBeInTheDocument();
    expect(florencia.getByRole("cell", { name: "0" })).toBeInTheDocument();
  });

  it("hoy, ayer y 1 día desde el inicio se escriben en singular", async () => {
    const datos = datosDePrueba({
      hoy: "2026-09-02",
      colportores: [
        colportor({ id: "n", nombre: "Nunca Uno" }),
        colportor({ id: "h", nombre: "Hoy Dos", acompanamientos: [{ jornadaId: "1", dia: "2026-09-02", horas: 1, acompanante: "X", acompananteEsVos: false, origen: null, nota: null }] }),
        colportor({ id: "a", nombre: "Ayer Tres", acompanamientos: [{ jornadaId: "2", dia: "2026-09-01", horas: 1, acompanante: "X", acompananteEsVos: false, origen: null, nota: null }] }),
      ],
    });
    const { usuario } = mostrar(datos);
    await irAAcompanamientos(usuario);

    expect(within(fila(/Nunca Uno/)).getByText("1 día desde el inicio")).toBeInTheDocument();
    expect(within(fila(/Hoy Dos/)).getByText("hoy")).toBeInTheDocument();
    expect(within(fila(/Ayer Tres/)).getByText("ayer")).toBeInTheDocument();
    expect(screen.getByText(/3 colportores · 2 acompañamientos en la campaña/)).toBeInTheDocument();
  });

  it("en una campaña que todavía no empezó no se cuentan días", async () => {
    const { usuario } = mostrar(datosDePrueba({ campaniaInicio: "2026-11-02", hoy: HOY }));
    await irAAcompanamientos(usuario, "Rivera");

    expect(within(fila(/Florencia Pintos/)).getByText("La campaña todavía no empezó")).toBeInTheDocument();
  });

  it("el subtítulo dice «1 acompañamiento» en singular", async () => {
    const { usuario } = mostrar();
    await irAAcompanamientos(usuario, "Artigas");

    expect(screen.getByText("1 colportor + 1 sin zona · Departamento Artigas · 1 acompañamiento en la campaña · ordenado por días sin acompañar")).toBeInTheDocument();
  });

  it("«Ver historial» abre debajo de la fila cada acompañamiento con su fecha, sus horas y quién acompañó", async () => {
    const { usuario } = mostrar();
    await irAAcompanamientos(usuario, "Rivera");

    await usuario.click(screen.getByRole("button", { name: "Ver historial de Emiliano Sosa" }));

    const historial = screen.getByRole("region", { name: "Historial de acompañamientos de Emiliano Sosa" });
    expect(within(historial).getByText("HISTORIAL DE ACOMPAÑAMIENTOS · EMILIANO SOSA")).toBeInTheDocument();
    const items = within(historial).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("vie 02/10");
    expect(items[0]).toHaveTextContent("4,5 h");
    expect(items[0]).toHaveTextContent("Mariana Pérez (vos)");
    expect(items[1]).toHaveTextContent("mar 08/09");
    expect(items[1]).toHaveTextContent("Tomás Ibarra");
    expect(items[1]).not.toHaveTextContent("(vos)");
    const boton = screen.getByRole("button", { name: "Ocultar historial de Emiliano Sosa" });
    expect(boton).toHaveAttribute("aria-expanded", "true");
  });

  it("se pueden abrir varios historiales a la vez y cada «Ocultar» cierra solo el suyo", async () => {
    const { usuario } = mostrar();
    await irAAcompanamientos(usuario, "Rivera");

    await usuario.click(screen.getByRole("button", { name: "Ver historial de Emiliano Sosa" }));
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Florencia Pintos" }));
    expect(screen.getAllByRole("region", { name: /Historial de acompañamientos/ })).toHaveLength(2);
    expect(screen.getByText("Todavía no se lo acompañó en esta campaña.")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Ocultar historial de Emiliano Sosa" }));
    expect(screen.getAllByRole("region", { name: /Historial de acompañamientos/ })).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Historial de acompañamientos de Emiliano Sosa" })).not.toBeInTheDocument();
  });

  it("el historial abierto sobrevive a cambiar de pestaña y de ciudad y volver", async () => {
    const { usuario } = mostrar();
    await irAAcompanamientos(usuario, "Rivera");
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Emiliano Sosa" }));

    await usuario.click(screen.getByRole("button", { name: "Zonas" }));
    await usuario.click(screen.getByRole("button", { name: /^Artigas/ }));
    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));

    expect(screen.getByRole("region", { name: "Historial de acompañamientos de Emiliano Sosa" })).toBeInTheDocument();
  });

  it("una jornada todavía abierta figura «en curso»", async () => {
    const datos = datosDePrueba({
      colportores: [
        colportor({ id: "a", nombre: "Abierta", acompanamientos: [{ jornadaId: "1", dia: HOY, horas: null, acompanante: "Mariana Pérez", acompananteEsVos: true, origen: null, nota: null }] }),
      ],
    });
    const { usuario } = mostrar(datos);
    await irAAcompanamientos(usuario);
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Abierta" }));

    expect(within(screen.getByRole("region", { name: /Historial/ })).getByText("en curso")).toBeInTheDocument();
  });

  it("en «Todas las ciudades» cada ciudad tiene su cabecera y se ordena dentro de ella", async () => {
    const { usuario } = mostrar();
    await irAAcompanamientos(usuario);

    const tabla = within(screen.getByRole("table"));
    for (const cabecera of ["Artigas", "Bella Unión", "Rivera", "Sin zona asignada"]) expect(tabla.getByText(cabecera)).toBeInTheDocument();
    expect(within(fila(/Rocío Benítez/)).getByText("Sin zona")).toBeInTheDocument();
  });
});

describe("EquipoVista · registrar un acompañamiento", () => {
  async function abrir(nombre = "Florencia Pintos", acciones = crearAcciones(), datos = datosDePrueba()) {
    const vista = mostrar(datos, acciones);
    await irAAcompanamientos(vista.usuario, "Rivera");
    await vista.usuario.click(screen.getByRole("button", { name: `Registrar acompañamiento de ${nombre}` }));
    return { ...vista, acciones };
  }
  const botonDe = (j: string) => screen.getByRole("button", { name: `Registrar acompañamiento en la jornada de Florencia Pintos del ${j}` });

  it("trae las jornadas terminadas del colportor: las libres se pueden registrar y las ya acompañadas dicen quién", async () => {
    const { acciones } = await abrir();

    expect(acciones.jornadasParaAcompanar).toHaveBeenCalledWith("florencia");
    const lista = await screen.findByRole("list", { name: "Jornadas terminadas de Florencia Pintos" });
    const items = within(lista).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("mar 20/10");
    expect(items[0]).toHaveTextContent("5,5 h");
    expect(botonDe("mar 20/10")).toBeInTheDocument();
    expect(items[1]).toHaveTextContent("Acompañó Tomás Ibarra");
    expect(within(items[1]).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "REGISTRAR ACOMPAÑAMIENTO · FLORENCIA PINTOS" })).toHaveFocus();
  });

  it("mientras trae las jornadas lo dice", async () => {
    let resolver: (r: ResultadoJornadas) => void = () => {};
    const acciones = crearAcciones();
    acciones.jornadasParaAcompanar.mockReturnValueOnce(new Promise((r) => (resolver = r)));
    await abrir("Florencia Pintos", acciones);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando las jornadas de Florencia Pintos…");

    await act(async () => resolver({ ok: true, jornadas: [J1] }));
    expect(await screen.findByRole("list", { name: /Jornadas terminadas/ })).toBeInTheDocument();
  });

  it("registrar anota el acompañamiento: la fila sube el total, baja los días y la jornada dice quién", async () => {
    const { acciones, usuario } = await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(botonDe("mar 20/10"));

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledTimes(1);
    expect(acciones.registrarAcompanamiento).toHaveBeenCalledWith("j1", {});
    expect(await screen.findByText("Acompañamiento registrado: jornada de Florencia Pintos, mar 20/10.")).toBeInTheDocument();
    const florencia = within(fila(/^Florencia Pintos/));
    expect(florencia.getByText("ayer")).toBeInTheDocument();
    expect(florencia.getByText("último: mar 20/10")).toBeInTheDocument();
    expect(florencia.getByRole("cell", { name: "1" })).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: /Jornadas terminadas/ });
    expect(within(lista).getAllByRole("listitem")[0]).toHaveTextContent("Acompañó Mariana Pérez (vos)");
    expect(within(lista).getAllByRole("listitem")[0]).toHaveFocus();
    // Y el historial de la fila lo muestra.
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Florencia Pintos" }));
    expect(within(screen.getByRole("region", { name: /Historial de acompañamientos de Florencia/ })).getByText("5,5 h")).toBeInTheDocument();
  });

  it("un doble toque registra una sola vez", async () => {
    let resolver: (r: ResultadoAcompanamiento) => void = () => {};
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockReturnValueOnce(new Promise((r) => (resolver = r)));
    await abrir("Florencia Pintos", acciones);
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    const boton = botonDe("mar 20/10");
    fireEvent.click(boton);
    fireEvent.click(boton);

    expect(acciones.registrarAcompanamiento).toHaveBeenCalledTimes(1);
    expect(boton).toHaveTextContent("Registrando…");
    expect(boton).toHaveAttribute("aria-disabled", "true");

    await act(async () => resolver(ok("2026-10-20")));
    expect(await screen.findByText(/Acompañamiento registrado/)).toBeInTheDocument();
    expect(acciones.registrarAcompanamiento).toHaveBeenCalledTimes(1);
  });

  it("si falla a mitad, el botón vuelve a habilitarse, dice qué hacer y se puede reintentar", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockRejectedValueOnce(new Error("sin red"));
    const { usuario } = await abrir("Florencia Pintos", acciones);
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(botonDe("mar 20/10"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para registrar el acompañamiento. Revisá la conexión y probá de nuevo.");
    const boton = botonDe("mar 20/10");
    expect(boton).toHaveTextContent("Registrar");
    expect(boton).toHaveAttribute("aria-disabled", "false");
    expect(within(fila(/^Florencia Pintos/)).getByText("Nunca")).toBeInTheDocument();

    await usuario.click(boton);
    expect(await screen.findByText(/Acompañamiento registrado/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(acciones.registrarAcompanamiento).toHaveBeenCalledTimes(2);
  });

  it("dos jornadas seguidas, antes de que termine la primera, se registran las dos aunque contesten al revés", async () => {
    const resolvers: Record<string, (r: ResultadoAcompanamiento) => void> = {};
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockImplementation((id) => new Promise((r) => (resolvers[id] = r)));
    await abrir("Florencia Pintos", acciones);
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    fireEvent.click(botonDe("mar 20/10"));
    fireEvent.click(botonDe("sáb 17/10"));
    expect(acciones.registrarAcompanamiento.mock.calls.map(([id]) => id)).toEqual(["j1", "j3"]);

    await act(async () => resolvers.j3(ok("2026-10-17")));
    await act(async () => resolvers.j1(ok("2026-10-20")));

    const florencia = within(fila(/^Florencia Pintos/));
    expect(florencia.getByRole("cell", { name: "2" })).toBeInTheDocument();
    expect(florencia.getByText("ayer")).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: /Jornadas terminadas/ })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Acompañó Mariana Pérez (vos)");
    expect(items[2]).toHaveTextContent("Acompañó Mariana Pérez (vos)");
  });

  it("si la jornada cambió (otra persona ya la acompañó), muestra el rechazo y vuelve a pedir la lista", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce({
      ok: false,
      mensaje: "Esta jornada ya figura acompañada por Lorena Gil. El acompañamiento registrado no se cambia desde el panel.",
      recargar: true,
    });
    const { usuario } = await abrir("Florencia Pintos", acciones);
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    acciones.jornadasParaAcompanar.mockResolvedValueOnce({ ok: true, jornadas: [{ ...J1, acompanante: "Lorena Gil" }, J2, J3] });

    await usuario.click(botonDe("mar 20/10"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esta jornada ya figura acompañada por Lorena Gil.");
    expect(acciones.jornadasParaAcompanar).toHaveBeenCalledTimes(2);
    const items = within(screen.getByRole("list", { name: /Jornadas terminadas/ })).getAllByRole("listitem");
    await waitFor(() => expect(items[0]).toHaveTextContent("Acompañó Lorena Gil"));
    expect(within(fila(/^Florencia Pintos/)).getByText("Nunca")).toBeInTheDocument();
  });

  it("un rechazo sin recarga deja la lista como estaba y el botón disponible", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce({ ok: false, mensaje: "No podés registrarte como acompañante de tu propia jornada." });
    const { usuario } = await abrir("Florencia Pintos", acciones);
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(botonDe("mar 20/10"));

    expect(await screen.findByRole("alert")).toHaveTextContent("No podés registrarte como acompañante de tu propia jornada.");
    expect(acciones.jornadasParaAcompanar).toHaveBeenCalledTimes(1);
    expect(botonDe("mar 20/10")).toHaveAttribute("aria-disabled", "false");
  });

  it("si ya figuraba a nombre del coordinador lo dice y no suma otro acompañamiento", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce({ ok: true, dia: "2026-10-20", acompanante: "Mariana Pérez", yaEstaba: true, origen: null, nota: null });
    const { usuario } = await abrir("Florencia Pintos", acciones);
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(botonDe("mar 20/10"));

    expect(await screen.findByText("Esa jornada ya figuraba a tu nombre: Florencia Pintos, mar 20/10.")).toBeInTheDocument();
    expect(within(fila(/^Florencia Pintos/)).getByRole("cell", { name: "1" })).toBeInTheDocument();
  });

  it("si no se pueden traer las jornadas lo dice y «Reintentar» las vuelve a pedir", async () => {
    const acciones = crearAcciones();
    acciones.jornadasParaAcompanar.mockRejectedValueOnce(new Error("sin red"));
    const { usuario } = await abrir("Florencia Pintos", acciones);

    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para traer las jornadas. Revisá la conexión y probá de nuevo.");
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("list", { name: /Jornadas terminadas/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(acciones.jornadasParaAcompanar).toHaveBeenCalledTimes(2);
  });

  it("un rechazo al traer las jornadas muestra el texto de la base", async () => {
    const acciones = crearAcciones();
    acciones.jornadasParaAcompanar.mockResolvedValueOnce({ ok: false, mensaje: "Solo el coordinador de la campaña puede ver las jornadas de su equipo." });
    await abrir("Florencia Pintos", acciones);

    expect(await screen.findByRole("alert")).toHaveTextContent("Solo el coordinador de la campaña puede ver las jornadas de su equipo.");
  });

  it("sin jornadas terminadas explica qué falta", async () => {
    await abrir("Florencia Pintos", crearAcciones([]));

    expect(await screen.findByText(/Florencia Pintos todavía no terminó ninguna jornada en esta campaña/)).toBeInTheDocument();
  });

  it("«Cerrar» cierra el panel y devuelve el foco al botón de la fila", async () => {
    const { usuario } = await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByRole("region", { name: /Registrar acompañamiento de/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" })).toHaveFocus();
  });

  it("volver a tocar el botón de la fila lo cierra, y al volver a abrirlo pide las jornadas de nuevo", async () => {
    const { usuario, acciones } = await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    expect(screen.queryByRole("region", { name: /Registrar acompañamiento de/ })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));

    expect(await screen.findByRole("list", { name: /Jornadas terminadas/ })).toBeInTheDocument();
    expect(acciones.jornadasParaAcompanar).toHaveBeenCalledTimes(2);
  });

  it("abrir el registro de otro colportor cierra el anterior", async () => {
    const { usuario } = await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Emiliano Sosa" }));

    expect(screen.getAllByRole("region", { name: /Registrar acompañamiento de/ })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Registrar acompañamiento de Emiliano Sosa" })).toBeInTheDocument();
  });

  it("cambiar de ciudad o de pestaña cierra el registro", async () => {
    const { usuario } = await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });

    await usuario.click(screen.getByRole("button", { name: /^Artigas/ }));
    expect(screen.queryByRole("region", { name: /Registrar acompañamiento de/ })).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    await usuario.click(screen.getByRole("button", { name: "Zonas" }));
    expect(screen.queryByRole("region", { name: /Registrar acompañamiento de/ })).not.toBeInTheDocument();
  });

  it("si se cierra el panel mientras se registra, el acompañamiento igual queda anotado", async () => {
    let resolver: (r: ResultadoAcompanamiento) => void = () => {};
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockReturnValueOnce(new Promise((r) => (resolver = r)));
    const { usuario } = await abrir("Florencia Pintos", acciones);
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    fireEvent.click(botonDe("mar 20/10"));

    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));
    await act(async () => resolver(ok("2026-10-20")));

    expect(within(fila(/^Florencia Pintos/)).getByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(within(fila(/^Florencia Pintos/)).getByText("ayer")).toBeInTheDocument();
  });

  it("si la respuesta de una carga vieja llega tarde, no pisa a la nueva", async () => {
    let primera: (r: ResultadoJornadas) => void = () => {};
    const acciones = crearAcciones();
    acciones.jornadasParaAcompanar.mockReturnValueOnce(new Promise((r) => (primera = r)));
    const { usuario } = await abrir("Florencia Pintos", acciones);

    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    await act(async () => primera({ ok: true, jornadas: [] }));

    const items = within(await screen.findByRole("list", { name: /Jornadas terminadas/ })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });

  it("volver a entrar a la pantalla empieza de cero con lo que trae el servidor", async () => {
    const primera = await abrir();
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    primera.unmount();

    const { usuario } = mostrar();
    await irAAcompanamientos(usuario, "Rivera");

    expect(screen.queryByRole("region", { name: /Registrar acompañamiento de/ })).not.toBeInTheDocument();
    expect(within(fila(/^Florencia Pintos/)).getByText("Nunca")).toBeInTheDocument();
  });

  it("cada fila tiene su propio botón de registro, también la de quien no tiene zona", async () => {
    const { usuario } = mostrar();
    await irAAcompanamientos(usuario);

    expect(screen.getAllByRole("button", { name: /^Registrar acompañamiento de / })).toHaveLength(5);
  });
});

describe("EquipoVista · datos límite", () => {
  it("un equipo de 150 colportores se muestra completo en las dos pestañas", async () => {
    const muchos = Array.from({ length: 150 }, (_, i) => colportor({ id: `c${i}`, nombre: `Colportor ${String(i).padStart(3, "0")}` }));
    const { usuario } = mostrar(datosDePrueba({ colportores: muchos }));

    expect(screen.getByText("150 colportores")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(151);

    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    expect(screen.getAllByRole("button", { name: /^Registrar acompañamiento de / })).toHaveLength(150);
  });

  it("un nombre larguísimo sin espacios y muchas zonas anteriores no rompen la fila", () => {
    const nombre = "Maximiliano".repeat(20);
    const anteriores = Array.from({ length: 12 }, (_, i) => ({
      nombre: `Zona ${i}`,
      desde: "2026-09-01",
      hasta: "2026-09-02",
      eliminada: false,
      inicial: false,
    }));
    mostrar(datosDePrueba({ colportores: [colportor({ id: "l", nombre, zonasAnteriores: anteriores })] }));

    const celda = screen.getByRole("rowheader", { name: nombre });
    expect(celda.querySelector("span")).toHaveClass("wrap-anywhere");
    expect(screen.getByText(anteriores.map((a) => a.nombre).join(" · "))).toBeInTheDocument();
  });

  it("un historial de 60 acompañamientos se lista completo, del más nuevo al más viejo", async () => {
    const lista = Array.from({ length: 60 }, (_, i) => ({
      jornadaId: `j${i}`,
      dia: new Date(Date.UTC(2026, 8, 1 + (i % 50))).toISOString().slice(0, 10),
      horas: 4,
      acompanante: "Mariana Pérez",
      acompananteEsVos: true,
      origen: null,
      nota: null,
    }));
    const { usuario } = mostrar(datosDePrueba({ colportores: [colportor({ id: "m", nombre: "Muchos", acompanamientos: lista })] }));
    await irAAcompanamientos(usuario);

    await usuario.click(screen.getByRole("button", { name: "Ver historial de Muchos" }));

    const items = within(screen.getByRole("region", { name: /Historial/ })).getAllByRole("listitem");
    expect(items).toHaveLength(60);
    expect(items[0]).toHaveTextContent("mar 20/10");
  });

  it("una campaña con muchas semanas muestra las últimas 8", async () => {
    const { usuario } = mostrar(datosDePrueba({ hoy: "2026-11-18" }));
    await irAAcompanamientos(usuario);

    expect(screen.getByRole("columnheader", { name: "SEMANAS S5 A S12" })).toBeInTheDocument();
  });

  it("una campaña recién empezada tiene una sola semana y no dice «S1 A S1»", async () => {
    const { usuario } = mostrar(datosDePrueba({ campaniaInicio: HOY, hoy: HOY }));
    await irAAcompanamientos(usuario);

    expect(screen.getByRole("columnheader", { name: "SEMANA S1" })).toBeInTheDocument();
  });
});
