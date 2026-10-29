import type { BecaDeColportor, CarreraDelCatalogo, ColportorDeEquipo } from "@/datos/equipo/contrato";
import { logroDeBeca } from "@/datos/equipo/logro-de-beca";

import type { AmbitoResuelto, UnidadDeAvance } from "./modelo";

/**
 * Estado, filtros y orden de la tabla «Becas» de la vista 33 (HU-BEC-004, HU-BEC-006). Todo puro: filtrar y ordenar no
 * pide nada al servidor. La ciudad y el departamento se filtran con la lista de la izquierda (el ámbito), no acá.
 */

/** El estado de beca de un colportor (HU-BEC-002): sale de la compra a la CES de productos bonificables; los libros no lo cambian (S67 cerrado, «Beca alcanz.», 28/10). */
export type EstadoDeBeca = "sin-carrera" | "sin-beca" | "en-progreso" | "media" | "completa";

export const ESTADOS: { valor: EstadoDeBeca; etiqueta: string }[] = [
  { valor: "sin-carrera", etiqueta: "Falta la carrera" },
  { valor: "sin-beca", etiqueta: "Sin beca" },
  { valor: "en-progreso", etiqueta: "En progreso" },
  { valor: "media", etiqueta: "Media alcanzada" },
  { valor: "completa", etiqueta: "Completa alcanzada" },
];

export function etiquetaDeEstado(estado: EstadoDeBeca): string {
  return ESTADOS.find((e) => e.valor === estado)?.etiqueta ?? estado;
}

/**
 * «Sin tipo asignado no hay estado de beca»: sin carrera, «Falta la carrera»; con carrera y sin tipo ni nada alcanzado, «Sin beca».
 * Con tipo, «En progreso» por debajo del monto de la meta media, «Media alcanzada» desde él y «Completa alcanzada» desde el de
 * la completa, con las metas de la carrera y la compra a la CES de bonificables (no los libros: «Beca alcanz.», 28/10). Lo que ya alcanzó no se le quita: ni al apuntar a media, ni al pasar a «Sin beca» («Logro beca»,
 * Cristian 27/10): el estado sigue en lo alcanzado.
 */
export function estadoDeBeca(beca: BecaDeColportor | undefined, carreras: readonly CarreraDelCatalogo[]): EstadoDeBeca {
  if (!beca || !beca.carrera) return "sin-carrera";
  const logro = logroDeBeca(beca, carreras);
  if (logro !== null) return logro;
  return beca.apuntaA === null ? "sin-beca" : "en-progreso";
}

/**
 * El avance hacia la meta en porcentaje, sin tope (130 es «pasó la meta»), en la medida elegida; `null` si no hay meta que
 * medir (sin carrera, sin tipo o con la meta en 0).
 */
export function porcentajeDeAvance(beca: BecaDeColportor | undefined, unidad: UnidadDeAvance): number | null {
  if (!beca || !beca.carrera || !beca.meta || beca.apuntaA === null) return null;
  const objetivo = unidad === "libros" ? beca.meta.libros : beca.meta.monto;
  if (objetivo <= 0) return null;
  const logrado = unidad === "libros" ? beca.avance.libros : beca.avance.monto;
  return Math.round((logrado / objetivo) * 100);
}

export type FiltroDeAvance = "todos" | "sin-meta" | "0-24" | "25-49" | "50-74" | "75-99" | "100";

export const BANDAS_DE_AVANCE: { valor: Exclude<FiltroDeAvance, "todos">; etiqueta: string }[] = [
  { valor: "0-24", etiqueta: "Menos de 25 %" },
  { valor: "25-49", etiqueta: "De 25 a 49 %" },
  { valor: "50-74", etiqueta: "De 50 a 74 %" },
  { valor: "75-99", etiqueta: "De 75 a 99 %" },
  { valor: "100", etiqueta: "100 % o más" },
  { valor: "sin-meta", etiqueta: "Sin meta" },
];

export type FiltroDeTipo = "todos" | "media" | "completa" | "sin-beca";

export const OPCIONES_DE_FILTRO_DE_TIPO: { valor: Exclude<FiltroDeTipo, "todos">; etiqueta: string }[] = [
  { valor: "media", etiqueta: "Media" },
  { valor: "completa", etiqueta: "Completa" },
  { valor: "sin-beca", etiqueta: "Sin beca" },
];

