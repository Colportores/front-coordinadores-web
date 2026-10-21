import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import type { ColportorHoras, DatosHoras } from "@/datos/reportes/contrato";
import { crearHorasSimuladas } from "@/datos/reportes/simulado";

import { colportor, datosDePrueba, datosDePruebaConVentas, horasConstantes, ventasConstantes } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";

const tabla = () => screen.getByRole("table");
const filaDe = (nombre: RegExp | string) => within(tabla()).getByRole("rowheader", { name: nombre }).closest("tr")!;
const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const tarjeta = (nombre: string) => screen.getByRole("region", { name: nombre });
/** Los nombres de las tarjetas de cifras (la lista de ciudades también tiene regiones, una por departamento). */
const tarjetas = () =>
  screen
    .getAllByRole("region")
    .map((r) => r.getAttribute("aria-label") ?? "")
    .filter((nombre) => !nombre.startsWith("DEPTO."));

/** Las celdas de cifras de una fila, en texto («36,0= 0%» → se lee con la tendencia pegada). */
const celdasDe = (fila: HTMLElement) => within(fila).getAllByRole("cell").map((c) => c.textContent ?? "");

describe("ReporteHoras · presentaciones, ventas y monto (HU-REP-002)", () => {
  it("arranca con las tarjetas de horas, presentaciones y ventas, y las cuatro columnas; el % por cobrar (V2) no está", () => {
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);

    expect(tarjetas()).toEqual(["HORAS", "PRESENTACIONES", "VENTAS"]);
    expect(within(tabla()).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "COLPORTOR · S2",
      "HORAS",
      "PRESENTACIONES",
      "VENTAS",
      "MONTO",
    ]);
    expect(screen.queryByText(/POR COBRAR/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
  });

  it("cada tarjeta muestra su cifra, su tendencia, contra qué se compara y el total de la campaña", () => {
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);

    const presentaciones = within(tarjeta("PRESENTACIONES"));
    expect(presentaciones.getByText("96")).toBeInTheDocument();
    expect(presentaciones.getByText("▲ 7%")).toBeInTheDocument();
    expect(presentaciones.getByText("subió 7 %")).toBeInTheDocument(); // la frase para el lector de pantalla
    expect(presentaciones.getByText("S2 · contra S1")).toBeInTheDocument();
    expect(presentaciones.getByText("Campaña: 225")).toBeInTheDocument();

    const ventas = within(tarjeta("VENTAS"));
    expect(ventas.getByText("40")).toBeInTheDocument();
    expect(ventas.getByText("▲ 33%")).toBeInTheDocument();
    expect(ventas.getByText("Campaña: 86 · $U 73.400")).toBeInTheDocument();
  });

  it("los gráficos de presentaciones y de ventas tienen texto para el lector de pantalla", () => {
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    expect(screen.getByRole("img", { name: "Presentaciones por semana: S1: 90; S2: 96; S3: 39 (en curso)." })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Ventas por semana: S1: 30; S2: 40; S3: 16 (en curso)." })).toBeInTheDocument();
  });

  it("la tabla trae las cifras de cada colportor con su tendencia, y el monto en $U", () => {
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    expect(celdasDe(filaDe(/Ana Silva/))).toEqual(["36,0= 0%sin cambios", "30▲ 25%subió 25 %", "12▲ 100%subió 100 %", "$U 9.000▲ 50%subió 50 %"]);
    expect(celdasDe(filaDe(/Beto Techera/))).toEqual(["32,0▼ 33%bajó 33 %", "12▼ 33%bajó 33 %", "4▼ 33%bajó 33 %", "$U 3.200▼ 33%bajó 33 %"]);
  });

  it("elegir una ciudad cambia las tres tarjetas y las filas a la vez", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Artigas/ }));

    // Artigas es Carla sola: S2 36 presentaciones, 18 ventas
    expect(within(tarjeta("PRESENTACIONES")).getByText("36")).toBeInTheDocument();
    expect(within(tarjeta("VENTAS")).getByText("18")).toBeInTheDocument();
    expect(within(tarjeta("VENTAS")).getByText("▲ 50%")).toBeInTheDocument();
    expect(within(tabla()).getAllByRole("rowheader")).toHaveLength(1);
    expect(celdasDe(filaDe(/Carla Rey/))[3]).toContain("$U 18.000");
  });

  it("cambiar de período recalcula las cifras de ventas y mantiene el ámbito", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));

    await user.click(screen.getByRole("button", { name: "Días" }));
    // ayer, 20/10: Ana 5 presentaciones y Beto sin datos
    expect(within(tarjeta("PRESENTACIONES")).getByText("5")).toBeInTheDocument();
    expect(within(tarjeta("PRESENTACIONES")).getByText("ayer · contra el día anterior")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Presentaciones por día: .*mar 20\/10: 5; mié 21\/10: 2 \(en curso\)\.$/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Meses" }));
    expect(within(tarjeta("VENTAS")).getByText("Campaña: 32 · $U 26.000")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
  });

  it("la ficha de un colportor trae todas las cifras por período, y la semana en curso no lleva tendencia", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));

    expect(within(tabla()).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "SEMANA",
      "HORAS",
      "PRESENTACIONES",
      "VENTAS",
      "MONTO",
    ]);
    expect(celdasDe(filaDe(/S1 · 05\/10/))).toEqual(["36,0", "24", "6", "$U 6.000"]);
    expect(celdasDe(filaDe(/S2 · 12\/10/))[3]).toBe("$U 9.000▲ 50%subió 50 %");
    const enCurso = filaDe(/S3 · 19\/10/);
    expect(enCurso).toHaveTextContent("en curso");
    expect(within(enCurso).queryByText(/[▲▼]/)).not.toBeInTheDocument();
    expect(celdasDe(enCurso)).toEqual(["15,0", "12", "4", "$U 3.000"]);
  });

  it("un colportor sin datos tiene guion en todas las cifras, con el aviso, y nada que comparar", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(screen.getByRole("button", { name: "Días" }));

    const beto = filaDe(/Beto Techera/);
    expect(beto).toHaveTextContent("sin datos desde el 15/10");
    expect(celdasDe(beto)).toEqual(["— sin datos", "— sin datos", "— sin datos", "— sin datos"]);
    expect(within(beto).queryByText(/[▲▼]/)).not.toBeInTheDocument();
  });

  it("cuando todavía no llegaron ventas, las tarjetas lo dicen y las horas siguen", () => {
    render(<ReporteHoras datos={datosDePrueba()} />);
    const ventas = within(tarjeta("VENTAS"));
    expect(ventas.getByText("—")).toBeInTheDocument();
    expect(ventas.getByText("S2: sin datos")).toBeInTheDocument();
    expect(ventas.getByText("Campaña: —")).toBeInTheDocument();
    expect(within(tarjeta("HORAS")).getByText("122")).toBeInTheDocument();
    expect(celdasDe(filaDe(/Ana Silva/))).toEqual(["36,0= 0%sin cambios", "— sin datos", "— sin datos", "— sin datos"]);
  });
});

