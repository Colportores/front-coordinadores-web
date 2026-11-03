import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CiudadDelCatalogo } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

import { BuscadorCiudad, MENSAJE_BUSQUEDA_SIN_CONEXION } from "./BuscadorCiudad";

/**
 * QA del PR #99 (issue #80): selectores de ciudad y departamento desde el catálogo. Los de `skip` documentan un
 * hallazgo; el implementador saca el `skip` cuando lo arregla.
 */

vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: (props: PropsMapaZonas) => {
    void props;
    return <div data-testid="mapa" />;
  },
}));

const SALTO: CiudadDelCatalogo = { id: "cat-salto", nombre: "Salto", departamento: "Salto" };
const SJ_FLORES: CiudadDelCatalogo = { id: "cat-sj-2", nombre: "San José", departamento: "Flores" };
const SJ_SJ: CiudadDelCatalogo = { id: "cat-sj-1", nombre: "San José", departamento: "San José" };
const VIEJA: CiudadDelCatalogo = { id: "cat-vieja", nombre: "Pueblo Viejo", departamento: null };

function montarSuelto(props: Partial<Parameters<typeof BuscadorCiudad>[0]> = {}, catalogo: CiudadDelCatalogo[] = [SALTO, SJ_FLORES, SJ_SJ, VIEJA]) {
  const buscar = vi.fn<(texto: string) => Promise<CiudadDelCatalogo[]>>(async () => catalogo);
  const onElegir = vi.fn();
  const onCerrar = vi.fn();
  const r = render(<BuscadorCiudad buscar={buscar} excluidas={new Set()} ocupado={false} error={null} onElegir={onElegir} onCerrar={onCerrar} {...props} />);
  return { ...r, buscar, onElegir, onCerrar };
}

function acciones(sobre: Partial<AccionesZonas> = {}): AccionesZonas {
  return {
    esquinaMasCercana: vi.fn((c: string, p) => fuenteZonasSimulada.esquinaMasCercana(c, p)),
    tramoPorCalles: vi.fn((c: string, a, b) => fuenteZonasSimulada.tramoPorCalles(c, a, b)),
    vistaPreviaZona: vi.fn((e) => fuenteZonasSimulada.vistaPreviaZona(e)),
    guardarZona: vi.fn((e) => fuenteZonasSimulada.guardarZona(e)),
    asignarZona: vi.fn(async () => ({ ok: true as const })),
    quitarZona: vi.fn(async () => ({ ok: true as const })),
    eliminarZona: vi.fn((id: string) => fuenteZonasSimulada.eliminarZona("campania-verano-2026", id)),
    buscarCiudades: vi.fn((t: string) => fuenteZonasSimulada.buscarCiudades("campania-verano-2026", t)),
    agregarCiudad: vi.fn((id: string) => fuenteZonasSimulada.agregarCiudad("campania-verano-2026", id)),
    ...sobre,
  };
}

async function abrirBuscador(sobre: Partial<AccionesZonas> = {}) {
  const acc = acciones(sobre);
  render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acc} />);
  await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));
  const buscador = screen.getByRole("region", { name: "Agregar ciudad" });
  await within(buscador).findByRole("list", { name: "Ciudades del catálogo" });
  return { acc, buscador };
}

