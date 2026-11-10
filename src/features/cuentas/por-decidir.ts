import type {
  ColportorDeCuentas,
  DatosDeCuentas,
  DecisionDeAlquiler,
  DestinoDeAlquiler,
  TicketDeCuentas,
} from "@/datos/cuentas";
import { textoDia, textoDiaYHora } from "@/datos/cuentas/fechas";
import { formatMonto } from "@/features/cuentas/formato";

/**
 * Lo pagado de alquiler «por decidir» (vista 41, front-coordinadores-web#132): quien se dio de baja, o todos en una campaña que
 * no cobra alquiler, no deben alquiler y lo que pagaron lo decide el coordinador con un solo destino para todo el monto
 * («Alq. baja», 04/11). Con una decisión anterior, lo que llegó después se decide aparte y «devolver» anula solo eso
 * («Devolver resto», 05/11). Replica `alquiler_calculado()` y `decidir_alquiler_pagado()` (0167, 0181). Todo puro.
 */

/** La campaña no cobra alquiler (el panel lo guarda como 0). */
export const campaniaSinAlquiler = (datos: DatosDeCuentas) => datos.alquilerPorColportor === 0;

/** Lo pagado de alquiler de este colportor lo decide el coordinador: se dio de baja, o la campaña no cobra alquiler. */
export const decideElCoordinador = (datos: DatosDeCuentas, colportor: ColportorDeCuentas) =>
  colportor.baja !== undefined || campaniaSinAlquiler(datos);

/** Cuándo se validó un pago (si no se sabe, su fecha): con eso se sabe si llegó después de una decisión. */
export const instanteDeValidacion = (t: TicketDeCuentas) => t.validadoEn ?? t.fecha;

/** Un pago de alquiler que cuenta: validado y no devuelto. */
export const esPagoDeAlquilerVigente = (t: TicketDeCuentas) => t.estado === "VALIDADO" && t.destino === "alquiler" && !t.anulado;

/** Un pago de alquiler vivo: por validar o validado, sin contar los rechazados ni los devueltos (anulados). */
export const esPagoDeAlquilerVivo = (t: TicketDeCuentas) => t.destino === "alquiler" && t.estado !== "RECHAZADO" && !t.anulado;

/**
 * La campaña ya tiene pagos de alquiler (de cualquier colportor, también de quien se dio de baja). Con pagos, el alquiler no
 * puede quedar en 0 ni vacío: decisión de Cristian del 10/11 («Alquiler a 0»: bloquear si ya hay pagos; backend-supabase#260).
 */
export const hayPagosDeAlquiler = (datos: DatosDeCuentas) => datos.tickets.some(esPagoDeAlquilerVivo);

/** Lo que se ve junto al campo del alquiler (y lo que contesta el servidor) al querer dejarlo en 0 o vacío con pagos. */
export const TEXTO_ALQUILER_CON_PAGOS = "Ya hay pagos de alquiler en esta campaña, así que no puede quedar sin alquiler. Podés cambiar el monto.";

export interface AlquilerDecidible {
  /** Lo pagado lo decide el coordinador (si es `false`, lo demás vale 0 o vacío). */
  decide: boolean;
  /** Lo que todavía no se decidió. */
  porDecidir: number;
  /** Los pagos que forman lo por decidir: validados después de la última decisión, del más viejo al más nuevo. */
  pagosPorDecidir: TicketDeCuentas[];
  /** Las decisiones vigentes, de la más vieja a la más nueva. */
  decisiones: DecisionDeAlquiler[];
  /** Lo devuelto al colportor: sus pagos anulados. */
  devuelto: number;
  /** Lo dejado a cuenta del próximo depósito: ya bajó la deuda con la casa editora. */
  aCuenta: number;
}

const porInstante = (a: string, b: string) => Date.parse(a) - Date.parse(b);

/** Las decisiones de un colportor, de la más vieja a la más nueva. */
export function decisionesDe(datos: DatosDeCuentas, colportorId: string): DecisionDeAlquiler[] {
  return (datos.decisionesDeAlquiler ?? [])
    .filter((d) => d.colportorId === colportorId)
    .sort((a, b) => porInstante(a.decididoEn, b.decididoEn) || a.id.localeCompare(b.id));
}

/**
 * La cuenta de lo decidible, como `alquiler_calculado()`: de lo pagado (sin lo devuelto) primero sale lo dejado a cuenta y con
 * el resto lo que se queda el coordinador, sin pasarse de lo pagado; lo que sobra está por decidir.
 */
