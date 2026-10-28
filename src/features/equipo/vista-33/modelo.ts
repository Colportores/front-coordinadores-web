import {
  DIAS_DE_GRACIA_ACOMPANAMIENTO,
  type BecaDeColportor,
  type CargadoPor,
  type ColportorDeEquipo,
  type DatosEquipoPorCiudad,
  type MetaDeBeca,
  type OrigenDeAcompanamiento,
  type TipoDeBeca,
} from "@/datos/equipo/contrato";
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
 * Días corridos desde el último acompañamiento o, si nunca lo acompañaron, desde `contadoDesde`: el inicio de la campaña o
 * el día en que el colportor se sumó (o volvió), el que sea más tarde. Es informativo: sin umbral ni alerta. Una campaña
 * que todavía no empezó da 0.
 */
export function diasSinAcompanar(colportor: ColportorDeEquipo, hoy: string): number {
  return Math.max(0, diasEntre(ultimoAcompanamiento(colportor) ?? colportor.contadoDesde, hoy));
}

/**
 * El renglón de abajo de «Nunca»: «50 días desde el inicio» si se cuenta desde el inicio de la campaña, «20 días desde que
 * se sumó» si el colportor llegó después (decisión «Días acomp.»; si volvió, es desde la vuelta).
 */
export function textoDesdeCuandoSeCuenta(colportor: ColportorDeEquipo, campaniaInicio: string, hoy: string): string {
  const dias = diasSinAcompanar(colportor, hoy);
  const desde = colportor.contadoDesde > campaniaInicio ? "desde que se sumó" : "desde el inicio";
  return `${dias} ${dias === 1 ? "día" : "días"} ${desde}`;
}

