import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BecaDeColportor, DatosEquipoPorCiudad, ResultadoBeca, TipoDeBeca } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { becasDePrueba, colportor, datosDePrueba } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";
import { olvidarUnidadDeAvance } from "./unidad-de-avance";

vi.setConfig({ testTimeout: 30_000 });

const sistemas = { id: "sis", nombre: "Ingeniería en Sistemas", elegidaEl: "2026-09-01" };

/** Diego ya pasó la meta completa de Sistemas (240 libros): figura «Completa alcanzada». */
const DIEGO_COMPLETA: BecaDeColportor = {
  carrera: sistemas,
  apuntaA: "completa",
  meta: { libros: 240, monto: 360000 },
  avance: { libros: 250, monto: 375000 },
};
/** Como lo devuelve la base tras pasarlo a «Sin beca»: sin meta, con la marca de lo alcanzado. */
const DIEGO_SIN_BECA: BecaDeColportor = { ...DIEGO_COMPLETA, apuntaA: null, meta: null, alcanzada: "completa" };
const DIEGO_MEDIA: BecaDeColportor = { ...DIEGO_COMPLETA, apuntaA: "media", meta: { libros: 120, monto: 180000 }, alcanzada: "completa" };

function conDiferido<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

function datosConDiego(cambios: Partial<DatosEquipoPorCiudad> = {}, beca: BecaDeColportor = DIEGO_COMPLETA): DatosEquipoPorCiudad {
  const datos = datosDePrueba(cambios);
  datos.colportores.push(colportor({ id: "diego", nombre: "Diego Pérez" }));
  datos.becas!.porColportor.diego = beca;
  return datos;
}

function crearAcciones(respuestaDeTipo?: (tipo: TipoDeBeca | null) => BecaDeColportor) {
  const respuesta = respuestaDeTipo ?? ((tipo) => (tipo === null ? DIEGO_SIN_BECA : tipo === "media" ? DIEGO_MEDIA : DIEGO_COMPLETA));
  return {
    jornadasParaAcompanar: vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async () => ({ ok: true, jornadas: [] })),
    registrarAcompanamiento: vi.fn<AccionesEquipo["registrarAcompanamiento"]>(),
    elegirCarrera: vi.fn<AccionesEquipo["elegirCarrera"]>(),
    asignarTipoDeBeca: vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(async (_id, tipo): Promise<ResultadoBeca> => ({ ok: true, beca: respuesta(tipo) })),
  } satisfies AccionesEquipo;
}

function mostrar(datos: DatosEquipoPorCiudad, acciones: AccionesEquipo = crearAcciones()) {
  const resultado = render(<EquipoVista datos={datos} acciones={acciones} />);
  return { ...resultado, acciones, usuario: userEvent.setup() };
}

type Usuario = ReturnType<typeof userEvent.setup>;
const irA = (usuario: Usuario, vista: "Becas" | "Zonas") => usuario.click(screen.getByRole("button", { name: vista }));
const fila = (nombre: RegExp | string) => screen.getByRole("row", { name: nombre });
const sinBeca = (nombre: string) => screen.getByRole("button", { name: `Dejar sin beca: ${nombre}` });
const apuntarA = (nombre: string, tipo: TipoDeBeca) =>
  screen.getByRole("button", { name: `Apuntar a ${tipo === "media" ? "media beca" : "beca completa"}: ${nombre}` });

beforeEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
});

afterEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
});

