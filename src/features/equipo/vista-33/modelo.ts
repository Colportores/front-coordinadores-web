import type { BecaDeColportor, ColportorDeEquipo, DatosEquipoPorCiudad, MetaDeBeca, TipoDeBeca } from "@/datos/equipo/contrato";
import { formatMonto } from "@/features/cuentas/formato";
import { diasEntre, lunesDe, sumarDias } from "@/lib/dias";

/**
 * Lo que arma la vista 33 a partir de los datos: qué mira (todas las ciudades, un departamento, una ciudad o los que no
 * tienen zona), la lista de ciudades de la izquierda y las cuentas de la tabla de acompañamientos (días sin acompañar y
 * semanas). Todo puro: cambiar de ámbito no pide nada al servidor.
 */

export type Ambito =
  | { tipo: "todas" }
  | { tipo: "departamento"; departamento: string }
  | { tipo: "ciudad"; ciudadId: string };

export const AMBITO_TODAS: Ambito = { tipo: "todas" };

export type VistaEquipo = "zonas" | "becas" | "acompanamientos";

export function mismoAmbito(a: Ambito, b: Ambito): boolean {
  switch (a.tipo) {
    case "todas":
      return b.tipo === "todas";
    case "departamento":
      return b.tipo === "departamento" && b.departamento === a.departamento;
    case "ciudad":
      return b.tipo === "ciudad" && b.ciudadId === a.ciudadId;
  }
}

export function pluralColportores(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? "colportor" : "colportores"}`;
}

export function pluralAcompanamientos(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? "acompañamiento" : "acompañamientos"}`;
}

/** Los colportores de una ciudad (o los que no tienen zona), con su cabecera cuando el ámbito junta varias. */
export interface GrupoDeColportores {
  clave: string;
  nombre: string;
  colportores: ColportorDeEquipo[];
}

export interface AmbitoResuelto {
  ambito: Ambito;
  titulo: string;
  /** «Departamento Artigas» cuando el ámbito es una sola ciudad con departamento. */
  departamento: string | null;
  grupos: GrupoDeColportores[];
  /** Todos los que se ven, cada uno una sola vez. */
  colportores: ColportorDeEquipo[];
  /** Cuántos de ellos tienen zona (los demás figuran al final, bajo «Sin zona asignada»). */
  conZona: number;
  /** Los que no tienen zona: no tienen ciudad, así que figuran en cualquier ámbito (una sola vez). */
  sinZona: ColportorDeEquipo[];
  /** Hay más de un grupo: la tabla pone una cabecera por ciudad. */
  conCabeceras: boolean;
}

const SIN_ZONA = "Sin zona asignada";

function porNombre(a: string, b: string): number {
  return a.localeCompare(b, "es");
}

/** Departamentos por orden alfabético, y dentro de cada uno sus ciudades; las ciudades sin departamento van al final. */
function ciudadesOrdenadas(datos: DatosEquipoPorCiudad) {
  return datos.ciudades.slice().sort((a, b) => {
    if (a.departamento === null && b.departamento !== null) return 1;
    if (a.departamento !== null && b.departamento === null) return -1;
    return porNombre(a.departamento ?? "", b.departamento ?? "") || porNombre(a.nombre, b.nombre);
  });
}

function sinZona(datos: DatosEquipoPorCiudad): ColportorDeEquipo[] {
  const ciudades = new Set(datos.ciudades.map((c) => c.id));
  // Una zona de una ciudad que ya no está en la lista tampoco tiene a dónde ir: figura con los que no tienen zona.
  return datos.colportores.filter((c) => c.ciudadId === null || !ciudades.has(c.ciudadId));
}

/**
 * Un ámbito que ya no existe en los datos (la ciudad o el departamento desaparecieron) vuelve a «todas». Los que no
 * tienen zona no tienen ciudad: figuran en cualquier ámbito, una sola vez, al final y bajo «Sin zona asignada» (decisión
 * «Ciudad colp.», artboard 33-05).
 */
