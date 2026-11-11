import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConfigPublicaSupabase } from "@/datos/supabase/config-publica";
import { crearFetchDeAuth } from "@/datos/supabase/fetch-auth";
import { claveDeAlmacenamiento, registrarBorradoDeSesion } from "@/datos/supabase/sdk";

/**
 * El cliente de `supabase-js` cuya sesión vive en cookies que **el JavaScript de la página no puede leer** (decisión «Sesión
 * panel» de Cristian, 21/10, ADR-015): el token solo existe en el servidor, así que un XSS no se lo puede llevar. Lo usan el
 * proxy (`supabase-proxy.ts`: renueva la sesión y guarda las rutas) y los componentes de servidor y server actions
 * (`supabase-servidor.ts`: piden con el JWT de quien entró). El navegador nunca habla con Auth: iniciar y cerrar sesión son
 * server actions (`acciones.ts`).
 */

export interface CookieAEscribir {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

/** Lo único que el cliente necesita saber del lugar donde están las cookies (el pedido, la respuesta, `next/headers`). */
export interface ManejadorDeCookies {
  leer(): { name: string; value: string }[];
  /** `cabeceras`: `Cache-Control: no-store` y compañía, que van con toda respuesta que escribe la sesión. */
  escribir(cookies: CookieAEscribir[], cabeceras: Record<string, string>): void;
}

/**
 * Las opciones con que se escribe cada cookie de sesión. `httpOnly` es lo que cumple la decisión: sin él, `document.cookie`
 * lee el token. `secure` en todo build de producción (staging y producción son `https://`; en `next dev` y en los tests, no).
 */
export const OPCIONES_DE_COOKIE = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
} as const;

/** ¿Es una cookie de la sesión de este proyecto? (el token en trozos, el verificador de código…) */
export function esCookieDeSesion(nombre: string, clave: string): boolean {
  return nombre === clave || nombre.startsWith(`${clave}.`) || nombre.startsWith(`${clave}-`);
}

/** Cómo borrar la sesión sin pasar por el SDK: todas las cookies de la sesión, vencidas en el acto. */
export function borrarCookiesDeSesion(cookies: ManejadorDeCookies, clave: string): void {
  const vencidas = cookies
    .leer()
    .filter(({ name }) => esCookieDeSesion(name, clave))
    .map(({ name }): CookieAEscribir => ({ name, value: "", options: { ...OPCIONES_DE_COOKIE, maxAge: 0 } }));
  if (vencidas.length > 0) cookies.escribir(vencidas, {});
}

/**
 * El cliente de servidor de `supabase-js` sobre esas cookies, con el mismo `fetch` que el resto del panel
 * (`fetch-auth.ts`: tope de 5 s, un 429 al renovar no borra la sesión). Un cliente por pedido: no se comparte.
 */
export function crearSupabaseConCookies(config: ConfigPublicaSupabase, cookies: ManejadorDeCookies): SupabaseClient {
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookies.leer(),
      setAll: (aEscribir, cabeceras) => cookies.escribir(aEscribir as CookieAEscribir[], cabeceras),
    },
    cookieOptions: { ...OPCIONES_DE_COOKIE },
    global: {
      fetch: crearFetchDeAuth((...argumentos) => globalThis.fetch(...argumentos), {
        // En el servidor el pedido dura un instante: no hay una pestaña que cierre la sesión mientras se renueva.
        haySesionGuardada: async () => true,
      }),
    },
  }) as SupabaseClient;

  // Lo que el SDK avisa al leer `session.user` en el servidor («podría no ser auténtico») no aplica: la identidad y el rol no
  // salen de ese objeto sino de `tiene_rol`, que la base contesta verificando la firma del JWT (`src/auth/acceso.ts`).
  (supabase.auth as unknown as { suppressGetSessionWarning: boolean }).suppressGetSessionWarning = true;

  registrarBorradoDeSesion(supabase, () => borrarCookiesDeSesion(cookies, claveDeAlmacenamiento(config.url)));
  return supabase;
}