/** `carrera`: el id de una del catálogo, o `"sin-carrera"` para los que todavía no la tienen. */
export interface FiltrosDeBecas {
  estado: EstadoDeBeca | "todos";
  carrera: string;
  tipo: FiltroDeTipo;
  avance: FiltroDeAvance;
}

export const FILTROS_VACIOS: FiltrosDeBecas = { estado: "todos", carrera: "todas", tipo: "todos", avance: "todos" };

export function hayFiltros(filtros: FiltrosDeBecas): boolean {
  return (Object.keys(FILTROS_VACIOS) as (keyof FiltrosDeBecas)[]).some((clave) => filtros[clave] !== FILTROS_VACIOS[clave]);
}

export type ColumnaDeBecas = "colportor" | "carrera" | "apunta" | "estado" | "avance";
export type SentidoDeOrden = "asc" | "desc";
/** `null`: el orden de siempre (por ciudad, y dentro de cada una como vienen). */
export type OrdenDeBecas = { columna: ColumnaDeBecas; sentido: SentidoDeOrden } | null;

export const ETIQUETA_DE_COLUMNA: Record<ColumnaDeBecas, string> = {
  colportor: "Colportor",
  carrera: "Carrera",
  apunta: "Apunta a",
  estado: "Estado",
  avance: "Avance",
};

/** Cada toque en el encabezado avanza: de menor a mayor, de mayor a menor y de vuelta al orden de siempre. */
export function alternarOrden(orden: OrdenDeBecas, columna: ColumnaDeBecas): OrdenDeBecas {
  if (orden === null || orden.columna !== columna) return { columna, sentido: "asc" };
  return orden.sentido === "asc" ? { columna, sentido: "desc" } : null;
}

export function textoDeOrden(orden: OrdenDeBecas): string {
  if (orden === null) return "Orden de siempre, por ciudad.";
  const nombre = ETIQUETA_DE_COLUMNA[orden.columna].toLowerCase();
  return `Ordenado por ${nombre}, de ${orden.sentido === "asc" ? "menor a mayor" : "mayor a menor"}.`;
}

/** Un colportor de la tabla con todo lo que se necesita para filtrarlo y ordenarlo. */
export interface FilaDeBeca {
  colportor: ColportorDeEquipo;
  /** El grupo de la lista al que pertenece: una ciudad o «Sin zona asignada». */
  ciudad: string;
  beca: BecaDeColportor | undefined;
  estado: EstadoDeBeca;
  porcentaje: number | null;
}

export interface GrupoDeFilas {
  clave: string;
  nombre: string;
  filas: FilaDeBeca[];
}

export interface TablaDeBecasArmada {
  /** Con orden elegido hay un solo grupo sin cabecera; sin orden, uno por ciudad con la suya. */
  grupos: GrupoDeFilas[];
  /** Los grupos se ordenaron por una columna y ya no se separan por ciudad. */
  plana: boolean;
  /** Cuántos colportores hay en el ámbito, antes de filtrar. */
  total: number;
  /** Cuántos quedan después de filtrar. */
  coinciden: number;
}

function enBanda(porcentaje: number | null, banda: FiltroDeAvance): boolean {
  if (banda === "todos") return true;
  if (banda === "sin-meta") return porcentaje === null;
  if (porcentaje === null) return false;
  switch (banda) {
    case "0-24":
      return porcentaje < 25;
    case "25-49":
      return porcentaje >= 25 && porcentaje < 50;
    case "50-74":
      return porcentaje >= 50 && porcentaje < 75;
    case "75-99":
      return porcentaje >= 75 && porcentaje < 100;
    case "100":
      return porcentaje >= 100;
  }
}

function cumple(fila: FilaDeBeca, filtros: FiltrosDeBecas): boolean {
  if (filtros.estado !== "todos" && fila.estado !== filtros.estado) return false;
  if (filtros.carrera === "sin-carrera") {
    if (fila.beca?.carrera) return false;
  } else if (filtros.carrera !== "todas" && fila.beca?.carrera?.id !== filtros.carrera) return false;
  if (filtros.tipo !== "todos") {
    // «Sin beca» es lo que muestra la tabla con la carrera elegida y nada asignado.
    const mostrado = fila.beca?.carrera ? (fila.beca.apuntaA ?? "sin-beca") : null;
    if (mostrado !== filtros.tipo) return false;
  }
  return enBanda(fila.porcentaje, filtros.avance);
}

