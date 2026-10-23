import { describe, expect, it } from "vitest";

import {
  diaAnterior,
  diaEnMontevideo,
  esDiaValido,
  instanteDeRetiro,
  instanteHaceDias,
  textoFechaDeTicket,
} from "@/datos/cuentas/fechas";

// 22/10/2026 12:00 en Montevideo (UTC-3).
const AHORA = "2026-10-22T15:00:00.000Z";

describe("textoFechaDeTicket", () => {
  it("dice «hoy» con la hora de Montevideo", () => {
    expect(textoFechaDeTicket("2026-10-22T12:15:00.000Z", AHORA)).toBe("hoy 09:15");
  });

  it("dice «ayer» con la hora de Montevideo", () => {
    expect(textoFechaDeTicket("2026-10-21T21:30:00.000Z", AHORA)).toBe("ayer 18:30");
  });

  it("antes de ayer muestra día/mes", () => {
    expect(textoFechaDeTicket("2026-10-09T19:00:00.000Z", AHORA)).toBe("09/10");
  });

  it("el día lo marca Montevideo, no UTC: la 01:00 UTC del 23 sigue siendo el 22", () => {
    expect(textoFechaDeTicket("2026-10-23T01:00:00.000Z", AHORA)).toBe("hoy 22:00");
  });

  it("con un instante ilegible muestra un guion largo, nunca NaN", () => {
    expect(textoFechaDeTicket("no es una fecha", AHORA)).toBe("—");
  });
});

describe("días", () => {
  it("diaEnMontevideo devuelve AAAA-MM-DD o null", () => {
    expect(diaEnMontevideo(AHORA)).toBe("2026-10-22");
    expect(diaEnMontevideo("2026-01-01T01:00:00.000Z")).toBe("2025-12-31");
    expect(diaEnMontevideo("basura")).toBeNull();
  });

  it("diaAnterior cruza el mes y el año", () => {
    expect(diaAnterior("2026-03-01")).toBe("2026-02-28");
    expect(diaAnterior("2026-01-01")).toBe("2025-12-31");
  });

  it("esDiaValido rechaza lo que el calendario no conoce", () => {
    expect(esDiaValido("2026-10-22")).toBe(true);
    expect(esDiaValido("2026-04-31")).toBe(false);
    expect(esDiaValido("22/10/2026")).toBe(false);
    expect(esDiaValido("")).toBe(false);
  });

  it("instanteDeRetiro usa ahora si es hoy y el mediodía si es otro día", () => {
    expect(instanteDeRetiro("2026-10-22", AHORA)).toBe(AHORA);
    expect(instanteDeRetiro("2026-10-20", AHORA)).toBe("2026-10-20T12:00:00-03:00");
    expect(textoFechaDeTicket(instanteDeRetiro("2026-10-20", AHORA), AHORA)).toBe("20/10");
  });

  it("instanteHaceDias cuenta días de Montevideo hacia atrás", () => {
    expect(instanteHaceDias(AHORA, 0, 9, 15)).toBe("2026-10-22T09:15:00-03:00");
    expect(instanteHaceDias(AHORA, 1, 18, 30)).toBe("2026-10-21T18:30:00-03:00");
    expect(textoFechaDeTicket(instanteHaceDias(AHORA, 1, 18, 30), AHORA)).toBe("ayer 18:30");
  });
});
