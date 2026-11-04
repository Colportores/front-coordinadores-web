import { describe, expect, it } from "vitest";

import type { CasaDeCiudad, EstadoDeCasa } from "@/datos/equipo/zonas";
import {
  contarPorEstado,
  decidirAgrupado,
  ESTADOS_VISUALES,
  estadoVisual,
  horaEnMontevideo,
  MAX_CASAS_SIN_AGRUPAR,
  sinOcultas,
  textoDeTipo,
  textoTotalDeCasas,
} from "@/features/equipo/zonas/casas/estados";

const casa = (n: number, estado: EstadoDeCasa = "SIN_VISITA", lon = -56.26, lat = -34.87): CasaDeCiudad => ({
  id: `c${n}`,
  lon,
  lat,
  tipo: "CASA",
  estado,
  zonaIds: ["z"],
});

describe("estados de la casa", () => {
  it("son los ocho del canvas, en el orden de la leyenda, con círculo para la visita y cuadrado para la venta y el cobro", () => {
    expect(ESTADOS_VISUALES.map((e) => [e.nombre, e.forma, e.glifo])).toEqual([
      ["Sin visita", "circulo", ""],
      ["No contestó", "circulo", "–"],
      ["Entrevista agendada", "circulo", "◷"],
      ["Entrevista hecha", "circulo", "✓"],
      ["Rechazó", "circulo", "✕"],
      ["Cobranza pendiente", "cuadrado", "$"],
      ["Entrega y pago", "cuadrado", "⇢"],
      ["Venta completa", "cuadrado", "★"],
    ]);
  });

  it("ninguno se distingue solo por el color: dos estados nunca comparten forma y glifo", () => {
    const firmas = ESTADOS_VISUALES.map((e) => `${e.forma}${e.glifo}`);
    expect(new Set(firmas).size).toBe(ESTADOS_VISUALES.length);
  });

  it("estadoVisual encuentra cada clave y el tipo se escribe en español", () => {
    for (const e of ESTADOS_VISUALES) expect(estadoVisual(e.clave)).toBe(e);
    expect([textoDeTipo("CASA"), textoDeTipo("NEGOCIO"), textoDeTipo("EDIFICIO")]).toEqual(["Casa", "Negocio", "Edificio"]);
  });
});

describe("conteo, filtro y total", () => {
  const casas = [casa(1, "RECHAZO"), casa(2, "RECHAZO"), casa(3, "VENTA_COMPLETA"), casa(4)];

  it("cuenta por estado, con cero en los que no tienen casas", () => {
    expect(contarPorEstado(casas)).toEqual({
      SIN_VISITA: 1,
      SIN_CONTESTAR: 0,
      ENTREVISTA_PROGRAMADA: 0,
      ENTREVISTA_SIN_VENTA: 0,
      RECHAZO: 2,
      COBRANZA_PENDIENTE: 0,
      ENTREGA_Y_COBRANZA_PENDIENTE: 0,
      VENTA_COMPLETA: 1,
    });
    expect(Object.values(contarPorEstado([])).every((n) => n === 0)).toBe(true);
  });

  it("sinOcultas saca los estados destildados y sin destildar devuelve todas", () => {
    expect(sinOcultas(casas, new Set()).map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(sinOcultas(casas, new Set<EstadoDeCasa>(["RECHAZO", "SIN_VISITA"])).map((c) => c.id)).toEqual(["c3"]);
    expect(sinOcultas(casas, new Set(ESTADOS_VISUALES.map((e) => e.clave)))).toEqual([]);
  });

  it("el total dice «N casas» y, con estados destildados, «M de N casas»; una sola es «1 casa»", () => {
    expect(textoTotalDeCasas(150, 150)).toBe("150 casas");
    expect(textoTotalDeCasas(150, 26)).toBe("26 de 150 casas");
    expect(textoTotalDeCasas(150, 0)).toBe("0 de 150 casas");
    expect(textoTotalDeCasas(1, 1)).toBe("1 casa");
    expect(textoTotalDeCasas(0, 0)).toBe("0 casas");
  });

  it("la hora se escribe en Montevideo (UTC-3), con dos dígitos", () => {
    expect(horaEnMontevideo(new Date("2026-11-04T17:20:00Z"))).toBe("14:20");
    expect(horaEnMontevideo(new Date("2026-11-04T03:05:00Z"))).toBe("00:05");
  });
});

describe("agrupar los puntos (regla R2: más de 200 a la vista)", () => {
  const muchas = (n: number, lon = -56.26) => Array.from({ length: n }, (_, i) => casa(i, "SIN_VISITA", lon, -34.87));

  it("con 200 a la vista van de a una y con 201 se agrupan", () => {
    expect(decidirAgrupado(muchas(MAX_CASAS_SIN_AGRUPAR), null).agrupar).toBe(false);
    expect(decidirAgrupado(muchas(MAX_CASAS_SIN_AGRUPAR + 1), null).agrupar).toBe(true);
  });

  it("cuenta solo lo que está dentro de lo que se ve: al acercar, vuelven los puntos", () => {
    const afuera = muchas(150, -50);
    const adentro = muchas(150, -56.26);
    const lejos = { oeste: -60, sur: -36, este: -49, norte: -34 };
    const cerca = { oeste: -56.3, sur: -34.9, este: -56.2, norte: -34.8 };

    expect(decidirAgrupado([...afuera, ...adentro], lejos).agrupar).toBe(true);
    const acercado = decidirAgrupado([...afuera, ...adentro], cerca);
    expect(acercado.agrupar).toBe(false);
    expect(acercado.visibles).toHaveLength(150);
  });

  it("el borde de la caja cuenta como adentro", () => {
    const caja = { oeste: -56.26, sur: -34.87, este: -56.26, norte: -34.87 };
    expect(decidirAgrupado([casa(1)], caja).visibles).toHaveLength(1);
  });
});
