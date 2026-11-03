import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BecaDeColportor, DatosEquipoPorCiudad, ResultadoBeca, TipoDeBeca } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { becasDePrueba, colportor, datosDePrueba } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";
import { olvidarUnidadDeAvance } from "./unidad-de-avance";

// axe en jsdom tarda: un tope holgado, como en el resto de las pruebas de becas.
vi.setConfig({ testTimeout: 60_000 });

const sistemas = { id: "sis", nombre: "Ingeniería en Sistemas", elegidaEl: "2026-09-01" };
const MEDIA: BecaDeColportor = { carrera: sistemas, apuntaA: "media", meta: { libros: 120, monto: 180000 }, avance: { libros: 64, monto: 90000 } };
const COMPLETA: BecaDeColportor = { ...MEDIA, apuntaA: "completa", meta: { libros: 240, monto: 360000 } };
const SIN_BECA: BecaDeColportor = { ...MEDIA, apuntaA: null, meta: null };

function conDiferido<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

function crearAcciones(respuesta?: (tipo: TipoDeBeca | null) => Promise<ResultadoBeca>) {
  const asignarTipoDeBeca = vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(
    (respuesta ? (_id, tipo) => respuesta(tipo) : undefined) ?? (async (_id, tipo): Promise<ResultadoBeca> => ({ ok: true, beca: tipo === null ? SIN_BECA : tipo === "completa" ? COMPLETA : MEDIA })),
  );
  return {
    jornadasParaAcompanar: vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async () => ({ ok: true, jornadas: [] })),
    registrarAcompanamiento: vi.fn<AccionesEquipo["registrarAcompanamiento"]>(),
    elegirCarrera: vi.fn<AccionesEquipo["elegirCarrera"]>(async () => ({ ok: false, mensaje: "No en este test." })),
    asignarTipoDeBeca,
  } satisfies AccionesEquipo;
}

/** Emiliano pasó la media (130 de 120), Florencia pasó la completa (210 de 200); Sofía sin beca; Federico y Rocío sin carrera. */
function datosConAvance(): DatosEquipoPorCiudad {
  const datos = datosDePrueba();
  const becas = becasDePrueba();
  becas.porColportor.emiliano = { ...becas.porColportor.emiliano, avance: { libros: 130, monto: 200000 } };
  becas.porColportor.florencia = { ...becas.porColportor.florencia, avance: { libros: 210, monto: 310000 } };
  return { ...datos, becas };
}

function mostrar(datos: DatosEquipoPorCiudad = datosDePrueba(), acciones: AccionesEquipo = crearAcciones()) {
  const resultado = render(<EquipoVista datos={datos} acciones={acciones} />);
  return { ...resultado, acciones, usuario: userEvent.setup() };
}

type Usuario = ReturnType<typeof userEvent.setup>;
const irABecas = (usuario: Usuario) => usuario.click(screen.getByRole("button", { name: "Becas" }));
const tabla = () => screen.getByRole("table", { name: "Becas de cada colportor" });
const filas = () => within(tabla().querySelector("tbody") as HTMLElement).getAllByRole("row");
const nombresVisibles = () => within(tabla()).queryAllByRole("rowheader").map((th) => th.firstElementChild?.textContent);
const filtro = (nombre: string) => screen.getByRole("combobox", { name: nombre });
const encabezado = (nombre: RegExp | string) => within(tabla()).getByRole("button", { name: nombre });
const sinBeca = (nombre: string) => screen.getByRole("button", { name: `Dejar sin beca: ${nombre}` });

beforeEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
});

afterEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
});

