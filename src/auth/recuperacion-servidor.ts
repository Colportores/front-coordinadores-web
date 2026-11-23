import { OPCIONES_DE_COOKIE } from "@/auth/supabase-cookies";
import { crearSupabaseDeServidor } from "@/auth/supabase-servidor";

/**
 * Lo que la recuperación de la contraseña necesita del servidor de Next (cookies y cabeceras del pedido). Solo lo importan las
 * server actions (`acciones-recuperacion.ts`) y la página «Nueva contraseña», siempre por `import()` en la rama que no es el sitio
 * de prueba (ver README, «Sitio de prueba»).
 *
 * **La marca de recuperación.** Abrir el enlace del correo deja una sesión de recuperación en la cookie `httpOnly`, igual a una
 * sesión común. Para que la pantalla «Nueva contraseña» no sirva para cambiar la contraseña de cualquier sesión abierta (un XSS
 * podría llamar a la acción), cambiar la contraseña exige además esta cookie: la pone solo el canje de un código del correo, dura lo
 * que el enlace (`VIGENCIA_DE_LA_MARCA_S`), es `httpOnly` y lleva el id de la cuenta, así que otra sesión no la usa.
 */
export const COOKIE_DE_RECUPERACION = "panel-recuperacion";

/** Lo que dura la marca: 15 minutos, bastante menos que el enlace (Supuesto S4: 1 h), para no dejar abierta una puerta de más. */
export const VIGENCIA_DE_LA_MARCA_S = 15 * 60;

/**
 * Lo mínimo que tarda en contestar el pedido del enlace: que la respuesta no tarde distinto si el correo tiene cuenta o no
 * (HU-AUTH-004, riesgo R5: la diferencia de tiempo permitiría tantear qué correos existen). Es un objeto para que los tests
 * lo pongan en 0.
 */
export const piso = { pedidoMs: 800 };

async function almacenDeCookies() {
  const { cookies } = await import("next/headers");
  return cookies();
}

export async function ponerMarcaDeRecuperacion(usuarioId: string): Promise<void> {
  (await almacenDeCookies()).set(COOKIE_DE_RECUPERACION, usuarioId, { ...OPCIONES_DE_COOKIE, maxAge: VIGENCIA_DE_LA_MARCA_S });
}

export async function quitarMarcaDeRecuperacion(): Promise<void> {
  try {
    (await almacenDeCookies()).set(COOKIE_DE_RECUPERACION, "", { ...OPCIONES_DE_COOKIE, maxAge: 0 });
  } catch {
    // Solo se puede escribir en una acción de servidor; la marca vence sola.
  }
}

/** La cuenta de la sesión de este pedido, sin ir a la red (la sesión se lee de la cookie). `null` si no hay. */
async function cuentaDeLaSesion(): Promise<{ id: string; correo: string | null } | null> {
  try {
    const supabase = await crearSupabaseDeServidor();
    const { data } = await supabase.auth.getSession();
    const usuario = data.session?.user;
    return usuario ? { id: usuario.id, correo: usuario.email ?? null } : null;
  } catch {
    return null;
  }
}

/**
 * La recuperación en curso de este navegador: hay marca y la sesión abierta es de la misma cuenta. Devuelve el correo (para la
 * pantalla) y el id, o `null` si no hay nada que continuar.
 */
export async function recuperacionEnCurso(): Promise<{ id: string; correo: string } | null> {
  const marca = (await almacenDeCookies()).get(COOKIE_DE_RECUPERACION)?.value;
  if (!marca) return null;
  const cuenta = await cuentaDeLaSesion();
  if (!cuenta || cuenta.id !== marca || !cuenta.correo) return null;
  return { id: cuenta.id, correo: cuenta.correo };
}

/**
 * La dirección de la pantalla «Nueva contraseña» a la que vuelve el enlace del correo: el origen del propio pedido (una acción de
 * servidor ya lo comprueba contra el host). La autoridad es la lista de URLs permitidas del proyecto de Supabase
 * (`additional_redirect_urls`): una que no esté ahí no se usa, y el enlace cae en la `site_url`.
 */
export async function direccionDeNuevaContrasena(): Promise<string> {
  const { headers } = await import("next/headers");
  const cabeceras = await headers();
  const declarado = cabeceras.get("origin");
  let origen: string | null = null;
  try {
    if (declarado) {
      const url = new URL(declarado);
      if (url.protocol === "https:" || url.protocol === "http:") origen = url.origin;
    }
  } catch {
    origen = null;
  }
  if (!origen) {
    const servidor = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host") ?? "localhost:3000";
    const protocolo = cabeceras.get("x-forwarded-proto") ?? (servidor.startsWith("localhost") || servidor.startsWith("127.") ? "http" : "https");
    origen = `${protocolo}://${servidor}`;
  }
  return `${origen}/acceso/nueva-contrasena`;
}
