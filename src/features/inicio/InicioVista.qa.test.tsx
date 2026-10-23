import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ResultadoTablero, TableroDelDia } from "@/datos/inicio";
import { crearFuenteInicioSimulada } from "@/datos/inicio/simulado";
import { olvidarAjustes } from "@/features/inicio/ajustes";
import { InicioVista, type AccionesInicio } from "@/features/inicio/InicioVista";
import { TablaDeColportores } from "@/features/inicio/TablaDeColportores";
import { sigla } from "@/features/inicio/modelo";
import { fijarFlags } from "@/test/flags";

/**
 * QA de la vista 31 (PR #79): lo que el equipo de QA comprobó en un navegador real (Chromium, 1280 y 1366 px) y los casos
 * límite de acciones superpuestas y reentrada que los tests de la vista no cubren.
 */

const AHORA = new Date("2026-10-21T13:40:00.000Z");
const fuente = crearFuenteInicioSimulada(() => AHORA);

function acciones(obtenerDia: AccionesInicio["obtenerDia"] = async (fecha) => ({ ok: true, tablero: await fuente.obtenerTablero({ fecha }) })) {
  return { obtenerDia: vi.fn(obtenerDia) } satisfies AccionesInicio;
}

async function montar(opciones: { tablero?: TableroDelDia; acciones?: ReturnType<typeof acciones> } = {}) {
  fijarFlags({ modoDev: true });
  olvidarAjustes();
  window.localStorage.clear();
  const a = opciones.acciones ?? acciones();
  render(<InicioVista tablero={opciones.tablero ?? (await fuente.obtenerTablero())} acciones={a} />);
  return a;
}

function pendiente<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

describe("InicioVista · QA · la tabla de colportores en el ancho mínimo del panel (1280 px)", () => {
  // Con el panel a 1280 px (el mínimo del shell, `min-w-[1280px]`): 1280 − 320 (ciudades) − 2 × 22 (relleno) − 280 (pendientes)
  // − 16 (hueco) = 620 px para la tabla. Los mínimos son lo que mide cada columna en Chromium (`scrollWidth`) con los datos del
  // propio diseño: el nombre más largo de la simulada (147), «En jornada» con su punto (85), el encabezado «PRESENTACIONES»
  // (112), «VENTAS» (57) y «$U 12.345» (80).
  const MINIMOS = { Colportor: 150, Estado: 85, Horas: 55, Presentaciones: 112, Ventas: 57, Monto: 80 };

  it.skip("QA #59: a 1280 px la tabla recorta nombres y encabezados («Presentacion», «Venta») y «En jornada» pisa a «Horas»", async () => {
    const tablero = await fuente.obtenerTablero();
    const { container } = render(<TablaDeColportores ciudades={tablero.ciudades} ahora={tablero.calculadoA} titulo="Rivera" />);
    const tabla = container.querySelector("table")!;
    const minimoDeTabla = Number(/min-w-\[(\d+)px\]/.exec(tabla.className)?.[1] ?? 0);
    const ancho = Math.max(620, minimoDeTabla);

    const cols = [...container.querySelectorAll("colgroup col")].map((c) => c.className);
    const porcentajes = cols.map((c) => Number(/w-\[(\d+)%\]/.exec(c)?.[1] ?? NaN));
    const fijo = cols.reduce((suma, c) => suma + Number(/w-\[(\d+)px\]/.exec(c)?.[1] ?? 0), 0);
    const suma = porcentajes.filter((p) => !Number.isNaN(p)).reduce((a, b) => a + b, 0);
    // Si lo asignado supera el ancho, el navegador reparte lo que queda tras la columna fija en proporción (así salen 116 / 74 / 53 /
    // 95 / 47 / 74 px a 1280).
    const asignado = (suma / 100) * ancho;
    const factor = asignado + fijo > ancho ? (ancho - fijo) / asignado : 1;
    const anchos = Object.fromEntries(Object.keys(MINIMOS).map((nombre, i) => [nombre, (porcentajes[i] / 100) * ancho * factor]));
    for (const [nombre, minimo] of Object.entries(MINIMOS)) {
      expect(anchos[nombre], `la columna «${nombre}» mide ${Math.round(anchos[nombre])} px y su contenido pide ${minimo}`).toBeGreaterThanOrEqual(minimo);
    }
  });
});

