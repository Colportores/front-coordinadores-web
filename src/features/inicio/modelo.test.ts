import { describe, expect, it } from "vitest";

import type { CiudadDelDia, ColportorDelDia, TableroDelDia } from "@/datos/inicio";
import {
  claveDe,
  ciudadesDe,
  diaTexto,
  elementosDeLista,
  encabezadoDe,
  horaDeActualizacion,
  horasTexto,
  momentoCortoTexto,
  montoTexto,
  recienEmpieza,
  resumenDe,
  rotuloDelDia,
  seleccionDe,
  seleccionVigente,
  sigla,
  sinCifras,
  sumarDias,
  tarjetasPendientes,
  TODAS,
  ultimosDatosTexto,
} from "@/features/inicio/modelo";

/** Mié 21/10/2026, 10:40 en Montevideo (UTC-3). */
const AHORA = "2026-10-21T13:40:00.000Z";
const haceMin = (minutos: number) => new Date(new Date(AHORA).getTime() - minutos * 60_000).toISOString();

function colportor(parcial: Partial<ColportorDelDia> = {}): ColportorDelDia {
  return {
    id: "c-1",
    nombre: "Lucía Fernández",
    estado: "en-jornada",
    horas: 1,
    presentaciones: 1,
    ventas: 1,
    montoCentavos: 100_00,
    ultimoPushAt: null,
    ...parcial,
  };
}

function ciudad(id: string, nombre: string, departamento: string | null, colportores: ColportorDelDia[] = []): CiudadDelDia {
  return { id, nombre, departamento, colportores };
}

describe("«Últimos datos»", () => {
  it("sin ningún push dice «Sin datos»", () => {
    expect(ultimosDatosTexto(null, AHORA)).toBe("Sin datos");
  });

  it.each([
    [0, "hace menos de 1 min"],
    [1, "hace 1 min"],
    [12, "hace 12 min"],
    [59, "hace 59 min"],
    [60, "hace 1 h"],
    [160, "hace 2 h 40 min"],
    [10 * 60 + 39, "hace 10 h 39 min"], // 00:01 de hoy: todavía es hoy
  ])("hace %i minutos: «%s»", (minutos, texto) => {
    expect(ultimosDatosTexto(haceMin(minutos), AHORA)).toBe(texto);
  });

  it("de otro día de Montevideo, no de otras 24 horas: «ayer 18:30» y «hace N días»", () => {
    expect(ultimosDatosTexto("2026-10-20T21:30:00.000Z", AHORA)).toBe("ayer 18:30");
    expect(ultimosDatosTexto("2026-10-21T02:50:00.000Z", AHORA)).toBe("ayer 23:50"); // 23:50 del 20, 11 h antes
    expect(ultimosDatosTexto(haceMin(4 * 24 * 60), AHORA)).toBe("hace 4 días");
    expect(ultimosDatosTexto("2026-10-19T15:00:00.000Z", AHORA)).toBe("hace 2 días");
  });

  it("un push «del futuro» (relojes corridos) no inventa un tiempo negativo", () => {
    expect(ultimosDatosTexto(haceMin(-5), AHORA)).toBe("hace menos de 1 min");
  });

  it("una fecha ilegible dice «Sin datos» en vez de «NaN»", () => {
    expect(ultimosDatosTexto("no es una fecha", AHORA)).toBe("Sin datos");
  });

  it("momentoCortoTexto: hoy, ayer o el día", () => {
    expect(momentoCortoTexto("2026-10-21T12:15:00.000Z", AHORA)).toBe("hoy 09:15");
    expect(momentoCortoTexto("2026-10-20T21:30:00.000Z", AHORA)).toBe("ayer 18:30");
    expect(momentoCortoTexto("2026-10-14T21:30:00.000Z", AHORA)).toBe("14 oct 18:30");
  });
});

