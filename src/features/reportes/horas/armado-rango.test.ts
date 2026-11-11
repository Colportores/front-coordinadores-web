import { describe, expect, it } from "vitest";

import { AMBITO_TODAS } from "./ambito";
import { armarReporteDeRango } from "./armado";
import type { ColumnaDeReporte } from "./calculo";
import { conAcompanamientos, datosDePruebaConVentas } from "./datos-de-prueba";
import type { FilaDeTabla } from "./TablaDeReporte";

// Campaña desde el lunes 05/10 hasta hoy, miércoles 21/10 (ver datos-de-prueba.ts). Del 12 al 17/10 (S2):
//   Ana 36 h en 6 días, Beto 32 h en 4 días (hasta el 15/10), Carla 30 h en 6 días, Darío 24 h en 6 días.
//   Todos: 122 h en 22 días de trabajo (5,5 h por día); acompañadas: Ana 2, Beto 1, Darío 1 = 4.
const datos = conAcompanamientos(datosDePruebaConVentas());
const S2 = { desde: "2026-10-12", hasta: "2026-10-17" };

function celda(fila: FilaDeTabla | undefined, clave: ColumnaDeReporte) {
  if (!fila || fila.tipo !== "fila") throw new Error("no es una fila");
  const encontrada = fila.celdas.find((c) => c.clave === clave);
  if (!encontrada) throw new Error(`no hay columna ${clave}`);
  return encontrada;
}

const filaDe = (filas: FilaDeTabla[], nombre: string) => filas.find((f) => f.tipo === "fila" && f.nombre === nombre);

describe("armarReporteDeRango · todas las ciudades", () => {
  const r = armarReporteDeRango(datos, AMBITO_TODAS, S2);

  it("dice el rango en el subtítulo y no tiene problema", () => {
    expect(r.problemaDeRango).toBeNull();
    expect(r.titulo).toBe("Todas las ciudades");
    expect(r.subtitulo).toBe("4 colportores · Del 12/10/2026 al 17/10/2026");
    expect(r.periodo).toBe("Del 12/10/2026 al 17/10/2026");
    expect(r.rotuloDelPeriodo).toBe("12/10/2026 al 17/10/2026");
  });

  it("las tarjetas son el total de horas, el promedio por día trabajado, las jornadas con acompañamiento, presentaciones y ventas", () => {
    expect(r.tarjetas.map((t) => [t.clave, t.etiqueta, t.valor])).toEqual([
      ["horas", "HORAS", "122"],
      ["promedio", "PROMEDIO POR DÍA", "5,5"],
      ["acompaniadas", "JORNADAS CON ACOMPAÑAMIENTO", "4"],
      ["presentaciones", "PRESENTACIONES", "96"],
      ["ventas", "VENTAS", "40"],
    ]);
  });

  it("cada tarjeta dice de qué días es y no lleva tendencia ni gráfico (no hay período anterior)", () => {
    const [horas, promedio, acompaniadas, , ventas] = r.tarjetas;
    expect(horas.nota).toBe("Del 12/10/2026 al 17/10/2026");
    expect(promedio.nota).toBe("22 días trabajados (sumando colportores)");
    expect(acompaniadas.nota).toBe("Jornadas cerradas con acompañante");
    expect(ventas.campania).toBe("$U 33.800");
    for (const t of r.tarjetas) {
      expect(t.tendencia).toBeNull();
      expect(t.barras).toEqual([]);
    }
  });

  it("la tabla tiene una fila por colportor, agrupada por ciudad, con las siete columnas", () => {
    expect(r.tabla.primeraColumna).toBe("COLPORTOR");
    expect(r.tabla.columnas.map((c) => c.encabezado)).toEqual([
      "HORAS",
      "DÍAS TRABAJADOS",
      "PROMEDIO POR DÍA",
      "CON ACOMPAÑAMIENTO",
      "PRESENTACIONES",
      "VENTAS",
      "MONTO",
    ]);
    expect(r.tabla.filas.map((f) => (f.tipo === "grupo" ? `# ${f.nombre}` : f.nombre))).toEqual([
      "# Rivera",
      "Ana Silva",
      "Beto Techera",
      "# Artigas",
      "Carla Rey",
      "# Bella Unión",
      "Darío Viera",
    ]);
  });

  it("cada colportor trae sus horas, días, promedio y acompañamientos del rango", () => {
    const f = r.tabla.filas;
    const ana = filaDe(f, "Ana Silva");
    expect(celda(ana, "horas")).toMatchObject({ valor: "36,0", crudo: 36, tendencia: null });
    expect(celda(ana, "diasTrabajados").valor).toBe("6");
    expect(celda(ana, "promedio")).toMatchObject({ valor: "6,0", crudo: 6 });
    expect(celda(ana, "acompaniadas").valor).toBe("2");
    const beto = filaDe(f, "Beto Techera");
    expect(celda(beto, "horas").valor).toBe("32,0");
    expect(celda(beto, "diasTrabajados").valor).toBe("4");
    expect(celda(beto, "promedio").valor).toBe("8,0");
    expect(celda(beto, "acompaniadas").valor).toBe("1");
    expect(celda(filaDe(f, "Carla Rey"), "acompaniadas").valor).toBe("0");
  });

  it("el promedio es horas entre días trabajados, no entre los días del calendario", () => {
    // Beto trabajó 4 de los 6 días: 32 / 4 = 8 y no 32 / 6.
    expect(celda(filaDe(r.tabla.filas, "Beto Techera"), "promedio").crudo).toBe(8);
  });
});