export function alquilerDecidible(datos: DatosDeCuentas, colportor: ColportorDeCuentas): AlquilerDecidible {
  const propios = datos.tickets.filter((t) => t.colportorId === colportor.id && t.destino === "alquiler" && t.estado === "VALIDADO");
  const devuelto = propios.filter((t) => t.anulado).reduce((total, t) => total + t.monto, 0);
  if (!decideElCoordinador(datos, colportor)) {
    return { decide: false, porDecidir: 0, pagosPorDecidir: [], decisiones: [], devuelto, aCuenta: 0 };
  }
  const vigentes = propios.filter(esPagoDeAlquilerVigente);
  const pagado = vigentes.reduce((total, t) => total + t.monto, 0);
  const decisiones = decisionesDe(datos, colportor.id);
  const sumar = (destino: DestinoDeAlquiler) => decisiones.filter((d) => d.destino === destino).reduce((t, d) => t + d.monto, 0);
  const aCuenta = Math.min(sumar("a-cuenta"), pagado);
  const seLoQueda = Math.min(sumar("se-lo-queda"), pagado - aCuenta);
  const ultima = decisiones.at(-1)?.decididoEn ?? null;
  const pagosPorDecidir = vigentes
    .filter((t) => ultima === null || porInstante(instanteDeValidacion(t), ultima) > 0)
    .sort((a, b) => porInstante(a.fecha, b.fecha) || a.id.localeCompare(b.id));
  return { decide: true, porDecidir: pagado - aCuenta - seLoQueda, pagosPorDecidir, decisiones, devuelto, aCuenta };
}

/** Si el coordinador que mira puede decidir esta fila: hay algo por decidir y no es su propio alquiler. */
export const sePuedeDecidir = (colportor: ColportorDeCuentas, a: AlquilerDecidible) => a.decide && a.porDecidir > 0 && !colportor.esVos;

// ─── Textos de la fila ─────────────────────────────────────────────────────

/** La pastilla de una decisión ya tomada (41A·07). El símbolo y el texto dicen lo mismo que el color. */
export const ETIQUETA_DE_DESTINO: Record<DestinoDeAlquiler, string> = {
  devolver: "↩ Devuelto al colportor",
  "a-cuenta": "→ A cuenta del próximo depósito",
  "se-lo-queda": "■ Se lo quedó el coordinador",
};

/** Lo decidido con su monto, para las filas con más de una decisión: «$U 12.000 a cuenta del próximo depósito». */
export function montoDecidido(d: Pick<DecisionDeAlquiler, "destino" | "monto">): string {
  const monto = formatMonto(d.monto);
  if (d.destino === "devolver") return `${monto} devueltos al colportor`;
  if (d.destino === "a-cuenta") return `${monto} a cuenta del próximo depósito`;
  return `${monto} se los quedó el coordinador`;
}

/** «decidió Marta Pérez · 04/11 14:20»: quién y cuándo, siempre a la vista. */
export const quienYCuando = (d: DecisionDeAlquiler) => `decidió ${d.decididoPor} · ${textoDiaYHora(d.decididoEn)}`;

/** «Baja de la campaña el 02/11» (o sin el día, si no se sabe). `null` si no se dio de baja. */
export function textoDeBaja(colportor: ColportorDeCuentas): string | null {
  if (!colportor.baja) return null;
  return colportor.baja.fecha ? `Baja de la campaña el ${textoDia(colportor.baja.fecha)}` : "Baja de la campaña";
}

const bajaCorta = (colportor: ColportorDeCuentas) =>
  colportor.baja ? (colportor.baja.fecha ? `Baja ${textoDia(colportor.baja.fecha)}` : "Baja") : null;

/** Por qué la fila propia no ofrece la acción. */
export const TEXTO_FILA_PROPIA = "Es tu alquiler: lo decide otro coordinador de la campaña o un administrador.";

/**
 * Las líneas chicas bajo el nombre, en la pestaña Alquiler:
 * - por decidir, sin decisiones: «Baja de la campaña el 02/11» (41A·01);
 * - una decisión y nada más: «Baja 02/11 · decidió Marta Pérez · 04/11 14:20» (41A·06/07);
 * - más de una decisión, o una y algo nuevo por decidir: una línea por decisión con su monto, y lo nuevo aparte («Devolver resto»);
 * - la fila propia, además, por qué no se ofrece la acción.
 */
export function lineasDeLaFila(colportor: ColportorDeCuentas, a: AlquilerDecidible): string[] {
  if (!a.decide) return [];
  const baja = bajaCorta(colportor);
  const lineas: string[] = [];
  if (a.decisiones.length === 0) {
    const texto = textoDeBaja(colportor);
    if (texto) lineas.push(texto);
  } else if (a.decisiones.length === 1 && a.porDecidir === 0) {
    lineas.push([baja, quienYCuando(a.decisiones[0])].filter(Boolean).join(" · "));
  } else {
    if (baja) lineas.push(baja);
    for (const d of a.decisiones) lineas.push(`${montoDecidido(d)} · ${quienYCuando(d)}`);
    if (a.porDecidir > 0) lineas.push(`${formatMonto(a.porDecidir)} pagados después: por decidir`);
  }
  if (colportor.esVos && a.porDecidir > 0) lineas.push(TEXTO_FILA_PROPIA);
  return lineas;
}