describe("ReporteHoras · % por cobrar (V2)", () => {
  it("apagado, ni la tarjeta ni la columna; encendido, la cifra en % y la tendencia en puntos", () => {
    const { rerender } = render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    expect(screen.queryByRole("region", { name: "% POR COBRAR" })).not.toBeInTheDocument();

    rerender(<ReporteHoras datos={datosDePruebaConVentas()} mostrarPorCobrar />);
    const pc = within(tarjeta("% POR COBRAR"));
    expect(pc.getByText("42%")).toBeInTheDocument();
    expect(pc.getByText("▲ 14 pts")).toBeInTheDocument();
    expect(pc.getByText("hay 14 puntos más por cobrar")).toBeInTheDocument();
    expect(pc.getByText("Campaña: 35%")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "% POR COBRAR" })).toBeInTheDocument();
    expect(celdasDe(filaDe(/Ana Silva/)).at(-1)).toBe("40%▲ 20 ptshay 20 puntos más por cobrar");
  });

  it("encendido pero sin cobros conectados: guion y sin tendencia, sin romper", () => {
    const datos = datosDePruebaConVentas();
    const sinCobros: DatosHoras = {
      ...datos,
      ciudades: datos.ciudades.map((c) => ({
        ...c,
        colportores: c.colportores.map((p) => ({
          ...p,
          ventasPorDia: Object.fromEntries(Object.entries(p.ventasPorDia).map(([f, d]) => [f, { ...d, cobrado: null }])),
        })),
      })),
    };
    render(<ReporteHoras datos={sinCobros} mostrarPorCobrar />);
    expect(within(tarjeta("% POR COBRAR")).getByText("—")).toBeInTheDocument();
    expect(within(tarjeta("% POR COBRAR")).getByText("S2: sin datos")).toBeInTheDocument();
    expect(celdasDe(filaDe(/Ana Silva/)).at(-1)).toBe("— sin datos");
  });
});

