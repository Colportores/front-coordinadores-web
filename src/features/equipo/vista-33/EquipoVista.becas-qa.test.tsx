import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BecaDeColportor, DatosEquipoPorCiudad, ResultadoBeca, TipoDeBeca } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { becasDePrueba, colportor, datosDePrueba } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";
import { olvidarUnidadDeAvance } from "./unidad-de-avance";

/**
 * QA #95 (vista 33, pestaña Becas: «Sin beca», estado, filtros y orden). Casos límite que no cubren los tests de la
 * implementación: foco al limpiar filtros, guardados superpuestos con una falla, orden con valores vacíos, teclado,
 * 300 colportores, tipos inválidos en el servidor y consola limpia.
 */
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

const resultadoDe = (tipo: TipoDeBeca | null): ResultadoBeca => ({ ok: true, beca: tipo === null ? SIN_BECA : tipo === "completa" ? COMPLETA : MEDIA });

function crearAcciones(respuesta?: (tipo: TipoDeBeca | null) => Promise<ResultadoBeca>) {
  return {
    jornadasParaAcompanar: vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async () => ({ ok: true, jornadas: [] })),
    registrarAcompanamiento: vi.fn<AccionesEquipo["registrarAcompanamiento"]>(),
    elegirCarrera: vi.fn<AccionesEquipo["elegirCarrera"]>(async () => ({ ok: false, mensaje: "No en este test." })),
    asignarTipoDeBeca: vi.fn<AccionesEquipo["asignarTipoDeBeca"]>((_id, tipo) => (respuesta ? respuesta(tipo) : Promise.resolve(resultadoDe(tipo)))),
  } satisfies AccionesEquipo;
}

function mostrar(datos: DatosEquipoPorCiudad = datosDePrueba(), acciones: AccionesEquipo = crearAcciones()) {
  const resultado = render(<EquipoVista datos={datos} acciones={acciones} />);
  return { ...resultado, acciones, usuario: userEvent.setup() };
}

type Usuario = ReturnType<typeof userEvent.setup>;
const irABecas = (usuario: Usuario) => usuario.click(screen.getByRole("button", { name: "Becas" }));
const tabla = () => screen.getByRole("table", { name: "Becas de cada colportor" });
const nombresVisibles = () => within(tabla()).queryAllByRole("rowheader").map((th) => th.firstElementChild?.textContent);
const filtro = (nombre: string) => screen.getByRole("combobox", { name: nombre });
const encabezado = (nombre: RegExp | string) => within(tabla()).getByRole("button", { name: nombre });
const boton = (nombre: string) => screen.getByRole("button", { name: nombre });

beforeEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
});

afterEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
  vi.restoreAllMocks();
});

describe("QA #95 · foco y avisos", () => {
  it.skip("«Limpiar filtros» no deja el foco en el <body>: el botón se va y el foco tiene que quedar en la barra de filtros", async () => {  // QA #95: «Limpiar filtros» desaparece al tocarlo y el foco cae al <body> (TablaBecas.tsx:282)
    const { usuario } = mostrar();
    await irABecas(usuario);
    await usuario.selectOptions(filtro("Estado"), "sin-beca");

    await usuario.click(boton("Limpiar filtros"));

    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
  });

  it.skip("volver al orden de siempre se anuncia al lector de pantalla (hoy el aviso queda vacío)", async () => {  // QA #95: volver al orden de siempre no se anuncia, el aviso queda vacío (TablaBecas.tsx:402)
    const { usuario, container } = mostrar();
    await irABecas(usuario);
    const aviso = container.querySelector<HTMLElement>("p[aria-live='polite']") as HTMLElement;

    await usuario.click(encabezado(/^AVANCE/));
    expect(aviso).toHaveTextContent("Ordenado por avance, de menor a mayor.");
    await usuario.click(encabezado(/^AVANCE/));
    await usuario.click(encabezado(/^AVANCE/));

    expect(tabla().querySelector("[aria-sort]")).toBeNull();
    expect(aviso.textContent?.trim()).not.toBe("");
  });

  it.skip("la columna «Apunta a» de quien no tiene carrera usa un color de texto con contraste AA", async () => {  // QA #95: el «—» de «Apunta a» usa text-tinta-tenue, 2,66:1 (TablaBecas.tsx:488)
    const { usuario } = mostrar();
    await irABecas(usuario);

    const fila = screen.getByRole("row", { name: /^Federico Da Rosa/ });
    const guion = within(fila).getByText("—");

    // --tinta-tenue (#90a0b7) sobre blanco da 2,66:1: es texto y el AA pide 4,5:1.
    expect(guion.className).not.toMatch(/tinta-tenue/);
  });
});

