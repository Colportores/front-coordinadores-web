import { describe, expect, it } from "vitest";

import {
  CIFRA_SIN_DATOS,
  cifraDeDias,
  compararPeriodos,
  crearCalendario,
  formatearCifra,
  formatearDecimal,
  formatearEntero,
  periodosDe,
  serieDeColportor,
  serieSuma,
  sumarCifras,
  tendenciaDe,
  ultimoDatoAntesDe,
  type Cifra,
  type Serie,
} from "./calculo";

const constante = (valor: number): Serie => () => ({ valor, hayDatos: true });
const con = (valor: number): Cifra => ({ valor, hayDatos: true });

describe("crearCalendario", () => {
  it("cuenta los días de la campaña hasta hoy sin los domingos", () => {
    const cal = crearCalendario("2026-09-01", "2026-10-21");
    expect(cal.diasHabiles).toHaveLength(44);
    expect(cal.diasHabiles[0]).toBe("2026-09-01");
    expect(cal.diasHabiles.at(-1)).toBe("2026-10-21");
    expect(cal.diasHabiles).not.toContain("2026-09-06");
  });

  it("una campaña terminada llega hasta su último día, no hasta hoy", () => {
    const cal = crearCalendario("2026-09-01", "2026-10-21", "2026-09-30");
    expect(cal.diasHabiles.at(-1)).toBe("2026-09-30");
    expect(cal.hoy).toBe("2026-10-21");
    // ninguna semana ni mes está en curso: todo cerró
    for (const g of ["semana", "mes"] as const) expect(periodosDe(g, cal).some((p) => p.enCurso)).toBe(false);
    expect(compararPeriodos("semana", constante(5), cal)).toMatchObject({ rotulo: "S5" });
    expect(compararPeriodos("dia", constante(5), cal)?.rotulo).toBe("mié 30/09");
  });

  it("una campaña que todavía no empezó no tiene días", () => {
    expect(crearCalendario("2026-11-02", "2026-10-21").diasHabiles).toEqual([]);
  });
});

describe("periodosDe", () => {
  const cal = crearCalendario("2026-09-01", "2026-10-21");

  it("semanas: de lunes a domingo, contadas desde la semana en que empezó la campaña; la de hoy está en curso", () => {
    const semanas = periodosDe("semana", cal);
    expect(semanas).toHaveLength(8);
    expect(semanas[0]).toMatchObject({ rotulo: "S1", detalle: "31/08", enCurso: false });
    expect(semanas[0].dias).toHaveLength(5); // la campaña arrancó un martes
    expect(semanas[6]).toMatchObject({ rotulo: "S7", detalle: "12/10", enCurso: false });
    expect(semanas[7]).toMatchObject({ rotulo: "S8", detalle: "19/10", enCurso: true });
    expect(semanas[7].dias).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
  });

  it("días: los últimos 14 días de trabajo, con hoy en curso", () => {
    const dias = periodosDe("dia", cal);
    expect(dias).toHaveLength(14);
    expect(dias.at(-1)).toMatchObject({ rotulo: "21", detalle: "mié 21/10", enCurso: true });
    expect(dias.at(-2)).toMatchObject({ rotulo: "20", detalle: "mar 20/10", enCurso: false });
    // el domingo 18/10 no es un día de trabajo: el lunes 19 sigue al sábado 17
    expect(dias.map((d) => d.inicio)).not.toContain("2026-10-18");
  });

  it("meses: septiembre completo y octubre en curso", () => {
    const meses = periodosDe("mes", cal);
    expect(meses.map((m) => [m.rotulo, m.detalle, m.enCurso])).toEqual([
      ["Sep", "septiembre", false],
      ["Oct", "octubre", true],
    ]);
  });
});

describe("compararPeriodos", () => {
  const cal = crearCalendario("2026-09-01", "2026-10-21");

  it("semanas: la última semana completa (S7) contra la anterior (S6); la que está en curso no se usa", () => {
    const c = compararPeriodos("semana", constante(5), cal);
    expect(c).toMatchObject({ rotulo: "S7", contra: "contra S6" });
    expect(c?.actual).toEqual(con(30));
    expect(c?.base).toEqual(con(30));
  });

  it("días: ayer contra el día anterior", () => {
    const serie: Serie = (f) => con(f === "2026-10-20" ? 6 : 5);
    const c = compararPeriodos("dia", serie, cal);
    expect(c).toMatchObject({ rotulo: "ayer", contra: "contra el día anterior" });
    expect(c?.actual).toEqual(con(6));
    expect(c?.base).toEqual(con(5));
  });

  it("días: el día anterior a un lunes es el sábado (los domingos no se trabaja)", () => {
    const lunes = crearCalendario("2026-09-01", "2026-10-19");
    const serie: Serie = (f) => con(f === "2026-10-17" ? 8 : f === "2026-10-16" ? 4 : 1);
    const c = compararPeriodos("dia", serie, lunes);
    expect(c?.rotulo).toBe("ayer");
    expect(c?.actual).toEqual(con(8));
    expect(c?.base).toEqual(con(4));
  });

  it("días: hoy domingo, el último día completo es el sábado", () => {
    const domingo = crearCalendario("2026-09-01", "2026-10-18");
    const c = compararPeriodos("dia", constante(5), domingo);
    expect(c?.rotulo).toBe("ayer");
  });

  it("meses: el mes a la fecha contra el mes pasado hasta el mismo día, para que no salga siempre en baja", () => {
    // septiembre 5 h por día de trabajo, octubre 6: a la fecha son 18 días de cada lado
    const serie: Serie = (f) => con(f.startsWith("2026-10") ? 6 : 5);
    const c = compararPeriodos("mes", serie, cal);
    expect(c).toMatchObject({ rotulo: "oct. a la fecha", contra: "contra sep. a la misma fecha" });
    expect(c?.actual).toEqual(con(18 * 6));
    expect(c?.base).toEqual(con(18 * 5));
  });

  it("meses: un mes terminado se compara con el anterior entero", () => {
    const terminada = crearCalendario("2026-08-03", "2026-10-05", "2026-09-30");
    const c = compararPeriodos("mes", constante(5), terminada);
    expect(c).toMatchObject({ rotulo: "sep.", contra: "contra ago." });
    expect(c?.actual.valor).toBe(26 * 5);
    expect(c?.base?.valor).toBe(25 * 5);
  });

  it("sin período completo todavía no hay comparación; el primer mes se muestra sin período anterior", () => {
    const primerDia = crearCalendario("2026-10-21", "2026-10-21");
    expect(compararPeriodos("dia", constante(5), primerDia)).toBeNull();
    expect(compararPeriodos("semana", constante(5), primerDia)).toBeNull();
    const mes = compararPeriodos("mes", constante(5), primerDia);
    expect(mes).toMatchObject({ rotulo: "oct. a la fecha", contra: "", base: null });
  });

  it("una campaña que no empezó no compara nada", () => {
    const futura = crearCalendario("2026-11-02", "2026-10-21");
    for (const g of ["dia", "semana", "mes"] as const) expect(compararPeriodos(g, constante(5), futura)).toBeNull();
  });

  it("la segunda semana se compara con la primera, que está incompleta", () => {
    const cal2 = crearCalendario("2026-10-07", "2026-10-14"); // arrancó un miércoles; hoy es miércoles de la 2.ª semana
    const c = compararPeriodos("semana", constante(1), cal2);
    expect(c).toMatchObject({ rotulo: "S1", contra: "" });
  });
});

