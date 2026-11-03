import { describe, expect, it } from "vitest";

import { crearHorasSimuladas } from "@/datos/reportes/simulado";

import { AMBITO_TODAS, type Ambito } from "../horas/ambito";
import { armarReporte } from "../horas/armado";
import type { Granularidad } from "../horas/calculo";
import { colportor, datosDePruebaConVentas, horasConstantes } from "../horas/datos-de-prueba";
import { armarCsv, BOM_UTF8, celdaDeCifra, celdaDeTexto } from "./csv";

const lineas = (csv: string) => csv.split("\r\n").slice(0, -1);
const campos = (linea: string) => linea.split(",");

function csvDe(ambito: Ambito, granularidad: Granularidad, datos = datosDePruebaConVentas(), porCobrar = false) {
  return armarCsv(armarReporte(datos, ambito, granularidad, { porCobrar }));
}

describe("celdaDeTexto", () => {
  it("deja pasar un texto común, con tildes y todo", () => {
    expect(celdaDeTexto("Bella Unión")).toBe("Bella Unión");
  });

  it("entrecomilla lo que tiene coma, comilla o salto de línea, y duplica las comillas", () => {
    expect(celdaDeTexto("Pérez, Ana")).toBe('"Pérez, Ana"');
    expect(celdaDeTexto('Ana "la rápida"')).toBe('"Ana ""la rápida"""');
    expect(celdaDeTexto("dos\nlíneas")).toBe('"dos\nlíneas"');
  });

  it("un texto que una planilla tomaría por fórmula lleva un apóstrofe adelante", () => {
    for (const peligroso of ["=SUMA(A1:A9)", "+54911", "-2+3", "@usuario", "\tcelda"]) {
      expect(celdaDeTexto(peligroso).replace(/^"/, "")).toMatch(/^'/);
    }
    expect(celdaDeTexto("Ana-Belén")).toBe("Ana-Belén");
  });
});

describe("celdaDeCifra", () => {
  it("punto decimal, hasta dos decimales, y vacía si no hay datos", () => {
    expect(celdaDeCifra(36)).toBe("36");
    expect(celdaDeCifra(12.5)).toBe("12.5");
    expect(celdaDeCifra(0.1 + 0.2)).toBe("0.3");
    expect(celdaDeCifra(0)).toBe("0");
    expect(celdaDeCifra(null)).toBe("");
    expect(celdaDeCifra(Number.NaN)).toBe("");
  });
});

describe("armarCsv · todas las ciudades, por semanas", () => {
  const csv = csvDe(AMBITO_TODAS, "semana");

  it("termina cada línea con CRLF y lleva el encabezado con las cifras de la pantalla", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lineas(csv)[0]).toBe("Ciudad,Colportor,Período,Horas,Presentaciones,Ventas,Monto ($U),Nota");
  });

  it("una fila por colportor, con su ciudad y sin los títulos de ciudad que la tabla usa para agrupar", () => {
    const filas = lineas(csv).slice(1);
    expect(filas).toHaveLength(4);
    expect(filas.map((f) => campos(f).slice(0, 3).join("|"))).toEqual([
      "Rivera|Ana Silva|S2",
      "Rivera|Beto Techera|S2",
      "Artigas|Carla Rey|S2",
      "Bella Unión|Darío Viera|S2",
    ]);
  });

  it("las cifras van sin formato: punto decimal, sin «$U» ni separador de miles", () => {
    const filas = lineas(csv).slice(1).map(campos);
    expect(filas[0].slice(3)).toEqual(["36", "30", "12", "9000", ""]);
    expect(filas[1].slice(3)).toEqual(["32", "12", "4", "3200", ""]);
    expect(filas[2].slice(3)).toEqual(["30", "36", "18", "18000", ""]);
    expect(filas[3].slice(3)).toEqual(["24", "18", "6", "3600", ""]);
  });

  it("no lleva más columnas que las de la pantalla: nada de clientes, ni contacto, ni ubicaciones", () => {
    expect(lineas(csv)[0].toLowerCase()).not.toMatch(/cliente|correo|mail|tel[eé]fono|direcci[oó]n|ubicaci[oó]n/);
  });

  it("con el % por cobrar encendido (V2) suma su columna en %", () => {
    const con = lineas(csvDe(AMBITO_TODAS, "semana", datosDePruebaConVentas(), true));
    expect(campos(con[0])).toContain("% por cobrar");
    expect(campos(con[1])).toHaveLength(campos(con[0]).length);
  });
});

