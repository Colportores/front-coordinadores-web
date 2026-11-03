import { describe, expect, it } from "vitest";

import { crearHorasSimuladas } from "@/datos/reportes/simulado";

import { AMBITO_TODAS, construirLista, construirRiel, resolverAmbito, abreviarCiudad } from "./ambito";
import { armarReporte, textoSinDatosDesde } from "./armado";
import type { MedidaMostrada } from "./calculo";
import { datosDePrueba } from "./datos-de-prueba";
import type { FilaDeTabla } from "./TablaDeReporte";

const datos = datosDePrueba();

/** La celda de una columna de una fila (por omisión, la de horas). */
function celda(fila: FilaDeTabla | undefined, clave: MedidaMostrada = "horas") {
  if (!fila || fila.tipo !== "fila") throw new Error("no es una fila de colportor");
  const encontrada = fila.celdas.find((c) => c.clave === clave);
  if (!encontrada) throw new Error(`no hay columna ${clave}`);
  return encontrada;
}

describe("armarReporte · todas las ciudades", () => {
  it("semanas: la última completa (S2) contra la anterior, con el total de la campaña", () => {
    const r = armarReporte(datos, AMBITO_TODAS, "semana");
    expect(r.titulo).toBe("Todas las ciudades");
    expect(r.subtitulo).toBe("4 colportores · S2 contra S1");
    expect(r.tarjetas[0]).toMatchObject({ valor: "122", nota: "S2 · contra S1", campania: "Campaña: 302" });
    expect(r.tarjetas[0].tendencia?.texto).toBe("▼ 12%");
    expect(r.volverA).toBeNull();
  });

  it("las barras son las tres semanas; la que está en curso va rayada y la más alta ocupa todo el alto", () => {
    const { barras } = armarReporte(datos, AMBITO_TODAS, "semana").tarjetas[0];
    expect(barras.map((b) => [b.rotulo, b.enCurso, b.sinDatos])).toEqual([
      ["S1", false, false],
      ["S2", false, false],
      ["S3", true, false],
    ]);
    expect(barras[0].proporcion).toBe(1); // S1 = 138 h es la más alta
    expect(barras[1].proporcion).toBeCloseTo(122 / 138);
  });

  it("la tabla agrupa por ciudad y cada colportor lleva su propia tendencia", () => {
    const { filas } = armarReporte(datos, AMBITO_TODAS, "semana").tabla;
    expect(filas.map((f) => (f.tipo === "grupo" ? `# ${f.nombre} · ${f.detalle}` : f.nombre))).toEqual([
      "# Rivera · 2 colportores",
      "Ana Silva",
      "Beto Techera",
      "# Artigas · 1 colportor",
      "Carla Rey",
      "# Bella Unión · 1 colportor",
      "Darío Viera",
    ]);
    const ana = filas.find((f) => f.clave === "ana");
    const beto = filas.find((f) => f.clave === "beto");
    expect(ana).toMatchObject({ nota: null });
    expect(celda(ana)).toMatchObject({ valor: "36,0" });
    expect(celda(ana).tendencia?.texto).toBe("= 0%");
    expect(celda(beto).valor).toBe("32,0");
    expect(celda(beto).tendencia?.texto).toBe("▼ 33%");
  });

  it("el encabezado de la primera columna dice qué período se compara", () => {
    expect(armarReporte(datos, AMBITO_TODAS, "semana").tabla.primeraColumna).toBe("COLPORTOR · S2");
    expect(armarReporte(datos, AMBITO_TODAS, "dia").tabla.primeraColumna).toBe("COLPORTOR · AYER");
    expect(armarReporte(datos, AMBITO_TODAS, "mes").tabla.primeraColumna).toBe("COLPORTOR · OCT. A LA FECHA");
  });
});