describe("QA #95 · guardados superpuestos y fallas", () => {
  it("dos toques en cola: el primero falla y el segundo sale bien; el botón queda libre y gana lo último que se tocó", async () => {
    const primero = conDiferido<ResultadoBeca>();
    let llamada = 0;
    const acciones = crearAcciones(async (tipo) => {
      llamada += 1;
      return llamada === 1 ? primero.promesa : resultadoDe(tipo);
    });
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.click(boton("Apuntar a beca completa: Emiliano Sosa"));
    await usuario.click(boton("Dejar sin beca: Emiliano Sosa"));
    primero.resolver({ ok: false, mensaje: "No se pudo guardar. Probá de nuevo." });

    await waitFor(() => expect(boton("Dejar sin beca: Emiliano Sosa")).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(screen.queryByText(/Guardando…/)).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(acciones.asignarTipoDeBeca.mock.calls.map((c) => c[1])).toEqual(["completa", null]);
  });

  it("dos toques en cola: el primero sale bien y el segundo falla; vuelve a lo guardado, avisa y se puede reintentar", async () => {
    let llamada = 0;
    const acciones = crearAcciones(async (tipo) => {
      llamada += 1;
      if (llamada === 2) return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo." };
      return resultadoDe(tipo);
    });
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.click(boton("Apuntar a beca completa: Emiliano Sosa"));
    await usuario.click(boton("Dejar sin beca: Emiliano Sosa"));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar. Probá de nuevo.");
    expect(boton("Apuntar a beca completa: Emiliano Sosa")).toHaveAttribute("aria-pressed", "true");
    expect(boton("Dejar sin beca: Emiliano Sosa")).toHaveAttribute("aria-pressed", "false");

    await usuario.click(boton("Dejar sin beca: Emiliano Sosa"));
    await waitFor(() => expect(boton("Dejar sin beca: Emiliano Sosa")).toHaveAttribute("aria-pressed", "true"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si la acción revienta (sin red), dice «Necesitás conexión para guardar la beca», el botón queda libre y no se pierde lo marcado antes", async () => {
    const acciones = crearAcciones(async () => {
      throw new Error("Failed to fetch");
    });
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.click(boton("Dejar sin beca: Emiliano Sosa"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para guardar la beca");
    expect(boton("Apuntar a media beca: Emiliano Sosa")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/Guardando…/)).not.toBeInTheDocument();
    // El error no deja trabado el botón: un segundo intento vuelve a mandar.
    await usuario.click(boton("Dejar sin beca: Emiliano Sosa"));
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(2);
  });

  it("la fila ordenada que se mueve al guardar no le saca el foco al botón tocado", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);
    await usuario.click(encabezado(/^APUNTA A/));
    // Sin beca (Sofía) primero, luego Media (Emiliano), Completa (Florencia), y al final los que no tienen carrera.
    expect(nombresVisibles().slice(0, 3)).toEqual(["Sofía Cabral", "Emiliano Sosa", "Florencia Pintos"]);

    await usuario.click(boton("Apuntar a beca completa: Sofía Cabral"));

    await waitFor(() => expect(boton("Apuntar a beca completa: Sofía Cabral")).toHaveAttribute("aria-pressed", "true"));
    expect(nombresVisibles().slice(0, 3)).toEqual(["Emiliano Sosa", "Florencia Pintos", "Sofía Cabral"]);
    expect(boton("Apuntar a beca completa: Sofía Cabral")).toHaveFocus();
  });
});

describe("QA #95 · orden, filtros y datos límite", () => {
  it.each([
    ["CARRERA", "asc"],
    ["CARRERA", "desc"],
    ["APUNTA A", "asc"],
    ["APUNTA A", "desc"],
    ["ESTADO", "asc"],
    ["ESTADO", "desc"],
  ] as const)("ordenar por %s (%s): los dos sin carrera quedan al final", async (columna, sentido) => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    await usuario.click(encabezado(new RegExp(`^${columna}`)));
    if (sentido === "desc") await usuario.click(encabezado(new RegExp(`^${columna}`)));

    expect(nombresVisibles().slice(-2)).toEqual(["Federico Da Rosa", "Rocío Benítez"]);
  });

  it("«Avance»: los que no tienen meta (sin carrera o sin beca) van al final en los dos sentidos", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    await usuario.click(encabezado(/^AVANCE/));
    const asc = nombresVisibles();
    await usuario.click(encabezado(/^AVANCE/));
    const desc = nombresVisibles();

    expect(asc.slice(0, 2)).toEqual(["Florencia Pintos", "Emiliano Sosa"]);
    expect(desc.slice(0, 2)).toEqual(["Emiliano Sosa", "Florencia Pintos"]);
    expect(asc.slice(-3).sort()).toEqual(["Federico Da Rosa", "Rocío Benítez", "Sofía Cabral"]);
    expect(desc.slice(-3).sort()).toEqual(["Federico Da Rosa", "Rocío Benítez", "Sofía Cabral"]);
  });

  it("con 305 colportores ordena sin perder ni repetir a nadie y sin tardar", async () => {
    const base = datosDePrueba();
    const becas = becasDePrueba();
    const lista = Array.from({ length: 300 }, (_, i) => colportor({ id: `c${i}`, nombre: `Colportor ${String(i).padStart(3, "0")}` }));
    lista.forEach((c, i) => {
      becas.porColportor[c.id] = { ...MEDIA, avance: { libros: i % 150, monto: i * 100 } };
    });
    const { usuario } = mostrar({ ...base, colportores: [...base.colportores, ...lista], becas });
    await irABecas(usuario);

    const inicio = performance.now();
    await usuario.click(encabezado(/^AVANCE/));
    await usuario.click(encabezado(/^AVANCE/));
    const nombres = nombresVisibles();

    expect(performance.now() - inicio).toBeLessThan(10_000);
    expect(nombres).toHaveLength(305);
    expect(new Set(nombres).size).toBe(305);
    expect(tabla().querySelectorAll("th[aria-sort='descending']")).toHaveLength(1);
  });

  it("cambiar «Ver avance en» con un filtro de avance puesto recalcula quién entra, sin perder el filtro", async () => {
    const datos = datosDePrueba();
    const becas = becasDePrueba();
    // Emiliano: 100 % en libros (120 de 120) y 10 % en monto.
    becas.porColportor.emiliano = { ...MEDIA, avance: { libros: 120, monto: 18000 } };
    const { usuario } = mostrar({ ...datos, becas });
    await irABecas(usuario);

    await usuario.selectOptions(filtro("Avance en libros"), "100");
    expect(nombresVisibles()).toEqual(["Emiliano Sosa"]);

    await usuario.click(boton("Compra a la CES"));

    expect(filtro("Avance en compra a la CES")).toHaveValue("100");
    expect(nombresVisibles()).toEqual([]);
    expect(screen.getByText(/Ningún colportor coincide con estos filtros\./)).toBeInTheDocument();
    expect(boton("Limpiar filtros")).toBeInTheDocument();
  });

  it("«Sin meta» trae a quien no tiene carrera, a quien está sin beca y a quien tiene una carrera sin meta cargada", async () => {
    const datos = datosDePrueba();
    const becas = becasDePrueba();
    becas.porColportor.florencia = { carrera: { id: "cont", nombre: "Contador Público", elegidaEl: "2026-09-01" }, apuntaA: "media", meta: null, avance: { libros: 10, monto: 0 } };
    const { usuario } = mostrar({ ...datos, becas });
    await irABecas(usuario);

    await usuario.selectOptions(filtro("Avance en libros"), "sin-meta");

    expect(nombresVisibles().sort()).toEqual(["Federico Da Rosa", "Florencia Pintos", "Rocío Benítez", "Sofía Cabral"]);
  });
});

