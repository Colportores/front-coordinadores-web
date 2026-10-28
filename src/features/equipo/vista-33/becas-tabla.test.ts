import { describe, expect, it } from "vitest";

import type { BecaDeColportor } from "@/datos/equipo/contrato";

import {
  alternarOrden,
  armarTablaDeBecas,
  estadoDeBeca,
  FILTROS_VACIOS,
  hayFiltros,
  porcentajeDeAvance,
  textoDeOrden,
  type FiltrosDeBecas,
  type OrdenDeBecas,
} from "./becas-tabla";
import { becasDePrueba, datosDePrueba } from "./datos-de-prueba";
import { AMBITO_TODAS, resolverAmbito } from "./modelo";

const sistemas = { id: "sis", nombre: "Ingeniería en Sistemas", elegidaEl: "2026-09-01" };
const { carreras, porColportor: BASE } = becasDePrueba();

function beca(cambios: Partial<BecaDeColportor> = {}): BecaDeColportor {
  return { carrera: sistemas, apuntaA: "media", meta: { libros: 120, monto: 180000 }, avance: { libros: 64, monto: 90000 }, ...cambios };
}

describe("estadoDeBeca", () => {
  it("sin carrera, o sin fila en las becas, «Falta la carrera»", () => {
    expect(estadoDeBeca(undefined, carreras)).toBe("sin-carrera");
    expect(estadoDeBeca(BASE.federico, carreras)).toBe("sin-carrera");
  });

  it("con carrera y sin tipo asignado no hay estado de beca: «Sin beca»", () => {
    expect(estadoDeBeca(beca({ apuntaA: null, meta: null, avance: { libros: 500, monto: 0 } }), carreras)).toBe("sin-beca");
  });

  it("por debajo de la media, en progreso; desde la media, media alcanzada; desde la completa, completa alcanzada", () => {
    expect(estadoDeBeca(beca({ avance: { libros: 119, monto: 0 } }), carreras)).toBe("en-progreso");
    expect(estadoDeBeca(beca({ avance: { libros: 120, monto: 0 } }), carreras)).toBe("media");
    expect(estadoDeBeca(beca({ avance: { libros: 239, monto: 0 } }), carreras)).toBe("media");
    expect(estadoDeBeca(beca({ avance: { libros: 240, monto: 0 } }), carreras)).toBe("completa");
  });

  it("apuntando a completa con la media ya alcanzada, la media no se le quita", () => {
    expect(estadoDeBeca(beca({ apuntaA: "completa", meta: { libros: 240, monto: 360000 }, avance: { libros: 130, monto: 0 } }), carreras)).toBe("media");
  });

  it("el monto a la CES no cambia el estado (S67): solo cuentan los libros", () => {
    expect(estadoDeBeca(beca({ avance: { libros: 10, monto: 999999 } }), carreras)).toBe("en-progreso");
  });

  it("si la carrera no tiene la meta cargada o ya no está en el catálogo, usa la meta que se copió para su tipo", () => {
    const contador = { id: "cont", nombre: "Contador Público", elegidaEl: "2026-09-01" };
    // Contador no tiene metas en el catálogo y la copia es de media: alcanzó la media, pero no hay completa que medir.
    expect(estadoDeBeca(beca({ carrera: contador, avance: { libros: 130, monto: 0 } }), carreras)).toBe("media");
    expect(estadoDeBeca(beca({ carrera: contador, avance: { libros: 50, monto: 0 } }), carreras)).toBe("en-progreso");
    const borrada = { id: "vieja", nombre: "Carrera vieja", elegidaEl: "2026-09-01" };
    expect(estadoDeBeca(beca({ carrera: borrada, avance: { libros: 120, monto: 0 } }), carreras)).toBe("media");
    // Sin ninguna meta que medir no hay con qué compararlo: en progreso.
    expect(estadoDeBeca(beca({ carrera: borrada, apuntaA: "media", meta: { libros: 0, monto: 0 } }), carreras)).toBe("en-progreso");
  });
});

describe("porcentajeDeAvance", () => {
  it("el avance sobre la meta en la medida elegida, sin tope", () => {
    expect(porcentajeDeAvance(beca(), "libros")).toBe(53);
    expect(porcentajeDeAvance(beca(), "ces")).toBe(50);
    expect(porcentajeDeAvance(beca({ avance: { libros: 180, monto: 0 } }), "libros")).toBe(150);
  });

  it("sin carrera, sin tipo o con la meta en 0 no hay porcentaje", () => {
    expect(porcentajeDeAvance(undefined, "libros")).toBeNull();
    expect(porcentajeDeAvance(BASE.federico, "libros")).toBeNull();
    expect(porcentajeDeAvance(beca({ apuntaA: null, meta: null }), "libros")).toBeNull();
    expect(porcentajeDeAvance(beca({ meta: { libros: 0, monto: 180000 } }), "libros")).toBeNull();
    expect(porcentajeDeAvance(beca({ meta: { libros: 0, monto: 180000 } }), "ces")).toBe(50);
  });
});

