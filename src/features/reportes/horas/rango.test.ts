import { describe, expect, it } from "vitest";

import { crearCalendario } from "./calculo";
import { diasDelRango, limitesDelRango, rangoInicial, textoDelRango, validarRango } from "./rango";

const limites = { primero: "2026-10-05", ultimo: "2026-10-21" };

describe("limitesDelRango", () => {
  it("va del primer día de la campaña a hoy", () => {
    expect(limitesDelRango({ inicioCampania: "2026-10-05", finCampania: null, hoy: "2026-10-21" })).toEqual(limites);
  });

  it("una campaña con fin futuro llega hasta hoy; una terminada, hasta su último día", () => {
    expect(limitesDelRango({ inicioCampania: "2026-10-05", finCampania: "2026-11-30", hoy: "2026-10-21" }).ultimo).toBe("2026-10-21");
    expect(limitesDelRango({ inicioCampania: "2026-10-05", finCampania: "2026-10-15", hoy: "2026-10-21" }).ultimo).toBe("2026-10-15");
  });
});

describe("rangoInicial", () => {
  it("es el mes del último día con datos, hasta ese día", () => {
    expect(rangoInicial({ primero: "2026-09-01", ultimo: "2026-10-21" })).toEqual({ desde: "2026-10-01", hasta: "2026-10-21" });
  });

  it("nunca arranca antes del primer día de la campaña", () => {
    expect(rangoInicial(limites)).toEqual({ desde: "2026-10-05", hasta: "2026-10-21" });
  });

  it("una campaña que empieza hoy da un rango de un día", () => {
    expect(rangoInicial({ primero: "2026-10-21", ultimo: "2026-10-21" })).toEqual({ desde: "2026-10-21", hasta: "2026-10-21" });
  });
});

describe("validarRango", () => {
  it("acepta un rango dentro de la campaña, también de un solo día y con los bordes", () => {
    expect(validarRango("2026-10-12", "2026-10-17", limites)).toEqual({ ok: true, rango: { desde: "2026-10-12", hasta: "2026-10-17" } });
    expect(validarRango("2026-10-12", "2026-10-12", limites).ok).toBe(true);
    expect(validarRango("2026-10-05", "2026-10-21", limites).ok).toBe(true);
  });

  it("pide completar las dos fechas si falta alguna o no es una fecha", () => {
    for (const [desde, hasta] of [["", "2026-10-17"], ["2026-10-12", ""], ["", ""], ["2026-13-45", "2026-10-17"], ["12/10/2026", "2026-10-17"]]) {
      const r = validarRango(desde, hasta, limites);
      expect(r).toMatchObject({ ok: false, problema: "falta" });
    }
  });

  it("dice qué fechas están al revés y qué hacer", () => {
    const r = validarRango("2026-10-17", "2026-10-12", limites);
    expect(r).toEqual({
      ok: false,
      problema: "al-reves",
      texto: "La fecha «desde» (17/10/2026) es posterior a «hasta» (12/10/2026). Cambiá una de las dos para ver el reporte.",
    });
  });

  it("rechaza lo que cae antes de la campaña o después del último día con datos, y dice los límites", () => {
    const texto = "El rango tiene que estar dentro de la campaña, del 05/10/2026 al 21/10/2026. Corregí las fechas para ver el reporte.";
    expect(validarRango("2026-10-01", "2026-10-10", limites)).toEqual({ ok: false, problema: "fuera-de-la-campania", texto });
    expect(validarRango("2026-10-10", "2026-10-22", limites)).toEqual({ ok: false, problema: "fuera-de-la-campania", texto });
  });
});

describe("diasDelRango", () => {
  const calendario = crearCalendario("2026-10-05", "2026-10-21");

  it("deja los días de trabajo del rango, sin domingos", () => {
    expect(diasDelRango(calendario, { desde: "2026-10-16", hasta: "2026-10-20" })).toEqual(["2026-10-16", "2026-10-17", "2026-10-19", "2026-10-20"]);
  });

  it("un rango que es solo un domingo no tiene días", () => {
    expect(diasDelRango(calendario, { desde: "2026-10-18", hasta: "2026-10-18" })).toEqual([]);
  });
});

describe("textoDelRango", () => {
  it("dice las dos fechas con el año", () => {
    expect(textoDelRango({ desde: "2026-05-01", hasta: "2026-05-31" })).toBe("del 01/05/2026 al 31/05/2026");
  });
});
