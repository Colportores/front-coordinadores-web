import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CampaniaDelTablero, ResultadoTablero, TableroDelDia } from "@/datos/inicio";
import { crearFuenteInicioSimulada } from "@/datos/inicio/simulado";
import { olvidarAjustes } from "@/features/inicio/ajustes";
import { InicioVista, type AccionesInicio } from "@/features/inicio/InicioVista";
import { fijarFlags } from "@/test/flags";

/**
 * QA #77 · vista 31 con el encabezado «Inicio · <campaña>» (canvas 37, artboards 01, 06 y 08): estados, casos límite del
 * encabezado y de las acciones que lo rodean, y entradas raras (nombres con emoji o con marcas HTML).
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

describe("QA #77 · los cinco estados con el encabezado", () => {
  it("cargando: el encabezado queda y el «Cargando el día…» dice qué se espera; la zona queda marcada como ocupada", async () => {
    const a = acciones(() => new Promise<ResultadoTablero>(() => {}));
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] }), a);

    fireEvent.click(screen.getByRole("button", { name: "Día anterior" }));

    expect(titulo("Inicio · Primavera 2026")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando el día…");
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("sin conexión: el aviso dice qué pasa y qué hacer, con «Reintentar» a mano; el encabezado queda", async () => {
    const a = acciones(async () => ({ ok: false, causa: "sin-conexion" }));
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] }), a);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    });

    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent(/conexión/i);
    expect(within(aviso).getByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(titulo("Inicio · Primavera 2026")).toBeInTheDocument();
    expect(document.querySelector("[aria-busy='true']")).toBeNull();
  });

  it("error de la base: otro texto, también con «Reintentar»", async () => {
    const a = acciones(async () => ({ ok: false, causa: "error" }));
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] }), a);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Probá de nuevo más tarde");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });

  it("la campaña dejó de existir entre dos pedidos: avisa qué hacer (elegir otra en el selector) y deja «Reintentar»", async () => {
    const a = acciones(async () => ({ ok: true, tablero: null }));
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] }), a);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("La campaña ya no está disponible. Elegí otra desde el selector de arriba.");
    expect(titulo("Inicio · Primavera 2026")).toBeInTheDocument();
  });

  it("éxito tras un fallo: «Reintentar» trae el día, el aviso desaparece y el foco va al título del detalle", async () => {
    const a = acciones();
    a.obtenerDia.mockResolvedValueOnce({ ok: false, causa: "sin-conexion" });
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] }), a);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-busy='true']")).toBeNull();
    expect(document.activeElement).toHaveAttribute("data-foco", "titulo-detalle");
  });
});

describe("QA #77 · casos límite del encabezado", () => {
  it("falla a mitad de la acción (la server action lanza): no queda trabado en «cargando» y se puede reintentar", async () => {
    const a = acciones();
    a.obtenerDia.mockRejectedValueOnce(new Error("red caída"));
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] }), a);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    });

    expect(screen.queryByText("Cargando el día…")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/conexión/i);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(titulo("Inicio · Primavera 2026")).toBeInTheDocument();
  });

  it("acciones superpuestas: la respuesta tardía del primer pedido no pisa a la del segundo", async () => {
    const pendientes: Array<(r: ResultadoTablero) => void> = [];
    const a = acciones(() => new Promise<ResultadoTablero>((resolver) => pendientes.push(resolver)));
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] }), a);

    fireEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Día anterior" }));
    expect(pendientes).toHaveLength(2);

    // el segundo llega primero y bien; el primero llega después con un fallo que no debe verse
    await act(async () => pendientes[1]!({ ok: true, tablero: await fuente.obtenerTablero({ fecha: "2026-10-19" }) }));
    await act(async () => pendientes[0]!({ ok: false, causa: "sin-conexion" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Cargando el día…")).not.toBeInTheDocument();
    expect(titulo("Inicio · Primavera 2026")).toBeInTheDocument();
  });

  it("por empezar y sin ciudades: la fecha de inicio y el aviso de que faltan ciudades, con la salida «Ir a Ciudades»", async () => {
    montar(await tableroCon({ nombre: "Verano 2027", ciudades: [], fechaInicio: "2027-01-04", porEmpezar: true }, { ciudades: [], sinZona: [], pendientes: [] }));

    expect(titulo("Inicio · Verano 2027")).toBeInTheDocument();
    expect(screen.getByText("Empieza el 04/01/2027 · todavía no hay jornadas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Ciudades" })).toHaveAttribute("href", "/ciudades");
  });

  it("un nombre con emoji, comillas y marcas HTML se ve como texto, sin interpretarse", async () => {
    const nombre = `Verano 🌞 "2027" <b>ya</b> & <img src=x onerror=alert(1)>`;
    const { container } = montar(await tableroCon({ nombre, ciudades: ["Punta del Este 🏖️", "<i>San</i> Carlos"] }));

    expect(titulo(`Inicio · ${nombre}`)).toBeInTheDocument();
    expect(screen.getByText("Punta del Este 🏖️ · <i>San</i> Carlos")).toBeInTheDocument();
    expect(container.querySelector("header b, header img, header i")).toBeNull();
  });

  it("una sola ciudad: el subtítulo es solo su nombre, sin separador sobrante", async () => {
    montar(await tableroCon({ nombre: "Permanente 2026", ciudades: ["Salto"] }));

    const subtitulo = titulo("Inicio · Permanente 2026").nextElementSibling;
    expect(subtitulo).toHaveTextContent(/^Salto$/);
  });

  it("40 ciudades: el subtítulo las lista todas y no hay un segundo encabezado «Inicio ·»", async () => {
    const ciudades = Array.from({ length: 40 }, (_, i) => `Ciudad ${i + 1}`);
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades }));

    expect(screen.getAllByRole("heading", { name: /^Inicio ·/ })).toHaveLength(1);
    expect(titulo("Inicio · Primavera 2026").nextElementSibling).toHaveTextContent(ciudades.join(" · "));
  });

  it("el encabezado va dentro de un <header> propio y la columna de detalle conserva el suyo (dos h2 distintos)", async () => {
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] }));

    const h2 = screen.getAllByRole("heading", { level: 2 });
    expect(h2[0]).toHaveTextContent("Inicio · Primavera 2026");
    expect(h2[0]!.closest("header")).not.toBeNull();
    expect(h2.length).toBeGreaterThanOrEqual(2);
  });

  it("el encabezado no tiene datos de personas: solo el nombre de la campaña y sus ciudades", async () => {
    montar(await tableroCon({ nombre: "Primavera 2026", ciudades: ["Rivera"] }));

    const cabecera = titulo("Inicio · Primavera 2026").closest("header")!;
    expect(cabecera.textContent).toBe("Inicio · Primavera 2026Rivera");
  });
});