describe("armarReporte · ciudad, departamento y colportor", () => {
  it("una ciudad: el subtítulo trae su departamento y no repite el nombre de la ciudad en la tabla", () => {
    const r = armarReporte(datos, { tipo: "ciudad", ciudadId: "rivera" }, "semana");
    expect(r.titulo).toBe("Rivera");
    expect(r.subtitulo).toBe("Departamento Rivera · 2 colportores · S2 contra S1");
    expect(r.tarjetas[0]).toMatchObject({ valor: "68", campania: "Campaña: 167" });
    expect(r.tarjetas[0].tendencia?.texto).toBe("▼ 19%");
    expect(r.tabla.filas.every((f) => f.tipo === "fila")).toBe(true);
  });

  it("«Todo el departamento» suma sus ciudades, con una fila de encabezado por ciudad", () => {
    const r = armarReporte(datos, { tipo: "departamento", departamento: "Artigas" }, "semana");
    expect(r.titulo).toBe("Departamento Artigas");
    expect(r.subtitulo).toBe("2 colportores · S2 contra S1");
    expect(r.tarjetas[0].valor).toBe("54");
    expect(r.tarjetas[0].tendencia?.texto).toBe("= 0%");
    expect(r.tabla.filas.filter((f) => f.tipo === "grupo").map((f) => f.nombre)).toEqual(["Artigas", "Bella Unión"]);
  });

  it("un colportor: cifras con decimales, vuelta a su ciudad y una fila por semana comparada con la anterior", () => {
    const r = armarReporte(datos, { tipo: "colportor", colportorId: "ana" }, "semana");
    expect(r.titulo).toBe("Ana Silva");
    expect(r.subtitulo).toBe("Rivera · Departamento Rivera · S2 contra S1");
    expect(r.volverA).toEqual({ nombre: "Rivera", ambito: { tipo: "ciudad", ciudadId: "rivera" } });
    expect(r.tarjetas[0].valor).toBe("36,0");
    expect(r.tabla.primeraColumna).toBe("SEMANA");
    const filas = r.tabla.filas.flatMap((f) => (f.tipo === "fila" ? [f] : []));
    expect(filas.map((f) => [f.nombre, celda(f).valor, f.nota, celda(f).tendencia?.texto ?? null])).toEqual([
      ["S1 · 05/10", "36,0", null, null], // la primera no tiene con qué compararse
      ["S2 · 12/10", "36,0", null, "= 0%"],
      ["S3 · 19/10", "15,0", "en curso", null], // la que está en curso no lleva tendencia
    ]);
  });

  it("un colportor sin datos: guion, sin tendencia y desde cuándo no hay datos", () => {
    const r = armarReporte(datos, { tipo: "colportor", colportorId: "beto" }, "semana");
    const filas = r.tabla.filas.flatMap((f) => (f.tipo === "fila" ? [f] : []));
    expect(filas[2]).toMatchObject({ nombre: "S3 · 19/10", nota: "sin datos · últimos datos el 15/10" });
    expect(celda(filas[2])).toMatchObject({ valor: "—", sinDatos: true, tendencia: null });
    // el día sin datos tampoco arrastra a la fila siguiente
    const dias = armarReporte(datos, { tipo: "colportor", colportorId: "beto" }, "dia").tabla.filas;
    expect(celda(dias.at(-1))).toMatchObject({ valor: "—", sinDatos: true, tendencia: null });
  });

  it("días: ayer contra el día anterior; un colportor sin datos ayer se ve con guion y el aviso de desde cuándo", () => {
    const r = armarReporte(datos, AMBITO_TODAS, "dia");
    expect(r.subtitulo).toBe("4 colportores · ayer contra el día anterior");
    expect(r.tarjetas[0].valor).toBe("15"); // Ana 6 + Carla 5 + Darío 4; Beto no tiene datos ayer
    const beto = r.tabla.filas.find((f) => f.clave === "beto");
    expect(beto).toMatchObject({ nota: "sin datos desde el 15/10" });
    expect(celda(beto)).toMatchObject({ valor: "—", sinDatos: true, tendencia: null });
  });

  it("meses: el mes a la fecha, sin tendencia si no hay mes anterior", () => {
    const r = armarReporte(datos, AMBITO_TODAS, "mes");
    expect(r.tarjetas[0]).toMatchObject({ valor: "302", nota: "oct. a la fecha", tendencia: null });
    expect(r.subtitulo).toBe("4 colportores · oct. a la fecha");
  });

  it("un ámbito que ya no existe vuelve a todas las ciudades", () => {
    expect(armarReporte(datos, { tipo: "ciudad", ciudadId: "no-existe" }, "semana").titulo).toBe("Todas las ciudades");
    expect(armarReporte(datos, { tipo: "colportor", colportorId: "no-existe" }, "semana").titulo).toBe("Todas las ciudades");
    expect(armarReporte(datos, { tipo: "departamento", departamento: "Salto" }, "semana").titulo).toBe("Todas las ciudades");
  });
});

