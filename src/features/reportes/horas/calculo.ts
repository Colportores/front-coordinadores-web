import type { ColportorHoras, Fecha } from "@/datos/reportes/contrato";
import {
  diaDeSemana,
  diaDelMes,
  diasEntre,
  diaYMes,
  lunesDe,
  mesAbreviado,
  nombreDelDia,
  nombreDelMes,
  numeroDeMes,
  rotuloDelMes,
  sumarDias,
} from "@/datos/reportes/fechas";

/**
 * Cuentas de la vista 32 (HU-REP-001 y HU-REP-002): de las horas y las ventas de cada día salen los períodos (días,
 * semanas, meses) y la tendencia contra el período anterior. Funciones puras, sin reloj: el «hoy» viene en los datos.
 */

export type Granularidad = "dia" | "semana" | "mes";

/** Cómo se mira el reporte: por días, semanas o meses, o un rango de fechas libre (issue #107). */
export type ModoDeReporte = Granularidad | "rango";

/** Lo que se mide día por día. `monto` y `cobrado` son los dos números de los que sale el % por cobrar. */
export type Medida = "horas" | "presentaciones" | "ventas" | "monto" | "cobrado";

/** Una cifra de un período (horas, presentaciones, $U…). Sin datos no es lo mismo que 0: se muestra con guion y no lleva tendencia. */
export interface Cifra {
  valor: number;
  hayDatos: boolean;
}

export const CIFRA_SIN_DATOS: Cifra = { valor: 0, hayDatos: false };

/** Cuántos días se dibujan en la vista «Días». */
export const DIAS_EN_VISTA_DIAS = 14;

export interface Calendario {
  inicio: Fecha;
  hoy: Fecha;
  /**
   * Días de la campaña hasta hoy (o hasta su último día, si ya terminó): de lunes a sábado, y los domingos solo si tienen
   * datos (el domingo no se trabaja, pero el teléfono deja cerrar una jornada y esas horas existen, issue #116).
   */
  diasHabiles: Fecha[];
}

/**
 * Los domingos en que alguno de los colportores tiene datos: horas, ventas o jornadas con acompañamiento. Un domingo sin
 * datos no está: no es un «día sin datos» ni corta la tendencia.
 */
export function domingosConDatos(colportores: readonly DiasDeColportor[]): Set<Fecha> {
  const domingos = new Set<Fecha>();
  for (const colportor of colportores) {
    for (const porDia of [colportor.horasPorDia, colportor.ventasPorDia, colportor.acompaniadasPorDia]) {
      for (const fecha of Object.keys(porDia ?? {})) if (diaDeSemana(fecha) === 0) domingos.add(fecha);
    }
  }
  return domingos;
}

/** El calendario de la campaña; `conDatos` son los domingos con datos (ver `domingosConDatos`), que entran como cualquier día. */
export function crearCalendario(
  inicio: Fecha,
  hoy: Fecha,
  fin: Fecha | null = null,
  conDatos: ReadonlySet<Fecha> = new Set(),
): Calendario {
  const ultimo = fin !== null && fin < hoy ? fin : hoy;
  const diasHabiles: Fecha[] = [];
  for (let d = inicio; d <= ultimo; d = sumarDias(d, 1)) {
    if (diaDeSemana(d) !== 0 || conDatos.has(d)) diasHabiles.push(d);
  }
  return { inicio, hoy, diasHabiles };
}

/** La cifra de un día: de un colportor, o la suma de varios. */
export type Serie = (fecha: Fecha) => Cifra;

/** Cómo se junta la cifra de varios días en la de un período (una suma, o el % por cobrar de sus sumas). */
export type Agregar = (dias: Fecha[]) => Cifra;

/** Lo que hace falta de un colportor para armar sus series. `ventasPorDia` puede faltar (solo horas). */
export type DiasDeColportor = Pick<ColportorHoras, "horasPorDia"> & Partial<Pick<ColportorHoras, "ventasPorDia" | "acompaniadasPorDia">>;