describe("ReporteHoras · con los datos de ejemplo del diseño (ventas)", () => {
  const sim = crearHorasSimuladas();

  it("las tarjetas del primer tablero son las del canvas: 653 presentaciones, 209 ventas y $U 3.633.950 en la campaña", () => {
    render(<ReporteHoras datos={sim} />);
    expect(within(tarjeta("PRESENTACIONES")).getByText("653")).toBeInTheDocument();
    expect(within(tarjeta("PRESENTACIONES")).getByText("= 0%")).toBeInTheDocument();
    expect(within(tarjeta("PRESENTACIONES")).getByText("Campaña: 4.688")).toBeInTheDocument();
    expect(within(tarjeta("VENTAS")).getByText("209")).toBeInTheDocument();
    expect(within(tarjeta("VENTAS")).getByText("Campaña: 1.462 · $U 3.633.950")).toBeInTheDocument();
  });

  it("Bruno Techera: en su ficha cada semana trae sus cifras, y las semanas sin datos van con guion", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={sim} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Bruno Techera/ }));

    expect(celdasDe(filaDe(/S1 · 31\/08/))).toEqual(["25,0", "23", "9", "$U 24.400"]);
    expect(celdasDe(filaDe(/S8 · 19\/10/))).toEqual(["— sin datos", "— sin datos", "— sin datos", "— sin datos"]);
  });
});

