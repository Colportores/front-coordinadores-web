import type { MotivoDeAnulacion, TicketDeCuentas } from "@/datos/cuentas";
import { textoDiaYHora } from "@/datos/cuentas/fechas";
import { formatMonto } from "@/features/cuentas/formato";
import { mensajeSinConexion } from "@/lib/mensajes";

/**
 * «Anular cobro» (vista 39, front-coordinadores-web#81, HU-COB-006): lo que el panel decide y dice sobre un cobro con tarjeta.
 * Solo dentro de las 72 h desde el cobro, también para el coordinador («Anular 72 h», Cristian 23/10); el servidor
 * (`anular_cobro`, 0072) es quien decide de verdad. Todo puro: la hora llega por argumento.
 */

export const HORAS_DE_PLAZO = 72;
const MS_POR_HORA = 3_600_000;

/** Un ticket con cobro anulado (por el coordinador o desde el teléfono de la colportora): deja de contar. */
export const tieneCobroAnulado = (t: TicketDeCuentas) => t.cobro?.anulado !== undefined;

/** El instante (ms) hasta el que se puede anular, inclusive: 72 h después del cobro. `NaN` si la fecha no se entiende. */
export const limiteDeAnulacion = (fechaDelCobro: string) => Date.parse(fechaDelCobro) + HORAS_DE_PLAZO * MS_POR_HORA;

export type EstadoDelCobro =
  /** El ticket no tiene un cobro detrás (un depósito, un retiro): no hay nada que anular. */
  | "sin-cobro"
  | "anulado"
  | "disponible"
  | "fuera-de-plazo"
  | "sin-conexion";

/**
 * Qué ofrece el detalle del ticket. El plazo manda sobre la conexión: pasadas las 72 h no se puede anular ni con señal.
 * `vencido` es el aviso del servidor de que el plazo ya pasó (aunque el reloj de esta página todavía no lo diga).
 */
export function estadoDelCobro(ticket: TicketDeCuentas, ahoraIso: string, enLinea: boolean, vencido = false): EstadoDelCobro {
  const cobro = ticket.cobro;
  if (!cobro) return "sin-cobro";
  if (cobro.anulado) return "anulado";
  // Una fecha ilegible no se toma por «dentro del plazo»: se deja sin ofrecer.
  if (vencido || !(Date.parse(ahoraIso) <= limiteDeAnulacion(cobro.fecha))) return "fuera-de-plazo";
  return enLinea ? "disponible" : "sin-conexion";
}

// ─── Textos (los del canvas 39) ────────────────────────────────────────────

/** «19/10 · 10:20»: día y hora con un punto medio, como los escribe la vista 39. */
const conPunto = (iso: string) => textoDiaYHora(iso).replace(" ", " · ");

export const textoDeCobroRegistrado = (t: TicketDeCuentas) => (t.cobro ? conPunto(t.cobro.fecha) : "—");

export const TEXTO_ANULAR_COBRO = "Anular cobro";

export function notaDeAnulacionDisponible(fechaDelCobro: string): string {
  const limite = new Date(limiteDeAnulacion(fechaDelCobro)).toISOString();
  return `Se puede anular hasta el ${conPunto(limite)} (${HORAS_DE_PLAZO} h después del cobro). Anular deja el cobro sin efecto y le avisa a la colportora.`;
}

export function notaFueraDePlazo(fechaDelCobro: string): string {
  const [dia, hora] = textoDiaYHora(new Date(limiteDeAnulacion(fechaDelCobro)).toISOString()).split(" ");
  return `Pasaron más de ${HORAS_DE_PLAZO} h desde el cobro (${conPunto(fechaDelCobro)}). Se podía anular hasta el ${dia} a las ${hora}.`;
}

export const NOTA_SIN_CONEXION = "Necesitás conexión para anular un cobro.";
export const AVISO_SIN_CONEXION = "Sin conexión. Podés ver los cobros, pero no anularlos hasta que vuelva.";

