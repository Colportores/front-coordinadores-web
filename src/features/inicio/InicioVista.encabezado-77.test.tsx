import { act, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import type { CampaniaDelTablero, ResultadoTablero, TableroDelDia } from "@/datos/inicio";
import { crearFuenteInicioSimulada } from "@/datos/inicio/simulado";
import { olvidarAjustes } from "@/features/inicio/ajustes";
import { InicioVista, type AccionesInicio } from "@/features/inicio/InicioVista";
import { fijarFlags } from "@/test/flags";

/**
 * #77 · el encabezado «Inicio · <campaña>» de la vista 31 (canvas 37: artboards 01 «Lista abierta», 06 «Vacía» y 08 «Campaña
 * cambiada»): el nombre, sus ciudades y, si todavía no empezó, «Empieza el dd/mm/aaaa · todavía no hay jornadas».
 */

const fuente = crearFuenteInicioSimulada(() => new Date("2026-10-21T13:40:00.000Z"));

async function tableroCon(campania: Partial<CampaniaDelTablero> = {}, cambios: Partial<TableroDelDia> = {}): Promise<TableroDelDia> {
  const base = await fuente.obtenerTablero();
  return { ...base, ...cambios, campania: { ...base.campania, ...campania } };
}

function acciones(obtenerDia: AccionesInicio["obtenerDia"] = async (fecha) => ({ ok: true, tablero: await fuente.obtenerTablero({ fecha }) })) {
  return { obtenerDia: vi.fn(obtenerDia) } satisfies AccionesInicio;
}

function montar(tablero: TableroDelDia, accionesDeLaVista = acciones()) {
  fijarFlags({ modoDev: true });
  olvidarAjustes();
  return { ...render(<InicioVista tablero={tablero} acciones={accionesDeLaVista} />), acciones: accionesDeLaVista };
}

const titulo = (nombre: string | RegExp) => screen.getByRole("heading", { level: 2, name: nombre });

async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

describe("InicioVista #77 · encabezado con la campaña elegida", () => {
  it("en curso: «Inicio · <campaña>» y sus ciudades, como en el artboard 37-01", async () => {
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Montevideo", "Las Piedras"] }));

    expect(titulo("Inicio · Primavera 2026")).toBeInTheDocument();
    expect(screen.getByText("Montevideo · Las Piedras")).toBeInTheDocument();
    expect(screen.queryByText(/todavía no hay jornadas/)).not.toBeInTheDocument();
  });

  it("por empezar: «Empieza el 04/01/2027 · todavía no hay jornadas» en vez de las ciudades (artboard 37-08)", async () => {
    montar(await tableroCon({ nombre: "Verano 2027", ciudades: ["Maldonado", "Punta del Este"], fechaInicio: "2027-01-04", porEmpezar: true }));

    expect(titulo("Inicio · Verano 2027")).toBeInTheDocument();
    expect(screen.getByText("Empieza el 04/01/2027 · todavía no hay jornadas")).toBeInTheDocument();
    expect(screen.queryByText("Maldonado · Punta del Este")).not.toBeInTheDocument();
  });

  it("una campaña en curso sin ciudades: solo el título (la vista ya avisa que le faltan ciudades)", async () => {
    montar(await tableroCon({ nombre: "Permanente 2026", ciudades: [] }, { ciudades: [], sinZona: [], pendientes: [] }));

    expect(titulo("Inicio · Permanente 2026")).toBeInTheDocument();
    expect(screen.getByText(/Esta campaña todavía no tiene ciudades/)).toBeInTheDocument();
    expect(titulo("Inicio · Permanente 2026").nextElementSibling).toBeNull();
  });

  it("nombre larguísimo sin espacios y 40 ciudades: se muestran enteros y rompen en vez de desbordar", async () => {
    const nombre = "Campañaespecialdeinviernoparatodoeldepartamentodetacuarembó".repeat(5);
    const ciudades = Array.from({ length: 40 }, (_, i) => `Ciudad número ${i + 1}`);
    montar(await tableroCon({ nombre, ciudades }));

    const h = titulo(`Inicio · ${nombre}`);
    expect(h.className).toContain("[overflow-wrap:anywhere]");
    expect(screen.getByText(ciudades.join(" · "))).toHaveClass("[overflow-wrap:anywhere]");
  });

  it("al pedir otro día (cargando, error y reintento) el encabezado queda y no se duplica", async () => {
    const fallida: ResultadoTablero = { ok: false, causa: "sin-conexion" };
    const a = acciones();
    a.obtenerDia.mockResolvedValueOnce(fallida);
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] }), a);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el día");
    expect(screen.getAllByRole("heading", { name: "Inicio · Primavera 2026" })).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Inicio · Primavera 2026" })).toHaveLength(1);
    expect(screen.getAllByText("Rivera").length).toBeGreaterThan(0);
  });

  it("dos toques seguidos en «Día anterior» antes de que llegue el primero: el encabezado no cambia ni se pierde", async () => {
    let soltar!: () => void;
    const espera = new Promise<void>((resolver) => (soltar = resolver));
    const a = acciones(async (fecha) => {
      await espera;
      return { ok: true, tablero: await fuente.obtenerTablero({ fecha }) };
    });
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] }), a);

    fireEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    expect(screen.getByRole("status")).toHaveTextContent("Cargando el día…");
    expect(titulo("Inicio · Primavera 2026")).toBeInTheDocument();

    await act(async () => soltar());
    expect(a.obtenerDia).toHaveBeenCalledTimes(2);
    expect(titulo("Inicio · Primavera 2026")).toBeInTheDocument();
  });

  it("volver atrás y reentrar: la vista se vuelve a armar con el mismo encabezado", async () => {
    const tablero = await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] });
    const primera = montar(tablero);
    expect(titulo("Inicio · Primavera 2026")).toBeInTheDocument();
    primera.unmount();

    montar(tablero);
    expect(titulo("Inicio · Primavera 2026")).toBeInTheDocument();
    expect(screen.getAllByText("Rivera").length).toBeGreaterThan(0);
  });

  it("es accesible, en curso y por empezar (axe A/AA)", async () => {
    const { container, unmount } = montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] }));
    expect(await violaciones(container)).toEqual([]);
    unmount();

    const otra = montar(await tableroCon({ nombre: "Verano 2027", fechaInicio: "2027-01-04", porEmpezar: true }));
    expect(await violaciones(otra.container)).toEqual([]);
  });
});
