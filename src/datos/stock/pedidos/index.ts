/**
 * Único punto de selección de la fuente de datos de Pedidos y transferencias (vista 35, #215): la segunda vista de V2 conectada
 * a Supabase después de «Validar tickets» (29), con la misma regla (`conexion.ts`).
 *
 * - Con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/auth/modo.ts`): las RPC de la bandeja con la sesión de
 *   la coordinadora que entró (las cookies del pedido).
 * - Sin ellas, solo en desarrollo y con las variables del puente (`src/datos/supabase/config.ts`): el proyecto de la demo.
 * - Si no, la simulada (el desarrollo sin variables y cualquier build de producción sin Supabase). El sitio de prueba de Pages
 *   nunca pasa por acá: arma los datos en el navegador con la simulada (`PedidosLocal`).
 *
 * `accionesPedidos` es `null` con la fuente simulada: ahí las decisiones se resuelven en el navegador y no se guardan
 * (`crearAccionesSimuladas`). Con Supabase las llaman las server actions de la página.
 */
import { leerCampaniaElegida } from "@/datos/shell/campania-elegida-servidor";
import { crearClienteSupabase } from "@/datos/supabase/cliente";
import { leerConfigSupabase } from "@/datos/supabase/config";
import { fuenteDeSesion } from "@/datos/supabase/fuente-de-sesion";

import { fuenteDePedidos } from "./conexion";
import type { AccionesPedidos, FuenteDatosPedidos } from "./contrato";
import { crearAccionesPedidosRpc, crearFuentePedidosRpc } from "./rpc";
import { fuentePedidosSimulada } from "./simulado";

export type {
  AccionesPedidos,
  CantidadAutorizada,
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
  LineaDeUnPedido,
  PedidoDeColportor,
  ResultadoDeAccion,
  SolicitudResuelta,
  StockDelProducto,
  TipoDeSolicitud,
  TransferenciaDeStock,
} from "./contrato";

export { LIMITE_DE_DEUDA_MAXIMO } from "./contrato";

/**
 * Las acciones con la sesión de quien hace el pedido: en cada llamada, un cliente de `supabase-js` con las cookies. El módulo de
 * las cookies se importa recién al usarlas, como en `fuenteDeSesion`.
 */
function accionesDeSesion(): AccionesPedidos {
  const crear = async () => {
    const [{ crearSupabaseDeServidor }, { crearClienteRpc }] = await Promise.all([
      import("@/auth/supabase-servidor"),
      import("@/datos/supabase/sdk"),
    ]);
    return crearAccionesPedidosRpc(crearClienteRpc(await crearSupabaseDeServidor()), leerCampaniaElegida);
  };
  return {
    decidir: async (decision) => (await crear()).decidir(decision),
    editarLimite: async (limite, campaniaId) => {
      const acciones = await crear();
      if (!acciones.editarLimite) throw new Error("La fuente no puede editar el límite.");
      return acciones.editarLimite(limite, campaniaId);
    },
  };
}

// La regla es una sola (`conexion.ts`): la misma que usa la franja del shell para decir que la 35 sí guarda.
const fuente = fuenteDePedidos();
const configSupabase = fuente === "puente" ? leerConfigSupabase() : null;
const clienteDelPuente = configSupabase ? crearClienteSupabase(configSupabase) : null;

export const fuentePedidos: FuenteDatosPedidos =
  fuente === "sesion"
    ? fuenteDeSesion((cliente) => crearFuentePedidosRpc(cliente, leerCampaniaElegida))
    : clienteDelPuente
      ? crearFuentePedidosRpc(clienteDelPuente, leerCampaniaElegida)
      : fuentePedidosSimulada;

export const accionesPedidos: AccionesPedidos | null =
  fuente === "sesion" ? accionesDeSesion() : clienteDelPuente ? crearAccionesPedidosRpc(clienteDelPuente, leerCampaniaElegida) : null;
