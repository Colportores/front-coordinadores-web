/**
 * Contrato de datos de «Validar tickets» (vista 29, HU-COB-008): la cola de lo que el coordinador valida o rechaza. Por la
 * decisión de Cristian del 10/11 («Ticket dep.» y «Retiro rech.») entran solo los tickets de DEPÓSITO (banco u oficina, con
 * foto) y los RETIROS por el coordinador (sin foto, donde no hay banco); los tickets de cobros con tarjeta quedan afuera.
 *
 * Está pensado para las RPC de backend-supabase (0129 y 0152): `tickets_de_campania` (la lista de tickets),
 * `validacion_de_ticket` / `validacion_de_retiro` (en mano y deuda antes de decidir), `validar_ticket`, `rechazar_ticket`,
 * `confirmar_retiro` y `rechazar_retiro`, y la Edge Function `foto-ticket` (enlace firmado de la foto). Como el resto de
 * Cuentas, hoy solo existe la fuente simulada. Nunca viajan datos de clientes: el ticket es del depósito, no de la venta.
 */
import type { CausaDeFalla, DestinoDeTicket, ResultadoDeAccion } from "@/datos/cuentas/contrato";

export type { CausaDeFalla, ResultadoDeAccion };

/** Un ticket de depósito (con foto) o un retiro por el coordinador (sin ticket ni foto). */
export type TipoPorValidar = "deposito" | "retiro";

/** Contra qué deuda cuenta: lo elige el colportor al cargarlo (HU-CTA-004). */
export type ConceptoPorValidar = DestinoDeTicket;

/** Dónde depositó (vista 38 A del móvil: «Banco» u «Oficina»). El retiro no tiene lugar. */
export type LugarDelDeposito = "banco" | "oficina";

/** Si pagó el depósito con tarjeta (vista 38 A: «Débito», «Crédito» o «No»). */
export type TarjetaDelDeposito = "debito" | "credito" | "no";

/** Los tres estados de `esquema-datos.md`. En un retiro, `VALIDADO` es «Confirmado». */
export type EstadoPorValidar = "PENDIENTE" | "VALIDADO" | "RECHAZADO";

/** Lo que la app sabe del colportor para comparar antes de decidir (`validacion_de_*`: `en_mano` y `deuda_antes`). */
export interface CifrasDelColportor {
  /** Lo cobrado en efectivo y no depositado antes de este depósito (`efectivo_en_mano`). */
  enMano: number;
  /** La deuda del concepto antes de validar (casa editora o alquiler de la campaña). */
  deuda: number;
}

export interface ItemPorValidar {
  /** El id del ticket (depósito) o del depósito sin ticket (retiro). */
  id: string;
  tipo: TipoPorValidar;
  colportorId: string;
  colportorNombre: string;
  /** El retiro (o ticket) es de quien mira: nadie valida lo suyo (42501 en el servidor). */
  esVos: boolean;
  /** La ciudad de su zona actual; `null` si no tiene zona. */
  ciudad: string | null;
  monto: number;
  concepto: ConceptoPorValidar;
  lugar?: LugarDelDeposito;
  /** Banco del depósito («BROU»). */
  entidad?: string;
  numeroAutorizacion?: string;
  tarjeta?: TarjetaDelDeposito;
  /** Instante ISO 8601 del depósito o de la entrega del efectivo. */
  fecha: string;
  /** Instante ISO 8601 en que llegó al servidor. */
  enviadoEn: string;
  estado: EstadoPorValidar;
  /** Obligatorio cuando el estado es `RECHAZADO`. */
  motivoRechazo?: string;
  /** Instante ISO 8601 en que se validó, confirmó o rechazó. */
  resueltoEn?: string;
  resueltoPorVos?: boolean;
  /** Si la foto se puede pedir: el retiro no tiene y la del depósito vence a los 4 meses (`tiene_foto`). */
  tieneFoto: boolean;
  /** `null` si el servidor no las pudo calcular (ya resuelto o sin permiso). */
  cifras: CifrasDelColportor | null;
}

export interface DatosDeValidacion {
  campaniaId: string;
  /** Instante ISO 8601 de la lectura: de él salen «hoy», «ayer» y «hace 3 h». */
  ahora: string;
  /** Todo lo de la campaña que pasa por esta vista, en cualquier estado. */
  items: ItemPorValidar[];
}

export interface FuenteValidarTickets {
  obtenerPorValidar(): Promise<DatosDeValidacion>;
}

/** Lo que devuelve una decisión: cuándo quedó y si ya estaba así (un reintento de quien ya lo resolvió, `ya_estaba`). */
export interface Resolucion {
  resueltoEn: string;
  yaEstaba: boolean;
}

/** Escrituras de la vista. La fuente simulada las resuelve en el navegador; la real serán server actions. */
export interface AccionesValidarTickets {
  /** `validar_ticket` (depósito) o `confirmar_retiro` (retiro). */
  validar(item: Pick<ItemPorValidar, "id" | "tipo">): Promise<ResultadoDeAccion<Resolucion>>;
  /** `rechazar_ticket` o `rechazar_retiro`, con el motivo ya recortado (1 a 500 caracteres). */
  rechazar(item: Pick<ItemPorValidar, "id" | "tipo">, motivo: string): Promise<ResultadoDeAccion<Resolucion>>;
  /** El enlace firmado de la foto del ticket (vence en minutos), o por qué no se puede ver. */
  enlaceDeFoto(ticketId: string): Promise<ResultadoDeAccion<string>>;
}