describe("armarCsv · lo que está en pantalla es lo que se exporta", () => {
  it("una ciudad: solo sus colportores", () => {
    const filas = lineas(csvDe({ tipo: "ciudad", ciudadId: "rivera" }, "semana")).slice(1).map(campos);
    expect(filas.map((f) => f.slice(0, 2).join("|"))).toEqual(["Rivera|Ana Silva", "Rivera|Beto Techera"]);
  });

  it("un departamento: las ciudades del departamento", () => {
    const filas = lineas(csvDe({ tipo: "departamento", departamento: "Artigas" }, "semana")).slice(1).map(campos);
    expect(filas.map((f) => f.slice(0, 2).join("|"))).toEqual(["Artigas|Carla Rey", "Bella Unión|Darío Viera"]);
  });

  it("un colportor: una fila por período, con las mismas cifras que la tabla", () => {
    const datos = datosDePruebaConVentas();
    const reporte = armarReporte(datos, { tipo: "colportor", colportorId: "ana" }, "semana");
    const filas = lineas(armarCsv(reporte)).slice(1);
    const deLaTabla = reporte.tabla.filas.filter((f) => f.tipo === "fila");

    expect(filas).toHaveLength(deLaTabla.length);
    deLaTabla.forEach((fila, i) => {
      const [ciudad, nombre, periodo] = [celdaDeTexto("Rivera"), celdaDeTexto("Ana Silva"), celdaDeTexto(fila.nombre)];
      expect(filas[i].startsWith(`${ciudad},${nombre},${periodo},`)).toBe(true);
    });
    // S2 de Ana, la fila del medio: las cifras de la pantalla
    expect(campos(filas[1]).slice(-5)).toEqual(["36", "30", "12", "9000", ""]);
  });

  it("por días y por meses exporta los períodos de esa agrupación", () => {
    const dias = lineas(csvDe({ tipo: "ciudad", ciudadId: "rivera" }, "dia")).slice(1).map(campos);
    const meses = lineas(csvDe({ tipo: "ciudad", ciudadId: "rivera" }, "mes")).slice(1).map(campos);
    expect(dias).toHaveLength(2);
    expect(meses).toHaveLength(2);
    expect(dias[0][2]).not.toBe(meses[0][2]);
  });
});

describe("armarCsv · datos límite", () => {
  it("un día o un colportor sin datos va con la celda vacía —no con 0— y la nota que dice por qué", () => {
    const datos = datosDePruebaConVentas();
    // Beto no tiene datos desde el 15/10: la semana en curso (S3) queda vacía
    const filas = lineas(csvDe({ tipo: "colportor", colportorId: "beto" }, "semana", datos)).slice(1).map(campos);
    const sinDatos = filas.filter((f) => f.slice(3, 7).every((c) => c === ""));
    expect(sinDatos.length).toBeGreaterThan(0);
    for (const f of sinDatos) expect(f.at(-1)).toMatch(/^sin datos/);
  });

  it("el reporte de ejemplo del canvas, con sus 25 colportores, sale entero", () => {
    const csv = csvDe(AMBITO_TODAS, "semana", crearHorasSimuladas());
    expect(lineas(csv)).toHaveLength(26);
    for (const l of lineas(csv)) expect(campos(l).length).toBeGreaterThanOrEqual(8);
  });

  it("una lista larga (500 colportores) sale entera", () => {
    const datos = datosDePruebaConVentas();
    datos.ciudades[0].colportores = Array.from({ length: 500 }, (_, i) =>
      colportor(`c${i}`, `Colportor ${i}`, horasConstantes("2026-10-05", "2026-10-21", 6)),
    );
    expect(lineas(csvDe({ tipo: "ciudad", ciudadId: "rivera" }, "semana", datos))).toHaveLength(501);
  });

  it("nombres con coma, comillas o que parecen fórmulas no rompen las columnas ni se ejecutan en la planilla", () => {
    const datos = datosDePruebaConVentas();
    datos.ciudades[0].nombre = 'Rivera, "Norte"';
    datos.ciudades[0].colportores[0] = colportor("x", "=HIPERVINCULO(\"http://malo\")", horasConstantes("2026-10-05", "2026-10-21", 6));
    datos.ciudades[0].colportores[1] = colportor("y", "Pérez, Ana", horasConstantes("2026-10-05", "2026-10-21", 6));
    const csv = csvDe({ tipo: "ciudad", ciudadId: "rivera" }, "semana", datos);
    const [, primera, segunda] = lineas(csv);
    expect(primera.startsWith('"Rivera, ""Norte""","\'=HIPERVINCULO(""http://malo"")"')).toBe(true);
    expect(segunda.startsWith('"Rivera, ""Norte""","Pérez, Ana",')).toBe(true);
  });

  it("un nombre larguísimo sale entero", () => {
    const largo = "María de los Ángeles Fernández de la Concepción ".repeat(10).trim();
    const datos = datosDePruebaConVentas();
    datos.ciudades[0].colportores[0] = colportor("x", largo, horasConstantes("2026-10-05", "2026-10-21", 6));
    expect(csvDe({ tipo: "ciudad", ciudadId: "rivera" }, "semana", datos)).toContain(largo);
  });

  it("sin colportores deja solo el encabezado", () => {
    const vacio = { ...datosDePruebaConVentas(), ciudades: [] };
    expect(lineas(csvDe(AMBITO_TODAS, "semana", vacio))).toHaveLength(1);
  });

  it("la marca de orden de bytes es la de UTF-8", () => {
    expect(BOM_UTF8).toBe("﻿");
  });
});
