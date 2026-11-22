import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ColumnaDeCiudades } from "@/features/cuentas/ColumnaDeCiudades";
import { ListaDeCiudades as ListaDeEquipo } from "@/features/equipo/vista-33/ListaDeCiudades";
import { ListaDeCiudades as ListaDeInicio } from "@/features/inicio/ListaDeCiudades";
import { resumenDe } from "@/features/inicio/modelo";
import { ListaDeCiudades as ListaDeReportes } from "@/features/reportes/horas/ListaDeCiudades";
import { ListaDeCiudades as ListaDeStock } from "@/features/stock/vista-34/ListaDeCiudades";
import { CIUDADES_PARA_BUSCAR, ETIQUETA_BUSCAR_CIUDAD, textoSinCoincidencias } from "@/lib/buscar-ciudades";

/**
 * Issue #195: el buscador de ciudades de Ciudades (#189) en la columna de Inicio, Equipo (33), Reportes (32), Stock (34) y
 * Cuentas (36), con 150 ciudades. Mismo umbral, mismo texto, mismo orden y mismo «sin resultados» que la barra de Ciudades.
 */

const TOTAL = 150;
const ESPECIALES = ["Paysandú", "Villa Paysandú", "Salto", "San José de Mayo"];
const nombres = [...Array.from({ length: TOTAL - ESPECIALES.length }, (_, i) => `Pueblo ${String(i + 1).padStart(3, "0")}`), ...ESPECIALES];
const idDe = (i: number) => `c-${i}`;
const indiceDe = (nombre: string) => nombres.indexOf(nombre);
const PAYSANDU = indiceDe("Paysandú");
const VILLA_PAYSANDU = indiceDe("Villa Paysandú");
const SALTO = indiceDe("Salto");

const original = Element.prototype.scrollIntoView;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn() as unknown as Element["scrollIntoView"];
});
afterEach(() => {
  Element.prototype.scrollIntoView = original;
});

interface Montaje {
  /** La columna ya montada, con `elegida` (índice de ciudad, o null = Todas) y la cantidad de ciudades que se piden. */
  montar: (opciones: { elegida: number | null; cantidad?: number; alElegir: (valor: unknown) => void }) => { rerender: () => void };
  /** Lo que recibe `alElegir` al elegir la ciudad `i`. */
  alElegirDe: (i: number) => unknown;
  raiz: () => HTMLElement;
  boton: (raiz: HTMLElement, nombre: string) => HTMLElement;
  botones: (raiz: HTMLElement) => HTMLElement[];
}

const ambito = (i: number) => ({ tipo: "ciudad" as const, ciudadId: idDe(i) });
const todas = { tipo: "todas" as const };

function columnaPorAmbito(
  Lista: ComponentType<{ lista: never; alElegir: (a: never) => void; alContraer: () => void }>,
  nodoDe: (i: number, elegida: number | null, nombre: string) => object,
  todasDe: (elegida: number | null) => object,
): Montaje {
  return {
    montar: ({ elegida, cantidad = TOTAL, alElegir }) => {
      const hechas = nombres.slice(0, cantidad - ESPECIALES.length).concat(ESPECIALES.slice(0, Math.min(ESPECIALES.length, cantidad)));
      const lista = {
        todas: todasDe(elegida),
        grupos: [0, 1, 2].map((d) => ({
          clave: `d-${d}`,
          departamento: `Depto ${d}`,
          titulo: `DEPTO. ${d}`,
          nodos: hechas.map((n, i) => ({ n, i })).filter(({ i }) => i % 3 === d).map(({ n, i }) => nodoDe(i, elegida, n)),
        })),
      };
      const vista = () => <Lista lista={lista as never} alElegir={alElegir as never} alContraer={() => {}} />;
      const { rerender } = render(vista());
      return { rerender: () => rerender(vista()) };
    },
    alElegirDe: ambito,
    raiz: () => screen.getByRole("navigation", { name: "Ciudades" }),
    boton: (raiz, nombre) => within(raiz).getByRole("button", { name: new RegExp(`^${nombre}`) }),
    botones: (raiz) => within(raiz).getAllByRole("button"),
  };
}

