/**
 * Contrato de datos de la pestaña Stock (vista 34, HU-STK-010): el stock de la campaña por ciudad, producto por producto,
 * y lo que tiene cada colportor. Es lo que después implementa la RPC de lectura (backend-supabase#101, V2: se conecta
 * después del 20/11); hasta entonces lo cumple la fuente simulada.
 *
 * Qué trae y qué no:
 * - Cantidades, nunca plata ni datos de clientes: la deuda, lo depositado y el dinero en mano son de Cuentas (HU-CTA-005).
 * - El stock de una ciudad es la suma del de los colportores de esa ciudad, la de su zona asignada (S69). El colportor sin
 *   zona no tiene ciudad (`ciudadId: null`): la vista lo agrupa aparte, como «Sin ciudad».
 * - Las alertas («Agotado en la ciudad», «Faltan N para entregar») no viajan: salen de estas cantidades, que es lo que
 *   dibuja el canvas. Sin umbral y sin stock mínimo sugerido (S47).
 * - Pedidos a la casa editora y transferencias son de la vista 35 (HU-STK-001/003/005), no de esta.
 */

import type { ResultadoDeAccion } from "@/datos/stock/pedidos/contrato";

export type TipoDeProducto = "LIBRO" | "REVISTA" | "MATERIAL" | "MISIONERO";

export interface CiudadDeStock {
  id: string;
  nombre: string;
  /** `null` cuando la ciudad no tiene departamento cargado. */
  departamento: string | null;
}

export interface ProductoDeStock {
  id: string;
  nombre: string;
  /** Los jugos y los alimentos son «Material»; las revistas, «Revistas» (decisión C4 del 21/10). */
  tipo: TipoDeProducto;
  /** Aclaración de catálogo que se muestra debajo del nombre (p. ej. «tipo a confirmar»). */
  nota: string | null;
}

/** Lo que tiene un colportor de un producto. Un producto que no figura vale cero en todo. */
export interface ExistenciaDeStock {
  productoId: string;
  /** Unidades que tiene en mano. */
  tiene: number;
  /** Vendidas y todavía no entregadas. */
  porEntregar: number;
  /** Entregadas. No se les resta lo devuelto: la devolución va aparte, en `devueltos`. */
  entregados: number;
  /** Devueltas al stock (devolución de una venta, HU-VEN-004). Columna «Devueltos», aparte de `entregados` (decisión de Cristian, 27/10, «Devol. stock»). */
  devueltos: number;
  /**
   * Entregadas y no pagadas, en unidades (no en plata). Llega del servidor ya proporcional al saldo y redondeado hacia
   * arriba (una venta de 3 libros cobrada a la mitad cuenta 2; sin saldo, 0; decisión de Cristian, 27/10, «Por cobrar»):
   * el panel muestra el número tal cual, no recalcula nada.
   */
  porCobrar: number;
}

/** Por qué la colportora ajustó su stock desde el teléfono: la lista cerrada de la decisión del 28/10 («Ajuste stock»), sin texto libre. */
export type MotivoDeAjuste = "STOCK_INICIAL" | "LIBROS_DANADOS" | "CONTEO";

/**
 * Un ajuste de stock que cargó la colportora (movimiento `AJUSTE_ENTRADA` o `AJUSTE_SALIDA`, backend-supabase migración 0148):
 * no se edita, se corrige con otro ajuste. La coordinadora lo ve en el historial de cada producto de la vista 34 (decisión de
 * Cristian, 28/10, «Ajuste stock»).
 */
export interface AjusteDeStock {
  id: string;
  productoId: string;
  /** Con signo: positivo es una entrada («Stock inicial», «Conteo» que sube), negativo una salida («Libros dañados»). Nunca cero. */
  cantidad: number;
  motivo: MotivoDeAjuste;
  /** Cuándo lo cargó (marca de tiempo ISO). */
  cuando: string;
  /** Quién lo cargó: la colportora, en su teléfono. */
  cargadoPor: string;
}

export interface ColportorDeStock {
  id: string;
  nombre: string;
  /** `null` si no tiene zona asignada. */
  ciudadId: string | null;
  /**
   * Cuándo el servidor recibió el último dato de su teléfono (marca de tiempo ISO; `ultimo_dato_at` de la RPC): la vista
   * la muestra como «Sincronizó el 22/10 a las 18:30» para que nadie tome por de hoy una cifra vieja (decisión de Cristian
   * del 25/10, «Fecha stock»). `null` = todavía no llegó ninguno.
   */
  ultimoDatoAt: string | null;
  existencias: ExistenciaDeStock[];
  /** Los ajustes que cargó desde su teléfono, en cualquier orden. Sin la clave, no hay ninguno. */
  ajustes?: AjusteDeStock[];
}

/**
 * Cuántos pedidos a la casa editora esperan autorización en una ciudad: el aviso «2 pedidos por autorizar en Rivera» con «Ver
 * pedidos» (decisión de Cristian, 25/10, «Pedidos stock»). Viene de `pedidos_por_autorizar_por_ciudad` (backend-supabase#101,
 * migraciones 0111 y 0112): una fila por ciudad que tiene al menos uno; `ciudadId: null` es «sin ciudad» (la zona del colportor
 * no tiene ciudad). Solo el número: ni monto, ni líneas, ni quién pidió.
 */
export interface PedidosPorAutorizarDeCiudad {
  ciudadId: string | null;
  pedidos: number;
}

export interface DatosDeStock {
  campaniaId: string;
  ciudades: CiudadDeStock[];
  /** El catálogo de la campaña, en el orden en que se muestra dentro de cada tipo. */
  productos: ProductoDeStock[];
  colportores: ColportorDeStock[];
  /** Los pedidos por autorizar de cada ciudad. Sin la clave (o vacío), ninguna ciudad tiene pedidos esperando. */
  pedidosPorAutorizar?: PedidosPorAutorizarDeCiudad[];
}

export interface FuenteDatosStock {
  /** `null` cuando el coordinador no tiene una campaña en curso ni por empezar. */
  obtenerStock(): Promise<DatosDeStock | null>;
}

// ---------------------------------------------------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------------------------------------------------

/** Un producto de la transferencia y cuántas unidades. */
export interface LineaDeTransferenciaPedida {
  productoId: string;
  /** Entero mayor que cero. */
  cantidad: number;
}

/**
 * «Pedir transferencia de materiales» (HU-STK-005, antes «Pedir prestado»): la coordinadora arma una transferencia entre dos
 * colportores. Es `pedir_transferencia_de_stock(p_origen_id, p_destino_id, p_items)` (backend-supabase, migración 0139): queda
 * por autorizar, no mueve stock ni deuda hasta que se autoriza en la vista 35 y no lleva texto libre.
 */
export interface TransferenciaPedida {
  /** Quien da los libros. */
  origenId: string;
  /** Quien los recibe. */
  destinoId: string;
  /** Sin repetir producto. */
  lineas: LineaDeTransferenciaPedida[];
}

/** Lo que devuelve la base al armarla: queda por autorizar. */
export interface TransferenciaArmada {
  id: string;
  /** Como la ve la coordinadora: «T-19». */
  numero: string;
}

/** Escrituras de la vista 34. La fuente simulada las resuelve en el navegador; las reales serán server actions. */
export interface AccionesDeStock {
  pedirTransferencia(pedido: TransferenciaPedida): Promise<ResultadoDeAccion<TransferenciaArmada>>;
}
