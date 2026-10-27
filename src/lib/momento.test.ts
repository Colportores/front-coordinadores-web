import { describe, expect, it } from "vitest";

import { fechaYHoraEnMontevideo } from "./momento";

describe("fechaYHoraEnMontevideo", () => {
  it("escribe el día, el mes y la hora de Montevideo (UTC-3)", () => {
    expect(fechaYHoraEnMontevideo("2026-10-22T21:30:00Z")).toBe("22/10 a las 18:30");
  });

  it("pasa al día anterior cuando en UTC ya es el siguiente", () => {
    expect(fechaYHoraEnMontevideo("2026-10-23T01:05:00Z")).toBe("22/10 a las 22:05");
    expect(fechaYHoraEnMontevideo("2026-10-22T02:59:00Z")).toBe("21/10 a las 23:59");
  });

  it("rellena con cero el día, el mes, la hora y los minutos, y la medianoche es 00:00", () => {
    expect(fechaYHoraEnMontevideo("2026-02-05T03:07:00Z")).toBe("05/02 a las 00:07");
  });

  it("respeta el desfase con que venga la marca", () => {
    expect(fechaYHoraEnMontevideo("2026-10-22T18:30:00-03:00")).toBe("22/10 a las 18:30");
  });

  it("devuelve null si no hay fecha o no es una fecha", () => {
    expect(fechaYHoraEnMontevideo(null)).toBeNull();
    expect(fechaYHoraEnMontevideo("")).toBeNull();
    expect(fechaYHoraEnMontevideo("ayer")).toBeNull();
  });
});
