import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CasaDeCiudad, EstadoDeCasa } from "@/datos/equipo/zonas";
import {
  DATOS_ZONAS_SIMULADO,
  fuenteZonasSimulada,
} from "@/datos/equipo/zonas/simulado";
import { MapaZonasGl } from "@/features/equipo/zonas/MapaZonasGl";
import type {
  CasasEnMapa,
  PropsMapaZonas,
} from "@/features/equipo/zonas/tipos";
import { fechaEnMontevideo } from "@/lib/momento";

/**
 * QA del PR #143 (issue #138): «Último cambio: dd/mm» en la tarjeta del punto elegido (artboard 24P·03). MapLibre necesita
 * WebGL: el doble solo deja ver lo que la capa de casas pone dentro del marcador.
 */

vi.mock("maplibre-gl", () => ({ setWorkerUrl: vi.fn(), addProtocol: vi.fn(), removeProtocol: vi.fn() }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("react-map-gl/maplibre", () => ({
  default: (props: { children: ReactNode }) => (
    <div data-testid="mapa-gl">{props.children}</div>
  ),
  NavigationControl: () => null,
  Source: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Layer: () => null,
  Marker: (props: { children: ReactNode }) => (
    <div data-testid="marcador">{props.children}</div>
  ),
}));

const CIUDAD = DATOS_ZONAS_SIMULADO.ciudades[0];
const ZONAS = CIUDAD.zonas;

const casa = (
  n: number,
  estado: EstadoDeCasa = "SIN_VISITA",
  sobre: Partial<CasaDeCiudad> = {},
): CasaDeCiudad => ({
  id: `c${n}`,
  lon: -56.26 + n * 0.0001,
  lat: -34.87,
  tipo: "CASA",
  estado,
  zonaIds: [ZONAS[0].id],
  ...sobre,
});

function propsDe(
  casas: CasaDeCiudad[],
  elegidaId: string | null,
): PropsMapaZonas {
  const enMapa: CasasEnMapa = {
    casas,
    elegidaId,
    onElegir: vi.fn(),
    onAgrupadas: vi.fn(),
  };
  return {
    ciudad: CIUDAD,
    zonas: ZONAS,
    zonaElegidaId: null,
    dibujo: null,
    casas: enMapa,
    onZonaClick: vi.fn(),
    onMapaClick: vi.fn(),
    onMapaMove: vi.fn(),
    onRadio: vi.fn(),
  };
}

const tarjeta = () => screen.getByRole("group", { name: "Casa elegida" });

afterEach(cleanup);

/** Luminancia relativa y razón de contraste WCAG entre dos colores `#rrggbb`. */
function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}
const razon = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("24P·03 · la línea «Último cambio» de la tarjeta (QA #143)", () => {
  it("el texto de la tarjeta es el del canvas: «Último cambio: dd/mm», una sola vez, como texto (no un botón ni un enlace)", () => {
    render(
      <MapaZonasGl
        {...propsDe(
          [
            casa(1, "VENTA_COMPLETA", {
              ultimoCambio: "2026-10-18T21:30:00Z",
              zonaIds: [ZONAS[0].id, ZONAS[1].id],
            }),
          ],
          "c1",
        )}
      />,
    );

    const linea = screen.getAllByText(/Último cambio/);
    expect(linea).toHaveLength(1);
    expect(linea[0].tagName).toBe("SPAN");
    expect(linea[0].closest("button, a")).toBeNull();
    expect(linea[0].textContent).toMatch(
      /^Último cambio: \d{2}\/\d{2}(\/\d{4})?$/,
    );
  });

  it("la línea va con la tipografía del canvas (12 px, tinta suave) y su color pasa AA sobre la superficie de la tarjeta", () => {
    render(
      <MapaZonasGl
        {...propsDe(
          [casa(1, "RECHAZO", { ultimoCambio: new Date().toISOString() })],
          "c1",
        )}
      />,
    );
    expect(screen.getByText(/Último cambio/).className).toMatch(/text-chico/);
    expect(screen.getByText(/Último cambio/).className).toMatch(
      /text-tinta-suave/,
    );

    const css = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const token = (nombre: string) =>
      new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1] as string;
    expect(css).toMatch(/--text-chico:\s*12px/);
    expect(
      razon(token("tinta-suave"), token("superficie")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("axe no encuentra violaciones A/AA en la tarjeta con la línea", async () => {
    const { container } = render(
      <MapaZonasGl
        {...propsDe(
          [
            casa(1, "COBRANZA_PENDIENTE", {
              ultimoCambio: new Date().toISOString(),
            }),
          ],
          "c1",
        )}
      />,
    );
    const r = await axe.run(container, {
      rules: {
        "color-contrast": { enabled: false },
        region: { enabled: false },
      },
    });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });

  it("al elegir otra casa la línea sigue a la casa elegida: con fecha, sin fecha y otra vez con fecha", () => {
    const casas = [
      casa(1, "RECHAZO", { ultimoCambio: "2020-03-05T15:00:00Z" }),
      casa(2, "SIN_VISITA", { ultimoCambio: null }),
      casa(3, "VENTA_COMPLETA", { ultimoCambio: "2021-07-09T15:00:00Z" }),
    ];
    const { rerender } = render(<MapaZonasGl {...propsDe(casas, "c1")} />);
    expect(tarjeta()).toHaveTextContent("Último cambio: 05/03/2020");

    rerender(<MapaZonasGl {...propsDe(casas, "c2")} />);
    expect(tarjeta()).not.toHaveTextContent(/Último cambio/);

    rerender(<MapaZonasGl {...propsDe(casas, "c3")} />);
    expect(tarjeta()).toHaveTextContent("Último cambio: 09/07/2021");
  });

  it("una casa sin la propiedad (base que todavía no manda ultimo_cambio) no lleva la línea ni rompe la tarjeta", () => {
    render(<MapaZonasGl {...propsDe([casa(1, "RECHAZO")], "c1")} />);
    expect(tarjeta()).toHaveTextContent(/Rechazó/);
    expect(tarjeta()).not.toHaveTextContent(
      /Último cambio|undefined|null|NaN|Invalid/,
    );
  });

  it.each([
    ["", "vacía"],
    ["   ", "solo espacios"],
    ["0000-00-00", "cero"],
    ["18/10/2026", "dd/mm/aaaa"],
    ["💥", "emoji"],
    ["9".repeat(400), "400 dígitos"],
  ])(
    "un ultimo_cambio ilegible (%j, %s) no inventa la línea ni muestra «Invalid Date»",
    (valor) => {
      render(
        <MapaZonasGl
          {...propsDe([casa(1, "RECHAZO", { ultimoCambio: valor })], "c1")}
        />,
      );
      expect(tarjeta()).not.toHaveTextContent(/Último cambio|Invalid|NaN/);
    },
  );

  it("el formato de timestamptz de Postgres (con espacio, microsegundos y +00) se lee y cae en el día de Montevideo", () => {
    const ahora = new Date("2026-10-27T15:00:00Z");
    expect(fechaEnMontevideo("2026-10-18 21:30:00.123456+00", ahora)).toBe(
      "18/10",
    );
    expect(fechaEnMontevideo("2026-10-18T21:30:00.123456+00:00", ahora)).toBe(
      "18/10",
    );
    // 00:30 del 19 en +03:00 es 18:30 del 18 en Montevideo (-03:00).
    expect(fechaEnMontevideo("2026-10-19T00:30:00+03:00", ahora)).toBe("18/10");
  });

  it("el día lo marca Montevideo y no el navegador: 01:00 UTC del 1/1 todavía es 31/12 del año anterior", () => {
    const ahora = new Date("2026-10-27T15:00:00Z");
    expect(fechaEnMontevideo("2026-01-01T01:00:00Z", ahora)).toBe("31/12/2025");
    expect(fechaEnMontevideo("2026-01-01T03:00:00Z", ahora)).toBe("01/01");
  });

  it("la fuente simulada: las casas con estado traen fecha legible y «Sin visita» no", async () => {
    const fuente = fuenteZonasSimulada;
    const zonas = DATOS_ZONAS_SIMULADO.ciudades[0].zonas.map((z) => z.id);
    const casas = await fuente.casasDeZonas(
      DATOS_ZONAS_SIMULADO.campaniaId,
      zonas,
    );
    const conEstado = casas.filter((c) => c.estado !== "SIN_VISITA");
    expect(conEstado.length).toBeGreaterThan(0);
    for (const c of conEstado)
      expect(fechaEnMontevideo(c.ultimoCambio ?? null)).not.toBeNull();
    for (const c of casas.filter((x) => x.estado === "SIN_VISITA"))
      expect(c.ultimoCambio).toBeNull();
  });

  it.skip("QA #143: la simulada no inventa un «Último cambio» de mañana entre las 21:00 y las 24:00 de Montevideo (haceDias(0) = 15:00Z del día UTC)", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-11-05T01:00:00Z"),
    }); // 22:00 del 4/11 en Montevideo
    try {
      const casas = await fuenteZonasSimulada.casasDeZonas(
        DATOS_ZONAS_SIMULADO.campaniaId,
        DATOS_ZONAS_SIMULADO.ciudades[0].zonas.map((z) => z.id),
      );
      const hoyEnMontevideo = fechaEnMontevideo(new Date().toISOString());
      const fechas = casas
        .filter((c) => c.ultimoCambio)
        .map((c) => fechaEnMontevideo(c.ultimoCambio as string));
      expect(fechas).not.toContain("05/11");
      expect(hoyEnMontevideo).toBe("04/11");
    } finally {
      vi.useRealTimers();
    }
  });
});
