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
 * - **Abrir el enlace** canjea el código de la URL por una sesión de recuperación. Hay dos clases de enlace (#217): el de la
 *   plantilla de correo nueva lleva un código de un solo uso (`token_hash`) que se canjea con `verifyOtp` y abre en CUALQUIER
 *   navegador, sin depender del verificador PKCE del que pidió el correo; el `?code=` de los correos viejos (PKCE) sigue
 *   canjeándose con `exchangeCodeForSession` mientras no venza. Vencido, ya usado o (solo el PKCE) abierto en otro navegador es una
 *   sola respuesta, `no-valido`: Supabase no deja distinguirlos y no se adivina.
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
  /**
   * Vencido, ya usado o sin código: una sola respuesta. `sinVerificador` es el caso aparte de un `?code=` PKCE viejo abierto en
   * un navegador que no lo pidió (falta el verificador): ahí sí se sabe por qué falló y la pantalla lo dice (decisión P2 de #217).
   */
  | { tipo: "no-valido"; sinVerificador?: true }
  /** No se pudo comprobar (sin red, servicio caído): no es lo mismo que un enlace vencido. */
  | { tipo: "no-disponible" };

/** La clase de código que trae el enlace: `pkce` (`?code=`, correos viejos) o `un-solo-uso` (`?token_hash=`, la plantilla nueva). */
export type TipoDeEnlace = "pkce" | "un-solo-uso";

/**
 * Canjea el código del enlace del correo por una sesión de recuperación. El de un solo uso (`token_hash` + `type=recovery`) se
 * verifica con `verifyOtp`: no necesita el verificador PKCE, así que sirve en un navegador distinto del que pidió el correo.
 */
export async function abrirEnlace(
  supabase: SupabaseClient,
  codigo: string,
  tiempoMaximoMs: number = TIEMPO_MAXIMO_MS,
  tipo: TipoDeEnlace = "pkce",
): Promise<ResultadoDeAbrir> {
  const fallo: ResultadoDeAbrir = { tipo: "no-disponible" };
  return conTiempoMaximo<ResultadoDeAbrir>(
    (async () => {
      try {
        const { data, error } =
          tipo === "un-solo-uso"
            ? await supabase.auth.verifyOtp({ token_hash: codigo, type: "recovery" })
            : await supabase.auth.exchangeCodeForSession(codigo);
        if (error) {
          if (esDelServicio(error) || error.status === 429) return fallo;
          return error.name === "AuthPKCECodeVerifierMissingError" ? { tipo: "no-valido", sinVerificador: true } : { tipo: "no-valido" };
        }
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

/**
 * El tope de bcrypt: GoTrue contesta 400 `validation_failed` con un texto fijo («Password cannot be longer than 72 characters»,
 * sin datos de la cuenta), así que se distingue de los demás `validation_failed` por el mensaje, como hace el celular.
 */
function esRechazoPorLargo(error: AuthError): boolean {
  return error.status === 400 && error.code === "validation_failed" && /password cannot be longer/i.test(error.message);
}

export type ResultadoDeGuardar =
  /** Contraseña cambiada y todas las sesiones de la cuenta cerradas. */
  | { tipo: "ok" }
  /**
   * La contraseña cambió, pero el cierre de las demás sesiones no se pudo confirmar (red, servicio caído, tiempo agotado o un
   * `{ error }` de `signOut`). La sesión de este navegador se conserva para poder reintentar el cierre (`cerrarOtrasSesiones`).
   */
  | { tipo: "ok-sin-revocar" }
  /** Ya no hay sesión de recuperación (venció, se cerró): hay que pedir otro enlace. */
  | { tipo: "sin-sesion" }
  /** Es igual a la actual: Supabase la rechaza (`same_password`). */
  | { tipo: "misma-contrasena" }
  /** No cumple la política (largo, mayúscula, número): la pantalla ya lo avisa; esto es la red de seguridad del servidor. */
  | { tipo: "contrasena-debil" }
  /** Pasa del tope de 72 bytes en UTF-8 (HU-AUTH-001 «Topes de largo»): lo dice la pantalla, o lo rechazó el servidor (bcrypt). */
  | { tipo: "contrasena-larga" }
  | { tipo: "no-disponible" };

/**
 * Cambia la contraseña de la sesión de recuperación y cierra todas las sesiones de la cuenta (las de los demás dispositivos y,
 * después, la de este navegador). Si el cierre global no se pudo confirmar, la contraseña ya cambió pero el resultado es `ok-sin-revocar` (nunca
 * `ok`: la pantalla no puede afirmar un cierre que no pasó) y la sesión de este navegador se conserva para reintentarlo.
 */
export async function guardarContrasena(
  supabase: SupabaseClient,
  contrasena: string,
  tiempoMaximoMs: number = TIEMPO_MAXIMO_MS,
): Promise<ResultadoDeGuardar> {
  const reglas = reglasDeContrasena(contrasena);
  if (reglas.demasiadoLarga) return { tipo: "contrasena-larga" };
  if (!reglas.cumple) return { tipo: "contrasena-debil" };
  const fallo: ResultadoDeGuardar = { tipo: "no-disponible" };
  const cambio = await conTiempoMaximo<ResultadoDeGuardar>(
    (async () => {
      try {
        const { error } = await supabase.auth.updateUser({ password: contrasena });
        if (!error) return { tipo: "ok" };
        if (error.code === "same_password") return { tipo: "misma-contrasena" };
        if (error.code === "weak_password") return { tipo: "contrasena-debil" };
        if (esRechazoPorLargo(error)) return { tipo: "contrasena-larga" };
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

  if (!(await revocarTodas(supabase, tiempoMaximoMs))) return { tipo: "ok-sin-revocar" };
  // Cierra la sesión de este navegador (y quita su cookie): junto con las otras, es el cierre global.
  await cerrarSesion(supabase, tiempoMaximoMs);
  return cambio;
}

/**
 * Revoca las sesiones de la cuenta en los demás dispositivos (`scope: "others"`); la de este navegador se cierra después
 * (`cerrarSesion`, local), con lo que el efecto es el de un cierre global. Se usa `others` y no `global` porque auth-js, ante un
 * fallo de red o 5xx del `global`, borra igual la sesión local: ya no habría con qué reintentar. Con `others` la sesión de este
 * navegador sobrevive al fallo. `signOut` no lanza ante red o 5xx: devuelve `{ error }`; también puede lanzar o no contestar a
 * tiempo. En los tres casos es `false`.
 */
async function revocarTodas(supabase: SupabaseClient, tiempoMaximoMs: number): Promise<boolean> {
  try {
    const resultado = await conTiempoMaximo(supabase.auth.signOut({ scope: "others" }), tiempoMaximoMs, null);
    return resultado !== null && !resultado.error;
  } catch {
    return false;
  }
}

export type ResultadoDeCerrarOtras =
  | { tipo: "ok" }
  /** Sigue sin poderse cerrar (o ya no hay sesión de este navegador desde la cual hacerlo). */
  | { tipo: "ok-sin-revocar" };

/** Reintenta el cierre de todas las sesiones tras un `ok-sin-revocar`. No pide la contraseña: usa la sesión de recuperación. */
export async function cerrarOtrasSesiones(supabase: SupabaseClient, tiempoMaximoMs: number = TIEMPO_MAXIMO_MS): Promise<ResultadoDeCerrarOtras> {
  try {
    const { data } = await conTiempoMaximo(supabase.auth.getSession(), tiempoMaximoMs, null).then((r) => r ?? { data: { session: null } });
    if (!data.session) return { tipo: "ok-sin-revocar" };
  } catch {
    return { tipo: "ok-sin-revocar" };
  }
  if (!(await revocarTodas(supabase, tiempoMaximoMs))) return { tipo: "ok-sin-revocar" };
  await cerrarSesion(supabase, tiempoMaximoMs);
  return { tipo: "ok" };
}
