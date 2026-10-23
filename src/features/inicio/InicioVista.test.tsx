import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ResultadoTablero, TableroDelDia } from "@/datos/inicio";
import { crearFuenteInicioSimulada } from "@/datos/inicio/simulado";
import { olvidarAjustes } from "@/features/inicio/ajustes";
import { InicioVista, type AccionesInicio } from "@/features/inicio/InicioVista";
import { fijarFlags } from "@/test/flags";

/**
 * Los cinco artboards de `31 Inicio Vista Rapida.dc.html` con los datos del propio diseño (fuente simulada), a las 10:40 del
 * miércoles 21/10/2026 (Montevideo), y los estados que el diseño no dibuja: cargando, vacío, error, sin conexión.
 */

const AHORA = new Date("2026-10-21T13:40:00.000Z");
const fuente = crearFuenteInicioSimulada(() => AHORA);

const tableroDeHoy = () => fuente.obtenerTablero();

function recordar(ajustes: Record<string, unknown>) {
  window.localStorage.setItem("inicio-ajustes", JSON.stringify(ajustes));
}

function acciones(obtenerDia: AccionesInicio["obtenerDia"] = async (fecha) => ({ ok: true, tablero: await fuente.obtenerTablero({ fecha }) })) {
  return { obtenerDia: vi.fn(obtenerDia) } satisfies AccionesInicio;
}

async function montar(opciones: { tablero?: TableroDelDia; acciones?: ReturnType<typeof acciones> } = {}) {
  fijarFlags({ modoDev: true });
  olvidarAjustes();
  const accionesDeLaVista = opciones.acciones ?? acciones();
  const resultado = render(<InicioVista tablero={opciones.tablero ?? (await tableroDeHoy())} acciones={accionesDeLaVista} />);
  return { ...resultado, acciones: accionesDeLaVista };
}

const tabla = () => screen.getByRole("region", { name: /^Colportores/ });
const fila = (nombre: string) => within(tabla()).getByRole("row", { name: new RegExp(nombre) });
const celdas = (nombre: string) => within(fila(nombre)).getAllByRole("cell").map((c) => c.textContent);