describe("ReporteHoras · datos límite de las ventas", () => {
  it("una lista larga (300 colportores) con ventas se dibuja entera", () => {
    const horas = horasConstantes("2026-10-05", "2026-10-21", 6);
    const ventas = ventasConstantes("2026-10-05", "2026-10-21", { presentaciones: 5, ventas: 2, monto: 1500, cobrado: 1000 });
    const muchos: ColportorHoras[] = Array.from({ length: 300 }, (_, i) => colportor(`c${i}`, `Colportor ${i}`, horas, null, ventas));
    const datos: DatosHoras = {
      inicioCampania: "2026-10-05",
      finCampania: null,
      hoy: "2026-10-21",
      ciudades: [{ id: "x", nombre: "Rivera", departamento: "Rivera", colportores: muchos }],
    };
    render(<ReporteHoras datos={datos} />);
    expect(within(tabla()).getAllByRole("rowheader")).toHaveLength(300);
    expect(within(tarjeta("PRESENTACIONES")).getByText("9.000")).toBeInTheDocument(); // 300 × 5 × 6 días
    expect(within(tarjeta("VENTAS")).getByText("Campaña: 9.000 · $U 6.750.000")).toBeInTheDocument();
  }, 30_000);

  it("un monto de siete cifras no se recorta ni aprieta a las demás: la tabla se desplaza hacia el costado", () => {
    const grande = ventasConstantes("2026-10-05", "2026-10-21", { presentaciones: 900, ventas: 400, monto: 98_765_432, cobrado: null });
    const datos: DatosHoras = {
      inicioCampania: "2026-10-05",
      finCampania: null,
      hoy: "2026-10-21",
      ciudades: [
        {
          id: "x",
          nombre: "Rivera",
          departamento: "Rivera",
          colportores: [colportor("a", "Ana", horasConstantes("2026-10-05", "2026-10-21", 6), null, grande)],
        },
      ],
    };
    const { rerender } = render(<ReporteHoras datos={datos} />);
    const celda = celdasDe(filaDe(/Ana/));
    expect(celda[3]).toContain("$U 592.592.592"); // 6 días de 98.765.432
    // cada columna de cifras tiene su ancho, y la tabla no baja de lo que necesitan (no se aprieta ni se corta)
    expect(tabla().style.minWidth).toBe("880px");
    rerender(<ReporteHoras datos={datos} mostrarPorCobrar />);
    expect(tabla().style.minWidth).toBe("1040px");
  });

  it("textos largos: el nombre se recorta con puntos pero se lee entero", () => {
    const nombre = "María de los Ángeles Fernández de la Cruz y Pereira de Souza";
    const datos = datosDePruebaConVentas();
    datos.ciudades[0].colportores[0] = { ...datos.ciudades[0].colportores[0], nombre };
    render(<ReporteHoras datos={datos} />);
    const fila = filaDe(nombre);
    expect(within(fila).getByTitle(nombre)).toHaveClass("truncate");
  });

  it("volver a la pestaña (se monta de nuevo) arranca otra vez en todas las ciudades, por semanas", async () => {
    const user = userEvent.setup();
    const primera = render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Artigas/ }));
    await user.click(screen.getByRole("button", { name: "Meses" }));
    primera.unmount();

    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semanas", pressed: true })).toBeInTheDocument();
    expect(within(tarjeta("VENTAS")).getByText("40")).toBeInTheDocument();
  });

  it("doble toque en una ciudad o en un período no repite ni mezcla las cifras", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePruebaConVentas()} />);
    await user.dblClick(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.dblClick(screen.getByRole("button", { name: "Días" }));
    expect(tarjetas()).toHaveLength(3);
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
  });

  it("si los datos cambian y el colportor elegido desaparece, vuelve a todas las ciudades con las cifras de todas", async () => {
    const user = userEvent.setup();
    const datos = datosDePruebaConVentas();
    const { rerender } = render(<ReporteHoras datos={datos} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));
    expect(within(tarjeta("VENTAS")).getByText("12")).toBeInTheDocument();

    rerender(<ReporteHoras datos={{ ...datos, ciudades: datos.ciudades.slice(1) }} />);
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(within(tarjeta("VENTAS")).getByText("24")).toBeInTheDocument(); // Carla 18 + Darío 6
  });
});

describe("ReporteHoras · accesibilidad de las cifras nuevas (axe A/AA, sin contraste: jsdom no mide)", () => {
  async function violaciones(container: HTMLElement) {
    const resultado = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    return resultado.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  }

  it("no tiene violaciones con las tarjetas y las columnas nuevas, ni con el % por cobrar encendido", async () => {
    const user = userEvent.setup();
    const { container } = render(<ReporteHoras datos={crearHorasSimuladas()} mostrarPorCobrar />);
    expect(await violaciones(container)).toEqual([]);

    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Bruno Techera/ }));
    expect(await violaciones(container)).toEqual([]);
  }, 30_000);

  it("las tendencias se leen como frase y el triángulo queda oculto", () => {
    render(<ReporteHoras datos={datosDePruebaConVentas()} mostrarPorCobrar />);
    for (const triangulo of screen.getAllByText(/^[▲▼] /)) {
      expect(triangulo).toHaveAttribute("aria-hidden", "true");
    }
  });
});
