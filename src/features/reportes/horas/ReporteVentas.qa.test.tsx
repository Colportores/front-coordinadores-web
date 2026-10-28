import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ColportorHoras, DatosHoras } from "@/datos/reportes/contrato";

import { colportor, datosDePruebaConVentas, horasConstantes, ventasConstantes } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";

/**
 * QA de la vista 32 (HU-REP-002, #61): casos límite que no están en `ReporteVentas.test.tsx`. Los que llevan `skip`
 * documentan un hallazgo del QA; el implementador saca el `skip` cuando lo arregla.
 */

const tabla = () => screen.getByRole("table");
const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const tarjeta = (nombre: string) => screen.getByRole("region", { name: nombre });
const filaDe = (nombre: RegExp | string) => within(tabla()).getByRole("rowheader", { name: nombre }).closest("tr")!;
const celdasDe = (fila: HTMLElement) => within(fila).getAllByRole("cell").map((c) => c.textContent ?? "");

const DIA = { presentaciones: 5, ventas: 2, monto: 1500, cobrado: null };

function campania(colportores: ColportorHoras[], extra: Partial<DatosHoras> = {}, ciudadExtra: Partial<DatosHoras["ciudades"][number]> = {}): DatosHoras {
  return {
    inicioCampania: "2026-10-05",
    finCampania: null,
    hoy: "2026-10-21",
    ciudades: [{ id: "riv", nombre: "Rivera", departamento: "Rivera", colportores, ...ciudadExtra }],
    ...extra,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("QA #61 · accesibilidad de la tabla", () => {
  it("QA #61: el área de la tabla que se desplaza tiene tabindex, rol y nombre (axe scrollable-region-focusable, A/AA)", () => {
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    const area = tabla().parentElement as HTMLElement;
    // axe en el navegador marca esta región con la tabla larga (25 colportores): el lector de teclado la alcanza solo en Chromium
    expect(area).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("region", { name: /Horas, presentaciones, ventas y monto por colportor/ })).toBe(area);
  });
});

describe("QA #61 · datos límite", () => {
  it("el primer día de la campaña: todavía no hay un período completo, y las tres tarjetas lo dicen sin romper", async () => {
    const user = userEvent.setup();
    const horas = horasConstantes("2026-10-05", "2026-10-05", 3);
    const ventas = ventasConstantes("2026-10-05", "2026-10-05", DIA);
    render(<ReporteHoras datos={campania([colportor("a", "Ana", horas, null, ventas)], { hoy: "2026-10-05" })} />);

    for (const nombre of ["HORAS", "PRESENTACIONES", "VENTAS"]) {
      const t = tarjeta(nombre);
      expect(within(t).getByText("Todavía no hay un período completo")).toBeInTheDocument();
      expect(within(t).getByText("—")).toBeInTheDocument();
    }
    for (const periodo of ["Días", "Meses", "Semanas"]) {
      await user.click(screen.getByRole("button", { name: periodo }));
      expect(tabla()).toBeInTheDocument();
      expect(screen.queryByText(/NaN|undefined|Infinity/)).not.toBeInTheDocument();
    }
  });

  it("un colportor con horas pero sin ningún registro de ventas junto a otro con ventas: la ciudad suma lo que hay y su fila lleva guiones", () => {
    const horas = horasConstantes("2026-10-05", "2026-10-21", 6);
    const conVentas = ventasConstantes("2026-10-05", "2026-10-21", DIA);
    render(<ReporteHoras datos={campania([colportor("a", "Ana", horas, null, conVentas), colportor("b", "Beto", horas, null, {})])} />);

    expect(within(tarjeta("VENTAS")).getByText("Campaña: 30 · $U 22.500")).toBeInTheDocument(); // solo Ana: 15 días hábiles × 2
    expect(celdasDe(filaDe(/Beto/)).slice(1)).toEqual(["— sin datos", "— sin datos", "— sin datos"]);
    expect(celdasDe(filaDe(/Ana/))[2]).toMatch(/^12/);
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("una ciudad sin colportores se puede elegir: dice que no hay a quién mostrar y las cifras quedan en guion", async () => {
    const user = userEvent.setup();
    const horas = horasConstantes("2026-10-05", "2026-10-21", 6);
    const datos = campania([colportor("a", "Ana", horas, null, ventasConstantes("2026-10-05", "2026-10-21", DIA))]);
    datos.ciudades.push({ id: "art", nombre: "Artigas", departamento: "Artigas", colportores: [] });
    render(<ReporteHoras datos={datos} />);

    await user.click(within(lista()).getByRole("button", { name: /^Artigas/ }));
    expect(screen.getByRole("heading", { name: "Artigas", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay colportores para mostrar acá.")).toBeInTheDocument();
    expect(within(tarjeta("VENTAS")).getAllByText("—").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("una campaña sin ciudades se dibuja con los avisos, sin tirar la página", () => {
    render(<ReporteHoras datos={{ inicioCampania: "2026-10-05", finCampania: null, hoy: "2026-10-21", ciudades: [] }} />);
    expect(screen.getByRole("heading", { name: "Todas las ciudades", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay colportores para mostrar acá.")).toBeInTheDocument();
  });

  it("dos colportores con el mismo nombre en ciudades distintas: elegir uno abre el suyo, no el otro", async () => {
    const user = userEvent.setup();
    const horas = horasConstantes("2026-10-05", "2026-10-21", 6);
    const chica = ventasConstantes("2026-10-05", "2026-10-21", { presentaciones: 1, ventas: 1, monto: 100, cobrado: null });
    const grande = ventasConstantes("2026-10-05", "2026-10-21", { presentaciones: 9, ventas: 4, monto: 9000, cobrado: null });
    const datos = campania([colportor("riv-1", "Juan Pérez", horas, null, chica)]);
    datos.ciudades.push({
      id: "art",
      nombre: "Artigas",
      departamento: "Artigas",
      colportores: [colportor("art-1", "Juan Pérez", horas, null, grande)],
    });
    render(<ReporteHoras datos={datos} />);

    await user.click(within(lista()).getByRole("button", { name: /^Artigas/ }));
    await user.click(within(lista()).getByRole("button", { name: /Juan Pérez/ }));
    expect(screen.getByText(/^Artigas · Departamento Artigas/)).toBeInTheDocument();
    expect(within(tarjeta("VENTAS")).getByText("Campaña: 60 · $U 135.000")).toBeInTheDocument(); // 15 días × 4 ventas
  });

  it("nombre con emoji y con 200 letras sin espacios: el título y la lista lo muestran entero y no se pierde la ciudad", async () => {
    const user = userEvent.setup();
    const nombre = `Ana 😀🙏 ${"Ñ".repeat(200)}`;
    const horas = horasConstantes("2026-10-05", "2026-10-21", 6);
    render(<ReporteHoras datos={campania([colportor("a", nombre, horas, null, ventasConstantes("2026-10-05", "2026-10-21", DIA))])} />);

    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByTitle(nombre));
    const titulo = screen.getByRole("heading", { name: nombre, level: 2 });
    expect(titulo).toHaveClass("wrap-anywhere"); // sin esto la ficha se sale del panel
    expect(screen.getByRole("button", { name: /‹ Rivera/ })).toBeInTheDocument();
  });

  it("recorrer todas las vistas no escribe nada en la consola (ni avisos de React ni datos de nadie)", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} mostrarPorCobrar />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    for (const p of ["Días", "Meses", "Semanas"]) await user.click(screen.getByRole("button", { name: p }));
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));
    await user.click(screen.getByRole("button", { name: /‹ Rivera/ }));
    await user.click(screen.getByRole("button", { name: "Contraer ciudades" }));
    await user.click(screen.getByRole("button", { name: "Expandir ciudades" }));
    expect(espias.flatMap((e) => e.mock.calls)).toEqual([]);
  });
});

describe("QA #61 · campaña terminada", () => {
  it.skip("QA #61: con la campaña ya terminada, su última semana sigue rayada «en curso» y fuera de la comparación hasta que cierra la semana del calendario", () => {
    // La campaña terminó el martes 20/10; hoy es miércoles 21/10. Nada se está registrando, pero S3 sigue «en curso».
    const horas = horasConstantes("2026-10-05", "2026-10-20", 6);
    const ventas = ventasConstantes("2026-10-05", "2026-10-20", DIA);
    render(<ReporteHoras datos={campania([colportor("a", "Ana", horas, null, ventas)], { finCampania: "2026-10-20" })} />);
    expect(within(tarjeta("VENTAS")).getByText("S3 · contra S2")).toBeInTheDocument();
  });
});