export function serieDeColportor(colportor: DiasDeColportor, medida: Medida = "horas"): Serie {
  if (medida === "horas") {
    return (fecha) => {
      const valor = colportor.horasPorDia[fecha];
      return valor === undefined ? CIFRA_SIN_DATOS : { valor, hayDatos: true };
    };
  }
  return (fecha) => {
    const dia = colportor.ventasPorDia?.[fecha];
    if (dia === undefined) return CIFRA_SIN_DATOS;
    const valor =
      medida === "presentaciones" ? dia.presentaciones : medida === "ventas" ? dia.ventas : medida === "monto" ? dia.monto : dia.cobrado;
    // `cobrado: null` es V2 sin conectar: no hay dato, no es un día de 0 $U cobrados.
    return valor === null ? CIFRA_SIN_DATOS : { valor, hayDatos: true };
  };
}

export function sumarCifras(cifras: Cifra[]): Cifra {
  let valor = 0;
  let hayDatos = false;
  for (const c of cifras) {
    if (!c.hayDatos) continue;
    valor += c.valor;
    hayDatos = true;
  }
  return hayDatos ? { valor, hayDatos } : CIFRA_SIN_DATOS;
}

export function serieSuma(series: Serie[]): Serie {
  return (fecha) => sumarCifras(series.map((serie) => serie(fecha)));
}

export function cifraDeDias(serie: Serie, dias: Fecha[]): Cifra {
  return sumarCifras(dias.map(serie));
}

export interface Periodo {
  /** Primer día del período. */
  inicio: Fecha;
  /** Rótulo corto de la barra: «S7», «20», «Sep». */
  rotulo: string;
  /** Rótulo largo de la fila: «14/09», «mar 20/10», «septiembre». */
  detalle: string;
  dias: Fecha[];
  /** El período incluye a hoy: todavía no cerró y no se usa para comparar. */
  enCurso: boolean;
}

/** Todos los períodos de la campaña hasta hoy, del más viejo al más nuevo (en «Días», solo los últimos 14). */
export function periodosDe(granularidad: Granularidad, calendario: Calendario): Periodo[] {
  const { diasHabiles, hoy, inicio } = calendario;

  if (granularidad === "dia") {
    return diasHabiles.slice(-DIAS_EN_VISTA_DIAS).map((fecha) => ({
      inicio: fecha,
      rotulo: fecha.slice(8, 10),
      detalle: `${nombreDelDia(fecha)} ${diaYMes(fecha)}`,
      dias: [fecha],
      enCurso: fecha === hoy,
    }));
  }

  if (granularidad === "semana") {
    const primerLunes = lunesDe(inicio);
    const porLunes = new Map<Fecha, Fecha[]>();
    for (const fecha of diasHabiles) {
      const lunes = lunesDe(fecha);
      porLunes.set(lunes, [...(porLunes.get(lunes) ?? []), fecha]);
    }
    return [...porLunes.entries()].map(([lunes, dias]) => ({
      inicio: lunes,
      rotulo: `S${diasEntre(primerLunes, lunes) / 7 + 1}`,
      detalle: diaYMes(lunes),
      dias,
      enCurso: hoy >= lunes && hoy <= sumarDias(lunes, 6),
    }));
  }

  const porMes = new Map<number, Fecha[]>();
  for (const fecha of diasHabiles) {
    const mes = numeroDeMes(fecha);
    porMes.set(mes, [...(porMes.get(mes) ?? []), fecha]);
  }
  return [...porMes.entries()].map(([mes, dias]) => ({
    inicio: dias[0],
    rotulo: rotuloDelMes(mes),
    detalle: nombreDelMes(mes),
    dias,
    enCurso: numeroDeMes(hoy) === mes,
  }));
}

export interface Comparacion {
  /** Qué período se muestra: «S7», «ayer», «oct. a la fecha». */
  rotulo: string;
  /** Contra qué se compara: «contra S6». Vacío si no hay período anterior. */
  contra: string;
  actual: Cifra;
  /** Cifra del período anterior; `null` si no existe. */
  base: Cifra | null;
}

