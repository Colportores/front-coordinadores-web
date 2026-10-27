import { describe, expect, it } from "vitest";

import { fechaYHoraEnMontevideo } from "./momento";

const AHORA = new Date("2026-10-27T15:00:00Z");

describe("fechaYHoraEnMontevideo", () => {
  it("escribe el día, el mes y la hora de Montevideo (UTC-3)", () => {
    expect(fechaYHoraEnMontevideo("2026-10-22T21:30:00Z", AHORA)).toBe("22/10 a las 18:30");
  });

  it("pasa al día anterior cuando en UTC ya es el siguiente", () => {
    expect(fechaYHoraEnMontevideo("2026-10-23T01:05:00Z", AHORA)).toBe("22/10 a las 22:05");
    expect(fechaYHoraEnMontevideo("2026-10-22T02:59:00Z", AHORA)).toBe("21/10 a las 23:59");
  });

  it("rellena con cero el día, el mes, la hora y los minutos, y la medianoche es 00:00", () => {
    expect(fechaYHoraEnMontevideo("2026-02-05T03:07:00Z", AHORA)).toBe("05/02 a las 00:07");
  });

  it("respeta el desfase con que venga la marca", () => {
    expect(fechaYHoraEnMontevideo("2026-10-22T18:30:00-03:00", AHORA)).toBe("22/10 a las 18:30");
  });

  it("si el dato no es del año en curso, la fecha lleva el año", () => {
    expect(fechaYHoraEnMontevideo("2025-12-31T21:30:00Z", AHORA)).toBe("31/12/2025 a las 18:30");
    expect(fechaYHoraEnMontevideo("2027-01-02T03:04:00Z", AHORA)).toBe("02/01/2027 a las 00:04");
  });

  it("el año se cuenta en Montevideo, no en UTC", () => {
    // 01/01/2027 02:00 UTC es todavía el 31/12/2026 23:00 en Montevideo: del año en curso.
    expect(fechaYHoraEnMontevideo("2027-01-01T02:00:00Z", new Date("2026-06-01T12:00:00Z"))).toBe("31/12 a las 23:00");
    // Y "ahora" también: a las 01:00 UTC del 01/01/2027 en Montevideo todavía es 2026.
    expect(fechaYHoraEnMontevideo("2026-12-30T12:00:00Z", new Date("2027-01-01T01:00:00Z"))).toBe("30/12 a las 09:00");
    expect(fechaYHoraEnMontevideo("2026-12-30T12:00:00Z", new Date("2027-01-01T03:00:00Z"))).toBe("30/12/2026 a las 09:00");
  });

  it("devuelve null si no hay fecha o no es una fecha", () => {
    expect(fechaYHoraEnMontevideo(null)).toBeNull();
    expect(fechaYHoraEnMontevideo("")).toBeNull();
    expect(fechaYHoraEnMontevideo("ayer")).toBeNull();
  });
});
