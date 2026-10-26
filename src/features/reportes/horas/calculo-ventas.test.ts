import { describe, expect, it } from "vitest";

import {
  CIFRA_SIN_DATOS,
  cifraDeDias,
  compararCon,
  crearCalendario,
  formatearCifra,
  porCobrarDe,
  serieDeColportor,
  serieSuma,
  tendenciaDe,
  tendenciaEnPuntos,
  type Cifra,
} from "./calculo";

const con = (valor: number): Cifra => ({ valor, hayDatos: true });

const colportor = {
  horasPorDia: { "2026-10-19": 6 },
  ventasPorDia: {
    "2026-10-19": { presentaciones: 5, ventas: 2, monto: 4000, cobrado: 3000 },
    "2026-10-20": { presentaciones: 0, ventas: 0, monto: 0, cobrado: null },
  },
};

describe("serieDeColportor · presentaciones, ventas, monto y cobrado", () => {
  it("cada medida sale de su campo del día", () => {
    expect(serieDeColportor(colportor, "presentaciones")("2026-10-19")).toEqual(con(5));
    expect(serieDeColportor(colportor, "ventas")("2026-10-19")).toEqual(con(2));
    expect(serieDeColportor(colportor, "monto")("2026-10-19")).toEqual(con(4000));
    expect(serieDeColportor(colportor, "cobrado")("2026-10-19")).toEqual(con(3000));
    expect(serieDeColportor(colportor)("2026-10-19")).toEqual(con(6)); // por omisión, horas
  });

  it("un día sin registro es «sin datos»; un día con 0 es un dato", () => {
    expect(serieDeColportor(colportor, "ventas")("2026-10-21")).toEqual(CIFRA_SIN_DATOS);
    expect(serieDeColportor(colportor, "ventas")("2026-10-20")).toEqual(con(0));
  });

  it("lo cobrado todavía sin conectar (null) es «sin datos», no 0 $U cobrados", () => {
    expect(serieDeColportor(colportor, "cobrado")("2026-10-20")).toEqual(CIFRA_SIN_DATOS);
  });

  it("un colportor sin ventas (solo horas) no tiene ninguna cifra de ventas", () => {
    const soloHoras = { horasPorDia: { "2026-10-19": 6 } };
    expect(serieDeColportor(soloHoras, "ventas")("2026-10-19")).toEqual(CIFRA_SIN_DATOS);
  });

  it("varios colportores suman solo a quienes tienen datos ese día", () => {
    const otro = { horasPorDia: {}, ventasPorDia: { "2026-10-19": { presentaciones: 3, ventas: 1, monto: 1000, cobrado: 1000 } } };
    const juntas = serieSuma([serieDeColportor(colportor, "monto"), serieDeColportor(otro, "monto")]);
    expect(juntas("2026-10-19")).toEqual(con(5000));
    expect(cifraDeDias(juntas, ["2026-10-19", "2026-10-20", "2026-10-21"])).toEqual(con(5000));
  });
});

describe("porCobrarDe", () => {
  it("es la porción de lo vendido que no se cobró, redondeada", () => {
    expect(porCobrarDe(con(40000), con(30000))).toEqual(con(25)); // el ejemplo de la HU: Artigas
    expect(porCobrarDe(con(33800), con(19600))).toEqual(con(42));
    expect(porCobrarDe(con(1000), con(1000))).toEqual(con(0));
    expect(porCobrarDe(con(1000), con(0))).toEqual(con(100));
  });

  it("sin monto o sin lo cobrado no hay porcentaje", () => {
    expect(porCobrarDe(CIFRA_SIN_DATOS, con(10))).toEqual(CIFRA_SIN_DATOS);
    expect(porCobrarDe(con(10), CIFRA_SIN_DATOS)).toEqual(CIFRA_SIN_DATOS);
  });

  it("si no se vendió nada no hay nada por cobrar; si se cobró de más no da negativo", () => {
    expect(porCobrarDe(con(0), con(0))).toEqual(con(0));
    expect(porCobrarDe(con(1000), con(1500))).toEqual(con(0));
  });
});