export function resolverAmbito(datos: DatosEquipoPorCiudad, ambito: Ambito): AmbitoResuelto {
  const ciudades = ciudadesOrdenadas(datos);
  const sin = sinZona(datos);
  const delaCiudad = (id: string) => datos.colportores.filter((c) => c.ciudadId === id);
  const grupoDe = (id: string, nombre: string): GrupoDeColportores => ({ clave: id, nombre, colportores: delaCiudad(id) });
  const armar = (
    ambitoResuelto: Ambito,
    titulo: string,
    departamento: string | null,
    deCiudades: GrupoDeColportores[],
  ): AmbitoResuelto => {
    const conGente = deCiudades.filter((g) => g.colportores.length > 0);
    const grupos = sin.length > 0 ? [...conGente, { clave: "sin-zona", nombre: SIN_ZONA, colportores: sin }] : conGente;
    return {
      ambito: ambitoResuelto,
      titulo,
      departamento,
      grupos,
      colportores: grupos.flatMap((g) => g.colportores),
      conZona: conGente.reduce((suma, g) => suma + g.colportores.length, 0),
      sinZona: sin,
      conCabeceras: grupos.length > 1,
    };
  };

  if (ambito.tipo === "departamento") {
    const delDepartamento = ciudades.filter((c) => c.departamento === ambito.departamento);
    if (delDepartamento.length > 0) {
      return armar(ambito, `Departamento ${ambito.departamento}`, null, delDepartamento.map((c) => grupoDe(c.id, c.nombre)));
    }
  }

  if (ambito.tipo === "ciudad") {
    const ciudad = ciudades.find((c) => c.id === ambito.ciudadId);
    if (ciudad) return armar(ambito, ciudad.nombre, ciudad.departamento, [grupoDe(ciudad.id, ciudad.nombre)]);
  }

  return armar(AMBITO_TODAS, "Todas las ciudades", null, ciudades.map((c) => grupoDe(c.id, c.nombre)));
}

/** Un renglón de la lista de ciudades. */
export interface NodoLista {
  clave: string;
  ambito: Ambito;
  nombre: string;
  /** Colportores con zona en el ámbito. */
  cantidad: number;
  /** Los que no tienen zona y figuran en el ámbito además de los anteriores. */
  sinZona: number;
  seleccionado: boolean;
}

export interface GrupoLista {
  clave: string;
  departamento: string | null;
  /** «DEPTO. RIVERA»; `null` para las ciudades cuyo departamento no se conoce. */
  titulo: string | null;
  nodos: NodoLista[];
}

export interface ModeloLista {
  todas: NodoLista;
  grupos: GrupoLista[];
}

export function construirLista(datos: DatosEquipoPorCiudad, resuelto: AmbitoResuelto): ModeloLista {
  const ninguna = sinZona(datos).length;
  const nodo = (clave: string, ambito: Ambito, nombre: string, cantidad: number): NodoLista => ({
    clave,
    ambito,
    nombre,
    cantidad,
    sinZona: ninguna,
    seleccionado: mismoAmbito(ambito, resuelto.ambito),
  });
  const cuantos = (idCiudad: string) => datos.colportores.filter((c) => c.ciudadId === idCiudad).length;
  const ciudades = ciudadesOrdenadas(datos);

  const grupos: GrupoLista[] = [];
  for (const ciudad of ciudades) {
    let grupo = grupos.find((g) => g.departamento === ciudad.departamento);
    if (!grupo) {
      grupo = {
        clave: ciudad.departamento ?? "sin-departamento",
        departamento: ciudad.departamento,
        titulo: ciudad.departamento === null ? null : `DEPTO. ${ciudad.departamento.toUpperCase()}`,
        nodos: [],
      };
      grupos.push(grupo);
    }
    grupo.nodos.push(nodo(`ciudad:${ciudad.id}`, { tipo: "ciudad", ciudadId: ciudad.id }, ciudad.nombre, cuantos(ciudad.id)));
  }
  // «Todo el departamento» solo si el departamento tiene más de una ciudad: con una, sería la misma lista.
  for (const grupo of grupos) {
    if (grupo.departamento !== null && grupo.nodos.length > 1) {
      const cantidad = grupo.nodos.reduce((suma, n) => suma + n.cantidad, 0);
      grupo.nodos.unshift(
        nodo(`departamento:${grupo.departamento}`, { tipo: "departamento", departamento: grupo.departamento }, "Todo el departamento", cantidad),
      );
    }
  }

  return { todas: nodo("todas", AMBITO_TODAS, "Todas las ciudades", datos.colportores.length - ninguna), grupos };
}

