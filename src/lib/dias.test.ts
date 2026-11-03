import { describe, expect, it } from "vitest";

import { diaConSemana, diasEntre, diaYMes, esDiaIso, hace, hoyEnMontevideo, lunesDe, sumarDias } from "@/lib/dias";

describe("días del calendario", () => {
  it("cuenta días corridos, también entre meses y años", () => {
    expect(diasEntre("2026-09-01", "2026-10-21")).toBe(50);
    expect(diasEntre("2026-12-30", "2027-01-02")).toBe(3);
    expect(diasEntre("2026-10-21", "2026-10-21")).toBe(0);
    expect(diasEntre("2026-10-21", "2026-10-20")).toBe(-1);
  });

  it("suma días sin que el horario de verano mueva el día", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("escribe el día como el diseño: «02/10» y «vie 02/10»", () => {
    expect(diaYMes("2026-10-02")).toBe("02/10");
    expect(diaConSemana("2026-10-02")).toBe("vie 02/10");
    expect(diaConSemana("2026-10-04")).toBe("dom 04/10");
  });

  it("el lunes de la semana es el mismo día si ya es lunes y el anterior si es domingo", () => {
    expect(lunesDe("2026-08-31")).toBe("2026-08-31");
    expect(lunesDe("2026-09-01")).toBe("2026-08-31");
    expect(lunesDe("2026-10-04")).toBe("2026-09-28");
  });

  it("dice «hoy», «ayer» y «hace N días»", () => {
    expect(hace(0)).toBe("hoy");
    expect(hace(1)).toBe("ayer");
    expect(hace(19)).toBe("hace 19 días");
    expect(hace(-3)).toBe("hoy");
  });

  it("hoy es el día de Montevideo, no el de UTC", () => {
    // 01:30 UTC del 22/10 son las 22:30 del 21/10 en Montevideo (UTC-3).
    expect(hoyEnMontevideo(new Date("2026-10-22T01:30:00Z"))).toBe("2026-10-21");
    expect(hoyEnMontevideo(new Date("2026-10-22T03:30:00Z"))).toBe("2026-10-22");
  });

  it("reconoce solo días reales AAAA-MM-DD", () => {
    expect(esDiaIso("2026-02-28")).toBe(true);
    expect(esDiaIso("2026-02-30")).toBe(false);
    expect(esDiaIso("2026-2-3")).toBe(false);
    expect(esDiaIso(20261021)).toBe(false);
  });
});