describe("textos de las cifras", () => {
  it("horas con coma y una decimal; sin horas, «0 h»", () => {
    expect(horasTexto(2.8)).toBe("2,8 h");
    expect(horasTexto(19.7)).toBe("19,7 h");
    expect(horasTexto(0)).toBe("0 h");
    expect(horasTexto(0.04)).toBe("0 h");
  });

  it("monto en pesos con punto de miles; los centavos solo si los hay", () => {
    expect(montoTexto(4350_00)).toBe("$U 4.350");
    expect(montoTexto(0)).toBe("$U 0");
    expect(montoTexto(1_234_567_00)).toBe("$U 1.234.567");
    expect(montoTexto(4350_50)).toBe("$U 4.350,50");
    expect(montoTexto(5)).toBe("$U 0,05");
  });

  it("la hora de actualización es la de Montevideo", () => {
    expect(horaDeActualizacion(AHORA)).toBe("10:40");
    expect(horaDeActualizacion("2026-10-22T02:59:00.000Z")).toBe("23:59");
    expect(horaDeActualizacion("2026-10-22T03:00:00.000Z")).toBe("00:00");
  });

  it("un «Sin iniciar» sin nada que contar va con guiones; con cifras, no", () => {
    expect(sinCifras(colportor({ estado: "sin-iniciar", horas: 0, presentaciones: 0, ventas: 0, montoCentavos: 0 }))).toBe(true);
    expect(sinCifras(colportor({ estado: "sin-iniciar", horas: 0, presentaciones: 0, ventas: 1, montoCentavos: 500 }))).toBe(false);
    expect(sinCifras(colportor({ estado: "en-jornada", horas: 0, presentaciones: 0, ventas: 0, montoCentavos: 0 }))).toBe(false);
    expect(sinCifras(colportor({ estado: "sin-cerrar", horas: 0, presentaciones: 0, ventas: 0, montoCentavos: 0 }))).toBe(false);
  });
});

