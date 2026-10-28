import { modoDeAcceso } from "@/auth/modo";
import { pestanaVisible, sitioDePruebaActivo } from "@/config/flags";
import { leerConfigSupabase } from "@/datos/supabase/config";

/**
 * Cuánto de lo que se ve en este build es simulado (issue #101, seguimiento de #27). Regla: nunca un dato simulado sin aviso.
 *
 * - `"todo"`: ninguna pestaña habla con Supabase. Es el sitio de prueba de Pages, o un build sin la conexión pública
 *   (`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`) ni el puente de desarrollo de la demo: todas las fuentes de
 *   `src/datos/*` caen en la simulada.
 * - `"pestanas"`: Inicio, Equipo, Ciudades y Reportes hablan con las RPC, pero hay pestañas visibles cuya fuente todavía es
 *   siempre la simulada (Stock y Cuentas, V2). En staging y producción están ocultas por flag, así que esto solo pasa con
 *   `NEXT_PUBLIC_MODO_DEV` o con el flag de la pestaña prendido.
 * - `null`: nada simulado a la vista. Con la conexión mal configurada tampoco hay datos: el panel bloquea todo
 *   (`src/auth/modo.ts`) y nunca cae a la simulada.
 *
 * Se mira en el servidor (el puente de la demo son variables sin `NEXT_PUBLIC_`).
 */
export type DatosSimulados = "todo" | "pestanas";

/** Las pestañas cuya fuente es siempre la simulada, con el nombre que lleva el topbar. */
const PESTANAS_SIEMPRE_SIMULADAS = [
  { pestana: "stock", nombre: "Stock" },
  { pestana: "cuentas", nombre: "Cuentas" },
] as const;

export function datosSimulados(): DatosSimulados | null {
  if (sitioDePruebaActivo()) return "todo";
  const modo = modoDeAcceso();
  if (modo === "mal-configurado") return null;
  const conectado = modo === "activo" || leerConfigSupabase() !== null;
  if (!conectado) return "todo";
  return pestanasSimuladasVisibles().length > 0 ? "pestanas" : null;
}

/** Nombres de las pestañas visibles que muestran datos simulados aunque el resto esté conectado. */
export function pestanasSimuladasVisibles(): string[] {
  return PESTANAS_SIEMPRE_SIMULADAS.filter(({ pestana }) => pestanaVisible(pestana)).map(({ nombre }) => nombre);
}
