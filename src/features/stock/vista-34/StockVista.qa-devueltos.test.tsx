import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ColportorDeStock, DatosDeStock, ExistenciaDeStock } from "@/datos/stock/contrato";
import { crearDatosDeStockSimulados } from "@/datos/stock/simulado";

import { StockVista } from "./StockVista";

// QA del PR #119 (issue #109): columna «Devueltos», aparte de «Entregados», y «Por cobrar» tal cual llega del servidor
// (decisiones de Cristian del 27/10 en backend-supabase#101). Lo que los tests del implementador no cubren.

const ex = (productoId: string, p: Partial<ExistenciaDeStock> = {}): ExistenciaDeStock => ({
  productoId,
  tiene: 0,
  porEntregar: 0,
  entregados: 0,
  devueltos: 0,
  porCobrar: 0,
  ...p,
});
const col = (id: string, ciudadId: string | null, ...existencias: ExistenciaDeStock[]): ColportorDeStock => ({
  id,
  nombre: id,
  ciudadId,
  ultimoDatoAt: null,
  existencias,
});
const datos = (...colportores: ColportorDeStock[]): DatosDeStock => ({
  campaniaId: "c",
  ciudades: [
    { id: "riv", nombre: "Rivera", departamento: "Rivera" },
    { id: "art", nombre: "Artigas", departamento: "Artigas" },
  ],
  productos: [
    { id: "l1", nombre: "Libro uno", tipo: "LIBRO", nota: null },
    { id: "r1", nombre: "Revista A", tipo: "REVISTA", nota: null },
    { id: "r2", nombre: "Revista B", tipo: "REVISTA", nota: null },
  ],
  colportores,
});

const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const tabla = () => screen.getByRole("table", { name: /^Stock por producto en/ });
const celdasDe = (nombre: RegExp) => within(within(tabla()).getByRole("row", { name: nombre })).getAllByRole("cell").map((c) => c.textContent);
// en la ciudad · en manos de · por entregar · entregados · devueltos · por cobrar · estado
const I = { tiene: 0, manos: 1, porEntregar: 2, entregados: 3, devueltos: 4, porCobrar: 5 };

describe("PR #119 · «Devueltos» no toca a «Entregados» ni al estado", () => {
  it("devolver no resta de lo entregado: entregados 10 y devueltos 4 se muestran como 10 y 4", () => {
    render(<StockVista datos={datos(col("ana", "riv", ex("l1", { tiene: 2, entregados: 10, devueltos: 4, porCobrar: 1 })))} />);
    const c = celdasDe(/Libro uno/);
    expect(c[I.entregados]).toBe("10");
    expect(c[I.devueltos]).toBe("4");
  });

  it("lo devuelto no cambia el estado ni los avisos: sin stock en la ciudad sigue «Agotado en la ciudad», aunque haya devueltos", () => {
    render(<StockVista datos={datos(col("ana", "riv", ex("l1", { tiene: 0, entregados: 5, devueltos: 5 })))} />);
    expect(within(within(tabla()).getByRole("row", { name: /Libro uno/ })).getAllByRole("cell").at(-1)).toHaveTextContent("Agotado en la ciudad");
    expect(screen.getByRole("list", { name: "Avisos de stock" })).toHaveTextContent("Libro uno agotado en Rivera");
  });

  it("devueltos mayor que entregados (el servidor lo manda así) se muestra tal cual, sin recortar ni restar", () => {
    render(<StockVista datos={datos(col("ana", "riv", ex("l1", { tiene: 2, entregados: 1, devueltos: 3 })))} />);
    const c = celdasDe(/Libro uno/);
    expect([c[I.entregados], c[I.devueltos]]).toEqual(["1", "3"]);
  });
});

describe("PR #119 · cómo se suma «Devueltos»", () => {
  it("por producto suma a todos los colportores de la ciudad elegida y no mezcla ciudades", async () => {
    render(
      <StockVista
        datos={datos(
          col("ana", "riv", ex("l1", { tiene: 1, devueltos: 2 })),
          col("beto", "riv", ex("l1", { tiene: 1, devueltos: 5 })),
          col("carla", "art", ex("l1", { tiene: 1, devueltos: 100 })),
        )}
      />,
    );
    expect(celdasDe(/Libro uno/)[I.devueltos]).toBe("107");
    await userEvent.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    expect(celdasDe(/Libro uno/)[I.devueltos]).toBe("7");
    await userEvent.click(within(lista()).getByRole("button", { name: /^Artigas/ }));
    expect(celdasDe(/Libro uno/)[I.devueltos]).toBe("100");
  });

  it("la fila de categoría (revistas, todas juntas) suma lo devuelto de todos sus títulos", () => {
    render(
      <StockVista
        datos={datos(col("ana", "riv", ex("r1", { tiene: 2, devueltos: 3 }), ex("r2", { tiene: 1, devueltos: 4 })))}
      />,
    );
    expect(celdasDe(/Revistas · todas/)[I.devueltos]).toBe("7");
  });

  it("un colportor sin ciudad entra en «Sin ciudad» con sus devueltos (no se pierde)", async () => {
    render(<StockVista datos={datos(col("sola", null, ex("l1", { tiene: 1, devueltos: 6 })))} />);
    await userEvent.click(within(lista()).getByRole("button", { name: /Sin ciudad/ }));
    expect(celdasDe(/Libro uno/)[I.devueltos]).toBe("6");
  });

  it("cifras grandes llevan separador de miles en la fila y en el detalle", async () => {
    render(<StockVista datos={datos(col("ana", "riv", ex("l1", { tiene: 1, entregados: 2345678, devueltos: 1234567, porCobrar: 1000 })))} />);
    const c = celdasDe(/Libro uno/);
    expect([c[I.entregados], c[I.devueltos], c[I.porCobrar]]).toEqual(["2.345.678", "1.234.567", "1.000"]);
    await userEvent.click(within(tabla()).getByRole("button", { name: /Libro uno/ }));
    const detalle = screen.getByRole("table", { name: /^Quién tiene Libro uno/ });
    expect(within(detalle).getByText("1.234.567")).toBeInTheDocument();
  });

  it("devueltos negativo, NaN o infinito cuentan cero y no contaminan la suma de los demás", () => {
    render(
      <StockVista
        datos={datos(
          col("ana", "riv", ex("l1", { tiene: 1, devueltos: -5 })),
          col("beto", "riv", ex("l1", { tiene: 1, devueltos: Number.NaN })),
          col("carla", "riv", ex("l1", { tiene: 1, devueltos: 3 })),
        )}
      />,
    );
    const texto = celdasDe(/Libro uno/)[I.devueltos];
    expect(texto).not.toMatch(/nan|infinity|-/i);
    expect(texto).toBe("3");
  });
});