describe("«Logro beca»: pasar a «Sin beca» a quien ya alcanzó una meta", () => {
  it("antes de tocar nada, Diego figura «Completa alcanzada» apuntando a la completa", async () => {
    const { usuario } = mostrar(datosConDiego());
    await irA(usuario, "Becas");

    expect(within(fila(/^Diego Pérez/)).getByText("Completa alcanzada")).toBeInTheDocument();
    expect(apuntarA("Diego Pérez", "completa")).toHaveAttribute("aria-pressed", "true");
  });

  it("«Apunta a» dice «Sin beca», el estado sigue en «Completa alcanzada» y la fila muestra lo vendido", async () => {
    const { usuario, acciones } = mostrar(datosConDiego());
    await irA(usuario, "Becas");

    await usuario.click(sinBeca("Diego Pérez"));

    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledWith("diego", null);
    const diego = within(fila(/^Diego Pérez/));
    expect(await diego.findByText("250 libros vendidos · alcanzó la beca completa")).toBeInTheDocument();
    expect(diego.getByText("Completa alcanzada")).toBeInTheDocument();
    expect(sinBeca("Diego Pérez")).toHaveAttribute("aria-pressed", "true");
    expect(apuntarA("Diego Pérez", "completa")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("Diego Pérez quedó sin beca: ya no tiene meta, pero conserva la beca completa alcanzada.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("con «Ver avance en» compra a la CES, lo vendido se ve en pesos", async () => {
    const { usuario } = mostrar(datosConDiego({}, DIEGO_SIN_BECA));
    await irA(usuario, "Becas");

    await usuario.click(within(screen.getByRole("group", { name: "Ver avance en" })).getByRole("button", { name: "Compra a la CES" }));

    expect(within(fila(/^Diego Pérez/)).getByText("$U 375.000 de compra a la CES · alcanzó la beca completa")).toBeInTheDocument();
  });

  it("el filtro «Completa alcanzada» sigue incluyendo a quien quedó sin beca", async () => {
    const { usuario } = mostrar(datosConDiego({}, DIEGO_SIN_BECA));
    await irA(usuario, "Becas");

    await usuario.selectOptions(screen.getByRole("combobox", { name: "Estado" }), "completa");

    expect(fila(/^Diego Pérez/)).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /^Emiliano Sosa/ })).not.toBeInTheDocument();
  });

  it("quien nunca tuvo beca, aunque lleve libros, sigue en «Sin beca»", async () => {
    const sinMarca: BecaDeColportor = { ...DIEGO_SIN_BECA, alcanzada: null };
    const { usuario } = mostrar(datosConDiego({}, sinMarca));
    await irA(usuario, "Becas");

    const diego = within(fila(/^Diego Pérez/));
    expect(diego.getByText("Sin beca", { selector: "span" })).toBeInTheDocument();
    expect(diego.getByText("Sin meta: no apunta a ninguna beca")).toBeInTheDocument();
  });

  it("si falla a mitad, avisa, deja a Diego como estaba y el botón vuelve a quedar libre para reintentar", async () => {
    const acciones = crearAcciones();
    acciones.asignarTipoDeBeca.mockRejectedValueOnce(new Error("sin red"));
    const { usuario } = mostrar(datosConDiego(), acciones);
    await irA(usuario, "Becas");

    await usuario.click(sinBeca("Diego Pérez"));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(apuntarA("Diego Pérez", "completa")).toHaveAttribute("aria-pressed", "true");
    expect(within(fila(/^Diego Pérez/)).queryByText("Guardando…")).not.toBeInTheDocument();

    await usuario.click(sinBeca("Diego Pérez"));

    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(2);
    expect(await within(fila(/^Diego Pérez/)).findByText("250 libros vendidos · alcanzó la beca completa")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un doble toque en «Sin beca» es un solo guardado", async () => {
    const { usuario, acciones } = mostrar(datosConDiego());
    await irA(usuario, "Becas");

    await act(async () => {
      sinBeca("Diego Pérez").click();
      sinBeca("Diego Pérez").click();
    });

    await waitFor(() => expect(within(fila(/^Diego Pérez/)).queryByText("Guardando…")).not.toBeInTheDocument());
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(1);
    void usuario;
  });

  it("«Sin beca» y enseguida «Media», antes de que conteste el primero: salen en orden y lo alcanzado no se pierde", async () => {
    const primera = conDiferido<ResultadoBeca>();
    const acciones = crearAcciones();
    acciones.asignarTipoDeBeca.mockImplementationOnce(() => primera.promesa);
    const { usuario } = mostrar(datosConDiego(), acciones);
    await irA(usuario, "Becas");

    await usuario.click(sinBeca("Diego Pérez"));
    await usuario.click(apuntarA("Diego Pérez", "media"));
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(1);
    await act(async () => primera.resolver({ ok: true, beca: DIEGO_SIN_BECA }));

    await waitFor(() => expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(2));
    expect(acciones.asignarTipoDeBeca.mock.calls.map((llamada) => llamada[1])).toEqual([null, "media"]);
    await waitFor(() => expect(apuntarA("Diego Pérez", "media")).toHaveAttribute("aria-pressed", "true"));
    expect(within(fila(/^Diego Pérez/)).getByText("Completa alcanzada")).toBeInTheDocument();
  });

  it("al ir a «Zonas» y volver a «Becas», sigue sin beca y con lo alcanzado", async () => {
    const { usuario } = mostrar(datosConDiego());
    await irA(usuario, "Becas");
    await usuario.click(sinBeca("Diego Pérez"));
    await within(fila(/^Diego Pérez/)).findByText("250 libros vendidos · alcanzó la beca completa");

    await irA(usuario, "Zonas");
    await irA(usuario, "Becas");

    expect(within(fila(/^Diego Pérez/)).getByText("Completa alcanzada")).toBeInTheDocument();
    expect(sinBeca("Diego Pérez")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("«Beca perman.»: en una campaña permanente no hay becas", () => {
  const sinTipo = (): DatosEquipoPorCiudad => {
    const datos = datosDePrueba({ campaniaTipo: "PERMANENTE", campaniaFin: null });
    for (const [id, beca] of Object.entries(datos.becas!.porColportor)) {
      datos.becas!.porColportor[id] = beca.carrera ? { ...beca, apuntaA: null, meta: null } : beca;
    }
    return datos;
  };

  it("el selector de cada fila ofrece solo «Sin beca» y el panel dice por qué", async () => {
    const { usuario } = mostrar(sinTipo());
    await irA(usuario, "Becas");

    expect(screen.getByText(/^En una campaña permanente no hay becas\./)).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^Apuntar a / })).toHaveLength(0);
    const grupo = screen.getByRole("group", { name: "A qué beca apunta Emiliano Sosa" });
    expect(within(grupo).getAllByRole("button")).toHaveLength(1);
    expect(within(grupo).getByRole("button", { name: "Dejar sin beca: Emiliano Sosa" })).toHaveAttribute("aria-pressed", "true");
    expect(grupo).toHaveAccessibleDescription(/En una campaña permanente no hay becas\./);
  });

  it("tocar «Sin beca», que ya está marcado, no manda nada", async () => {
    const { usuario, acciones } = mostrar(sinTipo());
    await irA(usuario, "Becas");

    await usuario.click(sinBeca("Emiliano Sosa"));

    expect(acciones.asignarTipoDeBeca).not.toHaveBeenCalled();
  });

  it("en una campaña con fecha de fin sigue habiendo las tres opciones y ningún aviso", async () => {
    const { usuario } = mostrar(datosDePrueba());
    await irA(usuario, "Becas");

    expect(screen.queryByText(/campaña permanente/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "A qué beca apunta Emiliano Sosa" })).getAllByRole("button")).toHaveLength(3);
  });

  it("sin las becas conectadas, la pestaña dice eso y no el aviso de permanente", async () => {
    const { usuario } = mostrar({ ...datosDePrueba({ campaniaTipo: "PERMANENTE" }), becas: null });
    await irA(usuario, "Becas");

    expect(screen.queryByText(/campaña permanente/)).not.toBeInTheDocument();
    expect(screen.getByText(/Las becas todavía no están conectadas/)).toBeInTheDocument();
  });

  it("la tabla de una campaña permanente no tiene violaciones de accesibilidad", async () => {
    const { usuario, container } = mostrar(sinTipo());
    await irA(usuario, "Becas");

    const resultado = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
    });
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("«Carrera corr»: la carrera la corrigió Administración", () => {
  const datosConCorregida = (cambios: Partial<BecaDeColportor> = {}): DatosEquipoPorCiudad => {
    const datos = datosDePrueba();
    datos.becas!.porColportor.emiliano = {
      ...becasDePrueba().porColportor.emiliano,
      carrera: { id: "teo", nombre: "Teología", elegidaEl: "2026-09-01" },
      meta: { libros: 100, monto: 150000 },
      metaRecalculadaEn: "2026-10-27T15:30:00Z",
      ...cambios,
    };
    return datos;
  };

  it("la fila muestra «Carrera corregida: meta de Teología» y la meta nueva en las dos medidas", async () => {
    const { usuario } = mostrar(datosConCorregida());
    await irA(usuario, "Becas");

    const emiliano = within(fila(/^Emiliano Sosa/));
    expect(emiliano.getByText("Carrera corregida: meta de Teología")).toBeInTheDocument();
    expect(emiliano.getByText("Meta nueva: 100 libros · $U 150.000 a la CES")).toBeInTheDocument();
    expect(emiliano.getByText("64 de 100 libros · le faltan 36 · 64 %")).toBeInTheDocument();
  });

  it("sin tipo asignado no hay meta nueva que mostrar: solo el aviso de la carrera", async () => {
    const { usuario } = mostrar(datosConCorregida({ apuntaA: null, meta: null }));
    await irA(usuario, "Becas");

    const emiliano = within(fila(/^Emiliano Sosa/));
    expect(emiliano.getByText("Carrera corregida: meta de Teología")).toBeInTheDocument();
    expect(emiliano.queryByText(/^Meta nueva/)).not.toBeInTheDocument();
  });

  it("los que no se corrigieron no llevan aviso", async () => {
    const { usuario } = mostrar(datosConCorregida());
    await irA(usuario, "Becas");

    expect(within(fila(/^Florencia Pintos/)).queryByText(/Carrera corregida/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/^Carrera corregida/)).toHaveLength(1);
  });

  it("con un nombre de carrera larguísimo el aviso parte la línea y no desborda", async () => {
    const largo = "Licenciatura en ".concat("Administración".repeat(12));
    const datos = datosConCorregida();
    datos.becas!.porColportor.emiliano.carrera = { id: "teo", nombre: largo, elegidaEl: "2026-09-01" };
    const { usuario } = mostrar(datos);
    await irA(usuario, "Becas");

    expect(screen.getByText(`Carrera corregida: meta de ${largo}`).className).toContain("wrap-anywhere");
  });

  it("la tabla con el aviso no tiene violaciones de accesibilidad", async () => {
    const { usuario, container } = mostrar(datosConCorregida());
    await irA(usuario, "Becas");

    const resultado = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
    });
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });
});