describe("armarReporteDeRango · rangos y datos límite", () => {
  it("un colportor sin datos en el rango sale con guion y con desde cuándo no hay", () => {
    const r = armarReporteDeRango(datos, AMBITO_TODAS, { desde: "2026-10-16", hasta: "2026-10-21" });
    const beto = filaDe(r.tabla.filas, "Beto Techera");
    expect(beto).toMatchObject({ nota: "sin datos desde el 15/10" });
    expect(celda(beto, "horas")).toMatchObject({ valor: "—", crudo: null, sinDatos: true });
    expect(celda(beto, "promedio")).toMatchObject({ valor: "—", crudo: null, sinDatos: true });
    expect(celda(beto, "acompaniadas")).toMatchObject({ valor: "—", sinDatos: true });
  });

  it("un rango sin ningún dato dice «Sin datos en estos días» en vez de inventar un 0", () => {
    // El domingo 18/10 no se trabaja: no entra en ningún período.
    const r = armarReporteDeRango(datos, AMBITO_TODAS, { desde: "2026-10-18", hasta: "2026-10-18" });
    expect(r.problemaDeRango).toBeNull();
    expect(r.tarjetas.map((t) => t.valor)).toEqual(["—", "—", "—", "—", "—"]);
    expect(r.tarjetas[0].nota).toBe("Sin datos en estos días");
    expect(celda(filaDe(r.tabla.filas, "Ana Silva"), "horas").valor).toBe("—");
  });

  it("un rango de un solo día (hoy, en curso) cuenta lo cerrado hasta ahora", () => {
    const r = armarReporteDeRango(datos, { tipo: "colportor", colportorId: "ana" }, { desde: "2026-10-21", hasta: "2026-10-21" });
    expect(r.tarjetas[0]).toMatchObject({ valor: "3,0" });
    expect(r.tabla.filas).toMatchObject([{ nombre: "mié 21/10", nota: "en curso", enCurso: true }]);
  });

  it("todo el período de la campaña suma lo mismo que las semanas", () => {
    const r = armarReporteDeRango(datos, AMBITO_TODAS, { desde: "2026-10-05", hasta: "2026-10-21" });
    expect(r.tarjetas[0].valor).toBe("302"); // «Campaña: 302» de la vista por semanas
    expect(r.tarjetas[2].valor).toBe("5");
  });

  it("una ciudad sola no agrupa", () => {
    const r = armarReporteDeRango(datos, { tipo: "ciudad", ciudadId: "rivera" }, S2);
    expect(r.tabla.filas.map((f) => f.tipo)).toEqual(["fila", "fila"]);
    expect(r.tarjetas[0].valor).toBe("68");
  });

  it("sin el conteo de acompañamientos (la fuente no lo trae) la cifra queda sin datos, no en 0", () => {
    const sin = {
      ...datos,
      ciudades: datos.ciudades.map((c) => ({
        ...c,
        colportores: c.colportores.map((p) => ({ ...p, acompaniadasPorDia: {} })),
      })),
    };
    const r = armarReporteDeRango(sin, AMBITO_TODAS, S2);
    expect(r.tarjetas[2]).toMatchObject({ valor: "—", nota: "Sin datos en estos días" });
    expect(r.tarjetas[0].valor).toBe("122");
  });
});