describe("días", () => {
  it("suma y resta días a una fecha sin pasar por la zona del navegador", () => {
    expect(sumarDias("2026-10-21", -1)).toBe("2026-10-20");
    expect(sumarDias("2026-10-01", -1)).toBe("2026-09-30");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(sumarDias("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("el rótulo: Hoy, Ayer o el día; con año solo si no es el actual", () => {
    expect(diaTexto("2026-10-21", "2026-10-21")).toBe("mié 21 oct");
    expect(diaTexto("2025-12-31", "2026-10-21")).toBe("mié 31 dic 2025");
    expect(rotuloDelDia("2026-10-21", "2026-10-21")).toEqual({ fuerte: "Hoy", resto: "mié 21 oct" });
    expect(rotuloDelDia("2026-10-20", "2026-10-21")).toEqual({ fuerte: "Ayer", resto: "mar 20 oct" });
    expect(rotuloDelDia("2026-10-17", "2026-10-21")).toEqual({ fuerte: "sáb 17 oct", resto: "" });
  });
});

describe("elección y lista de ciudades", () => {
  const riv = ciudad("riv", "Rivera", "Rivera", [colportor({ id: "a" })]);
  const art = ciudad("art", "Artigas", "Artigas", [colportor({ id: "b", estado: "finalizada" })]);
  const bu = ciudad("bu", "Bella Unión", "Artigas", [colportor({ id: "c", estado: "sin-iniciar", horas: 0, presentaciones: 0, ventas: 0, montoCentavos: 0 })]);
  const todas = [art, bu, riv];

  it("la elección se recuerda como texto y vuelve igual; lo ilegible es «todas»", () => {
    for (const s of [TODAS, { tipo: "departamento", nombre: "artigas" }, { tipo: "ciudad", id: "riv" }] as const) {
      expect(seleccionDe(claveDe(s))).toEqual(s);
    }
    expect(seleccionDe(null)).toEqual(TODAS);
    expect(seleccionDe(7)).toEqual(TODAS);
    expect(seleccionDe("ciudad:")).toEqual(TODAS);
    expect(seleccionDe("otra cosa")).toEqual(TODAS);
  });

  it("una elección que ya no existe vuelve a «todas»", () => {
    expect(seleccionVigente({ tipo: "ciudad", id: "riv" }, todas)).toEqual({ tipo: "ciudad", id: "riv" });
    expect(seleccionVigente({ tipo: "ciudad", id: "salto" }, todas)).toEqual(TODAS);
    expect(seleccionVigente({ tipo: "departamento", nombre: "artigas" }, todas)).toEqual({ tipo: "departamento", nombre: "artigas" });
    // «Todo el departamento» solo existe con más de una ciudad: Rivera tiene una sola.
    expect(seleccionVigente({ tipo: "departamento", nombre: "rivera" }, todas)).toEqual(TODAS);
  });

  it("las ciudades de cada elección", () => {
    expect(ciudadesDe(TODAS, todas)).toEqual(todas);
    expect(ciudadesDe({ tipo: "departamento", nombre: "artigas" }, todas)).toEqual([art, bu]);
    expect(ciudadesDe({ tipo: "ciudad", id: "riv" }, todas)).toEqual([riv]);
  });

  it("la lista: todas, y por departamento «Todo el departamento» solo si tiene más de una ciudad", () => {
    const lista = elementosDeLista(todas).map((e) => (e.tipo === "grupo" ? `# ${e.etiqueta}` : e.nombre));
    expect(lista).toEqual(["Todas las ciudades", "# DEPTO. ARTIGAS", "Todo el departamento", "Artigas", "Bella Unión", "# DEPTO. RIVERA", "Rivera"]);
  });

  it("el departamento va por su clave normalizada: «Paysandu», «Paysandú» y «paysandú » son uno solo", () => {
    const ciudades = [
      ciudad("a", "Paysandú", "Paysandu"),
      ciudad("b", "Guichón", "Paysandú"),
      ciudad("c", "Piedras Coloradas", " paysandú "),
      ciudad("d", "Rivera", "rivera"),
    ];
    const lista = elementosDeLista(ciudades).map((e) => (e.tipo === "grupo" ? `# ${e.etiqueta}` : e.nombre));
    // La etiqueta es la del primer nombre en orden A-Z; «Todo el departamento» una sola vez.
    expect(lista).toEqual(["Todas las ciudades", "# DEPTO. PAYSANDU", "Todo el departamento", "Paysandú", "Guichón", "Piedras Coloradas", "# DEPTO. RIVERA", "Rivera"]);

    const eleccion = seleccionDe("departamento:Paysandú");
    expect(eleccion).toEqual({ tipo: "departamento", nombre: "paysandu" });
    expect(ciudadesDe(eleccion, ciudades).map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(seleccionVigente(eleccion, ciudades)).toEqual(eleccion);
    expect(encabezadoDe(eleccion, ciudades).titulo).toBe("Departamento Paysandu");
  });

  it("una ciudad sin departamento va al final, en su grupo, sin «Todo el departamento»", () => {
    const lista = elementosDeLista([ciudad("x", "Salto", null), ciudad("y", "Paysandú", null), riv]).map((e) =>
      e.tipo === "grupo" ? `# ${e.etiqueta}` : e.nombre,
    );
    expect(lista).toEqual(["Todas las ciudades", "# DEPTO. RIVERA", "Rivera", "# SIN DEPARTAMENTO", "Salto", "Paysandú"]);
  });

  it("sin ciudades, solo queda «Todas las ciudades» (con ceros)", () => {
    const [unico, ...resto] = elementosDeLista([]);
    expect(resto).toEqual([]);
    expect(unico).toMatchObject({ tipo: "item", nombre: "Todas las ciudades", resumen: { colportores: 0, enJornada: 0, horas: 0 } });
  });

  it("las sumas cierran con los colportores y no arrastran decimales de coma flotante", () => {
    const resumen = resumenDe([ciudad("x", "X", null, [colportor({ horas: 2.2 }), colportor({ horas: 4.1 }), colportor({ estado: "finalizada", horas: 0.1 })])]);
    expect(resumen).toMatchObject({ colportores: 3, enJornada: 2, horas: 6.4, presentaciones: 3, ventas: 3, montoCentavos: 300_00 });
  });

  it("encabezado: título y «Departamento X · N de M en jornada»", () => {
    expect(encabezadoDe({ tipo: "ciudad", id: "riv" }, todas)).toEqual({ titulo: "Rivera", subtitulo: "Departamento Rivera · 1 de 1 en jornada" });
    expect(encabezadoDe({ tipo: "departamento", nombre: "artigas" }, todas)).toEqual({ titulo: "Departamento Artigas", subtitulo: "0 de 2 en jornada" });
    expect(encabezadoDe(TODAS, todas)).toEqual({ titulo: "Todas las ciudades", subtitulo: "1 de 3 en jornada" });
    expect(encabezadoDe({ tipo: "ciudad", id: "x" }, [ciudad("x", "Salto", null)])).toEqual({ titulo: "Salto", subtitulo: "0 de 0 en jornada" });
  });

  it("«recién empieza» solo hoy y sin presentaciones ni ventas", () => {
    const sinNada = resumenDe([ciudad("x", "X", null, [colportor({ presentaciones: 0, ventas: 0 })])]);
    expect(recienEmpieza(sinNada, true)).toBe(true);
    expect(recienEmpieza(sinNada, false)).toBe(false);
    expect(recienEmpieza(resumenDe([ciudad("x", "X", null, [colportor()])]), true)).toBe(false);
    expect(recienEmpieza(resumenDe([]), true)).toBe(false);
  });
});

describe("siglas de la barra angosta", () => {
  it.each([
    ["Rivera", "Riv."],
    ["Artigas", "Art."],
    ["Bella Unión", "B. Un."],
    ["Río Branco", "R. Br."],
    ["Treinta y Tres", "T. y. T."],
    ["Sauce", "Sau."],
    ["Melo", "Mel."],
    ["Su", "Su"],
    ["", "?"],
  ])("%s → %s", (nombre, esperada) => {
    expect(sigla(nombre)).toBe(esperada);
  });
});

describe("pendientes de acción", () => {
  const riv = ciudad("riv", "Rivera", "Rivera");
  const art = ciudad("art", "Artigas", "Artigas");
  const base: TableroDelDia = {
    campaniaId: "c",
    fecha: "2026-10-21",
    esHoy: true,
    calculadoA: AHORA,
    ciudades: [riv, art],
    sinZona: [],
    pendientes: [
      { tipo: "ticket-por-validar", id: "t1", ciudadId: "riv", colportor: "Lucía Fernández", ciudad: "Rivera", montoCentavos: 9000_00, cuando: "2026-10-20T21:30:00.000Z" },
      { tipo: "ticket-por-validar", id: "t2", ciudadId: "art", colportor: "Sofía Cabral", ciudad: "Artigas", montoCentavos: 18500_00, cuando: "2026-10-21T12:15:00.000Z" },
      { tipo: "pedido-por-autorizar", id: "p1", ciudadId: "art", colportor: "Rodrigo Cardozo", ciudad: "Artigas", libros: 1, montoCentavos: 800_00, cuando: "2026-10-20T21:30:00.000Z" },
    ],
  };

  it("la ciudad ve solo lo suyo; todas ven los tickets juntos, con el más antiguo y cuántos más", () => {
    const rivera = tarjetasPendientes(base, { tipo: "ciudad", id: "riv" });
    expect(rivera.map((t) => t.titulo)).toEqual(["Ticket de depósito por validar"]);
    expect(rivera[0].detalle).toBe("Lucía Fernández · Rivera · $U 9.000 · ayer 18:30");
    expect(rivera[0].acciones).toEqual([{ texto: "Validar", tono: "primaria", destino: { pestana: "cuentas", href: "/cuentas" } }]);

    const todas = tarjetasPendientes(base, TODAS);
    expect(todas.map((t) => t.titulo)).toEqual(["2 tickets de depósito por validar", "Pedido de libros por autorizar"]);
    expect(todas[0].detalle).toBe("Lucía Fernández · Rivera · $U 9.000 · ayer 18:30 · y 1 más");
    expect(todas[1].detalle).toBe("Rodrigo Cardozo · Artigas · 1 libro · $U 800 · ayer 18:30");
    expect(todas[1].acciones.map((a) => a.texto)).toEqual(["Autorizar", "Rechazar"]);
    expect(todas[1].acciones.every((a) => a.destino === undefined)).toBe(true);
  });

  it("sin pendientes no hay tarjetas", () => {
    expect(tarjetasPendientes({ ...base, pendientes: [] }, TODAS)).toEqual([]);
  });

  it("quien no tiene zona figura en toda elección, con cuándo se sumó y «Asignar zona» hacia Ciudades", () => {
    const sinZona = [{ id: "r", nombre: "Rocío Benítez", estado: "sin-iniciar" as const, deBaja: false, inscriptoAt: "2026-10-21T14:02:00.000Z", ultimoPushAt: null }];
    const tablero = { ...base, pendientes: [], sinZona };
    for (const seleccion of [TODAS, { tipo: "ciudad", id: "riv" } as const]) {
      const [tarjeta] = tarjetasPendientes(tablero, seleccion);
      expect(tarjeta).toMatchObject({ etiqueta: "EQUIPO", titulo: "Colportor sin zona asignada", detalle: "Rocío Benítez · se sumó hoy a las 11:02" });
      expect(tarjeta.acciones).toEqual([{ texto: "Asignar zona", tono: "primaria", destino: { pestana: "ciudades", href: "/ciudades" } }]);
    }
  });

  it("varios sin zona: una tarjeta con la lista; quien ya se dio de baja no se ofrece", () => {
    const persona = (id: string, nombre: string, inscriptoAt: string, deBaja = false) => ({ id, nombre, estado: "sin-iniciar" as const, deBaja, inscriptoAt, ultimoPushAt: null });
    const tablero = {
      ...base,
      pendientes: [],
      sinZona: [
        persona("1", "Rocío Benítez", "2026-10-21T14:02:00.000Z"),
        persona("2", "Ana Pérez", "2026-10-20T21:30:00.000Z"),
        persona("3", "Luis Gómez", "2026-10-14T12:00:00.000Z"),
        persona("4", "Baja Reciente", "2026-10-21T14:02:00.000Z", true),
      ],
    };
    const [tarjeta] = tarjetasPendientes(tablero, TODAS);
    expect(tarjeta.titulo).toBe("3 colportores sin zona asignada");
    expect(tarjeta.personas).toEqual([
      { id: "1", nombre: "Rocío Benítez", cuando: "se sumó hoy a las 11:02" },
      { id: "2", nombre: "Ana Pérez", cuando: "se sumó ayer a las 18:30" },
      { id: "3", nombre: "Luis Gómez", cuando: "se sumó el 14 oct a las 09:00" },
    ]);
    expect(tarjetasPendientes({ ...tablero, sinZona: [persona("4", "Baja", "2026-10-21T14:02:00.000Z", true)] }, TODAS)).toEqual([]);
  });
});