const equipo = columnaPorAmbito(
  ListaDeEquipo as never,
  (i, elegida, nombre) => ({ clave: idDe(i), ambito: ambito(i), nombre, cantidad: 3, sinZona: 0, seleccionado: i === elegida }),
  (elegida) => ({ clave: "todas", ambito: todas, nombre: "Todas las ciudades", cantidad: 450, sinZona: 0, seleccionado: elegida === null }),
);
const reportes = columnaPorAmbito(
  ListaDeReportes as never,
  (i, elegida, nombre) => ({ clave: idDe(i), ambito: ambito(i), nombre, detalle: "3 colportores", seleccionado: i === elegida, hijos: [] }),
  (elegida) => ({ clave: "todas", ambito: todas, nombre: "Todas las ciudades", detalle: "450 colportores", seleccionado: elegida === null, hijos: [] }),
);
const stock = columnaPorAmbito(
  ListaDeStock as never,
  (i, elegida, nombre) => ({ clave: idDe(i), ambito: ambito(i), nombre, detalle: "sin avisos", seleccionado: i === elegida }),
  (elegida) => ({ clave: "todas", ambito: todas, nombre: "Todas las ciudades", detalle: "", seleccionado: elegida === null }),
);

const inicio: Montaje = {
  montar: ({ elegida, cantidad = TOTAL, alElegir }) => {
    const hechas = nombres.slice(0, cantidad - ESPECIALES.length).concat(ESPECIALES.slice(0, Math.min(ESPECIALES.length, cantidad)));
    const elementos = [
      { tipo: "item" as const, clave: "todas", seleccion: todas, nombre: "Todas las ciudades", sigla: "Todas", resumen: resumenDe([]) },
      { tipo: "grupo" as const, clave: "grupo:uno", etiqueta: "DEPTO. UNO" },
      ...hechas.map((nombre, i) => ({
        tipo: "item" as const,
        clave: `ciudad:${idDe(i)}`,
        seleccion: { tipo: "ciudad" as const, id: idDe(i) },
        nombre,
        sigla: `C${i}`,
        resumen: resumenDe([]),
      })),
    ];
    const seleccionada = elegida === null ? todas : { tipo: "ciudad" as const, id: idDe(elegida) };
    const vista = () => <ListaDeInicio elementos={elementos} seleccionada={seleccionada} alElegir={alElegir} alContraer={() => {}} />;
    const { rerender } = render(vista());
    return { rerender: () => rerender(vista()) };
  },
  alElegirDe: (i) => ({ tipo: "ciudad", id: idDe(i) }),
  raiz: () => document.getElementById("columna-ciudades")!,
  boton: (raiz, nombre) => within(raiz).getByRole("button", { name: new RegExp(`^${nombre}`) }),
  botones: (raiz) => within(raiz).getAllByRole("button"),
};

const cuentas: Montaje = {
  montar: ({ elegida, cantidad = TOTAL, alElegir }) => {
    const hechas = nombres.slice(0, cantidad - ESPECIALES.length).concat(ESPECIALES.slice(0, Math.min(ESPECIALES.length, cantidad)));
    const elementos = [
      { tipo: "ciudad" as const, clave: "todas", nombre: "Todas las ciudades", sigla: "Todas", pendientes: 0, porDecidir: 0, seleccion: todas },
      { tipo: "grupo" as const, clave: "grupo:Depto", etiqueta: "DEPTO. DEPTO" },
      ...hechas.map((nombre, i) => ({
        tipo: "ciudad" as const,
        clave: `ciudad:${idDe(i)}`,
        nombre,
        sigla: `C${i}`,
        pendientes: i % 4,
        porDecidir: 0,
        seleccion: { tipo: "ciudad" as const, ciudadId: idDe(i) },
      })),
    ];
    const seleccionada = elegida === null ? todas : { tipo: "ciudad" as const, ciudadId: idDe(elegida) };
    const vista = () => (
      <ColumnaDeCiudades elementos={elementos} seleccionada={seleccionada} contraida={false} alElegir={alElegir} alAlternar={() => {}} />
    );
    const { rerender } = render(vista());
    return { rerender: () => rerender(vista()) };
  },
  alElegirDe: (i) => ({ tipo: "ciudad", ciudadId: idDe(i) }),
  raiz: () => document.getElementById("columna-ciudades")!,
  boton: (raiz, nombre) => within(raiz).getByRole("button", { name: new RegExp(`^${nombre}`) }),
  botones: (raiz) => within(raiz).getAllByRole("button"),
};

