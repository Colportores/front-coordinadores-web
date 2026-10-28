import { describe, expect, it } from "vitest";

import type { ColportorHoras, DatosHoras } from "@/datos/reportes/contrato";

import { AMBITO_TODAS } from "./ambito";
import { armarReporte, armarReporteDeRango } from "./armado";
import type { ColumnaDeReporte } from "./calculo";
import { colportor, horasConstantes } from "./datos-de-prueba";
import type { FilaDeTabla } from "./TablaDeReporte";

/**
 * Issue #116: un domingo con datos cuenta en Días, Semanas, Meses y Rango; un domingo sin datos no es un «día sin datos»
 * ni corta la tendencia (canvas 32: «Los domingos no se trabaja, así que el día anterior a un lunes es el sábado»).
 *
 * Campaña desde el lunes 05/10 hasta hoy, lunes 19/10. Ana (6 h por día de lunes a sábado) cerró una jornada el domingo
 * 18/10: 5 h, una con acompañamiento, 3 presentaciones, 2 ventas por $U 500. Beto (8 h por día, de lunes a sábado)
 * no trabajó ese domingo.
 */
const DOMINGO = "2026-10-18";

function crear(conDomingo: boolean): DatosHoras {
  const ana: ColportorHoras = conDomingo
    ? colportor(
        "ana",
        "Ana Silva",
        { ...horasConstantes("2026-10-05", "2026-10-19", 6), [DOMINGO]: 5 },
        null,
        { [DOMINGO]: { presentaciones: 3, ventas: 2, monto: 500, cobrado: null } },
        { [DOMINGO]: 1 },
      )
    : colportor("ana", "Ana Silva", horasConstantes("2026-10-05", "2026-10-19", 6));
  const beto = colportor("beto", "Beto Techera", horasConstantes("2026-10-05", "2026-10-19", 8));
  return {
    inicioCampania: "2026-10-05",
    finCampania: null,
    hoy: "2026-10-19",
    ciudades: [{ id: "rivera", nombre: "Rivera", departamento: "Rivera", colportores: [ana, beto] }],
  };
}

const conDomingo = crear(true);
const sinDomingo = crear(false);
const ANA = { tipo: "colportor", colportorId: "ana" } as const;
const BETO = { tipo: "colportor", colportorId: "beto" } as const;

const filasDeColportor = (filas: FilaDeTabla[]) => filas.flatMap((f) => (f.tipo === "fila" ? [f] : []));
const nombresDeFilas = (filas: FilaDeTabla[]) => filasDeColportor(filas).map((f) => f.nombre);

function celda(fila: FilaDeTabla | undefined, clave: ColumnaDeReporte) {
  if (!fila || fila.tipo !== "fila") throw new Error("no es una fila");
  const encontrada = fila.celdas.find((c) => c.clave === clave);
  if (!encontrada) throw new Error(`no hay columna ${clave}`);
  return encontrada;
}

const tarjeta = (r: ReturnType<typeof armarReporte>, clave: ColumnaDeReporte) => {
  const encontrada = r.tarjetas.find((t) => t.clave === clave);
  if (!encontrada) throw new Error(`no hay tarjeta ${clave}`);
  return encontrada;
};