async function axeSinViolaciones(contenedor: HTMLElement) {
  const r = await axe.run(contenedor, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

afterEach(() => vi.useRealTimers());

describe("BuscadorCiudad · QA · casos límite del catálogo", () => {
  it("la búsqueda por departamento en la fuente simulada: «soriano» devuelve Mercedes, «paysandu» sin tilde devuelve Paysandú", async () => {
    const porDepto = await fuenteZonasSimulada.buscarCiudades("campania-verano-2026", "soriano");
    expect(porDepto.map((c) => c.nombre)).toEqual(["Mercedes"]);
    expect(porDepto[0].departamento).toBe("Soriano");

    const sinTilde = await fuenteZonasSimulada.buscarCiudades("campania-verano-2026", "PAYSANDU");
    expect(sinTilde.map((c) => c.nombre)).toEqual(["Paysandú"]);
  });

  it("una respuesta vieja que llega tarde no pisa a la de lo último que se escribió", async () => {
    const pendientes = new Map<string, (c: CiudadDelCatalogo[]) => void>();
    const buscar = vi.fn((t: string) => (t === "" ? Promise.resolve([SALTO]) : new Promise<CiudadDelCatalogo[]>((r) => pendientes.set(t, r))));
    render(<BuscadorCiudad buscar={buscar} excluidas={new Set()} ocupado={false} error={null} onElegir={vi.fn()} onCerrar={vi.fn()} />);
    await screen.findByRole("button", { name: "Agregar Salto, Salto" });

    const caja = screen.getByRole("searchbox");
    await userEvent.type(caja, "sa");
    await waitFor(() => expect(pendientes.has("sa")).toBe(true));
    await userEvent.type(caja, "n");
    await waitFor(() => expect(pendientes.has("san")).toBe(true));

    await act(async () => pendientes.get("san")?.([SJ_FLORES]));
    await act(async () => pendientes.get("sa")?.([SALTO]));

    expect(await screen.findByRole("button", { name: "Agregar San José, Flores" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar Salto, Salto" })).not.toBeInTheDocument();
  });

  it("texto con HTML, emoji y comodines se muestra como texto y no se interpreta", async () => {
    const buscar = vi.fn(async (t: string) => (t === "" ? [SALTO] : []));
    render(<BuscadorCiudad buscar={buscar} excluidas={new Set()} ocupado={false} error={null} onElegir={vi.fn()} onCerrar={vi.fn()} />);
    await screen.findByRole("button", { name: "Agregar Salto, Salto" });

    const raro = "🙂 %_ <img src=x onerror=alert(1)>";
    await userEvent.type(screen.getByRole("searchbox"), raro, { delay: null });

    expect(await screen.findByText(`No hay ciudades que coincidan con «${raro}».`)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("solo espacios cuenta como búsqueda vacía: ofrece todas y no dice «No hay ciudades que coincidan con «»»", async () => {
    const buscar = vi.fn(async () => [] as CiudadDelCatalogo[]);
    render(<BuscadorCiudad buscar={buscar} excluidas={new Set()} ocupado={false} error={null} onElegir={vi.fn()} onCerrar={vi.fn()} />);
    await screen.findByText("Ya están todas las ciudades del catálogo en la campaña.");

    await userEvent.type(screen.getByRole("searchbox"), "   ");

    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith("   "));
    expect(await screen.findByText("Ya están todas las ciudades del catálogo en la campaña.")).toBeInTheDocument();
  });

  it("una ciudad cuyo catálogo entero ya está en la campaña dice por qué la lista está vacía (no queda un spinner)", async () => {
    montarSuelto({ excluidas: new Set([SALTO.id]) }, [SALTO]);
    expect(await screen.findByText("Ya están todas las ciudades del catálogo en la campaña.")).toBeInTheDocument();
    expect(screen.queryByText("Buscando ciudades…")).not.toBeInTheDocument();
  });

  it("un fallo al buscar con lo tipeado conserva el texto y «Reintentar» pide el mismo texto", async () => {
    const buscar = vi
      .fn<(t: string) => Promise<CiudadDelCatalogo[]>>()
      .mockResolvedValueOnce([SALTO])
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue([SJ_FLORES]);
    render(<BuscadorCiudad buscar={buscar} excluidas={new Set()} ocupado={false} error={null} onElegir={vi.fn()} onCerrar={vi.fn()} />);
    await screen.findByRole("button", { name: "Agregar Salto, Salto" });

    await userEvent.type(screen.getByRole("searchbox"), "flo");
    expect(await screen.findByText(MENSAJE_BUSQUEDA_SIN_CONEXION)).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("flo");

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: "Agregar San José, Flores" })).toBeInTheDocument();
    expect(buscar).toHaveBeenLastCalledWith("flo");
  });

  it("axe sin violaciones en cada estado: lista, vacío, sin coincidencias, sin conexión, ocupado y con error", async () => {
    const lista = montarSuelto();
    await screen.findByRole("list", { name: "Ciudades del catálogo" });
    expect(await axeSinViolaciones(lista.container)).toEqual([]);
    lista.unmount();

    const vacio = montarSuelto({}, []);
    await screen.findByText("Ya están todas las ciudades del catálogo en la campaña.");
    expect(await axeSinViolaciones(vacio.container)).toEqual([]);
    await userEvent.type(screen.getByRole("searchbox"), "zzz");
    await screen.findByText("No hay ciudades que coincidan con «zzz».");
    expect(await axeSinViolaciones(vacio.container)).toEqual([]);
    vacio.unmount();

    const caida = montarSuelto({ buscar: vi.fn(async () => Promise.reject(new TypeError("fetch failed"))) });
    await screen.findByText(MENSAJE_BUSQUEDA_SIN_CONEXION);
    expect(await axeSinViolaciones(caida.container)).toEqual([]);
    caida.unmount();

    const ocupado = montarSuelto({ ocupado: true, error: "La ciudad ya no está en el catálogo." });
    await screen.findByRole("list", { name: "Ciudades del catálogo" });
    expect(await axeSinViolaciones(ocupado.container)).toEqual([]);
  });

  it("con el teclado: Tab pasa del buscador a la primera ciudad y Enter la elige", async () => {
    const { onElegir } = montarSuelto();
    await screen.findByRole("list", { name: "Ciudades del catálogo" });
    expect(screen.getByRole("searchbox")).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Agregar Salto, Salto" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    expect(onElegir).toHaveBeenCalledWith(SALTO);
  });
});

describe("«+ Agregar ciudad» · QA · acciones superpuestas, reentrada y fallas", () => {
  it("dos toques seguidos a la misma ciudad la agregan una sola vez", async () => {
    let terminar: (r: Awaited<ReturnType<AccionesZonas["agregarCiudad"]>>) => void = () => undefined;
    const agregarCiudad = vi.fn(() => new Promise<Awaited<ReturnType<AccionesZonas["agregarCiudad"]>>>((r) => (terminar = r)));
    const { buscador } = await abrirBuscador({ agregarCiudad });

    const boton = within(buscador).getByRole("button", { name: "Agregar Salto, Salto" });
    await userEvent.dblClick(boton);

    expect(agregarCiudad).toHaveBeenCalledTimes(1);
    expect(within(buscador).getByText("Agregando la ciudad…")).toBeInTheDocument();
    await act(async () => terminar({ ok: false, mensaje: "La ciudad ya no está en el catálogo." }));
  });

  it("si agregar falla, todo vuelve a habilitarse, queda el aviso y lo tipeado no se pierde", async () => {
    const agregarCiudad = vi.fn(async () => ({ ok: false as const, mensaje: "La ciudad ya no está en el catálogo." }));
    const { buscador } = await abrirBuscador({ agregarCiudad });
    await userEvent.type(within(buscador).getByRole("searchbox"), "salto");
    await within(buscador).findByRole("button", { name: "Agregar Salto, Salto" });

    await userEvent.click(within(buscador).getByRole("button", { name: "Agregar Salto, Salto" }));

    expect(await within(buscador).findByRole("alert")).toHaveTextContent("La ciudad ya no está en el catálogo.");
    expect(within(buscador).getByRole("searchbox")).toBeEnabled();
    expect(within(buscador).getByRole("searchbox")).toHaveValue("salto");
    expect(within(buscador).getByRole("button", { name: "Agregar Salto, Salto" })).toBeEnabled();
    expect(within(buscador).getByRole("button", { name: "Cerrar el buscador de ciudades" })).toBeEnabled();
  });

  it("si agregar se cae por la red, avisa con «Necesitás conexión para agregar la ciudad.» y no queda trabado", async () => {
    const agregarCiudad = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const { buscador } = await abrirBuscador({ agregarCiudad });

    await userEvent.click(within(buscador).getByRole("button", { name: "Agregar Salto, Salto" }));

    expect(await within(buscador).findByRole("alert")).toHaveTextContent(/Necesitás conexión para agregar la ciudad/);
    expect(within(buscador).getByRole("button", { name: "Agregar Salto, Salto" })).toBeEnabled();
  });

  it("cerrar y volver a abrir: el buscador arranca limpio y vuelve a pedir el catálogo", async () => {
    const { acc, buscador } = await abrirBuscador();
    await userEvent.type(within(buscador).getByRole("searchbox"), "zzz");
    await within(buscador).findByText("No hay ciudades que coincidan con «zzz».");

    await userEvent.click(within(buscador).getByRole("button", { name: "Cerrar el buscador de ciudades" }));
    expect(screen.queryByRole("region", { name: "Agregar ciudad" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));

    const nuevo = screen.getByRole("region", { name: "Agregar ciudad" });
    expect(within(nuevo).getByRole("searchbox")).toHaveValue("");
    expect(await within(nuevo).findByRole("list", { name: "Ciudades del catálogo" })).toBeInTheDocument();
    expect(acc.buscarCiudades).toHaveBeenLastCalledWith("");
  });

  it("al agregar bien, la ciudad queda como pestaña seleccionada y el aviso lo dice", async () => {
    const { buscador } = await abrirBuscador();

    await userEvent.click(within(buscador).getByRole("button", { name: "Agregar Salto, Salto" }));

    const pestanas = screen.getByRole("navigation", { name: "Ciudades de la campaña" });
    const salto = await within(pestanas).findByRole("button", { name: /Salto/ });
    expect(salto).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("«Salto» se agregó a la campaña.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Agregar ciudad" })).not.toBeInTheDocument();
  });
});

describe("«+ Agregar ciudad» · QA · hallazgos (skip hasta que se arreglen)", () => {
  it("QA #80: un texto pegado larguísimo sin espacios no se repite entero en el aviso de «sin coincidencias» (se sale de la tarjeta)", async () => {
    const buscar = vi.fn(async (t: string) => (t === "" ? [SALTO] : []));
    render(<BuscadorCiudad buscar={buscar} excluidas={new Set()} ocupado={false} error={null} onElegir={vi.fn()} onCerrar={vi.fn()} />);
    await screen.findByRole("button", { name: "Agregar Salto, Salto" });

    const largo = "x".repeat(300);
    await userEvent.click(screen.getByRole("searchbox"));
    await userEvent.paste(largo);

    await waitFor(() => expect(screen.queryByRole("button", { name: "Agregar Salto, Salto" })).not.toBeInTheDocument());
    const aviso = screen.getByRole("region", { name: "Agregar ciudad" }).querySelector("p[role=status]") as HTMLElement;
    // O el aviso no repite el texto entero, o parte las palabras largas (break-words / overflow-wrap).
    const partePalabras = /break-words|break-all|overflow-wrap|\[word-break/.test(aviso.className);
    expect(partePalabras || (aviso.textContent ?? "").length <= 120).toBe(true);
  });

  it("QA #80: tras «Reintentar» el foco no se pierde en el <body>", async () => {
    const buscar = vi.fn<(t: string) => Promise<CiudadDelCatalogo[]>>().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValue([SALTO]);
    const { container } = montarSuelto({ buscar });
    await screen.findByText(MENSAJE_BUSQUEDA_SIN_CONEXION);

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByRole("button", { name: "Agregar Salto, Salto" });

    expect(document.activeElement).not.toBe(document.body);
    expect(container.contains(document.activeElement)).toBe(true);
  });

  it("QA #80: tras agregar la ciudad el foco pasa a algo de la pantalla (la pestaña nueva), no al <body>", async () => {
    const { buscador } = await abrirBuscador();

    await userEvent.click(within(buscador).getByRole("button", { name: "Agregar Salto, Salto" }));
    await screen.findByText("«Salto» se agregó a la campaña.");

    expect(document.activeElement).not.toBe(document.body);
  });
});