// ─── El aviso de arriba ────────────────────────────────────────────────────

export interface Decidible {
  colportor: ColportorDeCuentas;
  alquiler: AlquilerDecidible;
}

/** La franja que dice cuánto falta decidir en la selección (41A·01, 41B·01). `null` si no falta nada que el que mira pueda decidir. */
export function avisoDePorDecidir(filas: Decidible[], sinAlquiler: boolean): string | null {
  const decidibles = filas.filter((f) => sePuedeDecidir(f.colportor, f.alquiler));
  if (decidibles.length === 0) return null;
  const total = formatMonto(decidibles.reduce((t, f) => t + f.alquiler.porDecidir, 0));
  const [una] = decidibles;
  if (sinAlquiler) {
    return decidibles.length === 1
      ? `Esta campaña no cobra alquiler y ${una.colportor.nombre} había pagado: ${total} por decidir.`
      : `Esta campaña no cobra alquiler y ${decidibles.length} colportores habían pagado: ${total} por decidir.`;
  }
  if (decidibles.length > 1) return `${decidibles.length} colportores dados de baja tienen ${total} de alquiler por decidir.`;
  return una.alquiler.decisiones.length > 0
    ? `${una.colportor.nombre} pagó ${total} de alquiler después de la última decisión. Falta decidir qué se hace con ese monto.`
    : `${una.colportor.nombre} se dio de baja y había pagado ${total} de alquiler. Falta decidir qué se hace con ese monto.`;
}

export const TEXTO_SIN_CONEXION = "Sin conexión. Podés ver el alquiler, pero no decidir hasta que vuelva.";

// ─── El diálogo ────────────────────────────────────────────────────────────

const primerNombre = (nombre: string) => nombre.split(/\s+/)[0] || nombre;