describe("un domingo con datos · Días", () => {
  const r = armarReporte(conDomingo, ANA, "dia");

  it("es el día de ayer del lunes: sus horas son la cifra y se compara con el sábado", () => {
    expect(r.subtitulo).toBe("Rivera · Departamento Rivera · ayer contra el día anterior");
    expect(tarjeta(r, "horas")).toMatchObject({ valor: "5,0", nota: "ayer · contra el día anterior" });
    expect(tarjeta(r, "horas").tendencia?.texto).toBe("▼ 17%");
  });

  it("tiene su fila, con sus horas, presentaciones, ventas y monto, y no figura como «sin datos»", () => {
    const domingo = filasDeColportor(r.tabla.filas).find((f) => f.nombre === "dom 18/10");
    expect(domingo).toMatchObject({ nota: null, enCurso: false });
    expect(celda(domingo, "horas")).toMatchObject({ valor: "5,0", sinDatos: false });
    expect(celda(domingo, "presentaciones").valor).toBe("3");
    expect(celda(domingo, "ventas").valor).toBe("2");
    expect(celda(domingo, "monto").valor).toBe("$U 500");
    expect(nombresDeFilas(r.tabla.filas).slice(-3)).toEqual(["sáb 17/10", "dom 18/10", "lun 19/10"]);
  });

  it("su barra está en el gráfico", () => {
    expect(tarjeta(r, "horas").barras.map((b) => b.rotulo).slice(-3)).toEqual(["17", "18", "19"]);
    expect(tarjeta(r, "horas").resumenDelGrafico).toContain("dom 18/10: 5,0");
  });

  it("los demás colportores no ganan una fila «sin datos» por ese domingo", () => {
    const beto = armarReporte(conDomingo, BETO, "dia");
    expect(nombresDeFilas(beto.tabla.filas)).not.toContain("dom 18/10");
    expect(filasDeColportor(beto.tabla.filas).some((f) => f.nota?.startsWith("sin datos"))).toBe(false);
  });
});

describe("un domingo sin datos · Días", () => {
  const r = armarReporte(sinDomingo, ANA, "dia");

  it("no es un día de la vista ni un «día sin datos»", () => {
    expect(nombresDeFilas(r.tabla.filas)).not.toContain("dom 18/10");
    expect(filasDeColportor(r.tabla.filas).filter((f) => f.nota !== null).map((f) => f.nota)).toEqual(["en curso"]);
  });

  it("no corta la tendencia: ayer del lunes es el sábado y se compara con el viernes", () => {
    expect(tarjeta(r, "horas")).toMatchObject({ valor: "6,0", nota: "ayer · contra el día anterior" });
    expect(tarjeta(r, "horas").tendencia?.texto).toBe("= 0%");
    expect(tarjeta(r, "horas").barras.every((b) => !b.sinDatos)).toBe(true);
  });
});

describe("un domingo con datos · Semanas", () => {
  it("las horas del domingo suman en la semana (de lunes a domingo) y en su tendencia", () => {
    const r = armarReporte(conDomingo, AMBITO_TODAS, "semana");
    // S2 (12 al 18/10): Ana 36 + 5, Beto 48 = 89 h; S1: 36 + 48 = 84 h.
    expect(tarjeta(r, "horas")).toMatchObject({ valor: "89", nota: "S2 · contra S1", campania: "Campaña: 187" });
    expect(tarjeta(r, "horas").tendencia?.texto).toBe("▲ 6%");
    expect(tarjeta(r, "presentaciones").valor).toBe("3");
    expect(tarjeta(r, "ventas")).toMatchObject({ valor: "2", campania: "Campaña: 2 · $U 500" });
  });

  it("con un domingo sin datos la semana vale lo de lunes a sábado", () => {
    const r = armarReporte(sinDomingo, AMBITO_TODAS, "semana");
    expect(tarjeta(r, "horas")).toMatchObject({ valor: "84", campania: "Campaña: 182" });
    expect(tarjeta(r, "horas").tendencia?.texto).toBe("= 0%");
  });

  it("la fila de Ana de la tabla lleva el domingo en su semana", () => {
    const { filas } = armarReporte(conDomingo, AMBITO_TODAS, "semana").tabla;
    expect(celda(filas.find((f) => f.tipo === "fila" && f.clave === "ana"), "horas").valor).toBe("41,0");
    expect(celda(filas.find((f) => f.tipo === "fila" && f.clave === "beto"), "horas").valor).toBe("48,0");
  });
});

describe("un domingo con datos · Meses", () => {
  it("las horas del domingo suman en el mes", () => {
    // Octubre: 36 + 36 + 5 + 6 (hoy) = 83 h; sin el domingo, 78 h.
    expect(tarjeta(armarReporte(conDomingo, ANA, "mes"), "horas")).toMatchObject({ valor: "83,0", campania: "Campaña: 83" });
    expect(tarjeta(armarReporte(sinDomingo, ANA, "mes"), "horas")).toMatchObject({ valor: "78,0", campania: "Campaña: 78" });
  });

  it("también en el total de varios colportores", () => {
    expect(tarjeta(armarReporte(conDomingo, AMBITO_TODAS, "mes"), "horas").valor).toBe("187");
    // Beto: 48 + 48 + 8 = 104 h; Ana 83 h.
    expect(tarjeta(armarReporte(conDomingo, AMBITO_TODAS, "mes"), "horas").campania).toBe("Campaña: 187");
  });
});

