import { describe, expect, it } from "vitest";

import {
  diaDeSemana,
  diaDelMes,
  diasEntre,
  diaYMes,
  lunesDe,
  mesAbreviado,
  nombreDelDia,
  nombreDelMes,
  numeroDeMes,
  rotuloDelMes,
  sumarDias,
} from "./fechas";

describe("fechas de calendario", () => {
  it("suma días cruzando meses, años y años bisiestos", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("cuenta los días entre dos fechas, también con el cambio de hora de por medio", () => {
    expect(diasEntre("2026-08-31", "2026-10-21")).toBe(51);
    expect(diasEntre("2026-10-21", "2026-10-21")).toBe(0);
    expect(diasEntre("2026-10-21", "2026-10-19")).toBe(-2);
  });

  it("día de la semana y lunes de la semana (las semanas van de lunes a domingo)", () => {
    expect(diaDeSemana("2026-10-18")).toBe(0); // domingo
    expect(diaDeSemana("2026-10-21")).toBe(3); // miércoles
    expect(lunesDe("2026-10-21")).toBe("2026-10-19");
    expect(lunesDe("2026-10-18")).toBe("2026-10-12"); // el domingo cierra la semana anterior
    expect(lunesDe("2026-10-19")).toBe("2026-10-19");
  });

  it("nombres y rótulos en español", () => {
    expect(nombreDelDia("2026-10-20")).toBe("mar");
    expect(diaYMes("2026-10-05")).toBe("05/10");
    expect(diaDelMes("2026-10-05")).toBe(5);
    const oct = numeroDeMes("2026-10-21");
    expect(nombreDelMes(oct)).toBe("octubre");
    expect(rotuloDelMes(oct)).toBe("Oct");
    expect(mesAbreviado(oct)).toBe("oct.");
    expect(mesAbreviado(numeroDeMes("2026-09-01"))).toBe("sep.");
    // diciembre y enero son meses seguidos aunque cambie el año
    expect(numeroDeMes("2027-01-05") - numeroDeMes("2026-12-31")).toBe(1);
    expect(nombreDelMes(numeroDeMes("2027-01-05"))).toBe("enero");
  });
});