function esAyer(fecha: Fecha, hoy: Fecha): boolean {
  // Los domingos no se trabaja: el día anterior a un lunes es el sábado (salvo que el domingo tenga datos: entonces es él).
  return fecha === sumarDias(hoy, -1) || (diaDeSemana(hoy) === 1 && fecha === sumarDias(hoy, -2));
}

/**
 * El período que se compara y contra cuál: el día anterior contra el anterior; la última semana completa contra la
 * semana anterior; el mes a la fecha contra el mes pasado a la misma fecha (para que el mes en curso no salga siempre
 * en baja). Lo que está en curso no se compara. `null` si todavía no hay un período completo.
 */
export function compararPeriodos(granularidad: Granularidad, serie: Serie, calendario: Calendario): Comparacion | null {
  return compararCon(granularidad, (dias) => cifraDeDias(serie, dias), calendario);
}

/** Lo mismo que `compararPeriodos`, para una cifra que no es una suma de días (el % por cobrar). */
export function compararCon(granularidad: Granularidad, agregar: Agregar, calendario: Calendario): Comparacion | null {
  const { diasHabiles, hoy } = calendario;

  if (granularidad === "dia") {
    const completos = diasHabiles.filter((d) => d !== hoy);
    const actual = completos.at(-1);
    if (actual === undefined) return null;
    const anterior = completos.at(-2);
    return {
      rotulo: esAyer(actual, hoy) ? "ayer" : `${nombreDelDia(actual)} ${diaYMes(actual)}`,
      contra: anterior === undefined ? "" : "contra el día anterior",
      actual: agregar([actual]),
      base: anterior === undefined ? null : agregar([anterior]),
    };
  }

  if (granularidad === "semana") {
    const completas = periodosDe("semana", calendario).filter((p) => !p.enCurso);
    const actual = completas.at(-1);
    if (actual === undefined) return null;
    const anterior = completas.at(-2);
    return {
      rotulo: actual.rotulo,
      contra: anterior === undefined ? "" : `contra ${anterior.rotulo}`,
      actual: agregar(actual.dias),
      base: anterior === undefined ? null : agregar(anterior.dias),
    };
  }

  const meses = [...new Set(diasHabiles.map(numeroDeMes))];
  const ultimo = meses.at(-1);
  if (ultimo === undefined) return null;
  const enCurso = numeroDeMes(hoy) === ultimo;
  const tieneAnterior = meses.at(-2) === ultimo - 1;
  const diasActual = diasHabiles.filter((d) => numeroDeMes(d) === ultimo);
  // El mes en curso se compara con el mismo tramo del anterior (del 1 al día de hoy); uno terminado, entero.
  const diasBase = tieneAnterior
    ? diasHabiles.filter((d) => numeroDeMes(d) === ultimo - 1 && (!enCurso || diaDelMes(d) <= diaDelMes(hoy)))
    : [];
  return {
    rotulo: enCurso ? `${mesAbreviado(ultimo)} a la fecha` : mesAbreviado(ultimo),
    contra: tieneAnterior ? `contra ${mesAbreviado(ultimo - 1)}${enCurso ? " a la misma fecha" : ""}` : "",
    actual: agregar(diasActual),
    base: tieneAnterior ? agregar(diasBase) : null,
  };
}

export interface Tendencia {
  sentido: "sube" | "baja" | "igual";
  /** «▲ 10%», «▼ 8%», «= 0%». */
  texto: string;
  /** Lo mismo para el lector de pantalla: «subió 10 %». */
  textoAccesible: string;
}

/**
 * Tendencia de una cifra contra la del período anterior. Sin tendencia (`null`) si a alguna de las dos le faltan
 * datos o la anterior es 0 (no hay contra qué calcular el porcentaje).
 */
export function tendenciaDe(actual: Cifra, base: Cifra | null): Tendencia | null {
  if (!base || !actual.hayDatos || !base.hayDatos || base.valor === 0) return null;
  const porcentaje = Math.round((actual.valor / base.valor - 1) * 100);
  if (porcentaje > 0) return { sentido: "sube", texto: `▲ ${porcentaje}%`, textoAccesible: `subió ${porcentaje} %` };
  if (porcentaje < 0) return { sentido: "baja", texto: `▼ ${-porcentaje}%`, textoAccesible: `bajó ${-porcentaje} %` };
  return { sentido: "igual", texto: "= 0%", textoAccesible: "sin cambios" };
}