const RANGO_DE_TIPO: Record<string, number> = { "sin-beca": 0, media: 1, completa: 2 };
const RANGO_DE_ESTADO: Record<EstadoDeBeca, number | null> = {
  "sin-carrera": null,
  "sin-beca": 0,
  "en-progreso": 1,
  media: 2,
  completa: 3,
};

/** El valor por el que se ordena una fila en una columna; `null` = no tiene (va al final en cualquier sentido). */
function claveDeOrden(fila: FilaDeBeca, columna: ColumnaDeBecas): string | number | null {
  switch (columna) {
    case "colportor":
      return fila.colportor.nombre;
    case "carrera":
      return fila.beca?.carrera?.nombre ?? null;
    case "apunta":
      return fila.beca?.carrera ? RANGO_DE_TIPO[fila.beca.apuntaA ?? "sin-beca"] : null;
    case "estado":
      return RANGO_DE_ESTADO[fila.estado];
    case "avance":
      return fila.porcentaje;
  }
}

function compararNombres(a: FilaDeBeca, b: FilaDeBeca): number {
  return a.colportor.nombre.localeCompare(b.colportor.nombre, "es");
}

function ordenar(filas: FilaDeBeca[], orden: NonNullable<OrdenDeBecas>): FilaDeBeca[] {
  const signo = orden.sentido === "asc" ? 1 : -1;
  return filas.slice().sort((a, b) => {
    const ca = claveDeOrden(a, orden.columna);
    const cb = claveDeOrden(b, orden.columna);
    if (ca === null && cb === null) return compararNombres(a, b);
    if (ca === null) return 1;
    if (cb === null) return -1;
    const resultado = typeof ca === "string" && typeof cb === "string" ? ca.localeCompare(cb, "es") : Number(ca) - Number(cb);
    return resultado * signo || compararNombres(a, b);
  });
}

/**
 * Las filas que se ven: los colportores del ámbito, filtrados y ordenados. `fijados` son los que se acaban de tocar: siguen
 * a la vista aunque ya no cumplan el filtro (si no, al guardar «Completa» con el filtro en «Media» la fila desaparecería
 * bajo el dedo, con el foco adentro). Sin `orden`, se agrupa por ciudad como el resto de la vista.
 */
export function armarTablaDeBecas({
  resuelto,
  porColportor,
  carreras,
  unidad,
  filtros,
  orden,
  fijados,
}: {
  resuelto: AmbitoResuelto;
  porColportor: Readonly<Record<string, BecaDeColportor>>;
  carreras: readonly CarreraDelCatalogo[];
  unidad: UnidadDeAvance;
  filtros: FiltrosDeBecas;
  orden: OrdenDeBecas;
  fijados: ReadonlySet<string>;
}): TablaDeBecasArmada {
  const todas: FilaDeBeca[] = [];
  const grupos: GrupoDeFilas[] = resuelto.grupos.map((grupo) => {
    const filas = grupo.colportores.map((colportor): FilaDeBeca => {
      const beca = porColportor[colportor.id];
      return { colportor, ciudad: grupo.nombre, beca, estado: estadoDeBeca(beca, carreras), porcentaje: porcentajeDeAvance(beca, unidad) };
    });
    todas.push(...filas);
    return { clave: grupo.clave, nombre: grupo.nombre, filas };
  });

  const visible = (fila: FilaDeBeca) => fijados.has(fila.colportor.id) || cumple(fila, filtros);
  const coinciden = todas.filter(visible).length;

  if (orden === null) {
    return {
      grupos: grupos.map((g) => ({ ...g, filas: g.filas.filter(visible) })).filter((g) => g.filas.length > 0),
      plana: false,
      total: todas.length,
      coinciden,
    };
  }
  const filas = ordenar(todas.filter(visible), orden);
  return { grupos: filas.length > 0 ? [{ clave: "todos", nombre: "", filas }] : [], plana: true, total: todas.length, coinciden };
}