/** Un renglón de la lista contraída: solo la abreviatura. */
export interface ItemRiel {
  clave: string;
  ambito: Ambito;
  nombre: string;
  abreviatura: string;
  seleccionado: boolean;
}

/** «Rivera» → «Riv.»; «Bella Unión» → «B. Un.». */
export function abreviar(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "";
  if (palabras.length === 1) return palabras[0].length <= 4 ? palabras[0] : `${palabras[0].slice(0, 3)}.`;
  const [primera, ...resto] = palabras;
  return `${primera[0]}. ${resto.map((p) => `${p.slice(0, 2)}.`).join(" ")}`;
}

export function construirRiel(lista: ModeloLista): ItemRiel[] {
  const item = (n: NodoLista, abreviatura: string): ItemRiel => ({
    clave: n.clave,
    ambito: n.ambito,
    nombre: n.nombre,
    abreviatura,
    seleccionado: n.seleccionado,
  });
  const items = [item(lista.todas, "Todas")];
  for (const grupo of lista.grupos) {
    for (const nodoDeLista of grupo.nodos) {
      items.push(item(nodoDeLista, nodoDeLista.ambito.tipo === "departamento" ? "Dpto." : abreviar(nodoDeLista.nombre)));
    }
  }
  return items;
}

/** El día del último acompañamiento, o `null` si nunca lo acompañaron. */
export function ultimoAcompanamiento(colportor: ColportorDeEquipo): string | null {
  let ultimo: string | null = null;
  for (const a of colportor.acompanamientos) if (ultimo === null || a.dia > ultimo) ultimo = a.dia;
  return ultimo;
}

/**
 * Días corridos desde el último acompañamiento o, si nunca lo acompañaron, desde el inicio de la campaña. Es informativo:
 * sin umbral ni alerta. Una campaña que todavía no empezó da 0.
 */
export function diasSinAcompanar(colportor: ColportorDeEquipo, campaniaInicio: string, hoy: string): number {
  return Math.max(0, diasEntre(ultimoAcompanamiento(colportor) ?? campaniaInicio, hoy));
}

/** Los que hace más días no acompaña nadie, primero; a igualdad, por nombre. */
export function ordenarPorDiasSinAcompanar(colportores: ColportorDeEquipo[], campaniaInicio: string, hoy: string): ColportorDeEquipo[] {
  return colportores
    .map((c) => ({ c, dias: diasSinAcompanar(c, campaniaInicio, hoy) }))
    .sort((a, b) => b.dias - a.dias || porNombre(a.c.nombre, b.c.nombre))
    .map(({ c }) => c);
}

export interface Semana {
  /** El número de la semana en la campaña: S1 es la que contiene el inicio. */
  numero: number;
  /** De lunes a domingo, `AAAA-MM-DD`. */
  desde: string;
  hasta: string;
  /** La semana de hoy: todavía no terminó. */
  actual: boolean;
}

/** Las semanas que muestra la tabla: hasta 8, terminando en la de hoy (o en la última de la campaña, si ya terminó). */
export const SEMANAS_VISIBLES = 8;

export function semanasDeLaCampania(campaniaInicio: string, campaniaFin: string | null, hoy: string): Semana[] {
  const lunes1 = lunesDe(campaniaInicio);
  const tope = campaniaFin !== null && campaniaFin < hoy ? campaniaFin : hoy;
  const ultima = Math.max(0, Math.floor(diasEntre(lunes1, tope) / 7));
  const primera = Math.max(0, ultima - SEMANAS_VISIBLES + 1);
  const semanas: Semana[] = [];
  for (let i = primera; i <= ultima; i++) {
    const desde = sumarDias(lunes1, i * 7);
    const hasta = sumarDias(desde, 6);
    semanas.push({ numero: i + 1, desde, hasta, actual: hoy >= desde && hoy <= hasta });
  }
  return semanas;
}

