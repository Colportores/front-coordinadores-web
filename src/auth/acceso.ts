import { isAuthRetryableFetchError, type AuthError, type SupabaseClient } from "@supabase/supabase-js";

import { causaDeFalla } from "@/datos/supabase/errores";
import { borrarSesionGuardada } from "@/datos/supabase/sdk";

/**
 * Acceso del coordinador al panel (issue #18, ADR-013 y ADR-015): iniciar y cerrar sesión con `supabase-js`
 * y comprobar que la cuenta tiene el rol `COORDINADOR` vigente.
 *
 * Es la lógica sola, sin pantalla ni guardas de ruta: cada función recibe el cliente de Supabase y devuelve
 * un resultado tipado, que quien la use (la pantalla de acceso, la guarda de las rutas) traduce a un aviso
 * o a una redirección. Nada de acá dice dónde se guarda la sesión.
 *
 * - **El rol lo decide la base.** `tiene_rol('COORDINADOR')` mira la vigencia (`valido_desde`/`valido_hasta`) y
 *   las bajas, así que un rol revocado se cae en la siguiente comprobación sin esperar a que el token venza.
 *   La autoridad de cada dato sigue siendo la RLS de cada RPC: esto solo decide si se muestra el panel.
 *   Un usuario con varios roles entra si uno es `COORDINADOR`. `ADMIN` solo no entra.
 * - **Una falla de conexión o de configuración no es una sesión vencida** (mismo criterio que tenía el BFF,
 *   `src/datos/supabase/errores.ts`): ante la duda el resultado es `no-disponible`, que no cierra la sesión
 *   ni manda a iniciar sesión de nuevo, y nunca deja entrar a nadie.
 */
export const ROL_COORDINADOR = "COORDINADOR";

/** El tope del correo en toda la app (registro y login del móvil, HU-AUTH-003): 254 caracteres. */
const LARGO_MAXIMO_CORREO = 254;

/**
 * Lo máximo que se espera a Supabase en un inicio de sesión o en una comprobación: el mismo tope de 5 s que
 * tenía el BFF hacia Supabase. Sin red, el SDK reintenta renovar un token vencido hasta ~25 s y una conexión
 * colgada no termina nunca; la persona no puede quedarse mirando «Entrando…» sin que nada pase. Al vencer, el
 * resultado es `no-disponible`: nada se cierra y se puede reintentar.
 */
export const TIEMPO_MAXIMO_MS = 5_000;

export interface Credenciales {
  correo: string;
  contrasena: string;
}

export type ResultadoInicioSesion =
  /** Sesión abierta y rol `COORDINADOR` vigente. */
  | { tipo: "ok"; usuarioId: string }
  /** Correo o contraseña que no son (o que vinieron vacíos: ni se consulta). No dice cuál de las dos. */
  | { tipo: "credenciales-invalidas" }
  /** La cuenta existe pero no verificó su correo. */
  | { tipo: "correo-sin-verificar" }
  /** Supabase limita los intentos por IP; hay que esperar. */
  | { tipo: "demasiados-intentos" }
  /** Las credenciales sirven, pero la cuenta no tiene el rol `COORDINADOR` vigente (o está dada de baja). No queda sesión. */
  | { tipo: "sin-acceso" }
  /** No se pudo llegar a Supabase, o contestó con una falla. No dice nada de las credenciales. */
  | { tipo: "no-disponible" };

export type ResultadoAcceso =
  | { tipo: "ok"; usuarioId: string }
  /** No hay sesión abierta en este navegador. */
  | { tipo: "sin-sesion" }
  /** Había sesión, pero el servidor ya no la acepta (el token de renovación se venció o se revocó). */
  | { tipo: "sesion-vencida" }
  /** La sesión es válida, pero la cuenta no tiene el rol `COORDINADOR` vigente. La sesión sigue abierta. */
  | { tipo: "sin-acceso" }
  /** No se pudo comprobar (sin red, Supabase caído, configuración): no se entra, pero tampoco se cierra la sesión. */
  | { tipo: "no-disponible" };

export type ResultadoCierre =
  | { tipo: "cerrada" }
  /** La sesión se cerró en este navegador, pero no se pudo avisar al servidor para revocarla. */
  | { tipo: "cerrada-sin-revocar" };

