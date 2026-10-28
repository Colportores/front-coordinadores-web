import { describe, expect, it } from "vitest";

import { CARRERAS_SIMULADAS, crearBecasSimuladas } from "@/datos/equipo/becas-simuladas";
import type { BecaDeColportor } from "@/datos/equipo/contrato";
import { logroDeBeca, mayorLogro } from "@/datos/equipo/logro-de-beca";

const SISTEMAS = { id: "sis", nombre: "Ingeniería en Sistemas", elegidaEl: "2026-09-01" };

function beca(cambios: Partial<BecaDeColportor>): BecaDeColportor {
  return { carrera: SISTEMAS, apuntaA: "completa", meta: { libros: 240, monto: 360000 }, avance: { libros: 10, monto: 1000 }, ...cambios };
}

describe("mayorLogro", () => {
  it("elige la meta más alta y ninguna es null", () => {
    expect(mayorLogro(null, null)).toBeNull();
    expect(mayorLogro(undefined, undefined)).toBeNull();
    expect(mayorLogro("media", null)).toBe("media");
    expect(mayorLogro(null, "completa")).toBe("completa");
    expect(mayorLogro("media", "completa")).toBe("completa");
    expect(mayorLogro("completa", "media")).toBe("completa");
  });
});

describe("logroDeBeca", () => {
  it("con tipo, sale de comparar lo que lleva con las metas de la carrera", () => {
    expect(logroDeBeca(beca({ avance: { libros: 119, monto: 0 } }), CARRERAS_SIMULADAS)).toBeNull();
    expect(logroDeBeca(beca({ avance: { libros: 120, monto: 0 } }), CARRERAS_SIMULADAS)).toBe("media");
    expect(logroDeBeca(beca({ avance: { libros: 240, monto: 0 } }), CARRERAS_SIMULADAS)).toBe("completa");
  });

  it("sin tipo y sin marca del servidor no hay logro, aunque lleve más que la meta: nunca se le asignó", () => {
    expect(logroDeBeca(beca({ apuntaA: null, meta: null, avance: { libros: 500, monto: 0 } }), CARRERAS_SIMULADAS)).toBeNull();
  });

  it("sin tipo, la marca del servidor sigue valiendo (lo alcanzado no se pierde)", () => {
    expect(logroDeBeca(beca({ apuntaA: null, meta: null, alcanzada: "completa", avance: { libros: 250, monto: 0 } }), CARRERAS_SIMULADAS)).toBe("completa");
  });

  it("la marca del servidor gana si es más alta que lo que se calcula, y al revés", () => {
    expect(logroDeBeca(beca({ apuntaA: "media", alcanzada: "completa", avance: { libros: 130, monto: 0 } }), CARRERAS_SIMULADAS)).toBe("completa");
    expect(logroDeBeca(beca({ alcanzada: "media", avance: { libros: 250, monto: 0 } }), CARRERAS_SIMULADAS)).toBe("completa");
  });

  it("sin carrera no hay logro", () => {
    expect(logroDeBeca(beca({ carrera: null, apuntaA: null, meta: null, alcanzada: "media" }), CARRERAS_SIMULADAS)).toBeNull();
  });

  it("una carrera con la meta sin cargar no da logro por el catálogo", () => {
    const sinMeta = [{ id: "sis", nombre: "Ingeniería en Sistemas", metaMedia: null, metaCompleta: null }];
    expect(logroDeBeca(beca({ meta: null, avance: { libros: 1000, monto: 0 } }), sinMeta)).toBeNull();
  });
});

describe("la fuente simulada y «Logro beca»", () => {
  const GENTE = [{ id: "emi", nombre: "Emiliano Sosa" }];

  // Metas bajas: Emiliano (30 a 84 libros) ya pasó la completa de Sistemas.
  const METAS_BAJAS = [{ id: "sis", nombre: "Ingeniería en Sistemas", metaMedia: { libros: 10, monto: 15000 }, metaCompleta: { libros: 20, monto: 30000 } }];

  it("al pasar a «Sin beca» a quien ya alcanzó la completa, la base devuelve la marca y el avance no cambia", () => {
    const becas = crearBecasSimuladas(GENTE, "2026-10-21", METAS_BAJAS);
    const antes = becas.datos().porColportor.emi.avance;

    const respuesta = becas.asignarTipoDeBeca("emi", null);

    expect(respuesta.ok && respuesta.beca).toMatchObject({ apuntaA: null, meta: null, alcanzada: "completa", avance: antes });
    expect(becas.datos().porColportor.emi.alcanzada).toBe("completa");
  });

  it("la marca no baja: volver a apuntar a media después no la quita", () => {
    const becas = crearBecasSimuladas(GENTE, "2026-10-21", METAS_BAJAS);
    becas.asignarTipoDeBeca("emi", null);

    const respuesta = becas.asignarTipoDeBeca("emi", "media");

    expect(respuesta.ok && respuesta.beca).toMatchObject({ apuntaA: "media", alcanzada: "completa" });
  });

  it("sin nada alcanzado, «Sin beca» no deja ninguna marca", () => {
    const becas = crearBecasSimuladas(GENTE, "2026-10-21");
    const respuesta = becas.asignarTipoDeBeca("emi", null);

    expect(respuesta.ok && respuesta.beca.alcanzada).toBeFalsy();
  });
});

describe("la fuente simulada y «Beca perman.»", () => {
  const GENTE = [{ id: "emi", nombre: "Emiliano Sosa" }];

  it("en una campaña permanente todos arrancan sin beca y la base rechaza cualquier tipo", () => {
    const becas = crearBecasSimuladas(GENTE, "2026-10-21", undefined, { permanente: true });

    expect(becas.datos().porColportor.emi).toMatchObject({ apuntaA: null, meta: null });
    expect(becas.asignarTipoDeBeca("emi", "media")).toEqual({ ok: false, mensaje: "En una campaña permanente no hay becas." });
    expect(becas.asignarTipoDeBeca("emi", null).ok).toBe(true);
  });
});
