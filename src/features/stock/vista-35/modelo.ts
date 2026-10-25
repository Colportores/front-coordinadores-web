import type {
  DatosDePedidos,
  DecisionDeSolicitud,
  PedidoDeColportor,
  SolicitudResuelta,
  TipoDeSolicitud,
  TransferenciaDeStock,
} from "@/datos/stock/pedidos";
import { diasEntre, diaYMes } from "@/lib/dias";

import {
  AMBITO_TODAS,
  claveDeDepartamento,
  formatearCantidad,
  mismoAmbito,
  pluralProductos,
  type Ambito,
  type GrupoLista,
  type ModeloLista,
  type NodoLista,
} from "../vista-34/modelo";

/**
 * Lo que arma la vista 35 (HU-STK-001 · HU-STK-003 · HU-STK-005) a partir de los datos: qué mira (todas las ciudades, un
 * departamento, una ciudad o los colportores sin ciudad), la lista de ciudades, las pestañas por estado, la bandeja y el
 * detalle de lo elegido con el contexto para decidir. Todo puro: cambiar de ciudad o de pestaña no pide nada al servidor.
 *
 * Las cuentas y los textos son los del canvas (`35 Pedidos y Transferencias.dc.html`, opción A):
 * - El límite es de deuda total con el pedido incluido, vale para toda la campaña y solo avisa («△ Supera el límite»).
 * - El «N por autorizar» de la lista de ciudades y del subtítulo cuenta pedidos y transferencias; la pestaña «Por autorizar» y las
 *   demás de estado muestran solo pedidos; «Transferencias», solo ellas. Cuando «Por autorizar» queda vacía y hay transferencias
 *   por autorizar, el vacío lo dice y lleva a «Transferencias» (decisión de la revisión, P1 §2).
 * - El costo unitario es el de la casa editora; la deuda de un pedido es lo que cuesta, y en una transferencia pasa del
 *   que da al que recibe.
 */

export { AMBITO_TODAS, mismoAmbito, type Ambito };

const ORDEN = new Intl.Collator("es", { sensitivity: "base" });

/** Cuántos caracteres admite el motivo de un rechazo: lo que llega al colportor tiene que ser corto de leer. */
export const MAXIMO_DEL_MOTIVO = 500;

export const money = (n: number): string => `$U ${formatearCantidad(n)}`;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Una cantidad que no es un entero positivo (negativa, NaN) cuenta como cero: no hay pedidos ni stock negativos. */
function cantidad(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Un monto que no es un número positivo cuenta como cero. */
function monto(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

// ---------------------------------------------------------------------------------------------------------------------
// Fechas (hora de Montevideo, UTC-3 todo el año)
// ---------------------------------------------------------------------------------------------------------------------

const TRES_HORAS = 3 * 3_600_000;

function enMontevideo(instante: number): string {
  return new Date(instante - TRES_HORAS).toISOString();
}

/** El día de Montevideo de un instante ISO como AAAA-MM-DD; `null` si el texto no es una fecha. */
export function diaDeInstante(iso: string): string | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : enMontevideo(t).slice(0, 10);
}

/** «02/10» (el día de Montevideo del instante); vacío si no es una fecha. */
export function diaYMesDeInstante(iso: string): string {
  const dia = diaDeInstante(iso);
  return dia === null ? "" : diaYMes(dia);
}

/**
 * Cuándo se envió, como lo dice el canvas: «hace 12 min», «hace 3 h», «ayer 19:20», «hace 3 días» y, pasada la semana, el día
 * («15/10»).
 */
export function textoDeCuando(iso: string, ahora: Date): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const minutos = Math.floor((ahora.getTime() - t) / 60_000);
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const dias = diasEntre(enMontevideo(t).slice(0, 10), enMontevideo(ahora.getTime()).slice(0, 10));
  if (dias <= 0) return `hace ${Math.floor(minutos / 60)} h`;
  if (dias === 1) return `ayer ${enMontevideo(t).slice(11, 16)}`;
  if (dias < 7) return `hace ${dias} días`;
  return diaYMes(enMontevideo(t).slice(0, 10));
}

// ---------------------------------------------------------------------------------------------------------------------
// Las solicitudes (pedidos y transferencias) con el mismo molde
// ---------------------------------------------------------------------------------------------------------------------

/** Los estados de los dos: el de una transferencia autorizada o rechazada se llama como el de un pedido. */
export type Estado = "PEND" | "AUT" | "DES" | "REC" | "RECH";

