import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CiudadDelDia, ColportorSinZona, PendienteDeAccion, TableroDelDia } from "@/datos/inicio";
import { crearFuenteInicioSimulada } from "@/datos/inicio/simulado";
import { olvidarAjustes } from "@/features/inicio/ajustes";
import { InicioVista } from "@/features/inicio/InicioVista";
import { fijarFlags } from "@/test/flags";

/**
 * Issue #192: la vista 31 con más de 25 registros en cada lista que desplaza (ciudades, colportores, pendientes), sin
 * paginar: todo está en el DOM, con su región de desplazamiento y la ciudad elegida a la vista.
 */

const AHORA = new Date("2026-10-21T13:40:00.000Z");
const fuente = crearFuenteInicioSimulada(() => AHORA);

const CIUDADES = 30;

async function tableroGrande(): Promise<TableroDelDia> {
  const base = (await fuente.obtenerTablero())!;
  const molde = base.ciudades[0];
  const ciudades: CiudadDelDia[] = Array.from({ length: CIUDADES }, (_, i) => ({
    ...molde,
    id: `ciudad-${i}`,
    nombre: `Ciudad ${String(i).padStart(2, "0")}`,
    departamento: `Departamento ${i % 3}`,
    colportores: molde.colportores.map((c) => ({ ...c, id: `${c.id}-${i}` })),
  }));
  const pedidos: PendienteDeAccion[] = Array.from({ length: 30 }, (_, i) => ({
    tipo: "pedido-por-autorizar",
    id: `pedido-${i}`,
    ciudadId: `ciudad-${i % CIUDADES}`,
    colportor: `Pedidor ${i}`,
    ciudad: `Ciudad ${String(i % CIUDADES).padStart(2, "0")}`,
    libros: 3,
    montoCentavos: 120000,
    cuando: "2026-10-21T10:00:00.000Z",
  }));
  const sinZona: ColportorSinZona[] = Array.from({ length: 40 }, (_, i) => ({
    id: `sz-${i}`,
    nombre: `Sin Zona ${i}`,
    estado: "sin-iniciar",
    deBaja: false,
    inscriptoAt: "2026-10-20T10:00:00.000Z",
    ultimoPushAt: null,
  }));
  return { ...base, ciudades, pendientes: pedidos, sinZona };
}

function recordar(ajustes: Record<string, unknown>) {
  window.localStorage.setItem("inicio-ajustes", JSON.stringify(ajustes));
}

async function montar(tablero: TableroDelDia) {
  fijarFlags({ modoDev: true });
  olvidarAjustes();
  return render(<InicioVista tablero={tablero} acciones={{ obtenerDia: vi.fn(async () => ({ ok: true as const, tablero })) }} />);
}

let alVer: ReturnType<typeof vi.fn>;
const original = Element.prototype.scrollIntoView;

beforeEach(() => {
  alVer = vi.fn();
  Element.prototype.scrollIntoView = alVer as unknown as Element["scrollIntoView"];
});

afterEach(() => {
  Element.prototype.scrollIntoView = original;
});

describe("InicioVista · más de 25 registros por lista", () => {
  it("30 ciudades: están todas en la lista, cada una con su botón, y la última se puede elegir", async () => {
    await montar(await tableroGrande());
    const lista = document.getElementById("columna-ciudades")!;
    const botones = within(lista).getAllByRole("button", { pressed: false }).filter((b) => /^Ciudad \d\d/.test(b.textContent ?? ""));
    // «Todas las ciudades» es un botón más; las 30 se ven con sus tres cifras.
    expect(botones).toHaveLength(CIUDADES);

    await userEvent.click(within(lista).getByRole("button", { name: /^Ciudad 29/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Ciudad 29" })).toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: /^Ciudad 29/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("la ciudad que se recuerda de otra visita queda a la vista aunque esté más abajo del borde", async () => {
    recordar({ seleccion: "ciudad:ciudad-27" });
    await montar(await tableroGrande());

    const elegida = within(document.getElementById("columna-ciudades")!).getByRole("button", { pressed: true });
    expect(elegida).toHaveTextContent(/^Ciudad 27/);
    await waitFor(() => expect(alVer).toHaveBeenCalled());
    expect(alVer.mock.contexts[0]).toBe(elegida);
    expect(alVer).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("al contraer la columna, la barra con las siglas también deja a la vista la ciudad elegida", async () => {
    recordar({ seleccion: "ciudad:ciudad-27" });
    await montar(await tableroGrande());
    await userEvent.click(screen.getByRole("button", { name: "Contraer ciudades" }));

    const barra = document.getElementById("columna-ciudades")!;
    const elegida = within(barra).getByRole("button", { pressed: true });
    expect(elegida).toHaveAccessibleName(/^Ciudad 27:/);
    expect(alVer.mock.contexts.at(-1)).toBe(elegida);
    // Las 30 ciudades siguen ahí, cada una con su nombre y sus cifras.
    expect(within(barra).getAllByRole("button", { name: /^Ciudad \d\d:/ })).toHaveLength(CIUDADES);
  });

  it("elegir una ciudad que ya se ve no mueve la lista de nuevo por su cuenta más de una vez por elección", async () => {
    await montar(await tableroGrande());
    const lista = document.getElementById("columna-ciudades")!;
    alVer.mockClear();
    await userEvent.click(within(lista).getByRole("button", { name: /^Ciudad 05/ }));
    expect(alVer).toHaveBeenCalledTimes(1);
    await userEvent.click(within(lista).getByRole("button", { name: /^Ciudad 05/ }));
    expect(alVer).toHaveBeenCalledTimes(1);
  });

  it("«Todas»: los 30 colportores de cada ciudad quedan en la tabla con su región de desplazamiento", async () => {
    const tablero = await tableroGrande();
    await montar(tablero);
    const tabla = screen.getByRole("region", { name: /^Colportores/ });
    const porCiudad = tablero.ciudades[0].colportores.length;
    // Una fila de encabezado de columnas, una cabecera por ciudad y los colportores de todas.
    expect(within(tabla).getAllByRole("row")).toHaveLength(1 + CIUDADES + CIUDADES * porCiudad);
    expect(tabla).toHaveAttribute("tabindex", "0");
  });

  it("pendientes de acción: 30 pedidos y 40 colportores sin zona se leen enteros, con un solo estado de la vista", async () => {
    await montar(await tableroGrande());
    const columna = document.getElementById("columna-pendientes")!;
    expect(within(columna).getAllByRole("article")).toHaveLength(30 + 1);
    expect(within(columna).getByText("40 colportores sin zona asignada")).toBeInTheDocument();
    expect(within(columna).getByText("Sin Zona 39")).toBeInTheDocument();
    // Nada se repite: cada botón «Autorizar» es de un pedido.
    expect(within(columna).getAllByRole("button", { name: "Autorizar" })).toHaveLength(30);
  });
});