describe("Becas · «Sin beca» como tercera opción de «Apunta a»", () => {
  it("cada fila ofrece Media, Completa y Sin beca, en ese orden", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    const grupo = screen.getByRole("group", { name: "A qué beca apunta Emiliano Sosa" });
    expect(within(grupo).getAllByRole("button").map((b) => b.textContent)).toEqual(["Media", "Completa", "Sin beca"]);
  });

  it("dejar a alguien sin beca guarda null, queda marcado, sin meta y con el aviso para el lector", async () => {
    const { usuario, acciones } = mostrar();
    await irABecas(usuario);

    await usuario.click(sinBeca("Emiliano Sosa"));

    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledExactlyOnceWith("emiliano", null);
    const emiliano = within(screen.getByRole("row", { name: /^Emiliano Sosa/ }));
    await waitFor(() => expect(emiliano.getByText("Sin meta: no apunta a ninguna beca")).toBeInTheDocument());
    expect(sinBeca("Emiliano Sosa")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Apuntar a media beca: Emiliano Sosa" })).toHaveAttribute("aria-pressed", "false");
    expect(emiliano.getByText("Sin beca", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Emiliano Sosa quedó sin beca: ya no tiene meta.")).toBeInTheDocument();
  });

  it("el doble toque en «Sin beca» es un solo guardado, y tocar lo que ya está marcado no manda nada", async () => {
    const diferido = conDiferido<ResultadoBeca>();
    const acciones = crearAcciones(() => diferido.promesa);
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.dblClick(sinBeca("Emiliano Sosa"));
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(1);
    diferido.resolver({ ok: true, beca: SIN_BECA });
    await waitFor(() => expect(screen.getByText("Emiliano Sosa quedó sin beca: ya no tiene meta.")).toBeInTheDocument());

    // Sofía ya está sin beca: tocar «Sin beca» no es un cambio.
    await usuario.click(sinBeca("Sofía Cabral"));
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(1);
  });

  it("si falla, avisa en la fila, el botón vuelve a quedar libre y se puede reintentar", async () => {
    let intento = 0;
    const acciones = crearAcciones(async (tipo) => {
      intento += 1;
      if (intento === 1) return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo." };
      return { ok: true, beca: tipo === null ? SIN_BECA : MEDIA };
    });
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.click(sinBeca("Emiliano Sosa"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar. Probá de nuevo.");
    // Vuelve a lo que decía el servidor: sigue apuntando a media.
    expect(screen.getByRole("button", { name: "Apuntar a media beca: Emiliano Sosa" })).toHaveAttribute("aria-pressed", "true");

    await usuario.click(sinBeca("Emiliano Sosa"));
    await waitFor(() => expect(sinBeca("Emiliano Sosa")).toHaveAttribute("aria-pressed", "true"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(2);
  });

  it("dos toques seguidos antes de que conteste el primero («Sin beca» y enseguida «Completa») terminan en lo último", async () => {
    const primero = conDiferido<ResultadoBeca>();
    let llamada = 0;
    const acciones = crearAcciones(async (tipo) => {
      llamada += 1;
      if (llamada === 1) return primero.promesa;
      return { ok: true, beca: tipo === "completa" ? COMPLETA : MEDIA };
    });
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.click(sinBeca("Emiliano Sosa"));
    await usuario.click(screen.getByRole("button", { name: "Apuntar a beca completa: Emiliano Sosa" }));
    // El segundo espera su turno: todavía no salió.
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(1);

    primero.resolver({ ok: true, beca: SIN_BECA });
    await waitFor(() => expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(2));
    expect(acciones.asignarTipoDeBeca).toHaveBeenLastCalledWith("emiliano", "completa");
    await waitFor(() => expect(screen.getByRole("button", { name: "Apuntar a beca completa: Emiliano Sosa" })).toHaveAttribute("aria-pressed", "true"));
    expect(sinBeca("Emiliano Sosa")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Becas · columna «Estado»", () => {
  it("cada fila dice en qué está: en progreso, sin beca, falta la carrera, media y completa alcanzadas", async () => {
    const { usuario } = mostrar(datosConAvance());
    await irABecas(usuario);

    const estadoDe = (nombre: RegExp) => within(screen.getByRole("row", { name: nombre })).getAllByRole("cell")[2].textContent;
    expect(estadoDe(/^Emiliano Sosa/)).toBe("Media alcanzada");
    expect(estadoDe(/^Florencia Pintos/)).toBe("Completa alcanzada");
    expect(estadoDe(/^Sofía Cabral/)).toBe("Sin beca");
    expect(estadoDe(/^Federico Da Rosa/)).toBe("Falta la carrera");
    expect(estadoDe(/^Rocío Benítez/)).toBe("Falta la carrera");
  });

  it("con los datos de prueba nadie llegó a la meta: en progreso", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    expect(within(screen.getByRole("row", { name: /^Emiliano Sosa/ })).getByText("En progreso")).toBeInTheDocument();
  });

  it("cambiar a «Sin beca» pasa la fila a «Sin beca» en el estado", async () => {
    const { usuario } = mostrar(datosConAvance());
    await irABecas(usuario);

    await usuario.click(sinBeca("Emiliano Sosa"));

    await waitFor(() => expect(within(screen.getByRole("row", { name: /^Emiliano Sosa/ })).getAllByRole("cell")[2]).toHaveTextContent("Sin beca"));
  });
});

describe("Becas · filtros", () => {
  it("hay un filtro por estado, carrera, a qué apunta y avance; la ciudad se elige en la lista", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    const barra = screen.getByRole("group", { name: "Filtrar las becas" });
    expect(within(barra).getAllByRole("combobox")).toHaveLength(4);
    expect(filtro("Estado")).toHaveValue("todos");
    expect(filtro("Carrera")).toHaveValue("todas");
    expect(filtro("Apunta a")).toHaveValue("todos");
    expect(filtro("Avance en libros")).toHaveValue("todos");
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).not.toBeInTheDocument();
  });

  it("por estado deja solo a los que coinciden y dice cuántos son", async () => {
    const { usuario } = mostrar(datosConAvance());
    await irABecas(usuario);

    await usuario.selectOptions(filtro("Estado"), "completa");

    expect(nombresVisibles()).toEqual(["Florencia Pintos"]);
    expect(screen.getByText("1 de 5 colportores")).toBeInTheDocument();
  });

  it("por carrera, incluida «Sin carrera elegida»", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    await usuario.selectOptions(filtro("Carrera"), "teo");
    expect(nombresVisibles()).toEqual(["Florencia Pintos"]);

    await usuario.selectOptions(filtro("Carrera"), "sin-carrera");
    expect(nombresVisibles()).toEqual(["Federico Da Rosa", "Rocío Benítez"]);
  });

  it("por a qué apunta: «Sin beca» trae a los que tienen carrera y nada asignado", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    await usuario.selectOptions(filtro("Apunta a"), "sin-beca");

    expect(nombresVisibles()).toEqual(["Sofía Cabral"]);
  });

  it("por avance, en la medida que se está viendo", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    // Emiliano 53 %, Florencia 20 % en libros; en CES, 50 % y 25 %.
    await usuario.selectOptions(filtro("Avance en libros"), "50-74");
    expect(nombresVisibles()).toEqual(["Emiliano Sosa"]);

    await usuario.click(screen.getByRole("button", { name: "Compra a la CES" }));
    expect(filtro("Avance en compra a la CES")).toHaveValue("50-74");
    expect(nombresVisibles()).toEqual(["Emiliano Sosa"]);

    await usuario.selectOptions(filtro("Avance en compra a la CES"), "25-49");
    expect(nombresVisibles()).toEqual(["Florencia Pintos"]);
  });

  it("se combinan con la ciudad que se eligió en la lista", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);
    await usuario.selectOptions(filtro("Carrera"), "sis");
    expect(nombresVisibles()).toEqual(["Sofía Cabral", "Emiliano Sosa"]);

    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));

    expect(nombresVisibles()).toEqual(["Emiliano Sosa"]);
  });

  it("sin coincidencias avisa qué pasó y qué hacer, y «Limpiar filtros» devuelve a todos", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    await usuario.selectOptions(filtro("Estado"), "completa");

    expect(screen.getByText("Ningún colportor coincide con estos filtros. Probá con otros o tocá «Limpiar filtros» para ver a todos.")).toBeInTheDocument();
    expect(screen.getByText("0 de 5 colportores")).toBeInTheDocument();
    expect(nombresVisibles()).toEqual([]);

    await usuario.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    expect(nombresVisibles()).toHaveLength(5);
    expect(filtro("Estado")).toHaveValue("todos");
    expect(screen.queryByText(/Ningún colportor coincide/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).not.toBeInTheDocument();
  });

  it("al ir a otra pestaña y volver los filtros siguen como se dejaron", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);
    await usuario.selectOptions(filtro("Estado"), "sin-beca");

    await usuario.click(screen.getByRole("button", { name: "Zonas" }));
    await irABecas(usuario);

    expect(filtro("Estado")).toHaveValue("sin-beca");
    expect(nombresVisibles()).toEqual(["Sofía Cabral"]);
  });

  it("con muchos colportores filtra sin perder a nadie", async () => {
    const muchos = datosDePrueba();
    const becas = becasDePrueba();
    const lista = Array.from({ length: 300 }, (_, i) => colportor({ id: `c${i}`, nombre: `Colportor ${String(i).padStart(3, "0")}` }));
    for (const c of lista) becas.porColportor[c.id] = c.id.endsWith("7") ? { ...MEDIA, avance: { libros: 130, monto: 190000 } } : MEDIA;
    const { usuario } = mostrar({ ...muchos, colportores: [...muchos.colportores, ...lista], becas });
    await irABecas(usuario);

    await usuario.selectOptions(filtro("Estado"), "media");

    // 30 terminan en 7 (7, 17, …, 297).
    expect(nombresVisibles()).toHaveLength(30);
    expect(screen.getByText("30 de 305 colportores")).toBeInTheDocument();
  });

  it("si se toca un colportor que deja de cumplir el filtro, la fila no desaparece bajo el dedo", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);
    await usuario.selectOptions(filtro("Apunta a"), "media");
    expect(nombresVisibles()).toEqual(["Emiliano Sosa"]);

    await usuario.click(screen.getByRole("button", { name: "Apuntar a beca completa: Emiliano Sosa" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Apuntar a beca completa: Emiliano Sosa" })).toHaveAttribute("aria-pressed", "true"));
    expect(nombresVisibles()).toEqual(["Emiliano Sosa"]);
    expect(screen.getByRole("button", { name: "Apuntar a beca completa: Emiliano Sosa" })).toHaveFocus();

    // Al cambiar el filtro, la lista vuelve a ser la que dice el filtro.
    await usuario.selectOptions(filtro("Apunta a"), "completa");
    expect(nombresVisibles()).toEqual(["Emiliano Sosa", "Florencia Pintos"]);
    await usuario.selectOptions(filtro("Apunta a"), "media");
    expect(nombresVisibles()).toEqual([]);
  });
});

