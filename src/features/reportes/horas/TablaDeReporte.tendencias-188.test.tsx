import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import type { ColumnaDeReporte, Tendencia } from "./calculo";
import { type CeldaDeTabla, type FilaDeTabla, TablaDeReporte } from "./TablaDeReporte";

/** Issue #188: detalle del colportor con las columnas repartidas, cabecera sobre su cifra y flechas verde/rojo. */

const SUBE: Tendencia = { sentido: "sube", texto: "▲ 10%", textoAccesible: "subió 10 %" };
const BAJA: Tendencia = { sentido: "baja", texto: "▼ 8%", textoAccesible: "bajó 8 %" };
const IGUAL: Tendencia = { sentido: "igual", texto: "= 0%", textoAccesible: "sin cambios" };

const CLAVES: ColumnaDeReporte[] = ["horas", "presentaciones", "ventas", "monto", "diasTrabajados", "promedio"];
const ENCABEZADOS = ["HORAS", "PRESENTACIONES", "VENTAS", "MONTO", "DÍAS TRABAJADOS", "PROMEDIO"];

function celda(clave: ColumnaDeReporte, tendencia: Tendencia | null): CeldaDeTabla {
  return { clave, valor: "12", crudo: 12, sinDatos: false, tendencia };
}

function fila(nombre: string, tendencias: (Tendencia | null)[]): FilaDeTabla {
  return {
    tipo: "fila",
    clave: nombre,
    nombre,
    nota: null,
    enCurso: false,
    celdas: CLAVES.map((c, i) => celda(c, tendencias[i] ?? null)),
  };
}

function montar(filas: FilaDeTabla[]) {
  return render(
    <TablaDeReporte
      descripcion="Martín Techera por semana"
      primeraColumna="SEMANA"
      columnas={CLAVES.map((clave, i) => ({ clave, encabezado: ENCABEZADOS[i]! }))}
      filas={filas}
      mensajeVacio="Sin datos"
    />,
  );
}

const flecha = (texto: string) => screen.getByText(texto, { selector: "span[aria-hidden]" });

describe("TablaDeReporte · flechas verde y roja (#188)", () => {
  it("en horas, presentaciones, ventas y monto, el alza va en verde y la baja en rojo", () => {
    montar([fila("Semana 1", [SUBE, BAJA, SUBE, BAJA])]);

    const filaSemana = within(screen.getByRole("row", { name: /^Semana 1/ }));
    const flechas = filaSemana.getAllByText(/[▲▼]/);
    expect(flechas.map((f) => f.className)).toEqual(["text-exito", "text-peligro", "text-exito", "text-peligro"]);
  });

  it("sin cambios, sin tendencia y en las columnas de días, promedio y acompañadas no hay color", () => {
    montar([fila("Semana 2", [IGUAL, null, null, null, SUBE, BAJA])]);

    expect(flecha("= 0%").className).toBe("");
    expect(flecha("▲ 10%").className).toBe("");
    expect(flecha("▼ 8%").className).toBe("");
  });

  it("el color no es el único indicador: sigue la flecha con el porcentaje y la frase para el lector de pantalla", () => {
    montar([fila("Semana 1", [SUBE, BAJA])]);

    const filaSemana = within(screen.getByRole("row", { name: /^Semana 1/ }));
    expect(filaSemana.getByText("▲ 10%")).toBeInTheDocument();
    expect(filaSemana.getByText("subió 10 %")).toHaveClass("sr-only");
    expect(filaSemana.getByText("bajó 8 %")).toHaveClass("sr-only");
  });
});

describe("TablaDeReporte · ancho y cabecera (#188)", () => {
  it("las columnas de cifras se reparten el ancho por igual y la primera se queda con una parte fija, no con todo lo que sobra", () => {
    const { container } = montar([fila("Semana 1", [])]);

    const cols = container.querySelectorAll("colgroup col");
    expect(cols).toHaveLength(1 + CLAVES.length);
    expect((cols[0] as HTMLElement).style.width).toBe("24%");
    for (const c of Array.from(cols).slice(1)) expect((c as HTMLElement).style.width).toBe("");
    expect(container.querySelector("table")).toHaveClass("table-fixed", "w-full");
  });

  it("cada encabezado va alineado a su cifra (mismo lugar reservado para la tendencia) y con un separador", () => {
    montar([fila("Semana 1", [SUBE])]);

    const encabezados = screen.getAllByRole("columnheader").slice(1);
    expect(encabezados.map((e) => e.textContent)).toEqual(ENCABEZADOS);
    for (const e of encabezados) {
      expect(e).toHaveClass("text-right", "border-l");
      expect(e.querySelector("span[aria-hidden]")).toHaveClass("min-w-[46px]");
    }
    // Las celdas de datos comparten el separador y el lugar de la tendencia.
    const celdas = within(screen.getByRole("row", { name: /^Semana 1/ })).getAllByRole("cell");
    expect(celdas).toHaveLength(CLAVES.length);
    for (const c of celdas) expect(c).toHaveClass("border-l");
  });

  it("un encabezado largo se parte en vez de invadir a la columna de al lado", () => {
    montar([fila("Semana 1", [])]);

    expect(screen.getByText("PRESENTACIONES")).toHaveClass("wrap-anywhere");
  });

  it("con muchas filas y un nombre larguísimo la tabla sigue entera: nombre cortado con su título, sin violaciones axe", async () => {
    const largo = "N".repeat(150);
    const filas = [fila(largo, [SUBE, BAJA]), ...Array.from({ length: 60 }, (_, i) => fila(`Semana ${i + 2}`, [SUBE]))];
    const { container } = montar(filas);

    expect(screen.getByTitle(largo)).toHaveClass("truncate");
    const resultado = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    expect(resultado.violations).toEqual([]);
  });

  it("sin filas muestra el mensaje y el encabezado sigue", () => {
    montar([]);

    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(1 + CLAVES.length);
  });
});