/**
 * % por cobrar de un período: la porción de lo vendido que todavía no se cobró (V2, HU-REP-002). Sin datos si falta el
 * monto o lo cobrado. Si no se vendió nada no hay nada por cobrar: 0 %. Lo cobrado de más no da un porcentaje negativo.
 */
export function porCobrarDe(monto: Cifra, cobrado: Cifra): Cifra {
  if (!monto.hayDatos || !cobrado.hayDatos) return CIFRA_SIN_DATOS;
  if (monto.valor <= 0) return { valor: 0, hayDatos: true };
  return { valor: Math.max(0, Math.round((1 - cobrado.valor / monto.valor) * 100)), hayDatos: true };
}

/**
 * Tendencia del % por cobrar: se dice en puntos, no en porcentaje de porcentaje. «▲ 6 pts» significa que hay más por
 * cobrar. Sin tendencia si a alguna de las dos le faltan datos.
 */
export function tendenciaEnPuntos(actual: Cifra, base: Cifra | null): Tendencia | null {
  if (!base || !actual.hayDatos || !base.hayDatos) return null;
  const puntos = actual.valor - base.valor;
  const unidad = (n: number) => (n === 1 ? "punto" : "puntos");
  if (puntos > 0) return { sentido: "sube", texto: `▲ ${puntos} pts`, textoAccesible: `hay ${puntos} ${unidad(puntos)} más por cobrar` };
  if (puntos < 0) return { sentido: "baja", texto: `▼ ${-puntos} pts`, textoAccesible: `hay ${-puntos} ${unidad(-puntos)} menos por cobrar` };
  return { sentido: "igual", texto: "= 0 pts", textoAccesible: "sin cambios" };
}

/** Miles con punto: 1450 → «1.450». */
export function formatearEntero(valor: number): string {
  return String(Math.round(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Una posición decimal con coma: 27.4 → «27,4». */
export function formatearDecimal(valor: number): string {
  return valor.toFixed(1).replace(".", ",");
}

/** Lo que se muestra: las medidas del día y el % por cobrar, que sale de dos de ellas. */
export type MedidaMostrada = "horas" | "presentaciones" | "ventas" | "monto" | "porCobrar";

/**
 * Las columnas y tarjetas del reporte: las cifras de siempre y las tres del rango libre (issue #107): los días en que el
 * colportor trabajó, el promedio de horas por día trabajado y las jornadas con acompañamiento.
 */
export type ColumnaDeReporte = MedidaMostrada | "diasTrabajados" | "promedio" | "acompaniadas";

/**
 * Cifra para mostrar: «—» sin datos. Las horas van enteras si son el total de varios colportores y con un decimal si
 * son de uno; los $U con «$U » y miles con punto; el % por cobrar con «%».
 */
export function formatearCifra(cifra: Cifra, total: boolean, medida: ColumnaDeReporte = "horas"): string {
  if (!cifra.hayDatos) return "—";
  switch (medida) {
    case "horas":
      return total ? formatearEntero(cifra.valor) : formatearDecimal(cifra.valor);
    case "monto":
      return `$U ${formatearEntero(cifra.valor)}`;
    case "porCobrar":
      return `${cifra.valor}%`;
    case "promedio":
      return formatearDecimal(cifra.valor);
    default:
      return formatearEntero(cifra.valor);
  }
}

/** Último día con datos anterior a `antesDe`, o `null`. */
export function ultimoDatoAntesDe(colportor: Pick<ColportorHoras, "horasPorDia">, antesDe: Fecha): Fecha | null {
  let ultimo: Fecha | null = null;
  for (const fecha of Object.keys(colportor.horasPorDia)) {
    if (fecha < antesDe && (ultimo === null || fecha > ultimo)) ultimo = fecha;
  }
  return ultimo;
}