describe("orden", () => {
  it("cada toque avanza: de menor a mayor, de mayor a menor y de vuelta al orden de siempre", () => {
    const uno = alternarOrden(null, "avance");
    expect(uno).toEqual({ columna: "avance", sentido: "asc" });
    const dos = alternarOrden(uno, "avance");
    expect(dos).toEqual({ columna: "avance", sentido: "desc" });
    expect(alternarOrden(dos, "avance")).toBeNull();
  });

  it("tocar otra columna arranca esa de menor a mayor", () => {
    expect(alternarOrden({ columna: "avance", sentido: "desc" }, "estado")).toEqual({ columna: "estado", sentido: "asc" });
  });

  it("el texto para el lector de pantalla dice la columna y el sentido", () => {
    expect(textoDeOrden({ columna: "avance", sentido: "desc" })).toBe("Ordenado por avance, de mayor a menor.");
    expect(textoDeOrden({ columna: "colportor", sentido: "asc" })).toBe("Ordenado por colportor, de menor a mayor.");
  });
});

describe("hayFiltros", () => {
  it("sin ningún filtro tocado no hay filtros", () => {
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false);
    expect(hayFiltros({ ...FILTROS_VACIOS, avance: "sin-meta" })).toBe(true);
  });
});

describe("armarTablaDeBecas", () => {
  const datos = datosDePrueba();
  const resuelto = resolverAmbito(datos, AMBITO_TODAS);
  const porColportor: Record<string, BecaDeColportor> = {
    ...BASE,
    // Emiliano ya pasó la media (130 de 120 libros).
    emiliano: beca({ avance: { libros: 130, monto: 0 } }),
    florencia: beca({ carrera: { id: "teo", nombre: "Teología", elegidaEl: "2026-09-01" }, apuntaA: "completa", meta: { libros: 200, monto: 300000 }, avance: { libros: 40, monto: 75000 } }),
  };

  function armar(filtros: Partial<FiltrosDeBecas> = {}, orden: OrdenDeBecas = null, fijados: ReadonlySet<string> = new Set(), unidad: "libros" | "ces" = "libros") {
    return armarTablaDeBecas({ resuelto, porColportor, carreras, unidad, filtros: { ...FILTROS_VACIOS, ...filtros }, orden, fijados });
  }
  const nombres = (t: ReturnType<typeof armar>) => t.grupos.flatMap((g) => g.filas.map((f) => f.colportor.nombre));

  it("sin filtros ni orden, agrupa por ciudad como la vista y trae a todos", () => {
    const t = armar();
    expect(t.plana).toBe(false);
    expect(t.total).toBe(5);
    expect(t.coinciden).toBe(5);
    expect(t.grupos.map((g) => g.nombre)).toEqual(["Artigas", "Bella Unión", "Rivera", "Sin zona asignada"]);
  });

  it("filtra por estado", () => {
    expect(nombres(armar({ estado: "media" }))).toEqual(["Emiliano Sosa"]);
    expect(nombres(armar({ estado: "sin-beca" }))).toEqual(["Sofía Cabral"]);
    expect(nombres(armar({ estado: "sin-carrera" })).sort()).toEqual(["Federico Da Rosa", "Rocío Benítez"]);
  });

  it("filtra por carrera, incluida «sin carrera elegida»", () => {
    expect(nombres(armar({ carrera: "teo" }))).toEqual(["Florencia Pintos"]);
    expect(nombres(armar({ carrera: "sis" })).sort()).toEqual(["Emiliano Sosa", "Sofía Cabral"]);
    expect(nombres(armar({ carrera: "sin-carrera" })).sort()).toEqual(["Federico Da Rosa", "Rocío Benítez"]);
    expect(nombres(armar({ carrera: "cont" }))).toEqual([]);
  });

  it("filtra por a qué apunta; «Sin beca» es el que tiene carrera y nada asignado", () => {
    expect(nombres(armar({ tipo: "media" }))).toEqual(["Emiliano Sosa"]);
    expect(nombres(armar({ tipo: "completa" }))).toEqual(["Florencia Pintos"]);
    expect(nombres(armar({ tipo: "sin-beca" }))).toEqual(["Sofía Cabral"]);
  });

  it("filtra por franja de avance en la medida elegida; sin meta es una franja aparte", () => {
    // Emiliano 130/120 = 108 %, Florencia 40/200 = 20 % en libros y 75000/300000 = 25 % en CES.
    expect(nombres(armar({ avance: "100" }))).toEqual(["Emiliano Sosa"]);
    expect(nombres(armar({ avance: "0-24" }))).toEqual(["Florencia Pintos"]);
    expect(nombres(armar({ avance: "25-49" }))).toEqual([]);
    expect(nombres(armar({ avance: "25-49" }, null, new Set(), "ces"))).toEqual(["Florencia Pintos"]);
    expect(nombres(armar({ avance: "sin-meta" })).sort()).toEqual(["Federico Da Rosa", "Rocío Benítez", "Sofía Cabral"]);
  });

  it("los filtros se combinan (todos tienen que cumplirse)", () => {
    expect(nombres(armar({ carrera: "sis", estado: "media" }))).toEqual(["Emiliano Sosa"]);
    expect(nombres(armar({ carrera: "teo", estado: "media" }))).toEqual([]);
  });

  it("sin coincidencias no queda ningún grupo y se sabe cuántos había", () => {
    const t = armar({ estado: "completa" });
    expect(t.grupos).toEqual([]);
    expect(t.coinciden).toBe(0);
    expect(t.total).toBe(5);
  });

  it("los fijados siguen a la vista aunque no cumplan el filtro", () => {
    const t = armar({ estado: "media" }, null, new Set(["florencia"]));
    expect(nombres(t).sort()).toEqual(["Emiliano Sosa", "Florencia Pintos"]);
    expect(t.coinciden).toBe(2);
  });

  it("ordenando se aplana: un solo grupo sin cabecera, por avance de mayor a menor con los que no tienen meta al final", () => {
    const t = armar({}, { columna: "avance", sentido: "desc" });
    expect(t.plana).toBe(true);
    expect(t.grupos).toHaveLength(1);
    expect(nombres(t)).toEqual(["Emiliano Sosa", "Florencia Pintos", "Federico Da Rosa", "Rocío Benítez", "Sofía Cabral"]);
  });

  it("los que no tienen valor van al final también de menor a mayor, y a igualdad se ordena por nombre", () => {
    const t = armar({}, { columna: "avance", sentido: "asc" });
    expect(nombres(t)).toEqual(["Florencia Pintos", "Emiliano Sosa", "Federico Da Rosa", "Rocío Benítez", "Sofía Cabral"]);
  });

  it("por colportor, carrera, a qué apunta y estado", () => {
    expect(nombres(armar({}, { columna: "colportor", sentido: "desc" }))).toEqual(["Sofía Cabral", "Rocío Benítez", "Florencia Pintos", "Federico Da Rosa", "Emiliano Sosa"]);
    // Ingeniería en Sistemas, Ingeniería en Sistemas, Teología y los dos sin carrera al final.
    expect(nombres(armar({}, { columna: "carrera", sentido: "asc" }))).toEqual(["Emiliano Sosa", "Sofía Cabral", "Florencia Pintos", "Federico Da Rosa", "Rocío Benítez"]);
    // Sin beca, media, completa.
    expect(nombres(armar({}, { columna: "apunta", sentido: "asc" })).slice(0, 3)).toEqual(["Sofía Cabral", "Emiliano Sosa", "Florencia Pintos"]);
    // Sin beca, en progreso, media alcanzada; los sin carrera al final.
    expect(nombres(armar({}, { columna: "estado", sentido: "asc" }))).toEqual(["Sofía Cabral", "Florencia Pintos", "Emiliano Sosa", "Federico Da Rosa", "Rocío Benítez"]);
  });

  it("filtro y orden juntos", () => {
    expect(nombres(armar({ carrera: "sis" }, { columna: "avance", sentido: "desc" }))).toEqual(["Emiliano Sosa", "Sofía Cabral"]);
  });

  it("cada fila trae su ciudad, para mostrarla cuando se aplana", () => {
    const filas = armar({}, { columna: "colportor", sentido: "asc" }).grupos[0].filas;
    expect(filas.find((f) => f.colportor.id === "federico")?.ciudad).toBe("Bella Unión");
    expect(filas.find((f) => f.colportor.id === "rocio")?.ciudad).toBe("Sin zona asignada");
  });
});
