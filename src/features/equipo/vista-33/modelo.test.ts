import { describe, expect, it } from "vitest";

import { colportor, datosDePrueba, HOY, INICIO } from "./datos-de-prueba";
import {
  abreviar,
  AMBITO_TODAS,
  construirLista,
  construirRiel,
  diasSinAcompanar,
  mismoAmbito,
  ordenarPorDiasSinAcompanar,
  resolverAmbito,
  semanasAcompanadas,
  semanasDeLaCampania,
  textoHoras,
} from "./modelo";

describe("resolverAmbito", () => {
  const datos = datosDePrueba();

  it("todas las ciudades: un grupo por ciudad con gente, por departamento, y al final los que no tienen zona", () => {
    const r = resolverAmbito(datos, AMBITO_TODAS);

    expect(r.titulo).toBe("Todas las ciudades");
    expect(r.grupos.map((g) => g.nombre)).toEqual(["Artigas", "Bella Unión", "Rivera", "Sin zona asignada"]);
    expect(r.colportores).toHaveLength(5);
    expect(r.conZona).toBe(4);
    expect(r.conCabeceras).toBe(true);
  });

  it("una ciudad: sus colportores y, al final, los que no tienen zona, con el departamento", () => {
    const r = resolverAmbito(datos, { tipo: "ciudad", ciudadId: "riv" });

    expect(r).toMatchObject({ titulo: "Rivera", departamento: "Rivera", conZona: 2, conCabeceras: true });
    expect(r.grupos.map((g) => g.nombre)).toEqual(["Rivera", "Sin zona asignada"]);
    expect(r.colportores.map((c) => c.nombre)).toEqual(["Emiliano Sosa", "Florencia Pintos", "Rocío Benítez"]);
  });

  it("una ciudad sin nadie sin zona no abre un grupo de más ni cabeceras", () => {
    const sinRocio = datosDePrueba({ colportores: datos.colportores.filter((c) => c.zonaActual !== null) });
    const r = resolverAmbito(sinRocio, { tipo: "ciudad", ciudadId: "riv" });

    expect(r).toMatchObject({ conCabeceras: false, conZona: 2 });
    expect(r.sinZona).toEqual([]);
  });

  it("un departamento: las ciudades que tiene, cada una con su cabecera", () => {
    const r = resolverAmbito(datos, { tipo: "departamento", departamento: "Artigas" });

    expect(r.titulo).toBe("Departamento Artigas");
    expect(r.grupos.map((g) => g.nombre)).toEqual(["Artigas", "Bella Unión", "Sin zona asignada"]);
    expect(r.conCabeceras).toBe(true);
  });

  it("los que no tienen zona figuran una sola vez en cada ámbito, nunca repetidos", () => {
    for (const ambito of [AMBITO_TODAS, { tipo: "departamento", departamento: "Artigas" } as const, { tipo: "ciudad", ciudadId: "bu" } as const]) {
      const r = resolverAmbito(datos, ambito);
      expect(r.colportores.filter((c) => c.nombre === "Rocío Benítez")).toHaveLength(1);
      expect(r.sinZona.map((c) => c.nombre)).toEqual(["Rocío Benítez"]);
    }
  });

  it("una ciudad o un departamento que ya no existen vuelven a «todas»", () => {
    expect(resolverAmbito(datos, { tipo: "ciudad", ciudadId: "no-esta" }).ambito).toEqual(AMBITO_TODAS);
    expect(resolverAmbito(datos, { tipo: "departamento", departamento: "Salto" }).ambito).toEqual(AMBITO_TODAS);
  });

  it("una zona de una ciudad que ya no está en la lista figura con los que no tienen zona", () => {
    const huerfano = datosDePrueba({ colportores: [colportor({ id: "x", nombre: "Ximena", ciudadId: "baja" })] });

    expect(resolverAmbito(huerfano, AMBITO_TODAS).grupos.map((g) => g.nombre)).toEqual(["Sin zona asignada"]);
  });

  it("una ciudad sin colportores no abre una cabecera sin filas en «todas»", () => {
    const sinBellaUnion = datosDePrueba({ colportores: datos.colportores.filter((c) => c.ciudadId !== "bu") });

    expect(resolverAmbito(sinBellaUnion, AMBITO_TODAS).grupos.map((g) => g.nombre)).toEqual(["Artigas", "Rivera", "Sin zona asignada"]);
    // Queda solo quien no tiene zona, que figura en cualquier ciudad.
    expect(resolverAmbito(sinBellaUnion, { tipo: "ciudad", ciudadId: "bu" }).colportores.map((c) => c.nombre)).toEqual(["Rocío Benítez"]);
    const nadie = datosDePrueba({ colportores: sinBellaUnion.colportores.filter((c) => c.zonaActual !== null) });
    expect(resolverAmbito(nadie, { tipo: "ciudad", ciudadId: "bu" }).colportores).toEqual([]);
  });
});

