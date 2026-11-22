import { isAuthRetryableFetchError, type AuthError, type SupabaseClient } from "@supabase/supabase-js";

import { cerrarSesion, conTiempoMaximo, TIEMPO_MAXIMO_MS } from "@/auth/acceso";
import { reglasDeContrasena } from "@/features/acceso/validacion";

/**
 * Recuperar la contraseña del coordinador (vista 40, HU-AUTH-004 y HU-AUTH-005, decisión «Olvidé clave» de Cristian, 27/10): el
 * correo con enlace de Supabase Auth, con el flujo PKCE de `@supabase/ssr`.
 *
 * Es la lógica sola, sin pantalla ni cookies de Next: cada función recibe el cliente de Supabase y devuelve un resultado tipado.
 *
 * - **Pedir el enlace** nunca revela si el correo tiene cuenta (OWASP): el límite de pedidos y la dirección que el servidor no
 *   acepta para mandar correos se tratan igual que un envío (HU-AUTH-004, «el rechazo se enmascara»). Solo una falla del servicio
 *   o de la red se dice como tal.
 * - **Abrir el enlace** canjea el código de la URL por una sesión de recuperación. Vencido, ya usado o abierto en otro navegador
 *   (sin el verificador PKCE) es una sola respuesta, `no-valido`: Supabase no deja distinguirlos y no se adivina.
 * - **Guardar la contraseña** la cambia y cierra TODAS las sesiones de la cuenta (HU-AUTH-005): el panel no entra directo, pasa
 *   por el login.
 */

export type ResultadoDelPedido =
  /** El pedido salió (o se hace como si hubiera salido: ver arriba). */
  | { tipo: "enviado" }
  /** No se pudo llegar a Supabase, o contestó con una falla del servicio. */
  | { tipo: "no-disponible" };

/** Los rechazos que se enmascaran como un envío (HU-AUTH-004): límite de correos o de pedidos, y dirección que no recibe correos. */
const CODIGOS_ENMASCARADOS = new Set(["over_email_send_rate_limit", "over_request_rate_limit", "email_address_invalid", "email_address_not_authorized"]);

function esDelServicio(error: AuthError): boolean {
  return isAuthRetryableFetchError(error) || (error.status !== undefined && (error.status === 0 || error.status === 408 || error.status >= 500));
}

/** Pide el correo con el enlace. `redirectTo` es la pantalla «Nueva contraseña»: tiene que estar en la lista de URLs permitidas del proyecto. */
export async function pedirEnlace(
  supabase: SupabaseClient,
  correo: string,
  redirectTo: string,
  tiempoMaximoMs: number = TIEMPO_MAXIMO_MS,
): Promise<ResultadoDelPedido> {
  const fallo: ResultadoDelPedido = { tipo: "no-disponible" };
  return conTiempoMaximo<ResultadoDelPedido>(
    (async () => {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(correo, { redirectTo });
        if (!error) return { tipo: "enviado" };
        if (esDelServicio(error)) return fallo;
        if ((error.code && CODIGOS_ENMASCARADOS.has(error.code)) || error.status === 429) return { tipo: "enviado" };
        return fallo;
      } catch {
        return fallo;
      }
    })(),
    tiempoMaximoMs,
    fallo,
  );
}

export type ResultadoDeAbrir =
  /** Hay una sesión de recuperación abierta (cookie `httpOnly`). `correo` es el de la cuenta: se nombra en la pantalla. */
  | { tipo: "ok"; correo: string; usuarioId: string }
  /** Vencido, ya usado, abierto en otro navegador o sin código: una sola respuesta. */
  | { tipo: "no-valido" }
  /** No se pudo comprobar (sin red, servicio caído): no es lo mismo que un enlace vencido. */
  | { tipo: "no-disponible" };

/** Canjea el código del enlace del correo por una sesión de recuperación. */
export async function abrirEnlace(supabase: SupabaseClient, codigo: string, tiempoMaximoMs: number = TIEMPO_MAXIMO_MS): Promise<ResultadoDeAbrir> {
  const fallo: ResultadoDeAbrir = { tipo: "no-disponible" };
  return conTiempoMaximo<ResultadoDeAbrir>(
    (async () => {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(codigo);
        if (error) return esDelServicio(error) || error.status === 429 ? fallo : { tipo: "no-valido" };
        const usuario = data.session?.user;
        if (!usuario?.email) return { tipo: "no-valido" };
        return { tipo: "ok", correo: usuario.email, usuarioId: usuario.id };
      } catch {
        return fallo;
      }
    })(),
    tiempoMaximoMs,
    fallo,
  );
}

export type ResultadoDeGuardar =
  /** Contraseña cambiada y todas las sesiones de la cuenta cerradas. */
  | { tipo: "ok" }
  /** Ya no hay sesión de recuperación (venció, se cerró): hay que pedir otro enlace. */
  | { tipo: "sin-sesion" }
  /** Es igual a la actual: Supabase la rechaza (`same_password`). */
  | { tipo: "misma-contrasena" }
  /** No cumple la política (largo, mayúscula, número): la pantalla ya lo avisa; esto es la red de seguridad del servidor. */
  | { tipo: "contrasena-debil" }
  | { tipo: "no-disponible" };

/**
 * Cambia la contraseña de la sesión de recuperación y cierra todas las sesiones de la cuenta (`scope: "global"`, en todos los
 * dispositivos). Si el cierre global no se pudo (red cortada justo después), la contraseña ya cambió: la sesión de este navegador
 * se borra igual y el resultado es `ok`.
 */
export async function guardarContrasena(
  supabase: SupabaseClient,
  contrasena: string,
  tiempoMaximoMs: number = TIEMPO_MAXIMO_MS,
): Promise<ResultadoDeGuardar> {
  if (!reglasDeContrasena(contrasena).cumple) return { tipo: "contrasena-debil" };
  const fallo: ResultadoDeGuardar = { tipo: "no-disponible" };
  const cambio = await conTiempoMaximo<ResultadoDeGuardar>(
    (async () => {
      try {
        const { error } = await supabase.auth.updateUser({ password: contrasena });
        if (!error) return { tipo: "ok" };
        if (error.code === "same_password") return { tipo: "misma-contrasena" };
        if (error.code === "weak_password") return { tipo: "contrasena-debil" };
        if (error.name === "AuthSessionMissingError" || error.code === "session_not_found" || error.code === "bad_jwt" || error.status === 401 || error.status === 403) {
          return { tipo: "sin-sesion" };
        }
        return fallo;
      } catch {
        return fallo;
      }
    })(),
    tiempoMaximoMs,
    fallo,
  );
  if (cambio.tipo !== "ok") return cambio;

  try {
    await conTiempoMaximo(supabase.auth.signOut({ scope: "global" }), tiempoMaximoMs, null);
  } catch {
    // Se cierra la de este navegador abajo.
  }
  // Quita la cookie de este navegador pase lo que pase con el cierre global.
  await cerrarSesion(supabase, tiempoMaximoMs);
  return cambio;
}
