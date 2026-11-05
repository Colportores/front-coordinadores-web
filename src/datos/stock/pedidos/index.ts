/**
 * Único punto de selección de la fuente de datos de Pedidos y transferencias.
 * Al conectar las RPC de la bandeja (V2, después del 20/11, backend-supabase#104) se cambia esta línea por la implementación
 * real; las vistas importan `fuentePedidos` y no se tocan.
 */
import type { FuenteDatosPedidos } from "./contrato";
import { fuentePedidosSimulada } from "./simulado";

export type {
  AccionesPedidos,
  CausaDeFalla,
  CiudadDePedidos,
  CuentaDelColportor,
  DatosDePedidos,
  DecisionDeSolicitud,
  EstadoDePedido,
  EstadoDeTransferencia,
  FuenteDatosPedidos,
  LineaDePedido,
  LineaDeTransferencia,
  PedidoDeColportor,
  ResultadoDeAccion,
  SolicitudResuelta,
  StockDelProducto,
  TipoDeSolicitud,
  TransferenciaDeStock,
} from "./contrato";

export const fuentePedidos: FuenteDatosPedidos = fuentePedidosSimulada;
