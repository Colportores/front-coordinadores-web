import { describe, expect, it } from "vitest";

import type { BecaDeColportor } from "@/datos/equipo/contrato";
import { crearEquipoSimulado } from "@/datos/equipo/equipo-simulado";
import { diaYMes } from "@/lib/dias";

import canvas from "./canvas-33-becas.json";
import { avanceDeBeca, avisoDeBecaAsignada, ETIQUETA_DE_TIPO, resolverAmbito, type UnidadDeAvance } from "./modelo";

const sistemas = { id: "sis", nombre: "Ingeniería en Sistemas", elegidaEl: "2026-09-01" };

function beca(cambios: Partial<BecaDeColportor> = {}): BecaDeColportor {
  return {
    carrera: sistemas,
    apuntaA: "media",
    meta: { libros: 120, monto: 180000 },
    avance: { libros: 64, monto: 90000 },
    ...cambios,
  };
}

describe("avanceDeBeca", () => {
  it("en libros: «64 de 120 libros · le faltan 56» y la barra al 53 %", () => {
    expect(avanceDeBeca(beca(), "libros")).toEqual({ tipo: "con-meta", texto: "64 de 120 libros · le faltan 56", porcentaje: 53, alcanzada: false });
  });

  it("en compra a la CES: la misma meta en $U", () => {
    expect(avanceDeBeca(beca(), "ces")).toEqual({
      tipo: "con-meta",
      texto: "$U 90.000 de $U 180.000 · le faltan $U 90.000",
      porcentaje: 50,
      alcanzada: false,
    });
  });

  it("sin carrera, o sin colportor en las becas, no hay meta: «falta la carrera»", () => {
    expect(avanceDeBeca(beca({ carrera: null, apuntaA: null, meta: null }), "libros")).toEqual({ tipo: "sin-carrera" });
    expect(avanceDeBeca(undefined, "ces")).toEqual({ tipo: "sin-carrera" });
  });

  it("con carrera pero sin tipo, o con la meta en 0, no se puede medir: «no apunta a ninguna beca»", () => {
    expect(avanceDeBeca(beca({ apuntaA: null, meta: null }), "libros")).toEqual({ tipo: "sin-tipo" });
    expect(avanceDeBeca(beca({ meta: { libros: 0, monto: 0 } }), "libros")).toEqual({ tipo: "sin-tipo" });
    // Una medida en 0 no frena a la otra.
    expect(avanceDeBeca(beca({ meta: { libros: 0, monto: 180000 } }), "ces").tipo).toBe("con-meta");
  });

  it("con la meta cumplida o superada dice «meta alcanzada» y la barra no pasa de 100 %", () => {
    expect(avanceDeBeca(beca({ avance: { libros: 120, monto: 0 } }), "libros")).toEqual({
      tipo: "con-meta",
      texto: "120 de 120 libros · meta alcanzada",
      porcentaje: 100,
      alcanzada: true,
    });
    expect(avanceDeBeca(beca({ avance: { libros: 500, monto: 900000 } }), "libros")).toMatchObject({ porcentaje: 100, alcanzada: true });
  });

  it("singular: «le falta 1» y «1 libro»", () => {
    expect(avanceDeBeca(beca({ avance: { libros: 119, monto: 0 } }), "libros")).toMatchObject({ texto: "119 de 120 libros · le falta 1" });
    expect(avanceDeBeca(beca({ meta: { libros: 1, monto: 1000 }, avance: { libros: 0, monto: 0 } }), "libros")).toMatchObject({
      texto: "0 de 1 libro · le falta 1",
    });
  });

  it("un avance sin vender nada es 0 %", () => {
    expect(avanceDeBeca(beca({ avance: { libros: 0, monto: 0 } }), "libros")).toMatchObject({ texto: "0 de 120 libros · le faltan 120", porcentaje: 0 });
  });
});

describe("avisoDeBecaAsignada", () => {
  it("dice a qué apunta y la meta en las dos medidas", () => {
    expect(avisoDeBecaAsignada("Juan", beca({ apuntaA: "completa", meta: { libros: 240, monto: 360000 } }))).toBe(
      "Juan ahora apunta a beca completa: meta de 240 libros y $U 360.000 a la CES.",
    );
    expect(avisoDeBecaAsignada("Ana", beca())).toBe("Ana ahora apunta a media beca: meta de 120 libros y $U 180.000 a la CES.");
  });

  it("sin tipo (solo se eligió la carrera) no inventa una meta", () => {
    expect(avisoDeBecaAsignada("Ana", beca({ apuntaA: null, meta: null }))).toBe("Quedó guardado el cambio de Ana.");
  });
});

type FilaCanvas = (typeof canvas.rivera.filas)[number];

/** Lo que la tabla «Becas» dice de un colportor, armado con el mismo modelo que la vista. */
async function filasDeLaTabla(unidad: UnidadDeAvance) {
  const fuente = crearEquipoSimulado();
  const datos = await fuente.obtenerEquipoPorCiudad();
  if (!datos) throw new Error("la fuente simulada siempre trae una campaña");
  const resuelto = resolverAmbito(datos, { tipo: "todas" });
  const porNombre = new Map<string, FilaCanvas>();
  for (const c of resuelto.colportores) {
    const b = datos.becas?.porColportor[c.id];
    const avance = avanceDeBeca(b, unidad);
    porNombre.set(c.nombre, {
      colportor: c.nombre,
      carrera: b?.carrera?.nombre ?? null,
      carreraSub: b?.carrera ? `elegida el ${diaYMes(b.carrera.elegidaEl)}` : undefined,
      apuntaA: b?.apuntaA ? ETIQUETA_DE_TIPO[b.apuntaA] : null,
      avance: avance.tipo === "con-meta" ? avance.texto : avance.tipo === "sin-carrera" ? "Sin meta: falta la carrera" : "Sin meta: no apunta a ninguna beca",
      ancho: avance.tipo === "con-meta" ? `${avance.porcentaje}%` : undefined,
    } as FilaCanvas);
  }
  return porNombre;
}

describe("la tabla «Becas» contra el canvas del diseño 33", () => {
  it.each([
    ["libros" as const, canvas.todasLibros],
    ["ces" as const, canvas.todasCes],
  ])("las 25 filas de Todas las ciudades, avance en %s: carrera, a qué apunta, texto y barra", async (unidad, esperado) => {
    const tabla = await filasDeLaTabla(unidad);

    expect(esperado.filas).toHaveLength(25);
    for (const fila of esperado.filas) {
      const propia = tabla.get(fila.colportor);
      expect(propia, fila.colportor).toBeDefined();
      expect(propia, fila.colportor).toMatchObject({
        carrera: fila.carrera,
        apuntaA: fila.apuntaA,
        avance: fila.avance,
        ...(fila.ancho ? { carreraSub: fila.carreraSub, ancho: fila.ancho } : {}),
      });
    }
  });

  it("el artboard 01 (Rivera) tiene los mismos diez colportores, dos de ellos sin carrera todavía", async () => {
    const tabla = await filasDeLaTabla("libros");

    expect(canvas.rivera.heads).toEqual(["COLPORTOR", "CARRERA", "APUNTA A", "AVANCE · LIBROS BONIFICABLES"]);
    expect(canvas.rivera.filas).toHaveLength(10);
    const sinCarrera = canvas.rivera.filas.filter((f) => f.carrera === null).map((f) => f.colportor);
    expect(sinCarrera).toEqual(["Martín Olivera"]);
    for (const fila of canvas.rivera.filas) expect(tabla.get(fila.colportor)?.avance).toBe(fila.avance);
  });
});