describe("tendenciaDe", () => {
  it("sube, baja o queda igual, redondeando al entero", () => {
    expect(tendenciaDe(con(110), con(100))).toMatchObject({ sentido: "sube", texto: "▲ 10%", textoAccesible: "subió 10 %" });
    expect(tendenciaDe(con(92), con(100))).toMatchObject({ sentido: "baja", texto: "▼ 8%", textoAccesible: "bajó 8 %" });
    expect(tendenciaDe(con(100.3), con(100))).toMatchObject({ sentido: "igual", texto: "= 0%", textoAccesible: "sin cambios" });
  });

  it("sin datos en alguna de las dos, o con el período anterior en 0, no hay tendencia", () => {
    expect(tendenciaDe(CIFRA_SIN_DATOS, con(100))).toBeNull();
    expect(tendenciaDe(con(100), CIFRA_SIN_DATOS)).toBeNull();
    expect(tendenciaDe(con(100), con(0))).toBeNull();
    expect(tendenciaDe(con(100), null)).toBeNull();
  });

  it("un colportor que no trabajó (0 horas con datos) baja un 100 %", () => {
    expect(tendenciaDe(con(0), con(8))?.texto).toBe("▼ 100%");
  });
});

describe("sumas", () => {
  it("suma solo los días con datos; si ninguno tiene, el resultado es «sin datos», no 0", () => {
    expect(sumarCifras([con(2), CIFRA_SIN_DATOS, con(3)])).toEqual(con(5));
    expect(sumarCifras([CIFRA_SIN_DATOS, CIFRA_SIN_DATOS])).toEqual(CIFRA_SIN_DATOS);
    expect(sumarCifras([])).toEqual(CIFRA_SIN_DATOS);
  });

  it("un día con 0 horas es un dato (trabajó 0), distinto de un día sin dato", () => {
    const serie = serieDeColportor({ horasPorDia: { "2026-10-20": 0 } });
    expect(serie("2026-10-20")).toEqual(con(0));
    expect(serie("2026-10-21")).toEqual(CIFRA_SIN_DATOS);
  });

  it("la serie de varios colportores suma a los que tienen datos ese día", () => {
    const a = serieDeColportor({ horasPorDia: { "2026-10-20": 4 } });
    const b = serieDeColportor({ horasPorDia: { "2026-10-20": 3.5, "2026-10-19": 2 } });
    const juntas = serieSuma([a, b]);
    expect(juntas("2026-10-20")).toEqual(con(7.5));
    expect(juntas("2026-10-19")).toEqual(con(2));
    expect(juntas("2026-10-18")).toEqual(CIFRA_SIN_DATOS);
    expect(cifraDeDias(juntas, ["2026-10-19", "2026-10-20"])).toEqual(con(9.5));
  });

  it("encuentra el último día con datos antes de una fecha", () => {
    const c = { horasPorDia: { "2026-10-15": 3, "2026-10-17": 4, "2026-10-20": 5 } };
    expect(ultimoDatoAntesDe(c, "2026-10-20")).toBe("2026-10-17");
    expect(ultimoDatoAntesDe(c, "2026-10-15")).toBeNull();
  });
});

describe("formato", () => {
  it("miles con punto y decimales con coma", () => {
    expect(formatearEntero(1450)).toBe("1.450");
    expect(formatearEntero(1234567.4)).toBe("1.234.567");
    expect(formatearEntero(0)).toBe("0");
    expect(formatearDecimal(27.44)).toBe("27,4");
  });

  it("«—» sin datos; entera en los totales y con un decimal en un colportor", () => {
    expect(formatearCifra(CIFRA_SIN_DATOS, true)).toBe("—");
    expect(formatearCifra(con(180.4), true)).toBe("180");
    expect(formatearCifra(con(27.44), false)).toBe("27,4");
    expect(formatearCifra(con(0), false)).toBe("0,0");
  });
});