const ESTADO_DE_PEDIDO = { POR_AUTORIZAR: "PEND", AUTORIZADO: "AUT", DESPACHADO: "DES", RECIBIDO: "REC", RECHAZADO: "RECH" } as const;
const ESTADO_DE_TRANSFERENCIA = { POR_AUTORIZAR: "PEND", AUTORIZADA: "AUT", RECHAZADA: "RECH" } as const;

export interface Linea {
  nombre: string;
  cantidad: number;
  costo: number;
}

export interface Solicitud {
  /** Único entre pedidos y transferencias: `pedido:ID` / `transferencia:ID`. */
  clave: string;
  tipo: TipoDeSolicitud;
  id: string;
  numero: string;
  /** Quien pide (un pedido) o quien da (una transferencia). */
  colportor: string;
  ciudadId: string | null;
  ciudadNombre: string | null;
  estado: Estado;
  /** Cuándo se envió o se pidió (instante ISO). */
  desde: string;
  resueltoEn: string | null;
  motivoDeRechazo: string | null;
  lineas: Linea[];
  total: number;
  /** Solo en un pedido. */
  pedido: PedidoDeColportor | null;
  /** Solo en una transferencia. */
  transferencia: TransferenciaDeStock | null;
}

function lineasDe(xs: ReadonlyArray<{ nombre: string; cantidad: number; costoUnitario: number }>): Linea[] {
  return xs.map((l) => ({ nombre: l.nombre, cantidad: cantidad(l.cantidad), costo: monto(l.costoUnitario) }));
}

const totalDe = (lineas: Linea[]) => lineas.reduce((suma, l) => suma + l.cantidad * l.costo, 0);

export interface CiudadConSolicitudes {
  id: string;
  nombre: string;
  departamento: string | null;
  claveDepartamento: string | null;
  solicitudes: Solicitud[];
}

export interface Mundo {
  campaniaId: string;
  limite: number | null;
  ahora: Date;
  /** Departamento primero (A-Z), después ciudad (A-Z); las ciudades sin departamento, al final. */
  ciudades: CiudadConSolicitudes[];
  sinCiudad: Solicitud[];
  todas: Solicitud[];
}