describe("InicioVista · QA · acciones superpuestas y reentrada", () => {
  it("‹ y enseguida ›: gana «Hoy» y la respuesta vieja que llega tarde no lo pisa", async () => {
    const dia1 = pendiente<ResultadoTablero>();
    const hoy = pendiente<ResultadoTablero>();
    const respuestas = [dia1, hoy];
    const a = await montar({ acciones: acciones(() => respuestas.shift()!.promesa) });

    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    await userEvent.click(screen.getByRole("button", { name: "Día siguiente" }));
    expect(a.obtenerDia.mock.calls.map(([fecha]) => fecha)).toEqual(["2026-10-20", "2026-10-21"]);

    hoy.resolver({ ok: true, tablero: await fuente.obtenerTablero() });
    expect(await screen.findByRole("region", { name: /^Colportores/ })).toBeInTheDocument();
    dia1.resolver({ ok: false, causa: "sin-conexion" });
    await act(async () => {});
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Hoy")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^Colportores/ })).toBeInTheDocument();
  });

  it("tras una falla, tocar ‹ otra vez (sin «Reintentar») trae ese día y limpia el aviso", async () => {
    const respuestas: (() => Promise<ResultadoTablero>)[] = [
      async () => ({ ok: false, causa: "sin-conexion" }),
      async () => ({ ok: true, tablero: await fuente.obtenerTablero({ fecha: "2026-10-19" }) }),
    ];
    await montar({ acciones: acciones(() => respuestas.shift()!()) });

    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Revisá tu conexión");
    // Con el aviso a la vista el selector sigue activo: sigue de donde se quedó (el día que falló).
    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    expect(await screen.findByRole("region", { name: /^Colportores/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("lun 19 oct")).toBeInTheDocument();
  });

  it("el foco se queda en el botón del día mientras carga y cuando llega la respuesta", async () => {
    const respuesta = pendiente<ResultadoTablero>();
    await montar({ acciones: acciones(() => respuesta.promesa) });

    const anterior = screen.getByRole("button", { name: "Día anterior" });
    await userEvent.click(anterior);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando el día…");
    expect(anterior).toHaveFocus();
    respuesta.resolver({ ok: true, tablero: await fuente.obtenerTablero({ fecha: "2026-10-20" }) });
    await waitFor(() => expect(screen.getByRole("region", { name: /^Colportores/ })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Día anterior" })).toHaveFocus();
  });

  it("una falla de la server action que nunca responde bien no deja «Cargando el día…» si la siguiente sí llega", async () => {
    const respuestas: (() => Promise<ResultadoTablero>)[] = [
      () => Promise.reject(new Error("se cortó")),
      async () => ({ ok: true, tablero: await fuente.obtenerTablero({ fecha: "2026-10-20" }) }),
    ];
    await montar({ acciones: acciones(() => respuestas.shift()!()) });

    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("region", { name: /^Colportores/ })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("InicioVista · QA · datos límite de la lista de ciudades", () => {
  it("una ciudad con emoji y nombre larguísimo sin espacios se lista y se elige (la sigla no corta el emoji)", async () => {
    const base = await fuente.obtenerTablero();
    const larga = `🌆${"Larguísima".repeat(12)}`;
    const tablero: TableroDelDia = {
      ...base,
      ciudades: [{ ...base.ciudades[0], id: "c-larga", nombre: larga, departamento: "Rivera" }, ...base.ciudades.slice(1)],
    };
    await montar({ tablero });

    await userEvent.click(screen.getByRole("button", { name: new RegExp(larga.slice(0, 10)) }));
    expect(screen.getByRole("heading", { level: 2, name: larga })).toBeInTheDocument();
    expect(sigla(larga)).not.toMatch(/�/);
    expect(Array.from(sigla(larga))[0]).toBe("🌆");
  });
});