describe("PR #119 · el detalle «Quién lo tiene»", () => {
  it("cada colportor lleva su propio número de devueltos, en la columna DEVUELTOS, entre ENTREGADOS y POR COBRAR", async () => {
    render(
      <StockVista
        datos={datos(
          col("ana", "riv", ex("l1", { tiene: 3, entregados: 9, devueltos: 2, porCobrar: 4 })),
          col("beto", "riv", ex("l1", { tiene: 1, entregados: 8, devueltos: 7, porCobrar: 5 })),
        )}
      />,
    );
    await userEvent.click(within(tabla()).getByRole("button", { name: /Libro uno/ }));
    const detalle = screen.getByRole("table", { name: /^Quién tiene Libro uno/ });
    const cabeceras = within(detalle).getAllByRole("columnheader").map((h) => h.textContent);
    expect(cabeceras).toEqual(["QUIÉN LO TIENE O DEBE ENTREGARLO", "TIENE", "POR ENTREGAR", "ENTREGADOS", "DEVUELTOS", "POR COBRAR"]);
    const idx = cabeceras.indexOf("DEVUELTOS");
    for (const [nombre, esperado] of [["ana", "2"], ["beto", "7"]]) {
      const fila = within(detalle).getByRole("row", { name: new RegExp(nombre) });
      // la primera celda es el encabezado de fila (nombre): las demás van desfasadas en uno
      expect(within(fila).getAllByRole("cell")[idx - 1]).toHaveTextContent(esperado);
    }
  });

  it("los números rotos del detalle no muestran NaN ni negativos (mismo saneado que la fila)", async () => {
    render(<StockVista datos={datos(col("ana", "riv", ex("l1", { tiene: 3, devueltos: -2, porCobrar: Number.NaN })))} />);
    await userEvent.click(within(tabla()).getByRole("button", { name: /Libro uno/ }));
    const detalle = screen.getByRole("table", { name: /^Quién tiene Libro uno/ });
    expect(detalle.textContent).not.toMatch(/nan|undefined|null|-\d/i);
  });
});

describe("PR #119 · «Por cobrar» tal cual llega", () => {
  it("la fila y el detalle muestran el mismo número que manda el servidor: 3 libros cobrados a la mitad cuentan 2", async () => {
    render(<StockVista datos={datos(col("ana", "riv", ex("l1", { tiene: 1, entregados: 3, porCobrar: 2 })))} />);
    expect(celdasDe(/Libro uno/)[I.porCobrar]).toBe("2");
    await userEvent.click(within(tabla()).getByRole("button", { name: /Libro uno/ }));
    const detalle = screen.getByRole("table", { name: /^Quién tiene Libro uno/ });
    const fila = within(detalle).getByRole("row", { name: /ana/ });
    expect(within(fila).getAllByRole("cell").at(-1)).toHaveTextContent("2");
  });

  it("por cobrar mayor que entregados no se recorta ni se recalcula (el panel no prorratea)", () => {
    render(<StockVista datos={datos(col("ana", "riv", ex("l1", { tiene: 1, entregados: 1, porCobrar: 4 })))} />);
    expect(celdasDe(/Libro uno/)[I.porCobrar]).toBe("4");
  });
});

describe("PR #119 · fuente simulada", () => {
  it("en ningún producto ni colportor los devueltos superan a lo entregado, y todos son enteros no negativos", () => {
    const d = crearDatosDeStockSimulados();
    for (const c of d.colportores)
      for (const e of c.existencias) {
        expect(Number.isInteger(e.devueltos), `${c.nombre}/${e.productoId}`).toBe(true);
        expect(e.devueltos).toBeGreaterThanOrEqual(0);
        expect(e.devueltos).toBeLessThanOrEqual(e.entregados);
      }
  });

  it("es determinista: dos cargas dan los mismos devueltos (la vista no parpadea con otras cifras)", () => {
    const una = crearDatosDeStockSimulados().colportores.map((c) => c.existencias.map((e) => e.devueltos));
    const otra = crearDatosDeStockSimulados().colportores.map((c) => c.existencias.map((e) => e.devueltos));
    expect(otra).toEqual(una);
  });

  it("la vista simulada completa muestra la columna sin NaN ni vacíos en ninguna fila", () => {
    render(<StockVista datos={crearDatosDeStockSimulados()} />);
    for (const fila of within(tabla()).getAllByRole("row")) {
      const celdas = within(fila).queryAllByRole("cell");
      if (celdas.length < 7) continue;
      expect(celdas[I.devueltos].textContent, fila.textContent ?? "").toMatch(/^\d{1,3}(\.\d{3})*$/);
    }
  });
});
