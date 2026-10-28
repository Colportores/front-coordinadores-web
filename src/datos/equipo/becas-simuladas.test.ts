import { describe, expect, it } from "vitest";

import { CARRERAS_SIMULADAS, crearBecasSimuladas } from "@/datos/equipo/becas-simuladas";
import type { CarreraDelCatalogo } from "@/datos/equipo/contrato";
import { crearEquipoSimulado } from "@/datos/equipo/equipo-simulado";

const GENTE = [
  { id: "emi", nombre: "Emiliano Sosa" },
  { id: "mar", nombre: "Martín Olivera" },
  { id: "pau", nombre: "Paula Ferreira" },
];
const HOY = "2026-10-21";

describe("las becas simuladas", () => {
  it("Emiliano Sosa es de Sistemas y apunta a media beca; Martín y Paula todavía no tienen carrera", () => {
    const { porColportor } = crearBecasSimuladas(GENTE, HOY).datos();

    expect(porColportor.emi).toMatchObject({
      carrera: { id: "sis", nombre: "Ingeniería en Sistemas", elegidaEl: "2026-09-01" },
      apuntaA: "media",
      meta: { libros: 120, monto: 180000 },
    });
    expect(porColportor.mar).toEqual({ carrera: null, apuntaA: null, meta: null, avance: { libros: 0, monto: 0 } });
    expect(porColportor.pau.carrera).toBeNull();
  });

  it("las metas del catálogo son las del canvas: la completa es el doble de la media", () => {
    expect(CARRERAS_SIMULADAS.map((c) => c.nombre)).toEqual(["Ingeniería en Sistemas", "Teología", "Contador Público", "Enfermería", "Psicología"]);
    for (const c of CARRERAS_SIMULADAS) {
      expect(c.metaCompleta).toEqual({ libros: (c.metaMedia?.libros ?? 0) * 2, monto: (c.metaMedia?.monto ?? 0) * 2 });
    }
  });

  it("elegir la carrera la guarda con el día de hoy, sin tipo ni meta todavía", () => {
    const becas = crearBecasSimuladas(GENTE, HOY);

    const respuesta = becas.elegirCarrera("mar", "teo");

    expect(respuesta).toEqual({
      ok: true,
      beca: { carrera: { id: "teo", nombre: "Teología", elegidaEl: HOY }, apuntaA: null, meta: null, avance: { libros: 0, monto: 0 } },
    });
    expect(becas.datos().porColportor.mar.carrera?.nombre).toBe("Teología");
  });

  it("la carrera se elige una sola vez: otra distinta se rechaza (la corrige el administrador) y la misma es un reintento", () => {
    const becas = crearBecasSimuladas(GENTE, HOY);
    becas.elegirCarrera("mar", "teo");

    expect(becas.elegirCarrera("mar", "teo").ok).toBe(true);
    const otra = becas.elegirCarrera("mar", "psi");
    expect(otra).toMatchObject({ ok: false, recargar: true });
    expect(otra.ok === false && otra.mensaje).toContain("la corrige el administrador");
    expect(becas.datos().porColportor.mar.carrera?.id).toBe("teo");
  });

  it("asignar el tipo fija la meta con la de la carrera, en las dos medidas, y no toca el avance", () => {
    const becas = crearBecasSimuladas(GENTE, HOY);
    const antes = becas.datos().porColportor.emi.avance;

    const respuesta = becas.asignarTipoDeBeca("emi", "completa");

    expect(respuesta).toMatchObject({ ok: true, beca: { apuntaA: "completa", meta: { libros: 240, monto: 360000 }, avance: antes } });
    expect(becas.asignarTipoDeBeca("emi", "media")).toMatchObject({ ok: true, beca: { apuntaA: "media", meta: { libros: 120, monto: 180000 } } });
  });

  it("«Sin beca» (null) lo deja sin tipo ni meta, conserva el avance y se puede volver a asignar", () => {
    const becas = crearBecasSimuladas(GENTE, HOY);
    const antes = becas.datos().porColportor.emi.avance;

    expect(becas.asignarTipoDeBeca("emi", null)).toMatchObject({ ok: true, beca: { apuntaA: null, meta: null, avance: antes } });
    expect(becas.datos().porColportor.emi).toMatchObject({ apuntaA: null, meta: null });
    expect(becas.asignarTipoDeBeca("emi", "completa")).toMatchObject({ ok: true, beca: { apuntaA: "completa", meta: { libros: 240, monto: 360000 } } });
  });

  it("«Sin beca» pide la carrera igual que los otros tipos y rechaza a quien no está en la campaña", () => {
    const becas = crearBecasSimuladas(GENTE, HOY);
    expect(becas.asignarTipoDeBeca("mar", null)).toMatchObject({ ok: false, recargar: true });
    expect(becas.asignarTipoDeBeca("nadie", null)).toMatchObject({ ok: false, recargar: true });
  });

  it("una carrera sin meta cargada avisa «Falta configurar la meta de esta carrera» y no cambia nada", () => {
    const sinMeta: CarreraDelCatalogo = { id: "sin", nombre: "Archivología", metaMedia: null, metaCompleta: null };
    const becas = crearBecasSimuladas(GENTE, HOY, [...CARRERAS_SIMULADAS, sinMeta]);
    becas.elegirCarrera("mar", "sin");

    const respuesta = becas.asignarTipoDeBeca("mar", "media");

    expect(respuesta).toMatchObject({ ok: false, sinMeta: true });
    expect(respuesta.ok === false && respuesta.mensaje).toContain("Falta configurar la meta de esta carrera");
    expect(becas.datos().porColportor.mar.apuntaA).toBeNull();
  });

  it("sin carrera no se puede asignar el tipo; un colportor o una carrera que no existen piden recargar", () => {
    const becas = crearBecasSimuladas(GENTE, HOY);

    expect(becas.asignarTipoDeBeca("mar", "media")).toMatchObject({ ok: false });
    expect(becas.asignarTipoDeBeca("nadie", "media")).toMatchObject({ ok: false, recargar: true });
    expect(becas.elegirCarrera("nadie", "teo")).toMatchObject({ ok: false, recargar: true });
    expect(becas.elegirCarrera("mar", "no-existe")).toMatchObject({ ok: false, recargar: true });
  });

  it("lo que devuelve es una copia: cambiarla no cambia la fuente", () => {
    const becas = crearBecasSimuladas(GENTE, HOY);
    const datos = becas.datos();
    datos.porColportor.emi.avance.libros = 9999;
    datos.carreras[0].nombre = "otra";

    expect(becas.datos().porColportor.emi.avance.libros).not.toBe(9999);
    expect(becas.datos().carreras[0].nombre).toBe("Ingeniería en Sistemas");
  });
});

async function leer(fuente: ReturnType<typeof crearEquipoSimulado>) {
  const datos = await fuente.obtenerEquipoPorCiudad();
  if (!datos) throw new Error("la fuente simulada siempre trae una campaña");
  return datos;
}

describe("la fuente simulada de Equipo con becas", () => {
  it("trae las becas de todos los colportores y recuerda lo que se guardó", async () => {
    const fuente = crearEquipoSimulado();
    const datos = await leer(fuente);
    const martin = datos.colportores.find((c) => c.nombre === "Martín Olivera");
    if (!martin) throw new Error("falta Martín Olivera");

    expect(datos.becas?.carreras).toHaveLength(5);
    expect(datos.becas?.porColportor[martin.id].carrera).toBeNull();
    expect(await fuente.elegirCarrera(datos.campaniaId, martin.id, "enf")).toMatchObject({ ok: true });
    expect((await leer(fuente)).becas?.porColportor[martin.id].carrera?.nombre).toBe("Enfermería");
    expect(await fuente.asignarTipoDeBeca(datos.campaniaId, martin.id, "completa")).toMatchObject({
      ok: true,
      beca: { meta: { libros: 220, monto: 330000 } },
    });
  });
});
