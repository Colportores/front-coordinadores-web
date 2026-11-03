import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

import { crearSupabaseConCookies, type CookieAEscribir } from "@/auth/supabase-cookies";
import type { ConfigPublicaSupabase } from "@/datos/supabase/config-publica";

/**
 * El cliente de Supabase del proxy: lee la sesión de las cookies del pedido y, si hay que renovarla, la deja escrita en dos
 * lugares. En el **pedido** (`request.cookies`), para que la página que se va a renderizar (que lee `cookies()`) vea el token
 * nuevo y no intente renovarlo ella de nuevo, y en la **respuesta** (`aplicar`), para que el navegador lo guarde. `aplicar`
 * va sobre toda respuesta que el proxy devuelva, también sobre una redirección: una sesión que se venció y se borró tiene que
 * llegar borrada al navegador.
 */
export function crearSupabaseDeProxy(request: NextRequest, config: ConfigPublicaSupabase) {
  const escritas: CookieAEscribir[] = [];
  let cabeceras: Record<string, string> = {};

  const supabase: SupabaseClient = crearSupabaseConCookies(config, {
    leer: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    escribir: (aEscribir, cabecerasDeRespuesta) => {
      for (const cookie of aEscribir) {
        // Una vencida (valor vacío) sale del pedido; así `cookies()` de la página tampoco la ve.
        if (cookie.value) request.cookies.set(cookie.name, cookie.value);
        else request.cookies.delete(cookie.name);
        escritas.push(cookie);
      }
      cabeceras = { ...cabeceras, ...cabecerasDeRespuesta };
    },
  });

  return {
    supabase,
    /** Pone en `respuesta` las cookies de sesión que cambiaron en este pedido y las cabeceras que piden que no se cachee. */
    aplicar<T extends NextResponse>(respuesta: T): T {
      for (const { name, value, options } of escritas) respuesta.cookies.set(name, value, options);
      for (const [nombre, valor] of Object.entries(cabeceras)) respuesta.headers.set(nombre, valor);
      return respuesta;
    },
  };
}
