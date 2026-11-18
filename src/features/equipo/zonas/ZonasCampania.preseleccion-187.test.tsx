import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CiudadDeCampania, DatosZonas } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import {
  hrefAsignarZona,
  preseleccionDeColportor,
  TEXTO_COLPORTOR_NO_ENCONTRADO,
  textoCuentaSuspendida,
  textoYaTieneZona,
} from "@/features/equipo/zonas/preseleccion";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import { ZonasCampaniaDesdeUrl } from "@/features/equipo/zonas/ZonasCampaniaDesdeUrl";

/** Issue #187: Ciudades abre con el colportor que mandó Inicio ya elegido, o dice por qué no pudo. */

vi.mock("@/features/equipo/zonas/MapaZonas", () => ({ MapaZonas: () => <div data-testid="mapa" /> }));
const parametros = vi.hoisted(() => ({ actual: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(parametros.actual) }));

const CAMPANIA = "campania-verano-2026";
const MONTEVIDEO = DATOS_ZONAS_SIMULADO.ciudades[0]!;
const SIN_ZONA = MONTEVIDEO.colportores.find((c) => c.zonaId === null && !c.suspendido)!;
const SUSPENDIDO = MONTEVIDEO.colportores.find((c) => c.suspendido)!;
const CON_ZONA = MONTEVIDEO.colportores.find((c) => c.zonaId !== null)!;

function acciones(sobre: Partial<AccionesZonas> = {}): AccionesZonas {
  return {
    esquinaMasCercana: vi.fn(async () => null),
    tramoPorCalles: vi.fn(async () => null),
    vistaPreviaZona: vi.fn((e) => fuenteZonasSimulada.vistaPreviaZona(e)),
    guardarZona: vi.fn((e) => fuenteZonasSimulada.guardarZona(e)),
    asignarZona: vi.fn(async () => ({ ok: true as const })),
    quitarZona: vi.fn(async () => ({ ok: true as const })),
    eliminarZona: vi.fn((id: string) => fuenteZonasSimulada.eliminarZona(CAMPANIA, id)),
    buscarCiudades: vi.fn((t: string) => fuenteZonasSimulada.buscarCiudades(CAMPANIA, t)),
    agregarCiudad: vi.fn((id: string) => fuenteZonasSimulada.agregarCiudad(CAMPANIA, id)),
    casasDeZonas: vi.fn(async () => []),
    ...sobre,
  } as unknown as AccionesZonas;
}

function montar(colportorId: string | null, datos: DatosZonas = DATOS_ZONAS_SIMULADO, sobre: Partial<AccionesZonas> = {}) {
  const acc = acciones(sobre);
  render(<ZonasCampania datos={datos} acciones={acc} colportorPreseleccionadoId={colportorId} />);
  return acc;
}

afterEach(() => {
  parametros.actual = "";
  window.history.replaceState(null, "", "/");
});

describe("preseleccionDeColportor (puro)", () => {
  const otraCiudad: CiudadDeCampania = { ...MONTEVIDEO, id: "otra", colportores: [{ id: "u-9", nombre: "Ana", zonaId: null, zonaNombre: null }], zonas: [] };

  it("sin parámetro no cambia nada", () => {
    expect(preseleccionDeColportor(DATOS_ZONAS_SIMULADO.ciudades, null)).toEqual({ ciudadId: null, asignandoA: null, aviso: null });
    expect(preseleccionDeColportor(DATOS_ZONAS_SIMULADO.ciudades, "")).toEqual({ ciudadId: null, asignandoA: null, aviso: null });
  });

  it("sin zona: abre en su ciudad (aunque no sea la primera) y lo deja elegido", () => {
    expect(preseleccionDeColportor([MONTEVIDEO, otraCiudad], "u-9")).toEqual({ ciudadId: "otra", asignandoA: "u-9", aviso: null });
  });

  it("no existe, ya tiene zona o está suspendido: no deja elegido a nadie y avisa", () => {
    expect(preseleccionDeColportor([MONTEVIDEO], "nadie")).toEqual({ ciudadId: null, asignandoA: null, aviso: TEXTO_COLPORTOR_NO_ENCONTRADO });
    expect(preseleccionDeColportor([MONTEVIDEO], CON_ZONA.id)).toMatchObject({
      ciudadId: MONTEVIDEO.id,
      asignandoA: null,
      aviso: textoYaTieneZona(CON_ZONA.nombre, CON_ZONA.zonaNombre),
    });
    expect(preseleccionDeColportor([MONTEVIDEO], SUSPENDIDO.id)).toMatchObject({ asignandoA: null, aviso: textoCuentaSuspendida(SUSPENDIDO.nombre) });
  });

  it("el enlace escapa el id", () => {
    expect(hrefAsignarZona("a b&c")).toBe("/ciudades?colportor=a%20b%26c");
  });
});

