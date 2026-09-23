/**
 * Único punto de selección de la fuente de datos de Stock.
 * Al conectar el BFF (V2, después del 27/11) se cambia esta línea por la
 * implementación real; las vistas importan `fuenteStock` y no se tocan.
 */
import type { FuenteDatosStock } from "@/datos/stock/contrato";
import { fuenteStockSimulada } from "@/datos/stock/simulado";

export type {
  DatosStock,
  EstadoPedidoCasaEditora,
  EstadoTransferencia,
  FuenteDatosStock,
  KpisStock,
  PedidoCasaEditora,
  StockPorColportor,
  TransferenciaStock,
} from "@/datos/stock/contrato";

export const fuenteStock: FuenteDatosStock = fuenteStockSimulada;
