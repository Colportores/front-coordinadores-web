import { describe, expect, it } from "vitest";

import { crearHorasSimuladas } from "@/datos/reportes/simulado";

import { armarReporte, type ReporteArmado } from "./armado";
import type { Ambito } from "./ambito";
import { AMBITO_TODAS } from "./ambito";
import type { Granularidad } from "./calculo";
import canvas from "./canvas-32.json";
import { datosDePrueba, datosDePruebaConVentas } from "./datos-de-prueba";
import { cifrasVisibles, listarNombres, MOSTRAR_POR_COBRAR } from "./metricas";
import type { FilaDeTabla } from "./TablaDeReporte";

/** Lo que muestra la tabla, en el mismo formato que `canvas-32.json`: «valor|tendencia» por celda. */
function filasComoEnElCanvas(filas: FilaDeTabla[], sinPorCobrar: boolean) {
  return filas.map((f) =>
    f.tipo === "grupo"
      ? { grupo: f.nombre, detalle: f.detalle }
      : {
          nombre: f.nombre,
          nota: f.nota,
          celdas: f.celdas
            .filter((c) => !sinPorCobrar || c.clave !== "porCobrar")
            .map((c) => `${c.valor}|${c.tendencia?.texto ?? ""}`),
        },
  );
}

function tarjetasComoEnElCanvas(r: ReporteArmado) {
  return r.tarjetas.map((t) => ({
    etiqueta: t.etiqueta,
    valor: t.valor,
    tendencia: t.tendencia?.texto ?? "",
    nota: t.nota,
    campania: t.campania,
  }));
}

describe("las cifras de los cinco tableros del canvas 32 (HU-REP-002), una por una", () => {
  const sim = crearHorasSimuladas();
  const bruno = sim.ciudades[0].colportores.find((c) => c.nombre === "Bruno Techera")!;
  const tableros: { ambito: Ambito; granularidad: Granularidad }[] = [
    { ambito: AMBITO_TODAS, granularidad: "semana" },
    { ambito: { tipo: "ciudad", ciudadId: "ciu-rivera" }, granularidad: "semana" },
    { ambito: { tipo: "ciudad", ciudadId: "ciu-rivera" }, granularidad: "dia" },
    { ambito: { tipo: "ciudad", ciudadId: "ciu-rivera" }, granularidad: "mes" },
    { ambito: { tipo: "colportor", colportorId: bruno.id }, granularidad: "semana" },
  ];

  it("el canvas trae los cinco tableros", () => {
    expect(canvas).toHaveLength(5);
  });

  it.each(tableros.map((t, i) => [canvas[i].tablero, t, canvas[i]] as const))(
    "%s: título, subtítulo, tarjetas y tabla coinciden con el canvas, con el % por cobrar encendido",
    (_nombre, { ambito, granularidad }, esperado) => {
      const r = armarReporte(sim, ambito, granularidad, { porCobrar: true });
      expect(r.titulo).toBe(esperado.titulo);
      expect(r.subtitulo).toBe(esperado.subtitulo);
      expect(tarjetasComoEnElCanvas(r)).toEqual(esperado.tarjetas);
      expect(r.tabla.primeraColumna).toBe(esperado.primeraColumna);
      expect(r.tabla.columnas.map((c) => c.encabezado)).toEqual(["HORAS", "PRESENTACIONES", "VENTAS", "MONTO", "% POR COBRAR"]);
      expect(filasComoEnElCanvas(r.tabla.filas, false)).toEqual(esperado.filas);
    },
  );

  it.each(tableros.map((t, i) => [canvas[i].tablero, t, canvas[i]] as const))(
    "%s: con el % por cobrar apagado (V2) es el mismo tablero sin esa tarjeta ni esa columna",
    (_nombre, { ambito, granularidad }, esperado) => {
      const r = armarReporte(sim, ambito, granularidad);
      expect(tarjetasComoEnElCanvas(r)).toEqual(esperado.tarjetas.filter((t) => t.etiqueta !== "% POR COBRAR"));
      expect(r.tabla.columnas.map((c) => c.encabezado)).toEqual(["HORAS", "PRESENTACIONES", "VENTAS", "MONTO"]);
      expect(filasComoEnElCanvas(r.tabla.filas, true)).toEqual(
        esperado.filas.map((f) => (f.celdas ? { ...f, celdas: f.celdas.slice(0, 4) } : f)),
      );
    },
  );

  it("el % por cobrar sigue apagado hasta que se conecte la V2", () => {
    expect(MOSTRAR_POR_COBRAR).toBe(false);
    expect(cifrasVisibles(MOSTRAR_POR_COBRAR).map((c) => c.clave)).toEqual(["horas", "presentaciones", "ventas", "monto"]);
  });
});