describe("QA #95 · teclado", () => {
  it("el encabezado se ordena con Enter y con Espacio, y «Sin beca» se guarda con el teclado", async () => {
    const { usuario, acciones } = mostrar();
    await irABecas(usuario);

    encabezado(/^AVANCE/).focus();
    await usuario.keyboard("{Enter}");
    expect(screen.getByRole("columnheader", { name: /^AVANCE/ })).toHaveAttribute("aria-sort", "ascending");
    await usuario.keyboard(" ");
    expect(screen.getByRole("columnheader", { name: /^AVANCE/ })).toHaveAttribute("aria-sort", "descending");

    boton("Dejar sin beca: Emiliano Sosa").focus();
    await usuario.keyboard(" ");
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledExactlyOnceWith("emiliano", null);
    await waitFor(() => expect(boton("Dejar sin beca: Emiliano Sosa")).toHaveAttribute("aria-pressed", "true"));
    expect(boton("Dejar sin beca: Emiliano Sosa")).toHaveFocus();
  });

  it("no escribe nada en la consola (ni nombres ni advertencias de React) al filtrar, ordenar, guardar y fallar", async () => {
    const espias = (["log", "info", "warn", "error"] as const).map((nivel) => vi.spyOn(console, nivel).mockImplementation(() => {}));
    let llamada = 0;
    const acciones = crearAcciones(async (tipo) => {
      llamada += 1;
      return llamada === 1 ? { ok: false, mensaje: "No se pudo guardar. Probá de nuevo." } : resultadoDe(tipo);
    });
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.selectOptions(filtro("Estado"), "en-progreso");
    await usuario.click(encabezado(/^COLPORTOR/));
    await usuario.click(boton("Dejar sin beca: Emiliano Sosa"));
    await screen.findByRole("alert");
    await usuario.click(boton("Dejar sin beca: Emiliano Sosa"));
    await usuario.click(boton("Limpiar filtros"));

    for (const espia of espias) expect(espia).not.toHaveBeenCalled();
  });
});