describe("tendenciaEnPuntos", () => {
  it("sube, baja o queda igual, en puntos, y dice qué significa para quien lo escucha", () => {
    expect(tendenciaEnPuntos(con(38), con(20))).toEqual({
      sentido: "sube",
      texto: "▲ 18 pts",
      textoAccesible: "hay 18 puntos más por cobrar",
    });
    expect(tendenciaEnPuntos(con(10), con(16))).toEqual({
      sentido: "baja",
      texto: "▼ 6 pts",
      textoAccesible: "hay 6 puntos menos por cobrar",
    });
    expect(tendenciaEnPuntos(con(5), con(5))).toEqual({ sentido: "igual", texto: "= 0 pts", textoAccesible: "sin cambios" });
  });

  it("un solo punto va en singular", () => {
    expect(tendenciaEnPuntos(con(6), con(5))?.textoAccesible).toBe("hay 1 punto más por cobrar");
    expect(tendenciaEnPuntos(con(5), con(6))?.textoAccesible).toBe("hay 1 punto menos por cobrar");
  });

  it("sin datos en alguna de las dos, o sin período anterior, no hay tendencia; con base en 0 % sí (son puntos)", () => {
    expect(tendenciaEnPuntos(CIFRA_SIN_DATOS, con(10))).toBeNull();
    expect(tendenciaEnPuntos(con(10), CIFRA_SIN_DATOS)).toBeNull();
    expect(tendenciaEnPuntos(con(10), null)).toBeNull();
    expect(tendenciaEnPuntos(con(10), con(0))?.texto).toBe("▲ 10 pts");
  });
});

describe("tendenciaDe con ventas", () => {
  it("de 0 ventas a algo no se puede dar un porcentaje; de algo a 0 baja un 100 %", () => {
    expect(tendenciaDe(con(5), con(0))).toBeNull();
    expect(tendenciaDe(con(0), con(5))?.texto).toBe("▼ 100%");
  });
});

describe("formatearCifra por medida", () => {
  it("presentaciones y ventas van enteras, con miles; el monto en $U; el % por cobrar con el signo", () => {
    expect(formatearCifra(con(1462), true, "ventas")).toBe("1.462");
    expect(formatearCifra(con(653), false, "presentaciones")).toBe("653");
    expect(formatearCifra(con(3633950), true, "monto")).toBe("$U 3.633.950");
    expect(formatearCifra(con(0), false, "monto")).toBe("$U 0");
    expect(formatearCifra(con(38), true, "porCobrar")).toBe("38%");
  });

  it("sin datos es «—» en todas", () => {
    for (const medida of ["horas", "presentaciones", "ventas", "monto", "porCobrar"] as const) {
      expect(formatearCifra(CIFRA_SIN_DATOS, true, medida)).toBe("—");
    }
  });
});

describe("compararCon", () => {
  const cal = crearCalendario("2026-10-05", "2026-10-21");

  it("compara con cualquier forma de juntar los días, no solo con una suma", () => {
    // el % por cobrar de la semana: monto 600, cobrado 300 → 50 %, sin importar cuántos días tenga
    const c = compararCon("semana", (dias) => porCobrarDe(con(100 * dias.length), con(50 * dias.length)), cal);
    expect(c).toMatchObject({ rotulo: "S2", contra: "contra S1" });
    expect(c?.actual).toEqual(con(50));
    expect(c?.base).toEqual(con(50));
  });

  it("en «días» el período es un solo día", () => {
    const vistos: string[][] = [];
    compararCon("dia", (dias) => (vistos.push(dias), con(1)), cal);
    expect(vistos).toEqual([["2026-10-20"], ["2026-10-19"]]);
  });
});