describe("armarReporteDeRango · fechas que no sirven", () => {
  const casos: [string, { desde: string; hasta: string }, string][] = [
    ["falta una fecha", { desde: "2026-10-12", hasta: "" }, "Elegí desde qué día y hasta qué día querés ver el reporte."],
    ["«desde» después de «hasta»", { desde: "2026-10-17", hasta: "2026-10-12" }, "La fecha «desde» (17/10/2026) es posterior a «hasta» (12/10/2026). Cambiá una de las dos para ver el reporte."],
    ["antes de la campaña", { desde: "2026-09-01", hasta: "2026-10-12" }, "El rango tiene que estar dentro de la campaña, del 05/10/2026 al 21/10/2026. Corregí las fechas para ver el reporte."],
    ["después de hoy", { desde: "2026-10-12", hasta: "2026-10-30" }, "El rango tiene que estar dentro de la campaña, del 05/10/2026 al 21/10/2026. Corregí las fechas para ver el reporte."],
  ];

  it.each(casos)("%s: no arma cifras ni filas y dice qué hacer", (_nombre, rango, texto) => {
    const r = armarReporteDeRango(datos, AMBITO_TODAS, rango);
    expect(r.problemaDeRango).toBe(texto);
    expect(r.tarjetas).toEqual([]);
    expect(r.tabla.filas).toEqual([]);
    expect(r.periodo).toBe("");
    expect(r.titulo).toBe("Todas las ciudades");
  });
});

describe("armarReporteDeRango · un colportor, por día", () => {
  const r = armarReporteDeRango(datos, { tipo: "colportor", colportorId: "ana" }, S2);

  it("una fila por día de trabajo del rango, con el desglose del día", () => {
    expect(r.tabla.primeraColumna).toBe("DÍA");
    expect(r.tabla.filas.map((f) => (f.tipo === "fila" ? f.nombre : ""))).toEqual([
      "lun 12/10",
      "mar 13/10",
      "mié 14/10",
      "jue 15/10",
      "vie 16/10",
      "sáb 17/10",
    ]);
    const martes = r.tabla.filas[1];
    expect(celda(martes, "horas").valor).toBe("6,0");
    expect(celda(martes, "diasTrabajados").valor).toBe("1");
    expect(celda(martes, "acompaniadas").valor).toBe("1");
    expect(celda(r.tabla.filas[0], "acompaniadas").valor).toBe("0");
  });

  it("las tarjetas son las de ese colportor, con un decimal, y se vuelve a su ciudad", () => {
    expect(r.titulo).toBe("Ana Silva");
    expect(r.tarjetas.map((t) => t.valor)).toEqual(["36,0", "6,0", "2", "30", "12"]);
    expect(r.tarjetas[1].nota).toBe("6 días trabajados");
    expect(r.volverA).toEqual({ nombre: "Rivera", ambito: { tipo: "ciudad", ciudadId: "rivera" } });
  });

  it("un día sin datos del colportor sale como «sin datos»", () => {
    const beto = armarReporteDeRango(datos, { tipo: "colportor", colportorId: "beto" }, S2);
    const sabado = beto.tabla.filas[5];
    expect(sabado).toMatchObject({ nombre: "sáb 17/10", nota: "sin datos" });
    expect(celda(sabado, "horas")).toMatchObject({ valor: "—", crudo: null });
  });
});

describe("armarReporteDeRango · colportores elegidos", () => {
  it("con dos elegidos suma solo a esos dos y lo dice", () => {
    const r = armarReporteDeRango(datos, AMBITO_TODAS, S2, { elegidos: ["ana", "carla"] });
    expect(r.subtitulo).toBe("2 colportores · Del 12/10/2026 al 17/10/2026");
    expect(r.tarjetas.map((t) => t.valor)).toEqual(["66", "5,5", "2", "66", "30"]);
    expect(r.tabla.filas.map((f) => (f.tipo === "grupo" ? `# ${f.nombre}` : f.nombre))).toEqual(["# Rivera", "Ana Silva", "# Artigas", "Carla Rey"]);
  });

  it("con uno solo se ve por día, sin botón para volver (se vuelve quitando la elección)", () => {
    const r = armarReporteDeRango(datos, AMBITO_TODAS, S2, { elegidos: ["beto"] });
    expect(r.titulo).toBe("Beto Techera");
    expect(r.tabla.primeraColumna).toBe("DÍA");
    expect(r.volverA).toBeNull();
  });

  it("una elección que ya no existe en el ámbito se ignora y se ve todo", () => {
    const r = armarReporteDeRango(datos, { tipo: "ciudad", ciudadId: "rivera" }, S2, { elegidos: ["carla", "nadie"] });
    expect(r.tarjetas[0].valor).toBe("68");
    expect(r.subtitulo).toContain("2 colportores");
  });

  it("los elegidos solo valen dentro del ámbito: elegir a Carla en Rivera no la suma", () => {
    const r = armarReporteDeRango(datos, { tipo: "ciudad", ciudadId: "rivera" }, S2, { elegidos: ["ana", "carla"] });
    expect(r.titulo).toBe("Ana Silva");
  });
});