describe("un domingo con datos · Rango", () => {
  const SEMANA = { desde: "2026-10-12", hasta: DOMINGO };

  it("suma sus horas, el día trabajado y la jornada con acompañamiento (un colportor)", () => {
    const r = armarReporteDeRango(conDomingo, ANA, SEMANA);
    expect(r.problemaDeRango).toBeNull();
    expect(tarjeta(r, "horas").valor).toBe("41,0");
    // 41 h en 7 días trabajados.
    expect(tarjeta(r, "promedio")).toMatchObject({ valor: "5,9", nota: "7 días trabajados" });
    expect(tarjeta(r, "acompaniadas").valor).toBe("1");
    expect(tarjeta(r, "ventas")).toMatchObject({ valor: "2", campania: "$U 500" });
  });

  it("la tabla por día tiene la fila del domingo, con sus cifras", () => {
    const { filas } = armarReporteDeRango(conDomingo, ANA, SEMANA).tabla;
    expect(nombresDeFilas(filas)).toEqual(["lun 12/10", "mar 13/10", "mié 14/10", "jue 15/10", "vie 16/10", "sáb 17/10", "dom 18/10"]);
    const domingo = filasDeColportor(filas).at(-1);
    expect(domingo).toMatchObject({ nota: null });
    expect(celda(domingo, "horas")).toMatchObject({ valor: "5,0", sinDatos: false });
    expect(celda(domingo, "diasTrabajados").valor).toBe("1");
    expect(celda(domingo, "acompaniadas").valor).toBe("1");
  });

  it("suma en el total de varios colportores", () => {
    const r = armarReporteDeRango(conDomingo, AMBITO_TODAS, SEMANA);
    expect(tarjeta(r, "horas").valor).toBe("89");
    expect(tarjeta(r, "promedio")).toMatchObject({ valor: "6,8", nota: "13 días trabajados (sumando colportores)" });
    expect(tarjeta(r, "acompaniadas").valor).toBe("1");
    const ana = r.tabla.filas.find((f) => f.tipo === "fila" && f.clave === "ana");
    expect(celda(ana, "horas").valor).toBe("41,0");
    expect(celda(ana, "diasTrabajados").valor).toBe("7");
  });

  it("un rango que es solo el domingo con datos tiene cifras", () => {
    const r = armarReporteDeRango(conDomingo, ANA, { desde: DOMINGO, hasta: DOMINGO });
    expect(tarjeta(r, "horas").valor).toBe("5,0");
    expect(tarjeta(r, "promedio")).toMatchObject({ valor: "5,0", nota: "1 día trabajado" });
  });
});

describe("un domingo sin datos · Rango", () => {
  const SEMANA = { desde: "2026-10-12", hasta: DOMINGO };

  it("no es un día sin datos: la tabla por día no lo lista y el total es el de lunes a sábado", () => {
    const r = armarReporteDeRango(sinDomingo, ANA, SEMANA);
    expect(tarjeta(r, "horas").valor).toBe("36,0");
    expect(tarjeta(r, "promedio")).toMatchObject({ valor: "6,0", nota: "6 días trabajados" });
    expect(nombresDeFilas(r.tabla.filas)).toEqual(["lun 12/10", "mar 13/10", "mié 14/10", "jue 15/10", "vie 16/10", "sáb 17/10"]);
    expect(filasDeColportor(r.tabla.filas).some((f) => f.nota !== null)).toBe(false);
  });

  it("un rango que es solo ese domingo no inventa un día: sin cifras y se dice", () => {
    const r = armarReporteDeRango(sinDomingo, ANA, { desde: DOMINGO, hasta: DOMINGO });
    expect(r.problemaDeRango).toBeNull();
    expect(tarjeta(r, "horas")).toMatchObject({ valor: "—", nota: "Sin datos en estos días" });
    expect(r.tabla.filas).toEqual([]);
  });
});