describe("construirLista", () => {
  const datos = datosDePrueba();

  it("agrupa por departamento, con «Todo el departamento» solo donde hay más de una ciudad", () => {
    const lista = construirLista(datos, resolverAmbito(datos, AMBITO_TODAS));

    expect(lista.todas).toMatchObject({ nombre: "Todas las ciudades", cantidad: 4, sinZona: 1, seleccionado: true });
    expect(lista.grupos.map((g) => [g.titulo, g.nodos.map((n) => `${n.nombre}:${n.cantidad}`)])).toEqual([
      ["DEPTO. ARTIGAS", ["Todo el departamento:2", "Artigas:1", "Bella Unión:1"]],
      ["DEPTO. RIVERA", ["Rivera:2"]],
    ]);
    // Los que no tienen zona se suman a cada renglón («8 + 1 sin zona»); no tienen renglón propio.
    expect(lista.grupos.flatMap((g) => g.nodos).every((n) => n.sinZona === 1)).toBe(true);
  });

  it("marca como seleccionado el ámbito actual", () => {
    const r = resolverAmbito(datos, { tipo: "ciudad", ciudadId: "bu" });
    const lista = construirLista(datos, r);

    expect(lista.todas.seleccionado).toBe(false);
    expect(lista.grupos.flatMap((g) => g.nodos).filter((n) => n.seleccionado).map((n) => n.nombre)).toEqual(["Bella Unión"]);
  });

  it("las ciudades sin departamento van al final y sin título; sin colportores sin zona no hay ese renglón", () => {
    const sinDepartamento = datosDePrueba({
      ciudades: [
        { id: "riv", nombre: "Rivera", departamento: null },
        { id: "art", nombre: "Artigas", departamento: "Artigas" },
      ],
      colportores: [colportor({ id: "a", nombre: "A" })],
    });
    const lista = construirLista(sinDepartamento, resolverAmbito(sinDepartamento, AMBITO_TODAS));

    expect(lista.grupos.map((g) => g.titulo)).toEqual(["DEPTO. ARTIGAS", null]);
    expect(lista.todas.sinZona).toBe(0);
  });

  it("la lista contraída trae una abreviatura por renglón", () => {
    const lista = construirLista(datos, resolverAmbito(datos, AMBITO_TODAS));

    expect(construirRiel(lista).map((i) => i.abreviatura)).toEqual(["Todas", "Dpto.", "Art.", "B. Un.", "Riv."]);
  });

  it("abrevia nombres de una y de varias palabras", () => {
    expect(abreviar("Sauce")).toBe("Sau.");
    expect(abreviar("Paso")).toBe("Paso");
    expect(abreviar("Paso de la Arena")).toBe("P. de. la. Ar.");
    expect(abreviar("")).toBe("");
  });

  it("dos ámbitos son el mismo solo si apuntan a lo mismo", () => {
    expect(mismoAmbito({ tipo: "todas" }, AMBITO_TODAS)).toBe(true);
    expect(mismoAmbito({ tipo: "ciudad", ciudadId: "a" }, { tipo: "ciudad", ciudadId: "b" })).toBe(false);
    expect(mismoAmbito({ tipo: "departamento", departamento: "A" }, { tipo: "departamento", departamento: "A" })).toBe(true);
  });
});

