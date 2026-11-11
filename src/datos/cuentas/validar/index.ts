/**
 * Único punto de selección de la fuente de «Validar tickets» (vista 29). Es la primera vista de Cuentas conectada a Supabase
 * (decisión de Cristian del 10/11, «Conectar 29», #170); el resto de Cuentas sigue con la simulada.
 *
 * - Con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/auth/modo.ts`): las RPC y la Edge Function de la
 *   foto con la sesión de la coordinadora que entró (las cookies del pedido).
 * - Sin ellas, solo en desarrollo y con las variables del puente (`src/datos/supabase/config.ts`): el proyecto de la demo.
 * - Si no, la simulada (el desarrollo sin variables y cualquier build de producción sin Supabase). El sitio de prueba de
 *   Pages nunca pasa por acá: arma los datos en el navegador con la simulada (`ValidarTicketsLocal`).
 *
 * `accionesValidarTickets` es `null` con la fuente simulada: ahí las decisiones se resuelven en el navegador y no se guardan
 * (`crearAccionesDeValidacionSimuladas`). Con Supabase las llaman las server actions de la página.
 */
import { fuenteDeValidarTickets } from "@/datos/cuentas/validar/conexion";
import type { AccionesValidarTickets, FuenteValidarTickets } from "@/datos/cuentas/validar/contrato";
import { crearAccionesValidarTicketsRpc, crearFuenteValidarTicketsRpc, funcionesDeSupabase } from "@/datos/cuentas/validar/rpc";
import { fuenteValidarTicketsSimulada } from "@/datos/cuentas/validar/simulado";
import { leerCampaniaElegida } from "@/datos/shell/campania-elegida-servidor";
import { crearClienteSupabase } from "@/datos/supabase/cliente";
import { leerConfigSupabase } from "@/datos/supabase/config";
import { fuenteDeSesion } from "@/datos/supabase/fuente-de-sesion";

export type {
  AccionesValidarTickets,
  CifrasDelColportor,
  ConceptoPorValidar,
  DatosDeValidacion,
  EstadoPorValidar,
  FuenteValidarTickets,
  ItemPorValidar,
  LugarDelDeposito,
  Resolucion,
  ResultadoDeAccion,
  TarjetaDelDeposito,
  TipoPorValidar,
} from "@/datos/cuentas/validar/contrato";

/**
 * Las acciones con la sesión de quien hace el pedido: en cada llamada, un cliente de `supabase-js` con las cookies (RPC y
 * Edge Function con el mismo JWT). El módulo de las cookies se importa recién al usarlas, como en `fuenteDeSesion`.
 */
function accionesDeSesion(): AccionesValidarTickets {
  const crear = async () => {
    const [{ crearSupabaseDeServidor }, { crearClienteRpc }] = await Promise.all([
      import("@/auth/supabase-servidor"),
      import("@/datos/supabase/sdk"),
    ]);
    const supabase = await crearSupabaseDeServidor();
    return crearAccionesValidarTicketsRpc(crearClienteRpc(supabase), funcionesDeSupabase(supabase));
  };
  return {
    validar: async (item) => (await crear()).validar(item),
    rechazar: async (item, motivo) => (await crear()).rechazar(item, motivo),
    enlaceDeFoto: async (ticketId) => (await crear()).enlaceDeFoto(ticketId),
  };
}

// La regla es una sola (`conexion.ts`): la misma que usa la franja del shell para decir que la 29 sí guarda.
const fuente = fuenteDeValidarTickets();
const configSupabase = fuente === "puente" ? leerConfigSupabase() : null;
const clienteDelPuente = configSupabase ? crearClienteSupabase(configSupabase) : null;

export const fuenteValidarTickets: FuenteValidarTickets =
  fuente === "sesion"
    ? fuenteDeSesion((cliente) => crearFuenteValidarTicketsRpc(cliente, leerCampaniaElegida))
    : clienteDelPuente
      ? crearFuenteValidarTicketsRpc(clienteDelPuente, leerCampaniaElegida)
      : fuenteValidarTicketsSimulada;

export const accionesValidarTickets: AccionesValidarTickets | null =
  fuente === "sesion"
    ? accionesDeSesion()
    : clienteDelPuente
      ? crearAccionesValidarTicketsRpc(clienteDelPuente, clienteDelPuente)
      : null;
