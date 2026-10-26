import { describe, expect, it } from "vitest";

import type { CampaniaElegible } from "@/datos/shell/contrato";
import { fechaConAnio, fechaCorta, textoDeFechas, textoDelBoton } from "@/shell/campanias-texto";

const base: CampaniaElegible = {
  id: "c",
  nombre: "N",
  ciudades: [],
  fechaInicio: "2026-09-15",
  fechaFin: "2026-12-15",
  estado: "en-curso",
};

describe("fechas de la lista de campañas (vista 37)", () => {
  it("dd/mm y dd/mm/aaaa a partir de un día AAAA-MM-DD, sin pasar por una zona horaria", () => {
    expect(fechaCorta("2026-09-05")).toBe("05/09");
    expect(fechaConAnio("2027-01-04")).toBe("04/01/2027");
  });

  it("lo que no es un día se muestra tal cual en vez de inventar una fecha", () => {
    expect(fechaCorta("mañana")).toBe("mañana");
    expect(fechaConAnio("")).toBe("");
  });

  it("en curso: «15/09 – 15/12 · en curso»", () => {
    expect(textoDeFechas(base)).toBe("15/09 – 15/12 · en curso");
  });

  it("en curso sin fin: «desde el 15/09 · en curso»", () => {
    expect(textoDeFechas({ ...base, fechaFin: null })).toBe("desde el 15/09 · en curso");
  });

  it("por empezar: «empieza el 04/01/2027», con el año", () => {
    expect(textoDeFechas({ ...base, estado: "por-empezar", fechaInicio: "2027-01-04", fechaFin: null })).toBe("empieza el 04/01/2027");
  });
});

describe("textoDelBoton", () => {
  it("«<ciudades> · <campaña>», o solo la campaña si todavía no tiene ciudades", () => {
    expect(textoDelBoton("Montevideo · Las Piedras", "Primavera 2026")).toBe("Montevideo · Las Piedras · Primavera 2026");
    expect(textoDelBoton("", "Sin campaña")).toBe("Sin campaña");
  });
});
