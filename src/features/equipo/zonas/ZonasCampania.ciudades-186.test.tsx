import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DatosZonas } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { ETIQUETA_BUSCAR_CIUDAD } from "@/features/equipo/zonas/BarraDeCiudades";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";

/** Issue #186: con ~150 ciudades en la campaña se encuentra una escribiendo parte del nombre y la vista sigue entera. */

vi.mock("@/features/equipo/zonas/MapaZonas", () => ({ MapaZonas: () => <div data-testid="mapa" /> }));

const CAMPANIA = "campania-verano-2026";

function datosConMuchasCiudades(): DatosZonas {
  const [primera, ...otras] = DATOS_ZONAS_SIMULADO.ciudades;
  const relleno = Array.from({ length: 150 - DATOS_ZONAS_SIMULADO.ciudades.length }, (_, i) => ({
    ...primera!,
    id: `relleno-${i}`,
    catalogoId: `cat-relleno-${i}`,
    nombre: `Localidad ${String(i).padStart(3, "0")}`,
    zonas: [],
    colportores: [],
  }));
  return { ...DATOS_ZONAS_SIMULADO, ciudades: [primera!, ...otras, ...relleno] };
}

function acciones(): AccionesZonas {
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
  } as unknown as AccionesZonas;
}

describe("ZonasCampania · barra de ciudades con 150 ciudades (#186)", () => {
  it("buscar «localidad 120» y tocarla cambia de ciudad: queda elegida y el mapa y la lista siguen en su lugar", async () => {
    render(<ZonasCampania datos={datosConMuchasCiudades()} acciones={acciones()} />);
    const barra = screen.getByRole("navigation", { name: "Ciudades de la campaña" });
    expect(within(barra).getByText("150 ciudades")).toBeInTheDocument();

    await userEvent.type(within(barra).getByRole("searchbox", { name: ETIQUETA_BUSCAR_CIUDAD }), "LOCALIDAD 120");
    await userEvent.click(within(barra).getByRole("button", { name: /Localidad 120/ }));

    expect(within(barra).getByRole("button", { name: /Localidad 120/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("mapa")).toBeInTheDocument();
  });

  it("con las 3 ciudades de siempre no hay campo de búsqueda", () => {
    render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acciones()} />);

    expect(screen.queryByRole("searchbox", { name: ETIQUETA_BUSCAR_CIUDAD })).not.toBeInTheDocument();
  });

  it("la barra va A-Z aunque la fuente mande otro orden, y la ciudad que se abre primero sigue siendo la misma (P4 de #186)", () => {
    render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acciones()} />);
    const barra = screen.getByRole("navigation", { name: "Ciudades de la campaña" });

    const nombres = within(barra).getAllByRole("button").map((b) => b.querySelector("span")?.textContent);
    expect(nombres).toEqual(["Canelones", "Las Piedras", "Montevideo"]);
    expect(within(barra).getByRole("button", { current: true })).toHaveTextContent(DATOS_ZONAS_SIMULADO.ciudades[0]!.nombre);
  });

  it("con pocas ciudades «+ Agregar ciudad» va pegado a la última y centrado, como en el canvas 24 (revisión de #189)", () => {
    render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acciones()} />);
    const barra = screen.getByRole("navigation", { name: "Ciudades de la campaña" });
    const fila = screen.getByTestId("fila-de-ciudades");

    // El nav no se estira: el botón sigue a la última ciudad, no al borde derecho.
    expect(barra).not.toHaveClass("flex-1");
    expect(barra.nextElementSibling).toBe(screen.getByRole("button", { name: "+ Agregar ciudad" }));
    expect(fila).toHaveClass("items-center");
    expect(fila).not.toHaveClass("items-start");
  });

  it("con el buscador el nav ocupa la fila y el botón se alinea arriba, con el campo", () => {
    render(<ZonasCampania datos={datosConMuchasCiudades()} acciones={acciones()} />);

    expect(screen.getByRole("navigation", { name: "Ciudades de la campaña" })).toHaveClass("flex-1");
    expect(screen.getByTestId("fila-de-ciudades")).toHaveClass("items-start");
  });
});
