/**
 * Único punto de selección de la fuente de datos de Stock.
 * Al conectar la RPC de lectura (V2, después del 20/11, backend-supabase#101) se cambia esta línea por la implementación
 * real; las vistas importan `fuenteStock` y no se tocan.
 */
import type { FuenteDatosStock } from "@/datos/stock/contrato";
import { fuenteStockSimulada } from "@/datos/stock/simulado";

export type {
  CiudadDeStock,
  ColportorDeStock,
  DatosDeStock,
  ExistenciaDeStock,
  FuenteDatosStock,
  ProductoDeStock,
  TipoDeProducto,
} from "@/datos/stock/contrato";

export const fuenteStock: FuenteDatosStock = fuenteStockSimulada;