describe("armarReporte · presentaciones, ventas y monto (datos a mano)", () => {
  const datos = datosDePruebaConVentas();
  const tarjeta = (r: ReporteArmado, etiqueta: string) => r.tarjetas.find((t) => t.etiqueta === etiqueta)!;
  const fila = (r: ReporteArmado, clave: string) => {
    const f = r.tabla.filas.find((x) => x.clave === clave);
    if (!f || f.tipo !== "fila") throw new Error(`no hay fila ${clave}`);
    return f;
  };
  const celdas = (r: ReporteArmado, clave: string) =>
    Object.fromEntries(fila(r, clave).celdas.map((c) => [c.clave, [c.valor, c.tendencia?.texto ?? null]]));

  it("todas las ciudades, por semanas: S2 contra S1", () => {
    const r = armarReporte(datos, AMBITO_TODAS, "semana");
    expect(r.tarjetas.map((t) => t.etiqueta)).toEqual(["HORAS", "PRESENTACIONES", "VENTAS"]);
    expect(tarjeta(r, "PRESENTACIONES")).toMatchObject({ valor: "96", nota: "S2 · contra S1", campania: "Campaña: 225" });
    expect(tarjeta(r, "PRESENTACIONES").tendencia?.texto).toBe("▲ 7%"); // 90 → 96
    expect(tarjeta(r, "VENTAS")).toMatchObject({ valor: "40", campania: "Campaña: 86 · $U 73.400" });
    expect(tarjeta(r, "VENTAS").tendencia?.texto).toBe("▲ 33%"); // 30 → 40
  });

  it("el gráfico de cada cifra se dice con palabras y marca la semana en curso", () => {
    const r = armarReporte(datos, AMBITO_TODAS, "semana");
    expect(tarjeta(r, "PRESENTACIONES").resumenDelGrafico).toBe("Presentaciones por semana: S1: 90; S2: 96; S3: 39 (en curso).");
    expect(tarjeta(r, "VENTAS").resumenDelGrafico).toBe("Ventas por semana: S1: 30; S2: 40; S3: 16 (en curso).");
    expect(tarjeta(r, "VENTAS").barras.map((b) => [b.rotulo, b.enCurso])).toEqual([
      ["S1", false],
      ["S2", false],
      ["S3", true],
    ]);
    expect(tarjeta(r, "VENTAS").barras[1].proporcion).toBe(1); // S2 = 40 es la más alta
  });

  it("cada colportor trae sus cifras con su propia tendencia, y el monto en $U", () => {
    const r = armarReporte(datos, AMBITO_TODAS, "semana");
    expect(celdas(r, "ana")).toEqual({
      horas: ["36,0", "= 0%"],
      presentaciones: ["30", "▲ 25%"],
      ventas: ["12", "▲ 100%"],
      monto: ["$U 9.000", "▲ 50%"],
    });
    // Beto solo tiene cuatro días en S2: baja un tercio en todo
    expect(celdas(r, "beto")).toEqual({
      horas: ["32,0", "▼ 33%"],
      presentaciones: ["12", "▼ 33%"],
      ventas: ["4", "▼ 33%"],
      monto: ["$U 3.200", "▼ 33%"],
    });
  });

  it("la descripción de la tabla dice qué cifras trae", () => {
    expect(armarReporte(datos, AMBITO_TODAS, "semana").tabla.descripcion).toBe(
      "Horas, presentaciones, ventas y monto por colportor, semana",
    );
    expect(armarReporte(datos, { tipo: "colportor", colportorId: "ana" }, "mes").tabla.descripcion).toBe(
      "Horas, presentaciones, ventas y monto de Ana Silva por mes",
    );
    expect(armarReporte(datos, AMBITO_TODAS, "dia", { porCobrar: true }).tabla.descripcion).toBe(
      "Horas, presentaciones, ventas, monto y % por cobrar por colportor, día",
    );
    expect(listarNombres(cifrasVisibles(false).slice(0, 1))).toBe("horas");
  });

  it("la ficha de un colportor: una fila por semana, cada cifra comparada con la fila anterior y sin tendencia en la que está en curso", () => {
    const r = armarReporte(datos, { tipo: "colportor", colportorId: "ana" }, "semana");
    const porSemana = r.tabla.filas.flatMap((f) => (f.tipo === "fila" ? [f] : []));
    expect(porSemana.map((f) => f.nombre)).toEqual(["S1 · 05/10", "S2 · 12/10", "S3 · 19/10"]);
    expect(Object.fromEntries(porSemana[0].celdas.map((c) => [c.clave, [c.valor, c.tendencia?.texto ?? null]]))).toEqual({
      horas: ["36,0", null],
      presentaciones: ["24", null],
      ventas: ["6", null],
      monto: ["$U 6.000", null],
    });
    expect(Object.fromEntries(porSemana[1].celdas.map((c) => [c.clave, [c.valor, c.tendencia?.texto ?? null]]))).toMatchObject({
      presentaciones: ["30", "▲ 25%"],
      ventas: ["12", "▲ 100%"],
      monto: ["$U 9.000", "▲ 50%"],
    });
    expect(porSemana[2]).toMatchObject({ nota: "en curso", enCurso: true });
    expect(Object.fromEntries(porSemana[2].celdas.map((c) => [c.clave, [c.valor, c.tendencia?.texto ?? null]]))).toMatchObject({
      presentaciones: ["12", null],
      ventas: ["4", null],
      monto: ["$U 3.000", null],
    });
  });

  it("la campaña de un colportor incluye todos sus días", () => {
    const r = armarReporte(datos, { tipo: "colportor", colportorId: "ana" }, "semana");
    expect(tarjeta(r, "PRESENTACIONES").campania).toBe("Campaña: 66"); // 24 + 30 + 12
    expect(tarjeta(r, "VENTAS").campania).toBe("Campaña: 22 · $U 18.000"); // 6 + 12 + 4; 6.000 + 9.000 + 3.000
  });

  it("sin datos de ventas (horas sí): guion, sin tendencia, y la tarjeta lo dice", () => {
    const r = armarReporte(datosDePrueba(), AMBITO_TODAS, "semana");
    expect(tarjeta(r, "VENTAS")).toMatchObject({ valor: "—", tendencia: null, nota: "S2: sin datos", campania: "Campaña: —" });
    expect(tarjeta(r, "PRESENTACIONES").resumenDelGrafico).toBe(
      "Presentaciones por semana: S1: sin datos; S2: sin datos; S3: sin datos (en curso).",
    );
    expect(tarjeta(r, "VENTAS").barras.every((b) => b.sinDatos)).toBe(true);
    expect(celdas(r, "ana").ventas).toEqual(["—", null]);
    expect(celdas(r, "ana").monto).toEqual(["—", null]);
    // las horas siguen igual
    expect(tarjeta(r, "HORAS").valor).toBe("122");
  });

  it("un día sin datos de ventas no es un día de 0 ventas: no suma y no arrastra", () => {
    const r = armarReporte(datos, { tipo: "colportor", colportorId: "beto" }, "dia");
    const ultima = r.tabla.filas.at(-1);
    expect(ultima).toMatchObject({ tipo: "fila", nota: "sin datos · últimos datos el 15/10" });
    expect(ultima && ultima.tipo === "fila" && ultima.celdas.every((c) => c.valor === "—" && c.tendencia === null)).toBe(true);
  });

  it("un día con 0 ventas es un dato; el período en curso no se compara y el cerrado sí", () => {
    // Ana: hoy (21/10) tiene 0 ventas y 0 $U; ayer, 2 ventas y $U 1.500
    const ayer = armarReporte(datos, { tipo: "colportor", colportorId: "ana" }, "dia");
    const filas = ayer.tabla.filas.flatMap((f) => (f.tipo === "fila" ? [f] : []));
    const hoy = filas.at(-1)!;
    expect(hoy.enCurso).toBe(true);
    expect(hoy.celdas.find((c) => c.clave === "ventas")).toMatchObject({ valor: "0", tendencia: null }); // en curso: no se compara
    // cerrada la semana, 4 ventas contra 12 son ▼ 67 %
    const cerrada = armarReporte({ ...datos, hoy: "2026-10-26" }, { tipo: "colportor", colportorId: "ana" }, "semana");
    const s3 = cerrada.tabla.filas.flatMap((f) => (f.tipo === "fila" ? [f] : [])).find((f) => f.nombre.startsWith("S3"));
    expect(s3?.celdas.find((c) => c.clave === "ventas")).toMatchObject({ valor: "4", tendencia: expect.objectContaining({ texto: "▼ 67%" }) });
  });
});