describe("armarReporte · casos límite", () => {
  it("sin ciudades: nada que mostrar, sin romper", () => {
    const vacio = { ...datos, ciudades: [] };
    const r = armarReporte(vacio, AMBITO_TODAS, "semana");
    expect(r.subtitulo).toBe("0 colportores · S2 contra S1");
    expect(r.tarjetas[0].valor).toBe("—");
    expect(r.tarjetas[0].campania).toBe("Campaña: —");
    expect(r.tabla.filas).toEqual([]);
  });

  it("una campaña que recién empieza: todavía no hay un período completo", () => {
    const hoy = armarReporte({ ...datos, inicioCampania: "2026-10-21" }, AMBITO_TODAS, "semana");
    expect(hoy.tarjetas[0]).toMatchObject({ valor: "—", nota: "Todavía no hay un período completo", tendencia: null });
    expect(hoy.subtitulo).toBe("4 colportores");
  });

  it("una ciudad sin colportores", () => {
    const ciudadVacia = { ...datos, ciudades: [{ id: "x", nombre: "Tranqueras", departamento: "Rivera", colportores: [] }] };
    const r = armarReporte(ciudadVacia, { tipo: "ciudad", ciudadId: "x" }, "semana");
    expect(r.subtitulo).toBe("Departamento Rivera · 0 colportores · S2 contra S1");
    expect(r.tabla.filas).toEqual([]);
  });

  it("el resumen del gráfico dice cada período con su cifra y marca el que está en curso y los que no tienen datos", () => {
    const { resumenDelGrafico } = armarReporte(datos, { tipo: "colportor", colportorId: "beto" }, "semana").tarjetas[0];
    expect(resumenDelGrafico).toBe("Horas por semana: S1: 48,0; S2: 32,0; S3: sin datos (en curso).");
  });
});

describe("datos de ejemplo del diseño", () => {
  const sim = crearHorasSimuladas();

  it("tres ciudades en dos departamentos, con 25 colportores", () => {
    expect(sim.ciudades.map((c) => [c.nombre, c.departamento, c.colportores.length])).toEqual([
      ["Rivera", "Rivera", 10],
      ["Artigas", "Artigas", 8],
      ["Bella Unión", "Artigas", 7],
    ]);
  });

  it("Bruno Techera no tiene datos desde el 18/10 y la lista lo dice con la fecha del diseño", () => {
    const bruno = sim.ciudades[0].colportores.find((c) => c.nombre === "Bruno Techera");
    expect(bruno?.sinDatosDesde).toBe("2026-10-17");
    expect(bruno?.horasPorDia["2026-10-17"]).toBeGreaterThan(0);
    expect(bruno?.horasPorDia["2026-10-19"]).toBeUndefined();
    const r = armarReporte(sim, { tipo: "colportor", colportorId: bruno!.id }, "semana");
    const ultima = r.tabla.filas.at(-1);
    expect(ultima).toMatchObject({ nombre: "S8 · 19/10", nota: "sin datos · últimos datos el 17/10" });
    expect(celda(ultima).valor).toBe("—");
  });

  it("el total de «Todas las ciudades» es la suma de las ciudades, para cualquier período", () => {
    const campaniaDe = (ciudadId?: string) =>
      Number(
        armarReporte(sim, ciudadId ? { tipo: "ciudad", ciudadId } : AMBITO_TODAS, "semana").tarjetas[0].campania.replace(/\D/g, ""),
      );
    expect(sim.ciudades.reduce((total, c) => total + campaniaDe(c.id), 0)).toBeGreaterThanOrEqual(campaniaDe() - 3);
    expect(sim.ciudades.reduce((total, c) => total + campaniaDe(c.id), 0)).toBeLessThanOrEqual(campaniaDe() + 3);
    const suma = sim.ciudades
      .flatMap((c) => c.colportores)
      .reduce((total, c) => total + Object.values(c.horasPorDia).reduce((a, b) => a + b, 0), 0);
    const campania = armarReporte(sim, AMBITO_TODAS, "semana").tarjetas[0].campania;
    expect(campania).toBe(`Campaña: ${Math.round(suma).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`);
  });

  it("es determinista: dos corridas dan lo mismo", () => {
    expect(crearHorasSimuladas()).toEqual(crearHorasSimuladas());
  });

  it("no incluye nada de clientes ni de contacto: solo ciudades, colportores, horas, acompañadas y cifras de ventas", () => {
    const claves = new Set(sim.ciudades.flatMap((c) => c.colportores.flatMap((p) => Object.keys(p))));
    expect([...claves].sort()).toEqual(["acompaniadasPorDia", "horasPorDia", "id", "nombre", "sinDatosDesde", "ventasPorDia"]);
    const delDia = new Set(
      sim.ciudades.flatMap((c) => c.colportores.flatMap((p) => Object.values(p.ventasPorDia).flatMap((d) => Object.keys(d)))),
    );
    expect([...delDia].sort()).toEqual(["cobrado", "monto", "presentaciones", "ventas"]);
  });
});

