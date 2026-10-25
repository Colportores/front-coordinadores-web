/**
 * Contrato de datos de Pedidos y transferencias (vista 35, HU-STK-001 · HU-STK-003 · HU-STK-005): los pedidos de libros a
 * la casa editora y las transferencias de stock entre colportores que el coordinador tiene que autorizar, y la situación de
 * cuenta de quien los pide para decidir con contexto. Es lo que después implementan las RPC de la bandeja
 * (backend-supabase#104, V2: se conecta después del 20/11); hasta entonces lo cumple la fuente simulada.
 *
 * Qué trae y qué no:
 * - Pedidos y transferencias de la campaña con su estado. El coordinador solo ve los de sus campañas (RLS).
 * - El costo unitario es el de la casa editora (`precio_base_compra`, que carga administración a mano; C12 sigue abierto):
 *   con él la vista calcula el total del pedido y cómo queda la deuda. El pedido no se arma acá (lo arma el colportor desde
 *   su teléfono, HU-STK-009).
 * - La deuda, lo que tiene por cobrar y lo que tiene por entregar son los de HU-CTA: la vista no los calcula, los muestra.
 * - El límite de deuda es único para toda la campaña (así lo dibuja el canvas; la HU lo pone por colportor y por campaña:
 *   queda abierto) y solo avisa. `null` = sin límite fijado, y entonces no hay aviso.
 * - `REDUCIR` no está (el canvas no lo dibuja): se autoriza o se rechaza.
 * - Sin datos de clientes: es plata y stock del colportor.
 */

/** Los estados de un pedido, en el orden en que avanza (RECHAZADO sale del primero). */
export type EstadoDePedido = "POR_AUTORIZAR" | "AUTORIZADO" | "DESPACHADO" | "RECIBIDO" | "RECHAZADO";

/** Una transferencia se autoriza (y ahí se ejecuta) o se rechaza. */
export type EstadoDeTransferencia = "POR_AUTORIZAR" | "AUTORIZADA" | "RECHAZADA";

export interface CiudadDePedidos {
  id: string;
  nombre: string;
  /** `null` cuando la ciudad no tiene departamento cargado. */
  departamento: string | null;
}

export interface LineaDePedido {
  /** Producto del catálogo (nunca un combo: se piden sus productos). */
  nombre: string;
  cantidad: number;
  /** Lo que cuesta de la casa editora, en pesos, por unidad. */
  costoUnitario: number;
}

/** Cuánto tiene del producto quien pide, para ver si le falta. */
export interface StockDelProducto {
  /** Producto, o categoría cuando se cuentan juntos («revistas»). */
  nombre: string;
  cantidad: number;
}

export interface CuentaDelColportor {
  /** Lo que debe hoy (HU-CTA). Al autorizar el pedido se le suma el total. */
  deuda: number;
  porCobrar: number;
  /** Libros vendidos que todavía no entregó. */
  librosPorEntregar: number;
  /** El último depósito validado, con su día AAAA-MM-DD (hora de Montevideo); `null` si todavía no depositó. */
  ultimoDeposito: { dia: string; monto: number } | null;
}

export interface PedidoDeColportor {
  id: string;
  /** Como lo ve el coordinador: «#231». */
  numero: string;
  colportorId: string;
  colportorNombre: string;
  /** La ciudad de su zona; `null` si todavía no tiene zona asignada. */
  ciudadId: string | null;
  estado: EstadoDePedido;
  /** Cuándo lo envió el colportor (instante ISO). */
  enviadoEn: string;
  /** Cuándo pasó al estado en que está (autorizado, despachado, recibido o rechazado); `null` mientras está por autorizar. */
  resueltoEn: string | null;
  /** Lo que escribió quien lo rechazó; solo en RECHAZADO. */
  motivoDeRechazo: string | null;
  lineas: LineaDePedido[];
  cuenta: CuentaDelColportor;
  /** El stock actual de los productos que pide. */
  stock: StockDelProducto[];
}

export interface LineaDeTransferencia extends LineaDePedido {
  /** Unidades de este producto que tiene quien da. */
  tieneQuienDa: number;
  /** Unidades de este producto que quien recibe debe entregar. */
  debeEntregarQuienRecibe: number;
  /** Unidades de este producto que ya tiene quien recibe. */
  tieneQuienRecibe: number;
}

export interface TransferenciaDeStock {
  id: string;
  /** Como lo ve el coordinador: «T-18». */
  numero: string;
  deId: string;
  deNombre: string;
  aId: string;
  aNombre: string;
  /** La ciudad de quien da; `null` si no tiene zona. */
  ciudadId: string | null;
  estado: EstadoDeTransferencia;
  pedidaEn: string;
  resueltaEn: string | null;
  motivoDeRechazo: string | null;
  lineas: LineaDeTransferencia[];
}

export interface DatosDePedidos {
  campaniaId: string;
  /** Límite de deuda por colportor, con el pedido incluido; `null` si no hay. Solo avisa. */
  limiteDeDeuda: number | null;
  /** El instante en que se armaron estos datos (ISO): de acá salen los «hace 3 h» y los «ayer». */
  ahora: string;
  ciudades: CiudadDePedidos[];
  pedidos: PedidoDeColportor[];
  transferencias: TransferenciaDeStock[];
}

export interface FuenteDatosPedidos {
  /** `null` cuando el coordinador no tiene una campaña en curso ni por empezar. */
  obtenerPedidos(): Promise<DatosDePedidos | null>;
}

// ---------------------------------------------------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------------------------------------------------

export type TipoDeSolicitud = "pedido" | "transferencia";

/** La decisión del coordinador sobre algo que está por autorizar. */
export type DecisionDeSolicitud =
  | { tipo: TipoDeSolicitud; id: string; accion: "autorizar" }
  | { tipo: TipoDeSolicitud; id: string; accion: "rechazar"; motivo: string };

/** Cómo quedó después de la decisión. */
export interface SolicitudResuelta {
  tipo: TipoDeSolicitud;
  id: string;
  /** El estado nuevo: AUTORIZADO / RECHAZADO en un pedido, AUTORIZADA / RECHAZADA en una transferencia. */
  estado: "AUTORIZADO" | "AUTORIZADA" | "RECHAZADO" | "RECHAZADA";
  /** Instante ISO de la decisión. */
  resueltoEn: string;
  motivoDeRechazo: string | null;
}

/** Por qué no se pudo guardar: sin conexión (se reintenta igual) o rechazado por el servidor (trae su texto). */
export type CausaDeFalla = "sin-conexion" | "rechazado";

export type ResultadoDeAccion<T> = { ok: true; valor: T } | { ok: false; causa: CausaDeFalla; mensaje?: string };

/** Escrituras de la vista. La fuente simulada las resuelve en el navegador; la real serán server actions. */
export interface AccionesPedidos {
  decidir(decision: DecisionDeSolicitud): Promise<ResultadoDeAccion<SolicitudResuelta>>;
}
