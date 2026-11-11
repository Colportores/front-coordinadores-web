import { modoDeAcceso } from "@/auth/modo";
import { crearSupabaseDeServidor } from "@/auth/supabase-servidor";

/**
 * El correo de la cuenta que tiene la sesión abierta, para decirle «la cuenta X no tiene el rol de coordinador» (artboard 04
 * de la vista 38) cuando llegó ahí por la guarda de rutas. `null` si no hay sesión o no se pudo saber: el aviso se arma sin él.
 * Lo pregunta la página de acceso en el servidor; no es una server action, así que el navegador no lo puede llamar.
 */
export async function correoDeLaSesion(): Promise<string | null> {
  if (modoDeAcceso() !== "activo") return null;
  try {
    const { data } = await (await crearSupabaseDeServidor()).auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}