describe("la lista de ciudades", () => {
  const resuelto = (ambito = AMBITO_TODAS) => resolverAmbito(datos, ambito);

  it("agrupa por departamento; «Todo el departamento» solo donde hay más de una ciudad", () => {
    const lista = construirLista(datos, resuelto(), textoSinDatosDesde);
    expect(lista.todas).toMatchObject({ nombre: "Todas las ciudades", detalle: "4 colportores", seleccionado: true });
    expect(lista.grupos.map((g) => [g.titulo, g.nodos.map((n) => n.nombre)])).toEqual([
      ["DEPTO. RIVERA", ["Rivera"]],
      ["DEPTO. ARTIGAS", ["Todo el departamento", "Artigas", "Bella Unión"]],
    ]);
  });

  it("la ciudad elegida se abre a sus colportores, con el aviso de quien no tiene datos", () => {
    const lista = construirLista(datos, resuelto({ tipo: "ciudad", ciudadId: "rivera" }), textoSinDatosDesde);
    const rivera = lista.grupos[0].nodos[0];
    expect(rivera.seleccionado).toBe(true);
    expect(rivera.hijos.map((h) => [h.nombre, h.detalle])).toEqual([
      ["Ana Silva", null],
      ["Beto Techera", "sin datos desde el 15/10"],
    ]);
  });

  it("al elegir un colportor su ciudad sigue abierta y la seleccionada es él", () => {
    const lista = construirLista(datos, resuelto({ tipo: "colportor", colportorId: "beto" }), textoSinDatosDesde);
    const rivera = lista.grupos[0].nodos[0];
    expect(rivera.seleccionado).toBe(false);
    expect(rivera.hijos.map((h) => h.seleccionado)).toEqual([false, true]);
  });

  it("las ciudades sin departamento van al final, sin título", () => {
    const sinDepto = { ...datos, ciudades: [{ id: "x", nombre: "Tranqueras", departamento: null, colportores: [] }, ...datos.ciudades] };
    const lista = construirLista(sinDepto, resolverAmbito(sinDepto, AMBITO_TODAS), textoSinDatosDesde);
    expect(lista.grupos.map((g) => g.titulo)).toEqual(["DEPTO. RIVERA", "DEPTO. ARTIGAS", null]);
  });

  it("la lista contraída abrevia cada ciudad y resalta la del colportor elegido", () => {
    const riel = construirRiel(datos, resuelto({ tipo: "colportor", colportorId: "ana" }));
    expect(riel.map((i) => [i.abreviatura, i.seleccionado])).toEqual([
      ["Todas", false],
      ["Riv.", true],
      ["Dpto.", false],
      ["Art.", false],
      ["B. Un.", false],
    ]);
  });

  it("abrevia los nombres de una y de varias palabras", () => {
    expect(abreviarCiudad("Rivera")).toBe("Riv.");
    expect(abreviarCiudad("Bella Unión")).toBe("B. Un.");
    expect(abreviarCiudad("Paso de los Toros")).toBe("P. To.");
  });
});