describe("armarReporte · % por cobrar (V2), encendido", () => {
  const datos = datosDePruebaConVentas();
  const opciones = { porCobrar: true };

  it("la tarjeta y la columna dicen cuánto falta cobrar, y la tendencia va en puntos", () => {
    const r = armarReporte(datos, AMBITO_TODAS, "semana", opciones);
    const tarjeta = r.tarjetas.find((t) => t.etiqueta === "% POR COBRAR")!;
    // S1: cobró 18.600 de 25.800 → 28 % por cobrar; S2: 19.600 de 33.800 → 42 %
    expect(tarjeta).toMatchObject({ valor: "42%", nota: "S2 · contra S1", campania: "Campaña: 35%" });
    expect(tarjeta.tendencia).toEqual({ sentido: "sube", texto: "▲ 14 pts", textoAccesible: "hay 14 puntos más por cobrar" });
    expect(tarjeta.resumenDelGrafico).toBe("% por cobrar por semana: S1: 28%; S2: 42%; S3: 33% (en curso).");
    expect(r.tabla.columnas.at(-1)).toEqual({ clave: "porCobrar", encabezado: "% POR COBRAR" });
  });

  it("por colportor: Ana pasa de 20 % a 40 % por cobrar", () => {
    const r = armarReporte(datos, AMBITO_TODAS, "semana", opciones);
    const ana = r.tabla.filas.find((f) => f.clave === "ana");
    const celda = ana && ana.tipo === "fila" ? ana.celdas.find((c) => c.clave === "porCobrar") : undefined;
    expect(celda).toMatchObject({ valor: "40%", sinDatos: false });
    expect(celda?.tendencia?.texto).toBe("▲ 20 pts");
  });

  it("si lo cobrado todavía no llega (null), la cifra se ve con guion y sin tendencia, sin inventar un 100 %", () => {
    const sinCobros = {
      ...datos,
      ciudades: datos.ciudades.map((c) => ({
        ...c,
        colportores: c.colportores.map((p) => ({
          ...p,
          ventasPorDia: Object.fromEntries(Object.entries(p.ventasPorDia).map(([f, d]) => [f, { ...d, cobrado: null }])),
        })),
      })),
    };
    const r = armarReporte(sinCobros, AMBITO_TODAS, "semana", opciones);
    const tarjeta = r.tarjetas.find((t) => t.etiqueta === "% POR COBRAR")!;
    expect(tarjeta).toMatchObject({ valor: "—", tendencia: null, nota: "S2: sin datos", campania: "Campaña: —" });
    // lo demás sigue mostrándose
    expect(r.tarjetas.find((t) => t.etiqueta === "VENTAS")?.valor).toBe("40");
  });

  it("el estado por defecto no trae la tarjeta ni la columna", () => {
    const r = armarReporte(datos, AMBITO_TODAS, "semana");
    expect(r.tarjetas.map((t) => t.etiqueta)).not.toContain("% POR COBRAR");
    expect(r.tabla.columnas.map((c) => c.clave)).not.toContain("porCobrar");
  });
});