export function construirMundo(datos: DatosDePedidos): Mundo {
  const ciudades: CiudadConSolicitudes[] = datos.ciudades.map((c) => {
    const departamento = c.departamento === null ? null : c.departamento.trim().replace(/\s+/g, " ");
    return {
      id: c.id,
      nombre: c.nombre,
      departamento,
      claveDepartamento: departamento === null || claveDeDepartamento(departamento) === "" ? null : claveDeDepartamento(departamento),
      solicitudes: [],
    };
  });
  ciudades.sort((a, b) => {
    if (a.claveDepartamento === null && b.claveDepartamento !== null) return 1;
    if (a.claveDepartamento !== null && b.claveDepartamento === null) return -1;
    return ORDEN.compare(a.departamento ?? "", b.departamento ?? "") || ORDEN.compare(a.nombre, b.nombre);
  });

  const solicitudes: Solicitud[] = [];
  const vistas = new Set<string>();
  const ubicar = (ciudadId: string | null) => (ciudadId === null ? undefined : ciudades.find((c) => c.id === ciudadId));
  const base = (clave: string) => !vistas.has(clave) && vistas.add(clave);

  for (const p of datos.pedidos) {
    // El mismo pedido dos veces cuenta una sola.
    if (!base(`pedido:${p.id}`)) continue;
    const ciudad = ubicar(p.ciudadId);
    const lineas = lineasDe(p.lineas);
    solicitudes.push({
      clave: `pedido:${p.id}`,
      tipo: "pedido",
      id: p.id,
      numero: p.numero,
      colportor: p.colportorNombre,
      ciudadId: ciudad?.id ?? null,
      ciudadNombre: ciudad?.nombre ?? null,
      estado: ESTADO_DE_PEDIDO[p.estado] ?? "PEND",
      desde: p.enviadoEn,
      resueltoEn: p.resueltoEn,
      motivoDeRechazo: p.motivoDeRechazo,
      lineas,
      total: totalDe(lineas),
      pedido: p,
      transferencia: null,
    });
  }
  for (const t of datos.transferencias) {
    if (!base(`transferencia:${t.id}`)) continue;
    const ciudad = ubicar(t.ciudadId);
    const lineas = lineasDe(t.lineas);
    solicitudes.push({
      clave: `transferencia:${t.id}`,
      tipo: "transferencia",
      id: t.id,
      numero: t.numero,
      colportor: t.deNombre,
      ciudadId: ciudad?.id ?? null,
      ciudadNombre: ciudad?.nombre ?? null,
      estado: ESTADO_DE_TRANSFERENCIA[t.estado] ?? "PEND",
      desde: t.pedidaEn,
      resueltoEn: t.resueltaEn,
      motivoDeRechazo: t.motivoDeRechazo,
      lineas,
      total: totalDe(lineas),
      pedido: null,
      transferencia: t,
    });
  }
  // Lo más nuevo arriba, como la bandeja del canvas. Empatadas, por número, para que el orden no dependa de cómo vengan.
  solicitudes.sort((a, b) => (Date.parse(b.desde) || 0) - (Date.parse(a.desde) || 0) || ORDEN.compare(b.numero, a.numero));

  const sinCiudad: Solicitud[] = [];
  for (const s of solicitudes) {
    const ciudad = ubicar(s.ciudadId);
    if (ciudad) ciudad.solicitudes.push(s);
    else sinCiudad.push(s);
  }
  // Solo `null` (o un valor que no es un monto) es «sin límite»: un límite en cero es un límite, y todo pedido con deuda lo supera.
  const limite = datos.limiteDeDeuda === null || !Number.isFinite(datos.limiteDeDeuda) || datos.limiteDeDeuda < 0 ? null : Math.round(datos.limiteDeDeuda);
  const ahora = new Date(datos.ahora);
  return {
    campaniaId: datos.campaniaId,
    limite,
    ahora: Number.isNaN(ahora.getTime()) ? new Date(0) : ahora,
    ciudades,
    sinCiudad,
    todas: solicitudes,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Qué se mira
// ---------------------------------------------------------------------------------------------------------------------

export interface AmbitoResuelto {
  ambito: Ambito;
  titulo: string;
  subtitulo: string;
  /** «Rivera», «el departamento Artigas»: para completar «No hay pedidos … en ___». */
  lugar: string;
  solicitudes: Solicitud[];
}

export const porAutorizar = (solicitudes: Solicitud[]) => solicitudes.filter((s) => s.estado === "PEND").length;

/** Los departamentos con más de una ciudad: son los únicos que ofrecen «Todo el departamento». */
function departamentosConVarias(mundo: Mundo): Map<string, { etiqueta: string; ciudades: CiudadConSolicitudes[] }> {
  const porClave = new Map<string, { etiqueta: string; ciudades: CiudadConSolicitudes[] }>();
  for (const c of mundo.ciudades) {
    if (c.claveDepartamento === null || c.departamento === null) continue;
    const grupo = porClave.get(c.claveDepartamento) ?? { etiqueta: c.departamento, ciudades: [] };
    grupo.ciudades.push(c);
    porClave.set(c.claveDepartamento, grupo);
  }
  for (const [clave, grupo] of porClave) if (grupo.ciudades.length < 2) porClave.delete(clave);
  return porClave;
}

/** Un ámbito que ya no existe en los datos (la ciudad o el departamento desaparecieron) vuelve a «todas». */
export function resolverAmbito(mundo: Mundo, ambito: Ambito): AmbitoResuelto {
  const armar = (a: Ambito, titulo: string, lugar: string, solicitudes: Solicitud[]): AmbitoResuelto => ({
    ambito: a,
    titulo,
    lugar,
    solicitudes,
    subtitulo: `${porAutorizar(solicitudes)} por autorizar · ${solicitudes.length} en la campaña`,
  });
  if (ambito.tipo === "departamento") {
    const grupo = departamentosConVarias(mundo).get(ambito.clave);
    if (grupo) {
      const ids = new Set(grupo.ciudades.map((c) => c.id));
      return armar(ambito, `Departamento ${grupo.etiqueta}`, `el departamento ${grupo.etiqueta}`, mundo.todas.filter((s) => s.ciudadId !== null && ids.has(s.ciudadId)));
    }
  }
  if (ambito.tipo === "ciudad") {
    const ciudad = mundo.ciudades.find((c) => c.id === ambito.ciudadId);
    if (ciudad) return armar(ambito, ciudad.nombre, ciudad.nombre, ciudad.solicitudes);
  }
  if (ambito.tipo === "sin-ciudad" && mundo.sinCiudad.length > 0) {
    return armar(ambito, "Sin ciudad", "los colportores sin ciudad", mundo.sinCiudad);
  }
  return armar(AMBITO_TODAS, "Todas las ciudades", "la campaña", mundo.todas);
}

// ---------------------------------------------------------------------------------------------------------------------
// Lista de ciudades
// ---------------------------------------------------------------------------------------------------------------------

const detallePorAutorizar = (solicitudes: Solicitud[]) => {
  const n = porAutorizar(solicitudes);
  return n > 0 ? `${n} por autorizar` : "";
};

export function construirLista(mundo: Mundo, resuelto: AmbitoResuelto): ModeloLista {
  const nodo = (clave: string, ambito: Ambito, nombre: string, solicitudes: Solicitud[]): NodoLista => ({
    clave,
    ambito,
    nombre,
    detalle: detallePorAutorizar(solicitudes),
    seleccionado: mismoAmbito(ambito, resuelto.ambito),
  });
  const conVarias = departamentosConVarias(mundo);
  const grupos: GrupoLista[] = [];
  for (const ciudad of mundo.ciudades) {
    const claveGrupo = ciudad.claveDepartamento ?? "sin-departamento";
    let grupo = grupos.find((g) => g.clave === claveGrupo);
    if (!grupo) {
      grupo = { clave: claveGrupo, titulo: ciudad.departamento === null ? null : `DEPTO. ${ciudad.departamento.toLocaleUpperCase("es")}`, nodos: [] };
      grupos.push(grupo);
      const varias = ciudad.claveDepartamento === null ? undefined : conVarias.get(ciudad.claveDepartamento);
      if (ciudad.claveDepartamento !== null && varias) {
        const ids = new Set(varias.ciudades.map((c) => c.id));
        grupo.nodos.push(
          nodo(`departamento:${ciudad.claveDepartamento}`, { tipo: "departamento", clave: ciudad.claveDepartamento }, "Todo el departamento", mundo.todas.filter((s) => s.ciudadId !== null && ids.has(s.ciudadId))),
        );
      }
    }
    grupo.nodos.push(nodo(`ciudad:${ciudad.id}`, { tipo: "ciudad", ciudadId: ciudad.id }, ciudad.nombre, ciudad.solicitudes));
  }
  if (mundo.sinCiudad.length > 0) {
    grupos.push({ clave: "sin-ciudad", titulo: null, nodos: [nodo("sin-ciudad", { tipo: "sin-ciudad" }, "Sin ciudad", mundo.sinCiudad)] });
  }
  return { todas: nodo("todas", AMBITO_TODAS, "Todas las ciudades", mundo.todas), grupos };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pestañas y bandeja
// ---------------------------------------------------------------------------------------------------------------------

export type Pestana = "ALL" | "PEND" | "AUT" | "DES" | "REC" | "RECH" | "TRF";

export const PESTANAS: ReadonlyArray<{ id: Pestana; rotulo: string }> = [
  { id: "ALL", rotulo: "Todos" },
  { id: "PEND", rotulo: "Por autorizar" },
  { id: "AUT", rotulo: "Autorizados" },
  { id: "DES", rotulo: "Despachados" },
  { id: "REC", rotulo: "Recibidos" },
  { id: "RECH", rotulo: "Rechazados" },
  { id: "TRF", rotulo: "Transferencias" },
];

export function estaEnPestana(s: Solicitud, pestana: Pestana): boolean {
  if (pestana === "TRF") return s.tipo === "transferencia";
  if (s.tipo !== "pedido") return false;
  return pestana === "ALL" || s.estado === pestana;
}

export const solicitudesDe = (resuelto: AmbitoResuelto, pestana: Pestana) => resuelto.solicitudes.filter((s) => estaEnPestana(s, pestana));

export function contarPestanas(resuelto: AmbitoResuelto): Array<{ id: Pestana; rotulo: string; n: number }> {
  return PESTANAS.map((p) => ({ ...p, n: solicitudesDe(resuelto, p.id).length }));
}

/** Lo que dice la lista cuando una pestaña está vacía: dice qué pasa, no solo que no hay nada. */
export function textoDePestanaVacia(pestana: Pestana, lugar: string, transferenciasPorAutorizar = 0): string {
  switch (pestana) {
    case "ALL":
      return `Todavía no hay pedidos en ${lugar}. Cuando un colportor arme uno desde su teléfono, aparece acá.`;
    case "PEND":
      return transferenciasPorAutorizar > 0
        ? `No hay pedidos por autorizar en ${lugar}. Tenés ${transferenciasPorAutorizar} ${transferenciasPorAutorizar === 1 ? "transferencia" : "transferencias"} por autorizar.`
        : `No hay pedidos por autorizar en ${lugar}.`;
    case "AUT":
      return `No hay pedidos autorizados en ${lugar}.`;
    case "DES":
      return `No hay pedidos despachados en ${lugar}.`;
    case "REC":
      return `No hay pedidos recibidos en ${lugar}.`;
    case "RECH":
      return `No hay pedidos rechazados en ${lugar}.`;
    case "TRF":
      return `No hay transferencias en ${lugar}.`;
  }
}

export type Tono = "alerta" | "info" | "exito" | "peligro";

export interface Etiqueta {
  texto: string;
  tono: Tono;
}

/** Un pedido por autorizar que con su total deja la deuda por encima del límite. Las transferencias no tienen límite. */
export function superaElLimite(s: Solicitud, limite: number | null): boolean {
  return limite !== null && s.tipo === "pedido" && s.estado === "PEND" && deudaConElPedido(s) > limite;
}

function deudaConElPedido(s: Solicitud): number {
  return monto(s.pedido?.cuenta.deuda ?? 0) + s.total;
}

export function etiquetaDe(s: Solicitud, limite: number | null): Etiqueta {
  if (superaElLimite(s, limite)) return { texto: "△ Supera el límite", tono: "alerta" };
  const femenino = s.tipo === "transferencia";
  switch (s.estado) {
    case "PEND":
      return { texto: "Por autorizar", tono: "alerta" };
    case "AUT":
      return { texto: femenino ? "Autorizada" : "Autorizado", tono: "info" };
    case "DES":
      return { texto: "Despachado", tono: "info" };
    case "REC":
      return { texto: "Recibido", tono: "exito" };
    case "RECH":
      return { texto: femenino ? "Rechazada" : "Rechazado", tono: "peligro" };
  }
}

export interface Fila {
  clave: string;
  numero: string;
  quien: string;
  que: string;
  monto: string;
  cuando: string;
  etiqueta: Etiqueta;
}

function resumenDeLineas(s: Solicitud): string {
  const unidades = s.lineas.reduce((suma, l) => suma + l.cantidad, 0);
  if (s.tipo === "transferencia" && s.lineas.length === 1) return `${s.lineas[0].cantidad} × ${s.lineas[0].nombre}`;
  return `${pluralProductos(s.lineas.length)} · ${plural(unidades, "unidad", "unidades")}`;
}

export function construirFilas(mundo: Mundo, solicitudes: Solicitud[]): Fila[] {
  return solicitudes.map((s) => ({
    clave: s.clave,
    numero: s.numero,
    quien: s.transferencia ? `${s.transferencia.deNombre} → ${s.transferencia.aNombre}` : s.colportor,
    que: resumenDeLineas(s),
    monto: money(s.total),
    cuando: textoDeCuando(s.desde, mundo.ahora),
    etiqueta: etiquetaDe(s, mundo.limite),
  }));
}

/** La solicitud que se ve abierta: la elegida si sigue en la lista, y si no la primera (el canvas abre siempre una). */
export function claveVigente(filas: Fila[], elegida: string | null): string | null {
  if (elegida !== null && filas.some((f) => f.clave === elegida)) return elegida;
  return filas[0]?.clave ?? null;
}

/** A quién pasa el foco cuando `clave` sale de la lista: el que queda en su lugar, o el anterior si era el último. */
export function claveQueLaReemplaza(filas: Fila[], clave: string): string | null {
  const i = filas.findIndex((f) => f.clave === clave);
  if (i < 0) return null;
  return filas[i + 1]?.clave ?? filas[i - 1]?.clave ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------------------------------------------------

export interface Paso {
  rotulo: string;
  /** `hecho` lleva ✓; `actual` es el estado en que está; `pendiente`, lo que falta. */
  estado: "hecho" | "actual" | "pendiente";
  conLinea: boolean;
}

export interface ItemDelDetalle {
  nombre: string;
  cantidad: string;
  unidad: string;
  subtotal: string;
}

export interface FilaDeContexto {
  rotulo: string;
  valor: string;
  nota: string | null;
  negrita: boolean;
}

export interface Detalle {
  clave: string;
  tipo: TipoDeSolicitud;
  titulo: string;
  etiqueta: Etiqueta;
  quien: string;
  pasos: Paso[];
  aviso: string | null;
  tituloItems: string;
  items: ItemDelDetalle[];
  rotuloDelTotal: string;
  total: string;
  tituloContexto: string;
  contexto: FilaDeContexto[];
  puedeDecidir: boolean;
  notaDeAccion: string;
  nota: string | null;
  /** Para el aria-label de los botones: «el pedido #231 de Emiliano Sosa». */
  nombreCorto: string;
}

function pasosDe(s: Solicitud): Paso[] {
  const secuencia: Array<[Estado, string]> =
    s.tipo === "transferencia"
      ? [["PEND", "Por autorizar"], s.estado === "RECH" ? ["RECH", "Rechazada"] : ["AUT", "Autorizada"]]
      : s.estado === "RECH"
        ? [["PEND", "Por autorizar"], ["RECH", "Rechazado"]]
        : [["PEND", "Por autorizar"], ["AUT", "Autorizado"], ["DES", "Despachado"], ["REC", "Recibido"]];
  const actual = secuencia.findIndex(([k]) => k === s.estado);
  return secuencia.map(([k, rotulo], i) => {
    const termino = k === "REC" || k === "RECH" || (s.tipo === "transferencia" && k === "AUT");
    const estado: Paso["estado"] = i < actual || (i === actual && termino) ? "hecho" : i === actual ? "actual" : "pendiente";
    return { rotulo, estado, conLinea: i < secuencia.length - 1 };
  });
}

function contextoDeUnPedido(s: Solicitud, limite: number | null): FilaDeContexto[] {
  const p = s.pedido;
  if (!p) return [];
  const fila = (rotulo: string, valor: string, o: { nota?: string; negrita?: boolean } = {}): FilaDeContexto => ({
    rotulo,
    valor,
    nota: o.nota ?? null,
    negrita: o.negrita ?? false,
  });
  const deuda = monto(p.cuenta.deuda);
  const deposito = p.cuenta.ultimoDeposito;
  const enStock = p.stock.map((x) => `${x.nombre} ${cantidad(x.cantidad)}`).join(" · ");
  const porAutorizarAun = s.estado === "PEND";
  return [
    // Una vez autorizado, la deuda de hoy ya lleva este pedido: «con este pedido» sería contarlo dos veces.
    fila("Deuda actual", money(deuda), s.estado === "AUT" || s.estado === "DES" || s.estado === "REC" ? { nota: "incluye este pedido" } : {}),
    ...(porAutorizarAun ? [fila("Deuda con este pedido", money(deuda + s.total), { negrita: true, nota: limite !== null ? `límite ${money(limite)}` : undefined })] : []),
    fila("Por cobrar", money(monto(p.cuenta.porCobrar))),
    fila("Libros por entregar", String(cantidad(p.cuenta.librosPorEntregar))),
    fila("Último depósito", deposito ? `${diaYMes(deposito.dia)} · ${money(monto(deposito.monto))}` : "Todavía no depositó"),
    fila("Stock de estos productos", enStock === "" ? "—" : "", enStock === "" ? {} : { nota: enStock }),
  ];
}

function contextoDeUnaTransferencia(s: Solicitud): FilaDeContexto[] {
  const t = s.transferencia;
  if (!t) return [];
  const de = primerNombre(t.deNombre);
  const a = primerNombre(t.aNombre);
  const varias = t.lineas.length > 1;
  const filas: FilaDeContexto[] = [];
  for (const l of t.lineas) {
    const sufijo = varias ? ` de ${l.nombre}` : "";
    const tiene = cantidad(l.tieneQuienDa);
    const pide = cantidad(l.cantidad);
    filas.push({
      rotulo: `${de} tiene${sufijo}`,
      valor: String(tiene),
      nota: tiene >= pide ? `le quedan ${tiene - pide}` : `le faltan ${pide - tiene}`,
      negrita: false,
    });
    filas.push({
      rotulo: `${a} debe entregar${sufijo}`,
      valor: String(cantidad(l.debeEntregarQuienRecibe)),
      nota: `tiene ${cantidad(l.tieneQuienRecibe)}`,
      negrita: false,
    });
  }
  filas.push({ rotulo: `Deuda que pasa a ${a}`, valor: money(s.total), nota: null, negrita: true });
  return filas;
}

function notaDeEstado(s: Solicitud): string | null {
  const fecha = s.resueltoEn ? diaYMesDeInstante(s.resueltoEn) : "";
  const el = fecha === "" ? "" : ` el ${fecha}`;
  if (s.tipo === "transferencia") {
    if (s.estado === "AUT") return `Autorizada${el}.`;
    if (s.estado === "RECH") return `Rechazada${el}.${s.motivoDeRechazo ? ` Motivo: “${s.motivoDeRechazo}”` : ""}`;
    return null;
  }
  const nombre = primerNombre(s.colportor);
  switch (s.estado) {
    case "DES":
      return `La casa editora lo despachó${el}. ${nombre} lo marca como recibido desde el celular cuando le llegan los libros.`;
    case "REC":
      return `${nombre} lo recibió${el}.`;
    case "RECH":
      return `Rechazado${el}.${s.motivoDeRechazo ? ` Motivo: “${s.motivoDeRechazo}”` : ""}`;
    default:
      return null;
  }
}

export function construirDetalle(mundo: Mundo, s: Solicitud): Detalle {
  const { limite, ahora } = mundo;
  const etiqueta = etiquetaDe(s, limite);
  const lugar = s.ciudadNombre ?? "Sin ciudad";
  const items: ItemDelDetalle[] = s.lineas.map((l) => ({
    nombre: l.nombre,
    cantidad: String(l.cantidad),
    unidad: `${money(l.costo)} c/u`,
    subtotal: money(l.cantidad * l.costo),
  }));
  const pasos = pasosDe(s);
  const pendiente = s.estado === "PEND";
  const comun = { clave: s.clave, tipo: s.tipo, etiqueta, pasos, items, total: money(s.total), puedeDecidir: pendiente, nota: notaDeEstado(s) };

  if (s.transferencia) {
    const de = primerNombre(s.transferencia.deNombre);
    const a = primerNombre(s.transferencia.aNombre);
    return {
      ...comun,
      titulo: `Transferencia ${s.numero}`,
      quien: `${s.transferencia.deNombre} → ${s.transferencia.aNombre} · ${lugar} · pedida ${textoDeCuando(s.desde, ahora)}`,
      aviso: null,
      tituloItems: "LO QUE SE TRANSFIERE",
      rotuloDelTotal: "Deuda que se transfiere",
      tituloContexto: "STOCK DE LOS DOS",
      contexto: contextoDeUnaTransferencia(s),
      notaDeAccion: `Al autorizar, la deuda de ${money(s.total)} pasa de ${de} a ${a}.`,
      nombreCorto: `la transferencia ${s.numero} de ${s.transferencia.deNombre} a ${s.transferencia.aNombre}`,
    };
  }
  const con = deudaConElPedido(s);
  return {
    ...comun,
    titulo: `Pedido ${s.numero}`,
    quien: `${s.colportor} · ${lugar} · enviado ${textoDeCuando(s.desde, ahora)}`,
    aviso:
      limite !== null && superaElLimite(s, limite)
        ? `Con este pedido la deuda queda en ${money(con)} y supera el límite de ${money(limite)} por ${money(con - limite)}. Podés autorizarlo igual.`
        : null,
    tituloItems: "LO QUE PIDE",
    rotuloDelTotal: "Total del pedido",
    tituloContexto: `CUENTA DE ${primerNombre(s.colportor).toLocaleUpperCase("es")}`,
    contexto: contextoDeUnPedido(s, limite),
    notaDeAccion: `Al autorizar se suma ${money(s.total)} a la deuda de ${primerNombre(s.colportor)}.`,
    nombreCorto: `el pedido ${s.numero} de ${s.colportor}`,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Decidir
// ---------------------------------------------------------------------------------------------------------------------

/** El motivo del rechazo, listo para mandar, o por qué no se puede mandar. */
export function validarMotivo(texto: string, tipo: TipoDeSolicitud): { ok: true; motivo: string } | { ok: false; error: string } {
  const motivo = texto.trim();
  if (motivo === "") {
    return { ok: false, error: `Escribí el motivo para rechazar ${tipo === "pedido" ? "el pedido" : "la transferencia"}.` };
  }
  if (motivo.length > MAXIMO_DEL_MOTIVO) {
    return { ok: false, error: `El motivo es muy largo: usá hasta ${MAXIMO_DEL_MOTIVO} caracteres.` };
  }
  return { ok: true, motivo };
}

export function decisionDe(s: Solicitud, accion: "autorizar" | "rechazar", motivo = ""): DecisionDeSolicitud {
  return accion === "autorizar" ? { tipo: s.tipo, id: s.id, accion } : { tipo: s.tipo, id: s.id, accion, motivo };
}

/** Mueve la deuda de un colportor en todas las cuentas que lo muestran (cada pedido trae la suya). Nunca baja de cero. */
function conDeudaDe(pedidos: PedidoDeColportor[], colportorId: string, delta: number): PedidoDeColportor[] {
  if (delta === 0) return pedidos;
  return pedidos.map((p) => (p.colportorId === colportorId ? { ...p, cuenta: { ...p.cuenta, deuda: monto(monto(p.cuenta.deuda) + delta) } } : p));
}

/**
 * Los datos después de una decisión que el servidor aceptó. Lo que ya no está por autorizar no se vuelve a tocar.
 * Al autorizar, la deuda se mueve en todas las cuentas que la muestran: la de quien pidió el pedido sube lo que cuesta, y en
 * una transferencia baja la de quien da y sube la de quien recibe. Así el «Deuda actual» del detalle y el aviso del límite de
 * los otros pedidos por autorizar de esos colportores no quedan con la deuda de antes.
 */
export function aplicarResolucion(datos: DatosDePedidos, r: SolicitudResuelta): DatosDePedidos {
  if (r.tipo === "pedido") {
    const estado = r.estado === "AUTORIZADO" ? "AUTORIZADO" : r.estado === "RECHAZADO" ? "RECHAZADO" : null;
    if (estado === null) return datos;
    const pedido = datos.pedidos.find((p) => p.id === r.id && p.estado === "POR_AUTORIZAR");
    if (!pedido) return datos;
    const resueltos: PedidoDeColportor[] = datos.pedidos.map((p) => (p === pedido ? { ...p, estado, resueltoEn: r.resueltoEn, motivoDeRechazo: r.motivoDeRechazo } : p));
    const costo = estado === "AUTORIZADO" ? totalDe(lineasDe(pedido.lineas)) : 0;
    return { ...datos, pedidos: conDeudaDe(resueltos, pedido.colportorId, costo) };
  }
  const estado = r.estado === "AUTORIZADA" ? "AUTORIZADA" : r.estado === "RECHAZADA" ? "RECHAZADA" : null;
  if (estado === null) return datos;
  const transferencia = datos.transferencias.find((t) => t.id === r.id && t.estado === "POR_AUTORIZAR");
  if (!transferencia) return datos;
  const transferencias: TransferenciaDeStock[] = datos.transferencias.map((t) => (t === transferencia ? { ...t, estado, resueltaEn: r.resueltoEn, motivoDeRechazo: r.motivoDeRechazo } : t));
  if (estado === "RECHAZADA") return { ...datos, transferencias };
  const deuda = totalDe(lineasDe(transferencia.lineas));
  const pedidos = conDeudaDe(conDeudaDe(datos.pedidos, transferencia.deId, -deuda), transferencia.aId, deuda);
  return { ...datos, pedidos, transferencias };
}

/** El estado en que queda lo que se decidió, en los términos de la bandeja. */
export function estadoDeResolucion(r: SolicitudResuelta): Estado {
  return r.estado === "AUTORIZADO" || r.estado === "AUTORIZADA" ? "AUT" : "RECH";
}

/** «Pedido #231 de Emiliano Sosa autorizado.» para el aviso de lo que salió bien. */
export function textoDeDecision(s: Solicitud, accion: "autorizar" | "rechazar"): string {
  const femenino = s.tipo === "transferencia";
  const que = femenino ? `Transferencia ${s.numero} de ${s.transferencia?.deNombre ?? s.colportor}` : `Pedido ${s.numero} de ${s.colportor}`;
  if (accion === "rechazar") return `${que} ${femenino ? "rechazada" : "rechazado"}: el colportor recibe el motivo.`;
  if (femenino) return `${que} autorizada: la deuda de ${money(s.total)} pasó a ${primerNombre(s.transferencia?.aNombre ?? "")}.`;
  return `${que} autorizado: se sumaron ${money(s.total)} a su deuda.`;
}
