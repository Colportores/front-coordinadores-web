import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BecaDeColportor, DatosEquipoPorCiudad, ResultadoBeca, TipoDeBeca } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { becasDePrueba, colportor, datosDePrueba } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";
import { olvidarUnidadDeAvance } from "./unidad-de-avance";

/**
 * QA #117 (vista 33, pestaña Becas): «Logro beca», «Beca perman.» y «Carrera corr» (decisiones de Cristian del 27/10).
 * El canvas 33 es del 21/10 y no dibuja estos tres casos: el inventario son las tres decisiones del issue #108.
 * Los tests con `skip` documentan un hallazgo del QA: el implementador saca el `skip` cuando lo arregla.
 */
vi.setConfig({ testTimeout: 60_000 });

const sistemas = { id: "sis", nombre: "Ingeniería en Sistemas", elegidaEl: "2026-09-01" };

function conDiferido<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

/** Un equipo con Diego (alcanzó lo que se le pasa) sobre los datos de prueba. */
function conDiego(beca: BecaDeColportor, cambios: Partial<DatosEquipoPorCiudad> = {}): DatosEquipoPorCiudad {
  const datos = datosDePrueba(cambios);
  datos.colportores.push(colportor({ id: "diego", nombre: "Diego Pérez" }));
  datos.becas!.porColportor.diego = beca;
  return datos;
}

/** Todos sin beca, como los deja una campaña permanente. */
function permanente(): DatosEquipoPorCiudad {
  const datos = datosDePrueba({ campaniaTipo: "PERMANENTE", campaniaFin: null });
  for (const [id, beca] of Object.entries(datos.becas!.porColportor)) {
    datos.becas!.porColportor[id] = beca.carrera ? { ...beca, apuntaA: null, meta: null } : beca;
  }
  return datos;
}

function crearAcciones(respuesta?: (id: string, tipo: TipoDeBeca | null) => Promise<ResultadoBeca> | ResultadoBeca) {
  return {
    jornadasParaAcompanar: vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async () => ({ ok: true, jornadas: [] })),
    registrarAcompanamiento: vi.fn<AccionesEquipo["registrarAcompanamiento"]>(),
    elegirCarrera: vi.fn<AccionesEquipo["elegirCarrera"]>(async (_id, carreraId) => ({
      ok: true,
      beca: {
        carrera: { id: carreraId, nombre: "Teología", elegidaEl: "2026-10-21" },
        apuntaA: null,
        meta: null,
        avance: { libros: 0, monto: 0 },
      },
    })),
    asignarTipoDeBeca: vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(async (id, tipo) =>
      respuesta ? respuesta(id, tipo) : { ok: true, beca: { carrera: sistemas, apuntaA: tipo, meta: null, avance: { libros: 0, monto: 0 } } },
    ),
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

beforeEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
});

afterEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
  vi.restoreAllMocks();
});

