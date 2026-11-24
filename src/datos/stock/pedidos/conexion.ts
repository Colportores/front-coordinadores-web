import { modoDeAcceso } from "@/auth/modo";
import { leerConfigSupabase } from "@/datos/supabase/config";

/**
 * De dónde lee y dónde guarda «Pedidos y transferencias» (vista 35, #215), sin importar las fuentes: la única regla, que usan
 * el selector (`index.ts`) y la franja del shell (`src/config/datos-simulados.ts`).
 *
 * - `sesion`: hay conexión pública (`src/auth/modo.ts`): las RPC con la sesión de quien entró.
 * - `puente`: solo en desarrollo, con las variables del puente de la demo (`src/datos/supabase/config.ts`).
 * - `simulada`: nada de eso (el desarrollo sin variables y el sitio de prueba de Pages).
 */
export type FuenteDePedidos = "sesion" | "puente" | "simulada";

export function fuenteDePedidos(): FuenteDePedidos {
  if (modoDeAcceso() !== "apagado") return "sesion";
  return leerConfigSupabase() ? "puente" : "simulada";
}

/** La 35 guarda de verdad: lee y decide contra Supabase. */
export function pedidosConectada(): boolean {
  return fuenteDePedidos() !== "simulada";
}