describe("días sin acompañar", () => {
  const [emiliano, florencia] = datosDePrueba().colportores;

  it("cuenta desde el último acompañamiento", () => {
    expect(diasSinAcompanar(emiliano, INICIO, HOY)).toBe(19);
  });

  it("si nunca lo acompañaron, desde el inicio de la campaña", () => {
    expect(diasSinAcompanar(florencia, INICIO, HOY)).toBe(50);
  });

  it("el último es el más nuevo aunque la lista no venga ordenada", () => {
    const desordenado = colportor({
      id: "d",
      nombre: "D",
      acompanamientos: [
        { jornadaId: "1", dia: "2026-09-08", horas: 1, acompanante: "X", acompananteEsVos: false },
        { jornadaId: "2", dia: "2026-10-18", horas: 1, acompanante: "X", acompananteEsVos: false },
        { jornadaId: "3", dia: "2026-10-01", horas: 1, acompanante: "X", acompananteEsVos: false },
      ],
    });

    expect(diasSinAcompanar(desordenado, INICIO, HOY)).toBe(3);
  });

  it("acompañado hoy son 0 días y una campaña que todavía no empezó no da negativos", () => {
    const hoy = colportor({ id: "h", nombre: "H", acompanamientos: [{ jornadaId: "1", dia: HOY, horas: 1, acompanante: "X", acompananteEsVos: false }] });

    expect(diasSinAcompanar(hoy, INICIO, HOY)).toBe(0);
    expect(diasSinAcompanar(florencia, "2026-11-01", HOY)).toBe(0);
  });

  it("ordena a los que hace más días no acompaña nadie primero y desempata por nombre", () => {
    const [, , sofia, federico] = datosDePrueba().colportores;
    const orden = ordenarPorDiasSinAcompanar([sofia, emiliano, federico, florencia], INICIO, HOY);

    expect(orden.map((c) => c.nombre)).toEqual(["Federico Da Rosa", "Florencia Pintos", "Emiliano Sosa", "Sofía Cabral"]);
  });
});

describe("semanasDeLaCampania", () => {
  it("S1 es la semana que contiene el inicio (de lunes a domingo) y la última es la de hoy", () => {
    const semanas = semanasDeLaCampania(INICIO, "2026-12-19", HOY);

    expect(semanas).toHaveLength(8);
    expect(semanas[0]).toEqual({ numero: 1, desde: "2026-08-31", hasta: "2026-09-06", actual: false });
    expect(semanas[7]).toEqual({ numero: 8, desde: "2026-10-19", hasta: "2026-10-25", actual: true });
  });

  it("muestra las últimas 8 cuando la campaña lleva más", () => {
    const semanas = semanasDeLaCampania(INICIO, null, "2026-11-18");

    expect(semanas.map((s) => s.numero)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(semanas[7].actual).toBe(true);
  });

  it("una campaña que ya terminó termina en su última semana y ninguna es la actual", () => {
    const semanas = semanasDeLaCampania(INICIO, "2026-09-20", HOY);

    expect(semanas.map((s) => s.numero)).toEqual([1, 2, 3]);
    expect(semanas.some((s) => s.actual)).toBe(false);
  });

  it("una campaña que todavía no empezó tiene una sola semana", () => {
    const semanas = semanasDeLaCampania("2026-11-02", null, HOY);

    expect(semanas).toEqual([{ numero: 1, desde: "2026-11-02", hasta: "2026-11-08", actual: false }]);
  });

  it("marca las semanas con acompañamiento", () => {
    const [emiliano] = datosDePrueba().colportores;
    const semanas = semanasDeLaCampania(INICIO, null, HOY);

    expect(semanasAcompanadas(emiliano, semanas)).toEqual([false, true, false, false, true, false, false, false]);
  });

  it("un acompañamiento de antes de las 8 semanas visibles cuenta en el total pero no se dibuja", () => {
    const [emiliano] = datosDePrueba().colportores;
    const semanas = semanasDeLaCampania(INICIO, null, "2026-12-02");

    expect(semanasAcompanadas(emiliano, semanas).every((t) => !t)).toBe(true);
  });
});

describe("textoHoras", () => {
  it("usa coma decimal y dice «en curso» sin horas", () => {
    expect(textoHoras(4.5)).toBe("4,5 h");
    expect(textoHoras(6)).toBe("6,0 h");
    expect(textoHoras(null)).toBe("en curso");
  });
});