const vistas: { vista: string; m: Montaje }[] = [
  { vista: "Inicio (31)", m: inicio },
  { vista: "Equipo (33)", m: equipo },
  { vista: "Reportes (32)", m: reportes },
  { vista: "Stock (34)", m: stock },
  { vista: "Cuentas (36)", m: cuentas },
];

const campo = () => screen.getByRole("searchbox", { name: ETIQUETA_BUSCAR_CIUDAD });
/** Los nombres de las ciudades que se ven, en orden (sin «Todas», sin el botón de contraer). */
const verNombres = (m: Montaje) =>
  m
    .botones(m.raiz())
    .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "")
    .filter((t) => !/Todas las ciudades|Contraer/.test(t))
    .map((t) => /^(Paysandú|Villa Paysandú|Salto|San José de Mayo|Pueblo \d{3})/.exec(t)?.[1] ?? t);

describe.each(vistas)("$vista · buscador de ciudades con 150", ({ m }) => {
  it("con 150 ciudades hay un campo con etiqueta y el recuento, y se ven todas", () => {
    m.montar({ elegida: null, alElegir: () => {} });
    expect(campo()).toHaveAttribute("placeholder", "Buscar ciudad…");
    expect(within(m.raiz()).getByText("150 ciudades")).toHaveAttribute("aria-live", "polite");
    const vistos = verNombres(m);
    expect(vistos).toHaveLength(TOTAL);
    // Las agrupadas por departamento reparten las ciudades en grupos: lo que importa es que están las 150, sin filtrar.
    expect([...vistos].sort()).toEqual([...nombres].sort());
  });

  it("buscar sin tildes ni mayúsculas: primero las que empiezan, después las que contienen; se anuncia la cantidad", async () => {
    m.montar({ elegida: null, alElegir: () => {} });
    await userEvent.type(campo(), "PAYSANDU");
    expect(verNombres(m)).toEqual(["Paysandú", "Villa Paysandú"]);
    expect(within(m.raiz()).getByText("2 de 150 ciudades")).toBeInTheDocument();
    // «Todas las ciudades» sigue a la vista: es el ámbito, no una ciudad.
    expect(within(m.raiz()).getByRole("button", { name: /^Todas las ciudades/ })).toBeInTheDocument();
  });

  it("dentro de cada grupo van de la A a la Z", async () => {
    m.montar({ elegida: null, alElegir: () => {} });
    await userEvent.type(campo(), "s");
    const vistos = verNombres(m);
    // Empiezan con «s»: Salto y San José de Mayo; el resto lo contiene («Pueblo», «Paysandú»…).
    expect(vistos.slice(0, 2)).toEqual(["Salto", "San José de Mayo"]);
    const contienen = vistos.slice(2);
    expect(contienen).toEqual([...contienen].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })));
  });

  it("elegir una de los resultados la elige; Enter elige la primera", async () => {
    const alElegir = vi.fn();
    m.montar({ elegida: null, alElegir });
    await userEvent.type(campo(), "salto");
    await userEvent.click(m.boton(m.raiz(), "Salto"));
    expect(alElegir).toHaveBeenLastCalledWith(m.alElegirDe(SALTO));

    alElegir.mockClear();
    await userEvent.clear(campo());
    await userEvent.type(campo(), "pays{Enter}");
    expect(alElegir).toHaveBeenCalledTimes(1);
    expect(alElegir).toHaveBeenCalledWith(m.alElegirDe(PAYSANDU));
  });

  it("sin coincidencias: dice qué hacer y Todas sigue a la vista; Enter no elige nada", async () => {
    const alElegir = vi.fn();
    m.montar({ elegida: null, alElegir });
    await userEvent.type(campo(), "zzz{Enter}");
    expect(alElegir).not.toHaveBeenCalled();
    expect(within(m.raiz()).getByText(textoSinCoincidencias("zzz"))).toBeInTheDocument();
    expect(within(m.raiz()).getByText("0 de 150 ciudades")).toBeInTheDocument();
    expect(verNombres(m)).toEqual([]);
    expect(within(m.raiz()).getByRole("button", { name: /^Todas las ciudades/ })).toBeInTheDocument();
  });

  it("la ciudad elegida sigue a la vista, primera, aunque no coincida; Esc borra lo escrito y no la pierde", async () => {
    const alElegir = vi.fn();
    m.montar({ elegida: SALTO, alElegir });
    await userEvent.type(campo(), "paysandu");
    expect(verNombres(m)).toEqual(["Salto", "Paysandú", "Villa Paysandú"]);

    const seCierra = vi.fn();
    document.addEventListener("keydown", seCierra);
    fireEvent.keyDown(campo(), { key: "Escape" });
    document.removeEventListener("keydown", seCierra);
    expect(campo()).toHaveValue("");
    // Ese Esc no sube: no cierra lo que haya abierto en la vista.
    expect(seCierra).not.toHaveBeenCalled();
    expect(verNombres(m)).toHaveLength(TOTAL);
    expect(within(m.raiz()).getByText("150 ciudades")).toBeInTheDocument();
    expect(alElegir).not.toHaveBeenCalled();
    // Con el campo vacío, un Esc más sí sube (no se traga todos).
    const sube = vi.fn();
    document.addEventListener("keydown", sube);
    fireEvent.keyDown(campo(), { key: "Escape" });
    document.removeEventListener("keydown", sube);
    expect(sube).toHaveBeenCalledTimes(1);
  });

  it("al volver a la lista completa, la elegida (más abajo del borde) se vuelve a traer a la vista", async () => {
    const alVer = vi.fn();
    Element.prototype.scrollIntoView = alVer as unknown as Element["scrollIntoView"];
    m.montar({ elegida: SALTO, alElegir: () => {} });
    await userEvent.type(campo(), "paysandu");
    alVer.mockClear();
    await userEvent.clear(campo());
    expect(alVer).toHaveBeenCalled();
    expect(alVer.mock.contexts.at(-1)).toBe(m.boton(m.raiz(), "Salto"));
  });

  it("espacios solos no cuentan como búsqueda; textos largos y con espacios de más se entienden", async () => {
    m.montar({ elegida: null, alElegir: () => {} });
    await userEvent.type(campo(), "   ");
    expect(verNombres(m)).toHaveLength(TOTAL);
    await userEvent.clear(campo());
    await userEvent.type(campo(), "  san   jose  ");
    expect(verNombres(m)).toEqual(["San José de Mayo"]);
    await userEvent.clear(campo());
    await userEvent.type(campo(), "x".repeat(300));
    expect(within(m.raiz()).getByText(textoSinCoincidencias("x".repeat(300)))).toBeInTheDocument();
  });

  it("no tiene violaciones de accesibilidad (axe) con 150 ciudades ni buscando", async () => {
    m.montar({ elegida: SALTO, alElegir: () => {} });
    const opciones = { runOnly: { type: "tag" as const, values: ["wcag2a", "wcag2aa", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } };
    expect((await axe.run(m.raiz(), opciones)).violations).toEqual([]);
    await userEvent.type(campo(), "xyz");
    expect((await axe.run(m.raiz(), opciones)).violations).toEqual([]);
  });

  it("con pocas ciudades (el umbral o menos) no hay campo", () => {
    m.montar({ elegida: null, cantidad: CIUDADES_PARA_BUSCAR, alElegir: () => {} });
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("con una más que el umbral aparece el campo", () => {
    m.montar({ elegida: null, cantidad: CIUDADES_PARA_BUSCAR + 1, alElegir: () => {} });
    expect(campo()).toBeInTheDocument();
    expect(within(m.raiz()).getByText(`${CIUDADES_PARA_BUSCAR + 1} ciudades`)).toBeInTheDocument();
  });

  it("al cambiar los datos (otra ciudad elegida) con una búsqueda abierta, la búsqueda sigue", async () => {
    const alElegir = vi.fn();
    const { rerender } = m.montar({ elegida: null, alElegir });
    await userEvent.type(campo(), "paysandu");
    await act(async () => rerender());
    expect(campo()).toHaveValue("paysandu");
    expect(verNombres(m)).toEqual(["Paysandú", "Villa Paysandú"]);
    expect(VILLA_PAYSANDU).toBeGreaterThan(0);
  });
});