/** Por cada semana, si el colportor tuvo un acompañamiento en ella. */
export function semanasAcompanadas(colportor: ColportorDeEquipo, semanas: Semana[]): boolean[] {
  return semanas.map((s) => colportor.acompanamientos.some((a) => a.dia >= s.desde && a.dia <= s.hasta));
}

/** «4,2 h»; sin horas, la jornada sigue abierta. */
export function textoHoras(horas: number | null): string {
  return horas === null ? "en curso" : `${horas.toFixed(1).replace(".", ",")} h`;
}

/** «Mariana Pérez (vos)» cuando quien acompañó es quien tiene la sesión, como en el canvas. */
export function nombreDeAcompanante(nombre: string, esVos: boolean): string {
  return esVos ? `${nombre} (vos)` : nombre;
}

/** En qué medida se ve el avance de la beca: es la misma meta en libros bonificables o en compra a la CES. */
export type UnidadDeAvance = "libros" | "ces";

export const UNIDAD_POR_DEFECTO: UnidadDeAvance = "libros";

export function esUnidadDeAvance(valor: unknown): valor is UnidadDeAvance {
  return valor === "libros" || valor === "ces";
}

export const ETIQUETA_DE_TIPO: Record<TipoDeBeca, string> = { media: "Media", completa: "Completa" };

/** Lo que muestra la columna de avance de un colportor en la tabla «Becas». */
export type AvanceDeBeca =
  | { tipo: "sin-carrera" }
  | { tipo: "sin-tipo" }
  | {
      tipo: "con-meta";
      /** «64 de 120 libros · le faltan 56»; con la meta cumplida, «130 de 120 libros · meta alcanzada». */
      texto: string;
      /** De 0 a 100, para el ancho de la barra. */
      porcentaje: number;
      alcanzada: boolean;
    };

function enMedida(meta: MetaDeBeca, unidad: UnidadDeAvance): number {
  return unidad === "libros" ? meta.libros : meta.monto;
}

/** «1 libro», «120 libros». */
function libros(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? "libro" : "libros"}`;
}

/**
 * El avance de un colportor hacia su meta, en libros bonificables o en compra a la CES (`unidad`). Sin carrera o sin
 * tipo no hay meta («Sin meta: falta la carrera»); una meta en 0 tampoco se puede medir, así que cuenta como sin tipo.
 */
export function avanceDeBeca(beca: BecaDeColportor | undefined, unidad: UnidadDeAvance): AvanceDeBeca {
  if (!beca || !beca.carrera) return { tipo: "sin-carrera" };
  const meta = beca.meta;
  if (!meta || beca.apuntaA === null || enMedida(meta, unidad) <= 0) return { tipo: "sin-tipo" };
  const logrado = enMedida(beca.avance, unidad);
  const objetivo = enMedida(meta, unidad);
  const falta = Math.max(0, objetivo - logrado);
  const alcanzada = falta === 0;
  const cola = alcanzada ? "meta alcanzada" : `${falta === 1 ? "le falta" : "le faltan"} ${unidad === "libros" ? falta : formatMonto(falta)}`;
  const texto =
    unidad === "libros"
      ? `${logrado} de ${libros(objetivo)} · ${cola}`
      : `${formatMonto(logrado)} de ${formatMonto(objetivo)} · ${cola}`;
  return { tipo: "con-meta", texto, porcentaje: Math.max(0, Math.min(100, Math.round((logrado / objetivo) * 100))), alcanzada };
}

/** «Rocío Benítez ahora apunta a beca completa: meta de 240 libros y $U 360.000 a la CES.» */
export function avisoDeBecaAsignada(nombre: string, beca: BecaDeColportor): string {
  if (!beca.apuntaA || !beca.meta) return `Quedó guardado el cambio de ${nombre}.`;
  const tipo = beca.apuntaA === "completa" ? "beca completa" : "media beca";
  return `${nombre} ahora apunta a ${tipo}: meta de ${libros(beca.meta.libros)} y ${formatMonto(beca.meta.monto)} a la CES.`;
}