/** Lo que dé `promesa`, o `siVence` si tarda más de `ms`. La promesa que queda colgada no se cancela. */
function conTiempoMaximo<T>(promesa: Promise<T>, ms: number, siVence: T): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<T>((resolver) => {
    temporizador = setTimeout(() => resolver(siVence), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

/**
 * El número del último inicio de sesión de cada cliente. Un intento que venció el tope de 5 s sigue vivo por
 * detrás: si termina cuando ya hay otro intento en curso o terminado, no decide nada (en particular, no cierra
 * la sesión del intento nuevo).
 */
const ultimoIntento = new WeakMap<SupabaseClient, number>();

type ComprobacionDeRol = "coordinador" | "otro-rol" | "sesion-vencida" | "no-disponible";

async function comprobarRol(supabase: SupabaseClient): Promise<ComprobacionDeRol> {
  try {
    const { data, error, status } = await supabase.rpc("tiene_rol", { p_codigo: ROL_COORDINADOR });
    if (error) return causaDeFalla({ estado: status, codigo: error.code }) === "sesion-vencida" ? "sesion-vencida" : "no-disponible";
    if (data === true) return "coordinador";
    if (data === false) return "otro-rol";
    // Una respuesta que no es un booleano no dice nada del rol: no se entra, pero tampoco se acusa a la sesión.
    return "no-disponible";
  } catch {
    return "no-disponible";
  }
}

function resultadoDeErrorDeInicio(error: AuthError): ResultadoInicioSesion {
  // `AuthRetryableFetchError` cubre la falta de red y los 5xx del servicio.
  if (isAuthRetryableFetchError(error)) return { tipo: "no-disponible" };
  switch (error.code) {
    case "invalid_credentials":
      return { tipo: "credenciales-invalidas" };
    case "email_not_confirmed":
      return { tipo: "correo-sin-verificar" };
    case "over_request_rate_limit":
      return { tipo: "demasiados-intentos" };
    case "user_banned":
      return { tipo: "sin-acceso" };
  }
  if (error.status === 429) return { tipo: "demasiados-intentos" };
  // Supabase viejo, sin `code`: el mensaje de siempre para correo o contraseña equivocados.
  if (error.status === 400 && /invalid login credentials/i.test(error.message)) return { tipo: "credenciales-invalidas" };
  // Cualquier otra cosa no prueba que las credenciales estén mal: se avisa que no se pudo y se deja reintentar.
  return { tipo: "no-disponible" };
}

/**
 * Cierra en este navegador la sesión que haya, sin dejar rastro, aunque no haya red para revocarla. `signOut`
 * del SDK no alcanza solo: con el token vencido intenta renovarlo antes de cerrar y, si no hay red, devuelve el
 * error sin borrar nada; con el servidor colgado no termina. Por eso espera a lo sumo `tiempoMaximoMs` y, si
 * no logró cerrar, borra la sesión guardada por su cuenta (`borrarSesionGuardada`): «Cerrar sesión» nunca deja
 * la sesión abierta, y el resultado dice que no se pudo avisar al servidor.
 */
async function cerrarLocalmente(supabase: SupabaseClient, tiempoMaximoMs: number = TIEMPO_MAXIMO_MS): Promise<ResultadoCierre> {
  let resultado: ResultadoCierre = { tipo: "cerrada-sin-revocar" };
  try {
    // `scope: "local"`: solo esta sesión, no las del mismo usuario en otros dispositivos (como HU-AUTH-006, R8).
    const respuesta = await conTiempoMaximo<Awaited<ReturnType<typeof supabase.auth.signOut>> | null>(
      supabase.auth.signOut({ scope: "local" }),
      tiempoMaximoMs,
      null,
    );
    if (respuesta && !respuesta.error) resultado = { tipo: "cerrada" };
  } catch {
    // Queda `cerrada-sin-revocar`: se borra abajo.
  }
  if (resultado.tipo !== "cerrada") await borrarSesionGuardada(supabase);
  return resultado;
}

async function iniciarSinTope(
  supabase: SupabaseClient,
  { correo, contrasena }: Credenciales,
  esElIntentoVigente: () => boolean,
): Promise<ResultadoInicioSesion> {
  // El correo se normaliza (los espacios de los bordes no son parte de la dirección). La contraseña va tal cual:
  // puede llevar espacios y no tiene tope, ninguna cuenta puede tener una más larga.
  const email = correo.trim();
  if (!email || email.length > LARGO_MAXIMO_CORREO || !contrasena) return { tipo: "credenciales-invalidas" };

  let respuesta;
  try {
    respuesta = await supabase.auth.signInWithPassword({ email, password: contrasena });
  } catch {
    return { tipo: "no-disponible" };
  }
  if (respuesta.error) return resultadoDeErrorDeInicio(respuesta.error);
  const usuarioId = respuesta.data.session?.user.id;
  if (!usuarioId) return { tipo: "no-disponible" };

  switch (await comprobarRol(supabase)) {
    case "coordinador":
      return { tipo: "ok", usuarioId };
    case "otro-rol":
      // Un intento viejo no cierra la sesión del nuevo: el nuevo comprueba su propio rol.
      if (!esElIntentoVigente()) return { tipo: "no-disponible" };
      await cerrarLocalmente(supabase);
      return { tipo: "sin-acceso" };
    default:
      // Un token que acaba de emitir Supabase y la propia Supabase rechaza es un problema de configuración
      // (claves de otro proyecto), no una sesión vencida; por eso no hay un caso aparte.
      return { tipo: "no-disponible" };
  }
}

async function verificarSinTope(supabase: SupabaseClient): Promise<ResultadoAcceso> {
  let sesion;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return isAuthRetryableFetchError(error) ? { tipo: "no-disponible" } : { tipo: "sesion-vencida" };
    sesion = data.session;
  } catch {
    return { tipo: "no-disponible" };
  }
  if (!sesion) return { tipo: "sin-sesion" };

  switch (await comprobarRol(supabase)) {
    case "coordinador":
      return { tipo: "ok", usuarioId: sesion.user.id };
    case "otro-rol":
      return { tipo: "sin-acceso" };
    case "sesion-vencida":
      return { tipo: "sesion-vencida" };
    default:
      return { tipo: "no-disponible" };
  }
}

/**
 * Inicia sesión con correo y contraseña y comprueba el rol. Si las credenciales sirven pero la cuenta no es
 * de coordinador, cierra esa sesión: quien no puede usar el panel no se queda con una abierta en él. Si no se
 * pudo comprobar el rol (o Supabase no contestó en `tiempoMaximoMs`), la sesión queda abierta si llegó a
 * abrirse (es válida): `verificarAcceso` lo vuelve a comprobar en la siguiente visita.
 */
export function iniciarSesion(
  supabase: SupabaseClient,
  credenciales: Credenciales,
  tiempoMaximoMs: number = TIEMPO_MAXIMO_MS,
): Promise<ResultadoInicioSesion> {
  const intento = (ultimoIntento.get(supabase) ?? 0) + 1;
  ultimoIntento.set(supabase, intento);
  const esElIntentoVigente = () => ultimoIntento.get(supabase) === intento;
  return conTiempoMaximo(iniciarSinTope(supabase, credenciales, esElIntentoVigente), tiempoMaximoMs, { tipo: "no-disponible" });
}

/**
 * La puerta de cada visita al panel: ¿hay sesión, sigue valiendo y la cuenta tiene el rol de coordinador?
 * `getSession` renueva el token si hace falta y solo dice si hay una sesión guardada: lo que autentica es la
 * base, que verifica la firma del JWT al contestar `tiene_rol`, y solo cuenta como sesión vencida lo que ella
 * o el servidor de Auth rechazaron. Si Supabase no contesta en `tiempoMaximoMs`, `no-disponible`.
 */
export function verificarAcceso(supabase: SupabaseClient, tiempoMaximoMs: number = TIEMPO_MAXIMO_MS): Promise<ResultadoAcceso> {
  return conTiempoMaximo(verificarSinTope(supabase), tiempoMaximoMs, { tipo: "no-disponible" });
}

/**
 * Cierra la sesión de este navegador. Es idempotente: sin sesión abierta devuelve `cerrada`. Si no hay red
 * (o el servidor no contesta en `tiempoMaximoMs`, o el token venció y no se pudo renovar para revocarlo), la
 * sesión se borra igual acá y el resultado lo dice, para que la pantalla no afirme una revocación que no pasó
 * (la sesión del servidor queda hasta que venza su token).
 */
export function cerrarSesion(supabase: SupabaseClient, tiempoMaximoMs: number = TIEMPO_MAXIMO_MS): Promise<ResultadoCierre> {
  return cerrarLocalmente(supabase, tiempoMaximoMs);
}