describe("QA #117 · «Logro beca»", () => {
  const MEDIA_ALCANZADA: BecaDeColportor = {
    carrera: sistemas,
    apuntaA: null,
    meta: null,
    avance: { libros: 130, monto: 195000 },
    alcanzada: "media",
  };

  it("alcanzó la media: «Media alcanzada», «Apunta a» dice «Sin beca» y la fila dice «alcanzó la media beca»", async () => {
    const { usuario } = mostrar(conDiego(MEDIA_ALCANZADA));
    await irA(usuario, "Becas");

    const diego = within(fila(/^Diego Pérez/));
    expect(diego.getByText("Media alcanzada")).toBeInTheDocument();
    expect(diego.getByText("130 libros vendidos · alcanzó la media beca")).toBeInTheDocument();
    expect(sinBeca("Diego Pérez")).toHaveAttribute("aria-pressed", "true");
  });

  it("con un solo libro vendido el texto va en singular", async () => {
    const { usuario } = mostrar(conDiego({ ...MEDIA_ALCANZADA, avance: { libros: 1, monto: 1500 } }));
    await irA(usuario, "Becas");

    expect(within(fila(/^Diego Pérez/)).getByText("1 libro vendido · alcanzó la media beca")).toBeInTheDocument();
  });

  it("alcanzó la media pero apunta a la completa: el estado sigue en «Media alcanzada» y la barra mide la completa", async () => {
    const apuntaCompleta: BecaDeColportor = { ...MEDIA_ALCANZADA, apuntaA: "completa", meta: { libros: 240, monto: 360000 } };
    const { usuario } = mostrar(conDiego(apuntaCompleta));
    await irA(usuario, "Becas");

    const diego = within(fila(/^Diego Pérez/));
    expect(diego.getByText("Media alcanzada")).toBeInTheDocument();
    expect(diego.getByText("130 de 240 libros · le faltan 110 · 54 %")).toBeInTheDocument();
  });

  it("el estado «Sin beca» del filtro no incluye a quien ya alcanzó una meta; sí a quien nunca tuvo beca", async () => {
    const { usuario } = mostrar(conDiego(MEDIA_ALCANZADA));
    await irA(usuario, "Becas");

    await usuario.selectOptions(screen.getByRole("combobox", { name: "Estado" }), "sin-beca");

    expect(screen.queryByRole("row", { name: /^Diego Pérez/ })).not.toBeInTheDocument();
    expect(fila(/^Sofía Cabral/)).toBeInTheDocument();
  });

  it("ordenar por «Avance» con alguien sin beca que ya alcanzó no rompe la tabla ni lo pierde", async () => {
    const { usuario } = mostrar(conDiego(MEDIA_ALCANZADA));
    await irA(usuario, "Becas");

    await usuario.click(within(screen.getByRole("table", { name: "Becas de cada colportor" })).getByRole("button", { name: /^AVANCE/ }));

    expect(fila(/^Diego Pérez/)).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(5);
  });

  it("tras «Sin beca» el foco queda en el botón que se tocó, no en el <body>", async () => {
    const lograda: BecaDeColportor = { ...MEDIA_ALCANZADA, apuntaA: "media", meta: { libros: 120, monto: 180000 } };
    const acciones = crearAcciones(() => ({ ok: true, beca: MEDIA_ALCANZADA }));
    const { usuario } = mostrar(conDiego(lograda), acciones);
    await irA(usuario, "Becas");

    await usuario.click(sinBeca("Diego Pérez"));
    await within(fila(/^Diego Pérez/)).findByText("130 libros vendidos · alcanzó la media beca");

    expect(sinBeca("Diego Pérez")).toHaveFocus();
  });

  it("dos colportores a «Sin beca» a la vez, el primero falla: el segundo guarda y cada aviso es de su fila", async () => {
    const primero = conDiferido<ResultadoBeca>();
    const logrado: BecaDeColportor = { ...MEDIA_ALCANZADA, apuntaA: "media", meta: { libros: 120, monto: 180000 } };
    const acciones = crearAcciones((id) => {
      if (id === "diego") return primero.promesa;
      return { ok: true, beca: { ...becasDePrueba().porColportor.emiliano, apuntaA: null, meta: null } };
    });
    const { usuario } = mostrar(conDiego(logrado), acciones);
    await irA(usuario, "Becas");

    await usuario.click(sinBeca("Diego Pérez"));
    await usuario.click(sinBeca("Emiliano Sosa"));
    await act(async () => primero.resolver({ ok: false, mensaje: "No se pudo guardar. Probá de nuevo." }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar. Probá de nuevo.");
    expect(sinBeca("Emiliano Sosa")).toHaveAttribute("aria-pressed", "true");
    expect(within(fila(/^Diego Pérez/)).queryByText("Guardando…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apuntar a media beca: Diego Pérez" })).toHaveAttribute("aria-pressed", "true");
  });

  it("la tabla con una fila «lograda», el aviso y el estado no tiene violaciones de accesibilidad", async () => {
    const { usuario, container } = mostrar(conDiego(MEDIA_ALCANZADA));
    await irA(usuario, "Becas");

    const resultado = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
    });
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("QA #117 · «Beca perman.»", () => {
  it("el aviso aparece en «Becas» y no en «Zonas»", async () => {
    const { usuario } = mostrar(permanente());
    await irA(usuario, "Zonas");
    expect(screen.queryByText(/campaña permanente/)).not.toBeInTheDocument();

    await irA(usuario, "Becas");
    expect(screen.getByText(/^En una campaña permanente no hay becas\./)).toBeInTheDocument();
  });

  it("si la base trae a alguien apuntando a «Media» en una permanente, «Sin beca» lo corrige con un toque", async () => {
    const datos = permanente();
    datos.becas!.porColportor.emiliano = becasDePrueba().porColportor.emiliano; // apunta a media, como no debería
    const acciones = crearAcciones((_id, tipo) => ({ ok: true, beca: { ...becasDePrueba().porColportor.emiliano, apuntaA: tipo, meta: null } }));
    const { usuario } = mostrar(datos, acciones);
    await irA(usuario, "Becas");

    expect(sinBeca("Emiliano Sosa")).toHaveAttribute("aria-pressed", "false");
    await usuario.click(sinBeca("Emiliano Sosa"));

    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledWith("emiliano", null);
    await waitFor(() => expect(sinBeca("Emiliano Sosa")).toHaveAttribute("aria-pressed", "true"));
  });

  it("QA #117: al guardar la carrera en una permanente, el foco pasa al único botón de «Apunta a» y no al <body>", async () => {
    const { usuario } = mostrar(permanente());
    await irA(usuario, "Becas");
    await usuario.click(screen.getByRole("button", { name: "Elegir carrera de Federico Da Rosa" }));
    const panel = within(await screen.findByRole("region", { name: /Elegir la carrera/ }));
    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "teo");

    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: /Elegir la carrera/ })).not.toBeInTheDocument());
    expect(document.activeElement).not.toBe(document.body);
    expect(sinBeca("Federico Da Rosa")).toHaveFocus();
  });

  it("P2 (decisión 28/10): una campaña de verano sin fecha de fin NO es permanente: tres opciones y ningún aviso", async () => {
    const { usuario } = mostrar(datosDePrueba({ campaniaTipo: "VERANO", campaniaFin: null }));
    await irA(usuario, "Becas");

    expect(screen.queryByText(/campaña permanente/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "A qué beca apunta Emiliano Sosa" })).getAllByRole("button")).toHaveLength(3);
  });

  it("P2 (decisión 28/10): una campaña PERMANENTE con fecha de fin sí es permanente", async () => {
    const datos = permanente();
    datos.campaniaFin = "2026-12-19";
    const { usuario } = mostrar(datos);
    await irA(usuario, "Becas");

    expect(screen.getByText(/^En una campaña permanente no hay becas./)).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^Apuntar a / })).toHaveLength(0);
  });

  it("sin el tipo de la campaña (null) no se afirma que sea permanente", async () => {
    const { usuario } = mostrar(datosDePrueba({ campaniaTipo: null, campaniaFin: null }));
    await irA(usuario, "Becas");

    expect(screen.queryByText(/campaña permanente/)).not.toBeInTheDocument();
  });

  it("al guardar la carrera en una permanente, la fila queda con «Sin beca» y sin los botones de tipo", async () => {
    const { usuario } = mostrar(permanente());
    await irA(usuario, "Becas");
    await usuario.click(screen.getByRole("button", { name: "Elegir carrera de Federico Da Rosa" }));
    const panel = within(await screen.findByRole("region", { name: /Elegir la carrera/ }));
    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "teo");
    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: /Elegir la carrera/ })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Apuntar a media beca: Federico Da Rosa" })).not.toBeInTheDocument();
    expect(sinBeca("Federico Da Rosa")).toHaveAttribute("aria-pressed", "true");
  });

  it("con el aviso de permanente la tabla no tiene violaciones de accesibilidad con una carrera por elegir abierta", async () => {
    const { usuario, container } = mostrar(permanente());
    await irA(usuario, "Becas");
    await usuario.click(screen.getByRole("button", { name: "Elegir carrera de Federico Da Rosa" }));
    await screen.findByRole("region", { name: /Elegir la carrera/ });

    const resultado = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
    });
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("QA #117 · «Carrera corr»", () => {
  const corregida = (cambios: Partial<BecaDeColportor> = {}): DatosEquipoPorCiudad => {
    const datos = datosDePrueba();
    datos.becas!.porColportor.emiliano = {
      ...becasDePrueba().porColportor.emiliano,
      carrera: { id: "teo", nombre: "Teología", elegidaEl: "2026-09-01" },
      meta: { libros: 100, monto: 150000 },
      metaRecalculadaEn: "2026-10-20T14:30:00Z",
      ...cambios,
    };
    return datos;
  };

  it("el aviso y «Sin beca» a la vez: si la respuesta trae la marca, el aviso sigue; si no, desaparece sin error", async () => {
    const acciones = crearAcciones((_id, tipo) => ({
      ok: true,
      beca: { ...becasDePrueba().porColportor.emiliano, carrera: { id: "teo", nombre: "Teología", elegidaEl: "2026-09-01" }, apuntaA: tipo, meta: null, metaRecalculadaEn: "2026-10-20T14:30:00Z" },
    }));
    const { usuario } = mostrar(corregida(), acciones);
    await irA(usuario, "Becas");

    await usuario.click(sinBeca("Emiliano Sosa"));

    await waitFor(() => expect(sinBeca("Emiliano Sosa")).toHaveAttribute("aria-pressed", "true"));
    const emiliano = within(fila(/^Emiliano Sosa/));
    expect(emiliano.getByText("Carrera corregida: meta de Teología")).toBeInTheDocument();
    expect(emiliano.queryByText(/^Meta nueva/)).not.toBeInTheDocument();
  });

  it("el nombre de la carrera con signos y emoji se muestra tal cual, sin interpretarse como HTML", async () => {
    const nombre = "Teología <b>y</b> «Pastoral» 📚";
    const datos = corregida();
    datos.becas!.porColportor.emiliano.carrera = { id: "teo", nombre, elegidaEl: "2026-09-01" };
    const { usuario } = mostrar(datos);
    await irA(usuario, "Becas");

    expect(screen.getByText(`Carrera corregida: meta de ${nombre}`)).toBeInTheDocument();
    expect(document.querySelector("table b")).toBeNull();
  });

  it("la meta nueva sigue la medida de «Ver avance en»: las dos medidas se ven siempre", async () => {
    const { usuario } = mostrar(corregida());
    await irA(usuario, "Becas");
    await usuario.click(within(screen.getByRole("group", { name: "Ver avance en" })).getByRole("button", { name: "Compra a la CES" }));

    const emiliano = within(fila(/^Emiliano Sosa/));
    expect(emiliano.getByText("Meta nueva: 100 libros · $U 150.000 a la CES")).toBeInTheDocument();
  });

  it("corregida y ya alcanzada a la vez: se ven las dos cosas y la tabla sigue accesible", async () => {
    const datos = corregida({ apuntaA: null, meta: null, alcanzada: "completa", avance: { libros: 210, monto: 300000 } });
    const { usuario, container } = mostrar(datos);
    await irA(usuario, "Becas");

    const emiliano = within(fila(/^Emiliano Sosa/));
    expect(emiliano.getByText("Carrera corregida: meta de Teología")).toBeInTheDocument();
    expect(emiliano.getByText("210 libros vendidos · alcanzó la beca completa")).toBeInTheDocument();
    const resultado = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
    });
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });
});