function listaConY(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

/** Lo ya decidido, en una frase: «$U 12.000 a cuenta del próximo depósito». */
const yaDecidido = (a: AlquilerDecidible) => listaConY(a.decisiones.map(montoDecidido));

const fechasDePagos = (pagos: TicketDeCuentas[]) => listaConY(pagos.map((t) => textoDia(t.fecha)));

export interface OpcionDeDestino {
  destino: DestinoDeAlquiler;
  titulo: string;
  detalle: string;
}

export interface TextosDeEleccion {
  titulo: string;
  texto: string;
  opciones: OpcionDeDestino[];
}

/** El primer paso (41A·02): qué se hace con lo por decidir, con tres destinos y una sola elección. */
export function textosDeEleccion(colportor: ColportorDeCuentas, a: AlquilerDecidible): TextosDeEleccion {
  const monto = formatMonto(a.porDecidir);
  const nombre = colportor.nombre;
  const previas = a.decisiones.length > 0;
  const n = a.pagosPorDecidir.length;
  let texto: string;
  if (previas) {
    texto = `${nombre} pagó ${monto} después de la última decisión. Lo ya decidido (${yaDecidido(a)}) queda como estaba. Elegí un solo destino para estos ${monto}.`;
  } else if (colportor.baja) {
    const baja = colportor.baja.fecha ? ` el ${textoDia(colportor.baja.fecha)}` : "";
    texto = `${nombre} se dio de baja de la campaña${baja}. Elegí un solo destino para todo el monto.`;
  } else {
    texto = `La campaña no cobra alquiler y ${nombre} había pagado ${monto}. Elegí un solo destino para todo el monto.`;
  }
  let devolver: string;
  if (previas) {
    devolver =
      n === 1
        ? "Se anula solo el pago que llegó después. Lo ya decidido queda como estaba."
        : `Se anulan solo los ${n} pagos que llegaron después. Lo ya decidido queda como estaba.`;
  } else {
    devolver = n === 1 ? "Se anula su pago de alquiler." : `Se anulan sus ${n} pagos de alquiler.`;
  }
  return {
    titulo: previas
      ? `¿Qué hacés con los ${monto} que pagó ${primerNombre(nombre)} después?`
      : `¿Qué hacés con los ${monto} que pagó ${primerNombre(nombre)}?`,
    texto,
    opciones: [
      { destino: "devolver", titulo: "Devolverlo al colportor", detalle: devolver },
      { destino: "a-cuenta", titulo: "Dejarlo a cuenta", detalle: "Queda para su próximo depósito." },
      { destino: "se-lo-queda", titulo: "Quedárselo", detalle: "Lo conserva el coordinador." },
    ],
  };
}

export interface TextosDeConfirmacion {
  titulo: string;
  texto: string;
  boton: string;
}

const REGISTRO = "Queda registrado que lo decidiste vos, hoy. No se puede cambiar después.";

/** El segundo paso (41A·04): qué pasa con la plata según el destino elegido. */
export function textosDeConfirmacion(colportor: ColportorDeCuentas, a: AlquilerDecidible, destino: DestinoDeAlquiler): TextosDeConfirmacion {
  const monto = formatMonto(a.porDecidir);
  const nombre = primerNombre(colportor.nombre);
  if (destino === "devolver") {
    const n = a.pagosPorDecidir.length;
    const fechas = fechasDePagos(a.pagosPorDecidir);
    let texto: string;
    if (a.decisiones.length > 0) {
      texto = `Se anula solo lo que pagó después de la última decisión (${fechas}). Lo ya decidido (${yaDecidido(a)}) queda como estaba. ${REGISTRO}`;
    } else {
      texto = `${n === 1 ? "Se anula su pago" : `Se anulan sus ${n} pagos`} de alquiler (${fechas}). ${REGISTRO}`;
    }
    return { titulo: `¿Devolverle ${monto} a ${nombre}?`, texto, boton: "Sí, devolver" };
  }
  if (destino === "a-cuenta") {
    return {
      titulo: `¿Dejar ${monto} a cuenta del próximo depósito de ${nombre}?`,
      texto: `Se descuentan de su deuda con la casa editora. ${REGISTRO}`,
      boton: "Sí, dejar a cuenta",
    };
  }
  return {
    titulo: `¿Quedarte con los ${monto} de ${nombre}?`,
    texto: `La plata queda con el coordinador y su deuda con la casa editora no cambia. ${REGISTRO}`,
    boton: "Sí, quedármelo",
  };
}

/** El aviso de abajo tras decidir (41A·06). */
export function textoDeDecidido(nombre: string, decision: Pick<DecisionDeAlquiler, "destino" | "monto">): string {
  const monto = formatMonto(decision.monto);
  if (decision.destino === "devolver") return `Listo. Se devolvieron ${monto} a ${nombre}.`;
  if (decision.destino === "a-cuenta") return `Listo. ${monto} de ${nombre} quedan a cuenta de su próximo depósito.`;
  return `Listo. Los ${monto} de ${nombre} quedan con el coordinador.`;
}

export const TEXTO_YA_ESTABA = "Eso ya estaba decidido y no cambió nada. Recargá la página para ver cómo quedó.";

/** El error dentro del diálogo (41B·02). Si el servidor explica por qué, se muestra lo suyo. */
export function textoDeFallaAlDecidir(causa: "sin-conexion" | "rechazado", mensaje?: string): string {
  if (causa === "sin-conexion") return "Sin conexión: no pudimos guardar la decisión. No cambió nada: probá de nuevo cuando vuelva.";
  return mensaje ?? "No pudimos guardar la decisión. No cambió nada: probá de nuevo.";
}

// ─── La decisión aplicada a una copia de los datos ────────────────────────

/**
 * Suma la decisión y hace lo que hace el servidor con la plata: «devolver» anula los pagos por decidir (nunca los borra), baja
 * «Depositado» y vuelve a poner la plata «en mano». «A cuenta» baja la deuda con la casa editora: de eso se encarga quien
 * mueve los traslados (`modelo.ts`), igual que con lo pagado de más.
 */
export function sumarDecision(datos: DatosDeCuentas, decision: DecisionDeAlquiler): DatosDeCuentas {
  const colportor = datos.colportores.find((c) => c.id === decision.colportorId);
  if (!colportor || (datos.decisionesDeAlquiler ?? []).some((d) => d.id === decision.id)) return datos;
  const conDecision: DatosDeCuentas = { ...datos, decisionesDeAlquiler: [...(datos.decisionesDeAlquiler ?? []), decision] };
  if (decision.destino !== "devolver") return conDecision;
  const anular = new Set(alquilerDecidible(datos, colportor).pagosPorDecidir.map((t) => t.id));
  return {
    ...conDecision,
    tickets: datos.tickets.map((t) => (anular.has(t.id) ? { ...t, anulado: { en: decision.decididoEn } } : t)),
    colportores: datos.colportores.map((c) =>
      c.id === colportor.id ? { ...c, depositado: Math.max(0, c.depositado - decision.monto), enMano: c.enMano + decision.monto } : c,
    ),
  };
}