/** Una promesa que se resuelve cuando el test lo decide. */
function pendiente<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (error: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

describe("InicioVista · artboard 01 «Principal · 10:40 · Rivera elegida»", () => {
  it("el detalle de la ciudad: título, tres cifras, colportores y últimos datos", async () => {
    recordar({ seleccion: "ciudad:rivera" });
    await montar();

    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
    expect(screen.getByText("Departamento Rivera · 7 de 10 en jornada")).toBeInTheDocument();
    expect(screen.getByText("Actualizado 10:40")).toBeInTheDocument();

    const cifras = screen.getByText("Horas", { selector: "dt" }).closest("dl")!;
    expect(within(cifras).getByText("19,7 h")).toBeInTheDocument();
    expect(within(cifras).getByText("24")).toBeInTheDocument();
    expect(within(cifras).getByText("9")).toBeInTheDocument();
    expect(within(cifras).getByText("$U 18.600")).toBeInTheDocument();

    expect(celdas("Lucía Fernández")).toEqual(["En jornada", "2,8 h", "4", "2", "$U 4.350", "◷hace 12 min"]);
    // Quien no salió, pero tiene el teléfono conectado (hace 6 min), y quien no tiene conexión hace días: mismo formato.
    expect(celdas("Florencia Pintos")).toEqual(["Sin iniciar", "—sin datos", "—sin datos", "—sin datos", "—sin datos", "◷hace 6 min"]);
    expect(celdas("Bruno Techera")[5]).toBe("◷hace 4 días");
    expect(celdas("Joaquín Duarte")[5]).toBe("◷hace 2 h 40 min");
    expect(celdas("Santiago Pereira")[0]).toBe("Finalizada");
    // Las cifras en cero de quien sí trabaja no se vuelven guiones.
    expect(celdas("Joaquín Duarte").slice(1, 5)).toEqual(["1,1 h", "1", "0", "$U 0"]);
  });

  it("una sola ciudad: la tabla no lleva cabecera por ciudad", async () => {
    recordar({ seleccion: "ciudad:rivera" });
    await montar();

    expect(within(tabla()).queryByRole("columnheader", { name: /en jornada/ })).not.toBeInTheDocument();
    expect(within(tabla()).getAllByRole("row")).toHaveLength(1 + 10);
  });

  it("la lista de ciudades agrupada por departamento, con su resumen y sin «% de la meta» (sin dato en la base)", async () => {
    await montar();

    const lista = screen.getByRole("heading", { name: "Ciudades" }).closest("section")!;
    expect(within(lista).getByText("DEPTO. ARTIGAS")).toBeInTheDocument();
    expect(within(lista).getByText("DEPTO. RIVERA")).toBeInTheDocument();
    for (const nombre of ["Todas las ciudades", "Todo el departamento", "Artigas", "Bella Unión", "Rivera"]) {
      expect(within(lista).getByRole("button", { name: new RegExp(`^${nombre}`) })).toBeInTheDocument();
    }
    expect(within(lista).getByRole("button", { name: /^Rivera 7 de 10 en jornada/ })).toHaveTextContent("19,7 h");
    expect(lista.textContent).not.toMatch(/de la meta/);
  });

  it("los pendientes de Rivera: el ticket (con «Validar» hacia Cuentas) y la colportora sin zona (con «Asignar zona»)", async () => {
    recordar({ seleccion: "ciudad:rivera" });
    await montar();

    const pendientes = screen.getByRole("region", { name: "Pendientes de acción" });
    const ticket = within(pendientes).getByRole("heading", { name: "Ticket de depósito por validar" }).closest("article")!;
    expect(within(ticket).getByText("CUENTAS")).toBeInTheDocument();
    expect(within(ticket).getByText(/Lucía Fernández · Rivera · \$U 9\.000 · ayer 14:40/)).toBeInTheDocument();
    expect(within(ticket).getByRole("link", { name: "Validar" })).toHaveAttribute("href", "/cuentas");

    const sinZona = within(pendientes).getByRole("heading", { name: "Colportora sin zona asignada" }).closest("article")!;
    expect(within(sinZona).getByText("Rocío Benítez · se sumó hoy a las 09:10")).toBeInTheDocument();
    expect(within(sinZona).getByRole("link", { name: "Asignar zona" })).toHaveAttribute("href", "/ciudades");
    // El pedido de libros es de Bella Unión.
    expect(within(pendientes).queryByText("Pedido de libros por autorizar")).not.toBeInTheDocument();
  });
});

describe("InicioVista · artboard 02 «Departamento Artigas elegido»", () => {
  it("las dos ciudades agrupadas, cada una con su cabecera, sus colportores y los pendientes de las dos", async () => {
    recordar({ seleccion: "departamento:Artigas" });
    await montar();

    expect(screen.getByRole("heading", { level: 2, name: "Departamento Artigas" })).toBeInTheDocument();
    expect(screen.getAllByText("13 de 15 en jornada")).toHaveLength(2); // el subtítulo y el resumen de la lista
    const cabeceras = within(tabla()).getAllByRole("columnheader").filter((c) => /en jornada/.test(c.textContent ?? ""));
    expect(cabeceras.map((c) => c.textContent)).toEqual(["Artigas7 de 8 en jornada", "Bella Unión6 de 7 en jornada"]);
    expect(within(tabla()).getAllByRole("row")).toHaveLength(1 + 2 + 15);

    const pendientes = screen.getByRole("region", { name: "Pendientes de acción" });
    expect(within(pendientes).getByText("Ticket de depósito por validar")).toBeInTheDocument();
    const pedido = within(pendientes).getByRole("heading", { name: "Pedido de libros por autorizar" }).closest("article")!;
    expect(within(pedido).getByText("STOCK")).toBeInTheDocument();
    expect(within(pedido).getByText(/Rodrigo Cardozo · Bella Unión · 25 libros · \$U 19\.800/)).toBeInTheDocument();
    // «Autorizar» y «Rechazar» todavía no tienen formulario diseñado: botones inertes.
    for (const nombre of ["Autorizar", "Rechazar"]) {
      expect(within(pedido).getByRole("button", { name: nombre })).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("«Todas las ciudades» (la elección de arranque) suma las tres y junta los tickets", async () => {
    await montar();

    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getAllByText("20 de 25 en jornada")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "2 tickets de depósito por validar" })).toBeInTheDocument();
    expect(screen.getByText(/y 1 más/)).toBeInTheDocument();
  });

  it("elegir en la lista cambia el detalle y queda recordado", async () => {
    await montar();

    await userEvent.click(screen.getByRole("button", { name: /^Todo el departamento/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Departamento Artigas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Todo el departamento/ })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(window.localStorage.getItem("inicio-ajustes")!)).toMatchObject({ seleccion: "departamento:Artigas" });

    await userEvent.click(screen.getByRole("button", { name: /^Bella Unión/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Bella Unión" })).toBeInTheDocument();
    expect(screen.getByText("Departamento Artigas · 6 de 7 en jornada")).toBeInTheDocument();
  });
});

describe("InicioVista · artboard 03 «Primera hora · 07:50»", () => {
  async function primeraHora() {
    const tablero = await tableroDeHoy();
    return {
      ...tablero,
      calculadoA: "2026-10-21T10:50:00.000Z",
      sinZona: [],
      pendientes: [],
      ciudades: tablero.ciudades.map((c) => ({
        ...c,
        colportores: c.colportores.map((p, i) => ({
          ...p,
          estado: i === 0 ? ("en-jornada" as const) : ("sin-iniciar" as const),
          horas: i === 0 ? 0.3 : 0,
          presentaciones: 0,
          ventas: 0,
          montoCentavos: 0,
          ultimoPushAt: i === 0 ? "2026-10-21T10:44:00.000Z" : "2026-10-20T21:10:00.000Z",
        })),
      })),
    };
  }

  it("las cifras en cero, los colportores «Sin iniciar» con guiones y «ayer 18:10», sin tomarlo por un error", async () => {
    recordar({ seleccion: "ciudad:rivera" });
    await montar({ tablero: await primeraHora() });

    expect(screen.getByText(/Actualizado 07:50 · Recién empieza la jornada: las cifras se suman a medida que cada colportor sincroniza\./)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const cifras = screen.getByText("Horas", { selector: "dt" }).closest("dl")!;
    expect(within(cifras).getByText("0,3 h")).toBeInTheDocument();
    expect(within(cifras).getAllByText("0")).toHaveLength(2); // presentaciones y ventas; el monto va aparte, en «$U 0»
    expect(within(cifras).getByText("$U 0")).toBeInTheDocument();
    expect(celdas("Bruno Techera")).toEqual(["Sin iniciar", "—sin datos", "—sin datos", "—sin datos", "—sin datos", "◷ayer 18:10"]);
    expect(screen.getByText("Nada pendiente en esta ciudad.")).toBeInTheDocument();
  });

  it("la nota de la primera hora no sale en un día anterior ni cuando ya hay presentaciones", async () => {
    recordar({ seleccion: "ciudad:rivera" });
    await montar();
    expect(screen.queryByText(/Recién empieza/)).not.toBeInTheDocument();
  });
});

describe("InicioVista · artboard 04 «Solo Artigas · 11:20»", () => {
  it("una ciudad de un departamento con dos, con la colportora sin zona que se sumó recién", async () => {
    recordar({ seleccion: "ciudad:artigas" });
    await montar();

    expect(screen.getByRole("heading", { level: 2, name: "Artigas" })).toBeInTheDocument();
    expect(screen.getByText("Departamento Artigas · 7 de 8 en jornada")).toBeInTheDocument();
    expect(within(tabla()).getAllByRole("row")).toHaveLength(1 + 8);
    expect(celdas("Martina Correa")[0]).toBe("Sin iniciar");
    expect(screen.getByRole("heading", { name: "Ticket de depósito por validar" })).toBeInTheDocument();
    expect(screen.getByText(/Sofía Cabral · Artigas · \$U 18\.500 · hoy 09:10/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Colportora sin zona asignada" })).toBeInTheDocument();
  });

  it("la colportora sin zona no entra en las cifras de ninguna ciudad", async () => {
    await montar();
    const tablero = await tableroDeHoy();
    expect(tablero.ciudades.flatMap((c) => c.colportores).some((c) => c.nombre === "Rocío Benítez")).toBe(false);
    expect(within(tabla()).queryByText("Rocío Benítez")).not.toBeInTheDocument();
  });

  it("quien ya se dio de baja no recibe «Asignar zona»", async () => {
    const tablero = await tableroDeHoy();
    await montar({ tablero: { ...tablero, sinZona: tablero.sinZona.map((p) => ({ ...p, deBaja: true })) } });
    expect(screen.queryByText("Colportora sin zona asignada")).not.toBeInTheDocument();
  });

  it("sin pendientes: «Nada pendiente en esta ciudad.» (ciudad) o «Nada pendiente.» (varias)", async () => {
    const tablero = await tableroDeHoy();
    const sinPendientes = { ...tablero, sinZona: [], pendientes: [] };
    recordar({ seleccion: "ciudad:rivera" });
    const { unmount } = await montar({ tablero: sinPendientes });
    expect(screen.getByText("Nada pendiente en esta ciudad.")).toBeInTheDocument();
    unmount();
    recordar({ seleccion: "todas" });
    await montar({ tablero: sinPendientes });
    expect(screen.getByText("Nada pendiente.")).toBeInTheDocument();
  });
});

describe("InicioVista · artboard 05 «Rivera · columnas colapsadas»", () => {
  it("la barra de ciudades con siglas y «en jornada / total», que sigue sirviendo de filtro", async () => {
    recordar({ seleccion: "ciudad:rivera", ciudadesCerrada: true, pendientesCerrada: true });
    await montar();

    expect(screen.queryByRole("heading", { name: "Ciudades" })).not.toBeInTheDocument();
    const barra = screen.getByRole("region", { name: "Ciudades" });
    const rivera = within(barra).getByRole("button", { name: "Rivera: 7 de 10 en jornada" });
    expect(rivera).toHaveTextContent("Riv.7/10");
    expect(rivera).toHaveAttribute("title", "Rivera");
    expect(rivera).toHaveAttribute("aria-pressed", "true");
    expect(within(barra).getByRole("button", { name: "Bella Unión: 6 de 7 en jornada" })).toHaveTextContent("B. Un.6/7");
    expect(within(barra).getByRole("button", { name: "Todo el departamento: 13 de 15 en jornada" })).toHaveTextContent("Dpto.13/15");
    expect(within(barra).getByRole("button", { name: "Todas las ciudades: 20 de 25 en jornada" })).toHaveTextContent("Todas20/25");

    await userEvent.click(within(barra).getByRole("button", { name: "Artigas: 7 de 8 en jornada" }));
    expect(screen.getByRole("heading", { level: 2, name: "Artigas" })).toBeInTheDocument();
  });

  it("la barra de pendientes con la cantidad; la tabla ocupa el espacio que se libera", async () => {
    recordar({ seleccion: "ciudad:rivera", ciudadesCerrada: true, pendientesCerrada: true });
    await montar();

    const barra = screen.getByRole("region", { name: "Pendientes de acción" });
    expect(barra).toHaveTextContent("2 pendientes");
    expect(within(barra).getByRole("button", { name: "Expandir pendientes" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "Pendientes de acción" })).not.toBeInTheDocument();
  });

  it("contraer y expandir: se recuerda, y el foco pasa al botón de la otra versión", async () => {
    await montar();

    await userEvent.click(screen.getByRole("button", { name: "Contraer ciudades" }));
    const expandir = screen.getByRole("button", { name: "Expandir ciudades" });
    expect(expandir).toHaveFocus();
    expect(JSON.parse(window.localStorage.getItem("inicio-ajustes")!)).toMatchObject({ ciudadesCerrada: true, pendientesCerrada: false });

    await userEvent.click(screen.getByRole("button", { name: "Contraer pendientes" }));
    expect(screen.getByRole("button", { name: "Expandir pendientes" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Expandir pendientes" }));
    expect(screen.getByRole("button", { name: "Contraer pendientes" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Expandir ciudades" }));
    expect(screen.getByRole("button", { name: "Contraer ciudades" })).toHaveFocus();
    expect(JSON.parse(window.localStorage.getItem("inicio-ajustes")!)).toMatchObject({ ciudadesCerrada: false, pendientesCerrada: false });
  });
});

describe("InicioVista · recordar al volver", () => {
  it("volver atrás y reentrar: la ciudad y las columnas siguen como se dejaron", async () => {
    const primera = await montar();
    await userEvent.click(screen.getByRole("button", { name: /^Rivera/ }));
    await userEvent.click(screen.getByRole("button", { name: "Contraer pendientes" }));
    primera.unmount();

    await montar();
    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expandir pendientes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contraer ciudades" })).toBeInTheDocument();
  });

  it("una ciudad recordada que ya no está (otra campaña) vuelve a «Todas las ciudades» sin pisar lo guardado", async () => {
    recordar({ seleccion: "ciudad:salto" });
    await montar();

    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("inicio-ajustes")!).seleccion).toBe("ciudad:salto");
  });

  it("lo guardado ilegible o con otra forma no rompe la vista", async () => {
    window.localStorage.setItem("inicio-ajustes", "{esto no es json");
    const { unmount } = await montar();
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    unmount();

    window.localStorage.setItem("inicio-ajustes", JSON.stringify(["x"]));
    await montar();
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
  });

  it("sin almacenamiento (ventana privada) anda igual y recuerda mientras la pestaña siga abierta", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    await montar();

    await userEvent.click(screen.getByRole("button", { name: /^Rivera/ }));

    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
  });
});

describe("InicioVista · selector de día", () => {
  it("«Hoy · mié 21 oct», sin día por venir: «›» queda inerte y no suelta el foco", async () => {
    const { acciones: a } = await montar();

    expect(screen.getByText("Hoy")).toBeInTheDocument();
    expect(screen.getByText(/mié 21 oct/)).toBeInTheDocument();
    const siguiente = screen.getByRole("button", { name: "Día siguiente" });
    expect(siguiente).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(siguiente);
    expect(a.obtenerDia).not.toHaveBeenCalled();
  });

  it("‹ pide el día anterior: cifras de ese día, nada «En jornada», sin «Actualizado»", async () => {
    recordar({ seleccion: "ciudad:rivera" });
    const { acciones: a } = await montar();

    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));

    expect(a.obtenerDia).toHaveBeenCalledWith("2026-10-20");
    expect(await screen.findByText("Ayer")).toBeInTheDocument();
    expect(screen.getByText(/mar 20 oct/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Departamento Rivera · 0 de 10 en jornada")).toBeInTheDocument());
    expect(screen.queryByText(/Actualizado/)).not.toBeInTheDocument();
    expect(celdas("Lucía Fernández")[0]).toBe("Finalizada");
    expect(screen.getByRole("button", { name: "Día siguiente" })).toHaveAttribute("aria-disabled", "false");
  });

  it("y › vuelve a hoy", async () => {
    const { acciones: a } = await montar();
    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    await screen.findByText("Ayer");

    await userEvent.click(screen.getByRole("button", { name: "Día siguiente" }));

    expect(a.obtenerDia).toHaveBeenLastCalledWith("2026-10-21");
    expect(await screen.findByText("Hoy")).toBeInTheDocument();
    expect(await screen.findByText("Actualizado 10:40")).toBeInTheDocument();
  });

  it("mientras carga: «Cargando el día…», el selector sigue activo y la lista no muestra el día anterior", async () => {
    const espera = pendiente<ResultadoTablero>();
    const { acciones: a } = await montar({ acciones: acciones(() => espera.promesa) });

    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));

    expect(screen.getByRole("status")).toHaveTextContent("Cargando el día…");
    expect(screen.queryByRole("region", { name: /^Colportores/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Día anterior" })).toBeEnabled();
    espera.resolver({ ok: true, tablero: await fuente.obtenerTablero({ fecha: "2026-10-20" }) });
    expect(await screen.findByRole("region", { name: /^Colportores/ })).toBeInTheDocument();
    expect(a.obtenerDia).toHaveBeenCalledTimes(1);
  });

  it("dos toques seguidos en ‹ antes de que llegue la primera respuesta: gana el último día, no el que llega tarde", async () => {
    const primera = pendiente<ResultadoTablero>();
    const segunda = pendiente<ResultadoTablero>();
    const respuestas = [primera, segunda];
    const { acciones: a } = await montar({ acciones: acciones(() => respuestas.shift()!.promesa) });

    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    expect(a.obtenerDia.mock.calls.map(([fecha]) => fecha)).toEqual(["2026-10-20", "2026-10-19"]);

    // Llega primero la del segundo toque y después, tarde, la del primero (la distinguimos: sin ciudades): no la pisa.
    segunda.resolver({ ok: true, tablero: await fuente.obtenerTablero({ fecha: "2026-10-19" }) });
    expect(await screen.findByRole("region", { name: /^Colportores/ })).toBeInTheDocument();
    primera.resolver({ ok: true, tablero: { ...(await fuente.obtenerTablero({ fecha: "2026-10-20" })), ciudades: [] } });
    await act(async () => {});
    expect(screen.getByText("lun 19 oct")).toBeInTheDocument();
    expect(screen.queryByText("Ayer")).not.toBeInTheDocument();
    expect(screen.queryByText(/todavía no tiene ciudades/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^Colportores/ })).toBeInTheDocument();
  });

  it("el rótulo anuncia el cambio de día", async () => {
    await montar();
    expect(screen.getByText("Hoy").parentElement).toHaveAttribute("aria-live", "polite");
  });
});

describe("InicioVista · falla al traer un día", () => {
  const sinConexion = (): ResultadoTablero => ({ ok: false, causa: "sin-conexion" });

  it("sin conexión: aviso que guía, «Reintentar» trae el día y el foco va al detalle", async () => {
    const respuestas: (() => Promise<ResultadoTablero>)[] = [
      async () => sinConexion(),
      async () => ({ ok: true, tablero: await fuente.obtenerTablero({ fecha: "2026-10-20" }) }),
    ];
    const { acciones: a } = await montar({ acciones: acciones(() => respuestas.shift()!()) });

    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el día. Revisá tu conexión y probá de nuevo.");
    // El día de la falla no muestra cifras de otro: ni tabla ni lista.
    expect(screen.queryByRole("region", { name: /^Colportores/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ciudades" })).not.toBeInTheDocument();
    // Y los botones del día siguen habilitados para ir a otro.
    expect(screen.getByRole("button", { name: "Día anterior" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(a.obtenerDia.mock.calls.map(([fecha]) => fecha)).toEqual(["2026-10-20", "2026-10-20"]);
    expect(await screen.findByRole("region", { name: /^Colportores/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toHaveFocus());
  });

  it("la server action que se corta (rechaza) es lo mismo que sin conexión: nada queda «cargando»", async () => {
    await montar({ acciones: acciones(async () => Promise.reject(new TypeError("Failed to fetch"))) });

    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Revisá tu conexión");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });

  it("un rechazo de la base muestra su texto; una respuesta que no se entiende, un error genérico", async () => {
    const respuestas: ResultadoTablero[] = [
      { ok: false, causa: "rechazo", mensaje: "Ese día todavía no llegó. Elegí hoy o un día anterior." },
      { ok: false, causa: "error" },
    ];
    await montar({ acciones: acciones(async () => respuestas.shift()!) });

    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese día todavía no llegó. Elegí hoy o un día anterior.");

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el día. Probá de nuevo más tarde."));
  });

  it("falla a mitad de dos toques: la respuesta vieja que falla tarde no tapa el día bueno", async () => {
    const primera = pendiente<ResultadoTablero>();
    const segunda = pendiente<ResultadoTablero>();
    const respuestas = [primera, segunda];
    await montar({ acciones: acciones(() => respuestas.shift()!.promesa) });

    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    segunda.resolver({ ok: true, tablero: await fuente.obtenerTablero({ fecha: "2026-10-19" }) });
    await screen.findByRole("region", { name: /^Colportores/ });
    primera.rechazar(new TypeError("Failed to fetch"));
    await act(async () => {});

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^Colportores/ })).toBeInTheDocument();
  });

  it("si la campaña ya no está disponible lo dice y guía", async () => {
    await montar({ acciones: acciones(async () => ({ ok: true, tablero: null })) });

    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La campaña ya no está disponible. Elegí otra desde el selector de arriba.");
  });
});

describe("InicioVista · datos límite", () => {
  it("una campaña sin ciudades: lo dice y lleva a Ciudades; no hay lista ni cifras", async () => {
    const tablero = await tableroDeHoy();
    await montar({ tablero: { ...tablero, ciudades: [], sinZona: [], pendientes: [] } });

    expect(screen.getByText("Esta campaña todavía no tiene ciudades. Agregalas para ver cómo está tu gente.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Ciudades" })).toHaveAttribute("href", "/ciudades");
    expect(screen.queryByText("Horas", { selector: "dt" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Día anterior" })).toBeEnabled();
  });

  it("una ciudad sin colportores: ceros y un aviso en la tabla, no un error", async () => {
    const tablero = await tableroDeHoy();
    recordar({ seleccion: "ciudad:salto" });
    await montar({ tablero: { ...tablero, ciudades: [...tablero.ciudades, { id: "salto", nombre: "Salto", departamento: null, colportores: [] }] } });

    expect(screen.getByRole("heading", { level: 2, name: "Salto" })).toBeInTheDocument();
    expect(screen.getAllByText("0 de 0 en jornada")).toHaveLength(2); // el subtítulo y el resumen de la lista
    expect(screen.getByText("Esta ciudad todavía no tiene colportores en la campaña.")).toBeInTheDocument();
    expect(screen.getByText("SIN DEPARTAMENTO")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("nombres larguísimos sin espacios y una lista de 300 colportores: todo se ve (con scroll) y nada rompe la tabla", async () => {
    const tablero = await tableroDeHoy();
    const largo = "Maria".repeat(40);
    const muchos = Array.from({ length: 300 }, (_, i) => ({
      ...tablero.ciudades[0].colportores[0],
      id: `m-${i}`,
      nombre: i === 0 ? `${largo} ${largo}` : `Colportor ${i}`,
    }));
    recordar({ seleccion: "ciudad:artigas" });
    await montar({ tablero: { ...tablero, ciudades: tablero.ciudades.map((c) => (c.id === "artigas" ? { ...c, colportores: muchos } : c)) } });

    expect(within(tabla()).getAllByRole("row")).toHaveLength(301);
    expect(tabla()).toHaveAttribute("tabindex", "0");
    expect(within(tabla()).getByTitle(`${largo} ${largo}`)).toHaveClass("truncate");
    expect(screen.getByText("Departamento Artigas · 300 de 300 en jornada")).toBeInTheDocument();
  });

  it("montos y horas grandes se leen enteros", async () => {
    const tablero = await tableroDeHoy();
    const [uno] = tablero.ciudades[0].colportores;
    recordar({ seleccion: "ciudad:artigas" });
    await montar({
      tablero: {
        ...tablero,
        ciudades: tablero.ciudades.map((c) => (c.id === "artigas" ? { ...c, colportores: [{ ...uno, horas: 123.46, montoCentavos: 12_345_678_00 }] } : c)),
      },
    });

    expect(celdas(uno.nombre).slice(1, 5)).toEqual(["123,5 h", String(uno.presentaciones), String(uno.ventas), "$U 12.345.678"]);
  });

  it("«Sin cerrar» (jornada que quedó abierta un día anterior) se dice tal cual, con sus horas cerradas", async () => {
    const tablero = await tableroDeHoy();
    const [uno] = tablero.ciudades[0].colportores;
    recordar({ seleccion: "ciudad:artigas" });
    await montar({
      tablero: {
        ...tablero,
        ciudades: tablero.ciudades.map((c) => (c.id === "artigas" ? { ...c, colportores: [{ ...uno, estado: "sin-cerrar" as const, horas: 0, presentaciones: 0, ventas: 0, montoCentavos: 0 }] } : c)),
      },
    });

    expect(celdas(uno.nombre).slice(0, 2)).toEqual(["Sin cerrar", "0 h"]);
  });

  it("un colportor que nunca sincronizó dice «Sin datos» en los últimos datos", async () => {
    const tablero = await tableroDeHoy();
    const [uno] = tablero.ciudades[0].colportores;
    recordar({ seleccion: "ciudad:artigas" });
    await montar({ tablero: { ...tablero, ciudades: tablero.ciudades.map((c) => (c.id === "artigas" ? { ...c, colportores: [{ ...uno, ultimoPushAt: null }] } : c)) } });

    expect(celdas(uno.nombre)[5]).toBe("◷Sin datos");
  });

  it("«Ver equipo →» lleva a Equipo", async () => {
    await montar();
    expect(screen.getByRole("link", { name: "Ver equipo →" })).toHaveAttribute("href", "/equipo");
  });
});

describe("InicioVista · sin Cuentas visible", () => {
  it("«Validar» queda inerte cuando la pestaña Cuentas está oculta (staging y producción)", async () => {
    fijarFlags({ modoDev: false });
    olvidarAjustes();
    render(<InicioVista tablero={await tableroDeHoy()} acciones={acciones()} />);

    expect(screen.getByRole("button", { name: "Validar" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: "Validar" })).not.toBeInTheDocument();
  });
});