export const notaDeCobroAnulado = (nombre: string) => `Cobro anulado. No cuenta en la cuenta de ${nombre} ni en el saldo de la venta.`;

/** «Otro» con lo que escribió quien anuló; los demás motivos, tal cual. */
export function textoDeMotivo(motivo: MotivoDeAnulacion, detalle?: string): string {
  const escrito = detalle?.trim();
  return motivo === "Otro" && escrito ? `Otro: ${escrito}` : motivo;
}

/** Quién anuló: el coordinador por su nombre; la colportora, aclarando que fue desde el teléfono. */
export const textoDeQuienAnulo = (por: string, origen: "panel" | "telefono") => (origen === "telefono" ? `${por} (desde el teléfono)` : por);

export const textoDeCuandoSeAnulo = (iso: string) => conPunto(iso);

/** «tarjeta de débito Visa»: el medio dentro de una frase. */
function medioEnFrase(t: TicketDeCuentas): string {
  const base = t.medio === "tarjeta-credito" ? "tarjeta de crédito" : t.medio === "tarjeta-debito" ? "tarjeta de débito" : "cobro";
  return t.entidad ? `${base} ${t.entidad}` : base;
}

export const MOTIVO_OTRO = "Otro" satisfies MotivoDeAnulacion;
export const ROTULO_DEL_CAMPO_OTRO = "¿POR QUÉ?";
export const PLACEHOLDER_DEL_CAMPO_OTRO = "Escribí el motivo";
export const ERROR_DEL_CAMPO_OTRO = "Escribí el motivo para seguir.";
/** Tope del texto de «Otro»: lo escrito se muestra en el detalle y no puede ser una pared de texto. */
export const MAX_DETALLE_DE_OTRO = 200;

export const tituloDelMotivo = (t: TicketDeCuentas) => `Anular el cobro de ${formatMonto(t.monto)}`;

export function textoDelMotivo(nombre: string, t: TicketDeCuentas): string {
  const fecha = t.cobro ? conPunto(t.cobro.fecha).replace(" · ", " ") : "";
  return `${nombre} · ${medioEnFrase(t)} · ${fecha}. Elegí el motivo.`;
}

export const TITULO_DE_CONFIRMACION = "¿Anular este cobro?";

export const textoDeConfirmacion = (nombre: string, t: TicketDeCuentas) =>
  `El cobro de ${formatMonto(t.monto)} deja de contar: el saldo de la venta vuelve a subir y el ticket queda anulado. ${nombre} lo ve en su teléfono con el motivo. No se puede deshacer.`;

export const TEXTO_CONFIRMAR = "Sí, anular el cobro";
export const TEXTO_ANULANDO = "Anulando…";
export const TEXTO_DE_ERROR = "No pudimos anular el cobro. No cambió nada: probá de nuevo.";
export const TITULO_NO_SE_ANULO = "No se anuló";
export const TEXTO_VENCIO_AL_CONFIRMAR = "Pasaron las 72 h mientras confirmabas. El cobro sigue como estaba.";
export const TEXTO_ANULADO = "Cobro anulado.";
export const TEXTO_YA_ESTABA_ANULADO = "Ese cobro ya estaba anulado y no cambió nada. Recargá la página para ver cómo quedó.";

/** Sin señal al confirmar: dice que el problema es la conexión («Sin conexión, por pantalla»), no el error genérico. */
export const TEXTO_SIN_CONEXION_AL_ANULAR = mensajeSinConexion("anular un cobro");

/**
 * Lo que dice un fallo de la anulación: la falta de conexión por su nombre; lo que contestó el servidor al rechazar; o el texto
 * de 39B·03 (nunca un código técnico).
 */
export function textoDeFallaAlAnular(causa: "sin-conexion" | "rechazado", mensaje?: string): string {
  if (causa === "sin-conexion") return TEXTO_SIN_CONEXION_AL_ANULAR;
  return mensaje ?? TEXTO_DE_ERROR;
}