/** Los que hace más días no acompaña nadie, primero; a igualdad, por nombre. */
export function ordenarPorDiasSinAcompanar(colportores: ColportorDeEquipo[], hoy: string): ColportorDeEquipo[] {
  return colportores
    .map((c) => ({ c, dias: diasSinAcompanar(c, hoy) }))
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

/**
 * De dónde salió un acompañamiento, como en el diseño: «lo marcó en el celular», «cargado por vos» o «cargado por
 * <nombre>». Si la base no dice quién lo cargó (filas anteriores a ese dato), «cargado desde el panel», que es cierto.
 * Sin dato de origen no se inventa: `null`.
 */
export function textoDeOrigen(origen: OrigenDeAcompanamiento | null, cargadoPor?: CargadoPor | null): string | null {
  if (origen === "COLPORTOR") return "lo marcó en el celular";
  if (origen !== "COORDINADOR") return null;
  if (cargadoPor?.esVos) return "cargado por vos";
  if (cargadoPor && cargadoPor.nombre.trim() !== "") return `cargado por ${cargadoPor.nombre}`;
  return "cargado desde el panel";
}

/**
 * Pasaron más de 15 días del fin de la campaña (CZ011): ya no se registran acompañamientos y los que hay quedan como
 * están. El día 15 todavía se acepta y el 16 no.
 */
export function plazoVencido(campaniaFin: string | null, hoy: string): boolean {
  return campaniaFin !== null && diasEntre(campaniaFin, hoy) > DIAS_DE_GRACIA_ACOMPANAMIENTO;
}

/** Cuántos caracteres tiene un texto contados como los cuenta el servidor (letras, no unidades de UTF-16). */
export function largoDeTexto(texto: string): number {
  return Array.from(texto).length;
}

/** Corta un texto en `maximo` caracteres sin partir ninguno por la mitad. */
export function cortarTexto(texto: string, maximo: number): string {
  const letras = Array.from(texto);
  return letras.length <= maximo ? texto : letras.slice(0, maximo).join("");
}

/** En qué medida se ve el avance de la beca: es la misma meta en libros bonificables o en compra a la CES. */
export type UnidadDeAvance = "libros" | "ces";

export const UNIDAD_POR_DEFECTO: UnidadDeAvance = "libros";

export function esUnidadDeAvance(valor: unknown): valor is UnidadDeAvance {
  return valor === "libros" || valor === "ces";
}

export const ETIQUETA_DE_TIPO: Record<TipoDeBeca, string> = { media: "Media", completa: "Completa" };

/** Las tres opciones de «Apunta a»: media, completa y «Sin beca» (`null`, como `tipo_beca` en el esquema). */
export const OPCIONES_DE_TIPO: { tipo: TipoDeBeca | null; etiqueta: string }[] = [
  { tipo: "media", etiqueta: ETIQUETA_DE_TIPO.media },
  { tipo: "completa", etiqueta: ETIQUETA_DE_TIPO.completa },
  { tipo: null, etiqueta: "Sin beca" },
];

/** Lo que muestra la columna de avance de un colportor en la tabla «Becas». */
export type AvanceDeBeca =
  | { tipo: "sin-carrera" }
  | { tipo: "sin-tipo" }
  | {
      /** Sin beca, pero ya alcanzó una meta: se ve lo vendido, sin meta que medir («Logro beca»). */
      tipo: "lograda";
      /** «130 libros vendidos · alcanzó la beca completa». */
      texto: string;
    }
  | {
      tipo: "con-meta";
      /** «64 de 120 libros · le faltan 56 · 53 %»; con la meta cumplida, «130 de 120 libros · meta alcanzada · 108 %». */
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
  if (!meta || beca.apuntaA === null || enMedida(meta, unidad) <= 0) {
    if (beca.apuntaA === null && beca.alcanzada) {
      const vendido = unidad === "libros" ? `${beca.avance.libros} ${beca.avance.libros === 1 ? "libro vendido" : "libros vendidos"}` : `${formatMonto(beca.avance.monto)} de compra a la CES`;
      return { tipo: "lograda", texto: `${vendido} · alcanzó ${beca.alcanzada === "completa" ? "la beca completa" : "la media beca"}` };
    }
    return { tipo: "sin-tipo" };
  }
  const logrado = enMedida(beca.avance, unidad);
  const objetivo = enMedida(meta, unidad);
  const falta = Math.max(0, objetivo - logrado);
  const alcanzada = falta === 0;
  const cola = alcanzada ? "meta alcanzada" : `${falta === 1 ? "le falta" : "le faltan"} ${unidad === "libros" ? falta : formatMonto(falta)}`;
  // El mismo redondeo y sin tope que el filtro y el orden por avance (`porcentajeDeAvance`): lo que se lee es lo que se filtra.
  const porcentajeReal = Math.round((logrado / objetivo) * 100);
  const texto =
    unidad === "libros"
      ? `${logrado} de ${libros(objetivo)} · ${cola} · ${porcentajeReal} %`
      : `${formatMonto(logrado)} de ${formatMonto(objetivo)} · ${cola} · ${porcentajeReal} %`;
  return { tipo: "con-meta", texto, porcentaje: Math.max(0, Math.min(100, porcentajeReal)), alcanzada };
}

/**
 * «Rocío Benítez quedó sin beca: ya no tiene meta.»; si ya había alcanzado una, «…pero conserva la beca completa alcanzada.»
 * (lo alcanzado no se pierde).
 */
export function avisoDeSinBeca(nombre: string, beca?: BecaDeColportor): string {
  if (beca?.alcanzada) {
    return `${nombre} quedó sin beca: ya no tiene meta, pero conserva ${beca.alcanzada === "completa" ? "la beca completa alcanzada" : "la media beca alcanzada"}.`;
  }
  return `${nombre} quedó sin beca: ya no tiene meta.`;
}

/**
 * En una campaña permanente no hay becas («Beca perman.», Cristian 27/10). Es permanente la de `tipo` PERMANENTE, el mismo
 * dato por el que el servidor rechaza (BC006); la fecha de fin no cuenta: la base no ata `fecha_fin` nula con ese tipo.
 */
export function esCampaniaPermanente(datos: Pick<DatosEquipoPorCiudad, "campaniaTipo">): boolean {
  return datos.campaniaTipo === "PERMANENTE";
}

export const TEXTO_SIN_BECAS_EN_PERMANENTE =
  "En una campaña permanente no hay becas. Para dar una media beca o una beca completa, el colportor tiene que estar en una campaña de verano o de invierno.";

/** «Carrera corregida: meta de Teología» (`metaRecalculadaEn`, «Carrera corr»). */
export function textoDeCarreraCorregida(carreraNombre: string): string {
  return `Carrera corregida: meta de ${carreraNombre}`;
}

/** La meta que quedó tras corregir la carrera, en las dos medidas: «Meta nueva: 100 libros · $U 150.000 a la CES». */
export function textoDeMetaNueva(meta: MetaDeBeca): string {
  return `Meta nueva: ${libros(meta.libros)} · ${formatMonto(meta.monto)} a la CES`;
}

/** «Rocío Benítez ahora apunta a beca completa: meta de 240 libros y $U 360.000 a la CES.» */
export function avisoDeBecaAsignada(nombre: string, beca: BecaDeColportor): string {
  if (!beca.apuntaA || !beca.meta) return `Quedó guardado el cambio de ${nombre}.`;
  const tipo = beca.apuntaA === "completa" ? "beca completa" : "media beca";
  return `${nombre} ahora apunta a ${tipo}: meta de ${libros(beca.meta.libros)} y ${formatMonto(beca.meta.monto)} a la CES.`;
}