describe("ZonasCampania · llega desde «Asignar zona» de Inicio (#187)", () => {
  it("el colportor sin zona queda elegido: la vista dice a quién se asigna y qué falta, sin avisos de error", () => {
    montar(SIN_ZONA.id);

    expect(screen.getByText(`Elegí la zona para ${SIN_ZONA.nombre}, en la lista o en el mapa.`)).toBeInTheDocument();
    expect(screen.queryByText("Entendido")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("elegir una zona abre su detalle con ese colportor ya elegido, y asignar le llama a la fuente con él", async () => {
    const acc = montar(SIN_ZONA.id);

    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Cerro Norte" }));
    const detalle = within(screen.getByRole("region", { name: "Zona Cerro Norte" }));
    expect(detalle.getByRole("button", { name: new RegExp(SIN_ZONA.nombre) })).toBeInTheDocument();
    await userEvent.click(detalle.getByRole("button", { name: "Asignar a Cerro Norte" }));

    expect(acc.asignarZona).toHaveBeenCalledTimes(1);
    expect(acc.asignarZona).toHaveBeenCalledWith(SIN_ZONA.id, "zona-cerro-norte");
  });

  it("Cancelar suelta la preselección y no vuelve sola", async () => {
    montar(SIN_ZONA.id);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByText(/Elegí la zona para/)).not.toBeInTheDocument();
  });

  it("un colportor que no existe: aviso que dice qué hacer, sin nadie elegido; «Entendido» lo cierra", async () => {
    montar("ya-no-esta");

    expect(screen.getByText(TEXTO_COLPORTOR_NO_ENCONTRADO)).toBeInTheDocument();
    expect(screen.queryByText(/Elegí la zona para/)).not.toBeInTheDocument();
    // La vista sigue entera: la primera ciudad, con su lista de zonas.
    expect(screen.getByTestId("mapa")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByText(TEXTO_COLPORTOR_NO_ENCONTRADO)).not.toBeInTheDocument();
  });

  it("quien ya tiene zona: avisa cuál es y no lo deja para asignar", () => {
    montar(CON_ZONA.id);

    expect(screen.getByText(textoYaTieneZona(CON_ZONA.nombre, CON_ZONA.zonaNombre))).toBeInTheDocument();
    expect(screen.queryByText(/Elegí la zona para/)).not.toBeInTheDocument();
  });

  it("cuenta suspendida: avisa que hay que pedir su reactivación y no lo deja para asignar", () => {
    montar(SUSPENDIDO.id);

    expect(screen.getByText(textoCuentaSuspendida(SUSPENDIDO.nombre))).toBeInTheDocument();
    expect(screen.queryByText(/Elegí la zona para/)).not.toBeInTheDocument();
  });

  it("sin colportor en la dirección todo es como siempre", () => {
    montar(null);

    expect(screen.queryByText(/Elegí la zona para/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entendido" })).not.toBeInTheDocument();
  });

  it("volver a entrar (otro montaje con el mismo parámetro) repite la preselección; cambiar de ciudad después no la pisa", async () => {
    const { unmount } = render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acciones()} colportorPreseleccionadoId={SIN_ZONA.id} />);
    await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));
    // Elegir otra ciudad suelta la asignación en curso (comportamiento de siempre).
    expect(screen.queryByText(/Elegí la zona para/)).not.toBeInTheDocument();
    unmount();

    render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acciones()} colportorPreseleccionadoId={SIN_ZONA.id} />);
    expect(screen.getByText(`Elegí la zona para ${SIN_ZONA.nombre}, en la lista o en el mapa.`)).toBeInTheDocument();
  });
});

describe("ZonasCampaniaDesdeUrl", () => {
  it("toma el colportor de ?colportor= y lo quita de la dirección para que recargar no repita el aviso", () => {
    parametros.actual = `colportor=${SIN_ZONA.id}`;
    window.history.replaceState(null, "", `/ciudades?colportor=${SIN_ZONA.id}&otro=1#x`);

    render(<ZonasCampaniaDesdeUrl datos={DATOS_ZONAS_SIMULADO} acciones={acciones()} />);

    expect(screen.getByText(`Elegí la zona para ${SIN_ZONA.nombre}, en la lista o en el mapa.`)).toBeInTheDocument();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/ciudades?otro=1#x");
  });

  it("sin parámetro no toca la dirección ni elige a nadie", () => {
    window.history.replaceState(null, "", "/ciudades");

    render(<ZonasCampaniaDesdeUrl datos={DATOS_ZONAS_SIMULADO} acciones={acciones()} />);

    expect(screen.queryByText(/Elegí la zona para/)).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/ciudades");
  });
});
