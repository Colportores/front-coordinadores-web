import { describe, expect, it } from "vitest";

import type { BecaDeColportor } from "@/datos/equipo/contrato";

import { estadoDeBeca } from "./becas-tabla";
import { becasDePrueba, datosDePrueba } from "./datos-de-prueba";
import {
  avanceDeBeca,
  avisoDeSinBeca,
  esCampaniaPermanente,
  TEXTO_SIN_BECAS_EN_PERMANENTE,
  textoDeCarreraCorregida,
  textoDeMetaNueva,
} from "./modelo";

const SISTEMAS = { id: "sis", nombre: "Ingeniería en Sistemas", elegidaEl: "2026-09-01" };
const carreras = becasDePrueba().carreras;

function beca(cambios: Partial<BecaDeColportor>): BecaDeColportor {
  return { carrera: SISTEMAS, apuntaA: null, meta: null, avance: { libros: 130, monto: 195000 }, ...cambios };
}

describe("«Logro beca»: lo alcanzado se ve aunque pase a «Sin beca»", () => {
  it("sin tipo y con la completa marcada por el servidor, el estado sigue en «completa»", () => {
    expect(estadoDeBeca(beca({ alcanzada: "completa" }), carreras)).toBe("completa");
    expect(estadoDeBeca(beca({ alcanzada: "media" }), carreras)).toBe("media");
  });

  it("sin tipo y sin nada alcanzado sigue siendo «Sin beca», aunque lleve libros: nunca se le asignó", () => {
    expect(estadoDeBeca(beca({}), carreras)).toBe("sin-beca");
    expect(estadoDeBeca(beca({ alcanzada: null }), carreras)).toBe("sin-beca");
  });

  it("con tipo, lo alcanzado antes tampoco se quita al apuntar a una meta más baja o más alta", () => {
    const apuntaAMedia = beca({ apuntaA: "media", meta: { libros: 120, monto: 180000 }, avance: { libros: 50, monto: 0 }, alcanzada: "completa" });
    expect(estadoDeBeca(apuntaAMedia, carreras)).toBe("completa");
    expect(estadoDeBeca({ ...apuntaAMedia, alcanzada: null }, carreras)).toBe("en-progreso");
  });

  it("la fila de lo vendido dice cuánto y qué alcanzó, en las dos medidas", () => {
    const diego = beca({ alcanzada: "completa" });
    expect(avanceDeBeca(diego, "libros")).toEqual({ tipo: "lograda", texto: "130 libros vendidos · alcanzó la beca completa" });
    expect(avanceDeBeca(diego, "ces")).toEqual({ tipo: "lograda", texto: "$U 195.000 de compra a la CES · alcanzó la beca completa" });
    expect(avanceDeBeca(beca({ alcanzada: "media", avance: { libros: 1, monto: 0 } }), "libros")).toEqual({
      tipo: "lograda",
      texto: "1 libro vendido · alcanzó la media beca",
    });
  });

  it("sin tipo ni logro, el avance sigue diciendo que no hay meta", () => {
    expect(avanceDeBeca(beca({}), "libros")).toEqual({ tipo: "sin-tipo" });
  });

  it("el aviso de «Sin beca» cuenta que conserva lo alcanzado, y si no, el de siempre", () => {
    expect(avisoDeSinBeca("Diego Pérez", beca({ alcanzada: "completa" }))).toBe(
      "Diego Pérez quedó sin beca: ya no tiene meta, pero conserva la beca completa alcanzada.",
    );
    expect(avisoDeSinBeca("Diego Pérez", beca({ alcanzada: "media" }))).toBe(
      "Diego Pérez quedó sin beca: ya no tiene meta, pero conserva la media beca alcanzada.",
    );
    expect(avisoDeSinBeca("Diego Pérez", beca({}))).toBe("Diego Pérez quedó sin beca: ya no tiene meta.");
    expect(avisoDeSinBeca("Diego Pérez")).toBe("Diego Pérez quedó sin beca: ya no tiene meta.");
  });
});

describe("«Beca perman.» y «Carrera corr»: textos y campaña permanente", () => {
  it("una campaña sin fecha de fin es permanente", () => {
    expect(esCampaniaPermanente(datosDePrueba({ campaniaFin: null }))).toBe(true);
    expect(esCampaniaPermanente(datosDePrueba())).toBe(false);
  });

  it("el aviso empieza con el texto que pidió Cristian y dice qué hacer", () => {
    expect(TEXTO_SIN_BECAS_EN_PERMANENTE.startsWith("En una campaña permanente no hay becas.")).toBe(true);
    expect(TEXTO_SIN_BECAS_EN_PERMANENTE).toContain("verano o de invierno");
  });

  it("la carrera corregida y la meta nueva, en las dos medidas", () => {
    expect(textoDeCarreraCorregida("Teología")).toBe("Carrera corregida: meta de Teología");
    expect(textoDeMetaNueva({ libros: 100, monto: 150000 })).toBe("Meta nueva: 100 libros · $U 150.000 a la CES");
    expect(textoDeMetaNueva({ libros: 1, monto: 1500 })).toBe("Meta nueva: 1 libro · $U 1.500 a la CES");
  });
});