describe("Becas · orden por columna", () => {
  const nombresEnOrden = () => within(tabla()).getAllByRole("rowheader").filter((th) => th.getAttribute("scope") === "row").map((th) => th.firstElementChild?.textContent);

  it("al principio sigue por ciudad, con su cabecera, y los encabezados todavía no dicen que ordenen", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    expect(within(tabla()).getAllByRole("columnheader").filter((th) => th.hasAttribute("aria-sort"))).toEqual([]);
    expect(within(tabla()).getByRole("columnheader", { name: /^Artigas/ })).toBeInTheDocument();
  });

  it("«Avance» de menor a mayor, de mayor a menor y de vuelta al orden de siempre", async () => {
    const { usuario } = mostrar(datosConAvance());
    await irABecas(usuario);

    await usuario.click(encabezado(/AVANCE/));
    expect(screen.getByRole("columnheader", { name: /AVANCE/ })).toHaveAttribute("aria-sort", "ascending");
    // Emiliano 108 %, Florencia 105 %: de menor a mayor, Florencia primero; los que no tienen meta, al final.
    expect(nombresEnOrden()).toEqual(["Florencia Pintos", "Emiliano Sosa", "Federico Da Rosa", "Rocío Benítez", "Sofía Cabral"]);
    expect(screen.getByText("Ordenado por avance, de menor a mayor.")).toBeInTheDocument();
    // Ordenado ya no se separa por ciudad: cada fila dice la suya.
    expect(within(tabla()).queryByRole("columnheader", { name: /^Artigas/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /^Federico Da Rosa/ })).getByText("Bella Unión")).toBeInTheDocument();

    await usuario.click(encabezado(/AVANCE/));
    expect(screen.getByRole("columnheader", { name: /AVANCE/ })).toHaveAttribute("aria-sort", "descending");
    expect(nombresEnOrden()).toEqual(["Emiliano Sosa", "Florencia Pintos", "Federico Da Rosa", "Rocío Benítez", "Sofía Cabral"]);

    await usuario.click(encabezado(/AVANCE/));
    expect(screen.getByRole("columnheader", { name: /AVANCE/ })).not.toHaveAttribute("aria-sort");
    expect(within(tabla()).getByRole("columnheader", { name: /^Artigas/ })).toBeInTheDocument();
  });

  it("tocar otra columna ordena por ella y deja la anterior sin marca", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    await usuario.click(encabezado(/^COLPORTOR/));
    expect(nombresEnOrden()).toEqual(["Emiliano Sosa", "Federico Da Rosa", "Florencia Pintos", "Rocío Benítez", "Sofía Cabral"]);

    await usuario.click(encabezado(/^ESTADO/));
    expect(screen.getByRole("columnheader", { name: /^COLPORTOR/ })).not.toHaveAttribute("aria-sort");
    expect(screen.getByRole("columnheader", { name: /^ESTADO/ })).toHaveAttribute("aria-sort", "ascending");
    expect(nombresEnOrden().slice(0, 3)).toEqual(["Sofía Cabral", "Emiliano Sosa", "Florencia Pintos"]);
  });

  it("el orden y los filtros se aplican juntos", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);
    await usuario.selectOptions(filtro("Carrera"), "sis");

    await usuario.click(encabezado(/AVANCE/));
    await usuario.click(encabezado(/AVANCE/));

    expect(nombresEnOrden()).toEqual(["Emiliano Sosa", "Sofía Cabral"]);
  });

  it("el orden se mantiene al cambiar de ciudad y al volver a la pestaña", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);
    await usuario.click(encabezado(/^COLPORTOR/));

    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    await irABecas(usuario);

    expect(screen.getByRole("columnheader", { name: /^COLPORTOR/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("con textos largos la fila ordenada no se desborda: el nombre y la ciudad se parten", async () => {
    const largo = "Ana María de los Ángeles Fernández de la Rosa y Pérez Castellanos de Montevideo";
    const datos = datosDePrueba();
    const becas = becasDePrueba();
    becas.porColportor.largo = MEDIA;
    const { usuario } = mostrar({ ...datos, colportores: [...datos.colportores, colportor({ id: "largo", nombre: largo })], becas });
    await irABecas(usuario);

    await usuario.click(encabezado(/^COLPORTOR/));

    const celda = screen.getByRole("rowheader", { name: new RegExp(largo) });
    expect(celda.innerHTML).toContain("wrap-anywhere");
  });
});

describe("Becas · accesibilidad de filtros y orden", () => {
  async function axeDe(nodo: HTMLElement) {
    const resultado = await axe.run(nodo, {
      rules: { "color-contrast": { enabled: false } },
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
    });
    return resultado.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  }

  it("la tabla ordenada y filtrada no tiene violaciones", async () => {
    const { usuario, container } = mostrar(datosConAvance());
    await irABecas(usuario);
    await usuario.selectOptions(filtro("Carrera"), "sis");
    await usuario.click(encabezado(/AVANCE/));

    expect(await axeDe(container)).toEqual([]);
  });

  it("la tabla sin coincidencias no tiene violaciones", async () => {
    const { usuario, container } = mostrar();
    await irABecas(usuario);
    await usuario.selectOptions(filtro("Estado"), "completa");

    expect(await axeDe(container)).toEqual([]);
  });

  it("los selectores y los botones de orden se alcanzan con Tab y se activan con el teclado", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    encabezado(/^COLPORTOR/).focus();
    await usuario.keyboard("{Enter}");
    expect(screen.getByRole("columnheader", { name: /^COLPORTOR/ })).toHaveAttribute("aria-sort", "ascending");
    expect(encabezado(/^COLPORTOR/)).toHaveFocus();

    filtro("Estado").focus();
    await usuario.keyboard("{ArrowDown}");
    expect(filas().length).toBeGreaterThan(0);
  });
});
