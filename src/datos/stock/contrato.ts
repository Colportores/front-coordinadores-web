/**
 * Contrato de datos de la pestaña Stock: KPIs, pedidos a casa editora,
 * transferencias entre colportores y stock por colportor.
 *
 * Stock es V2 (ver `src/dev/estado-hu.ts`: HU-STK-001, HU-STK-003, HU-STK-004,
 * HU-STK-005 quedan "bloqueada" hasta la migración "Stock y cuenta (V2)").
 * Este contrato es lo que después implementa el BFF (bff-coordinadores).
 *
 * El coordinador ve montos y agregados de sus colportores, nunca datos de
 * clientes.
 */

export type EstadoPedidoCasaEditora = "por_autorizar" | "despachado" | "entregado";

export interface PedidoCasaEditora {
  id: string;
  /** Colportor que solicita el pedido. */
  solicitante: string;
  libros: number;
  /** Monto en pesos uruguayos, sin formatear. */
  monto: number;
  estado: EstadoPedidoCasaEditora;
}

export type EstadoTransferencia = "por_autorizar" | "autorizada" | "rechazada";

export interface TransferenciaStock {
  id: string;
  colportorOrigen: string;
  colportorDestino: string;
  producto: string;
  cantidad: number;
  estado: EstadoTransferencia;
  /** Fecha de resolución ya formateada (p. ej. "08 jun"). Vacía si sigue por autorizar. */
  fechaResolucion?: string;
}

export interface StockPorColportor {
  colportorId: string;
  nombre: string;
  libros: number;
  /**
   * Alerta de stock bajo. El umbral lo calcula el back al conectar la HU
   * (HU-STK-004); acá viaja como dato ya resuelto, no se recalcula en la vista.
   */
  stockBajo: boolean;
}

export interface KpisStock {
  librosEnCampo: number;
  pedidosEnCurso: number;
  transferenciasPendientes: number;
}

export interface DatosStock {
  kpis: KpisStock;
  pedidos: PedidoCasaEditora[];
  transferencias: TransferenciaStock[];
  stockPorColportor: StockPorColportor[];
}

export interface FuenteDatosStock {
  obtenerStock(): Promise<DatosStock>;
}
