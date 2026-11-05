/**
 * El `fetch` que usa el cliente de `supabase-js` del panel (issue #18, revisión de #47). Toca solo los pedidos
 * a Auth (`/auth/v1/…`); las RPC (`/rest/v1/…`) pasan tal cual. Resuelve tres cosas que el SDK decide por su
 * cuenta y que no se pueden arreglar desde `acceso.ts`:
 *
 * - **Un tope por pedido.** Un pedido a Auth que no contesta (conexión colgada) deja al SDK esperando para
 *   siempre, con su cerrojo tomado: ni `signOut` ni `getSession` terminan. Con el tope, el pedido falla como una
 *   caída de red (reintentable) y el cerrojo se libera. También acota los pedidos de un intento de inicio de
 *   sesión que ya venció: su respuesta tardía no llega a guardar una sesión que pise la del siguiente intento.
 * - **Un 429 al renovar no es un token inválido.** El SDK borra la sesión ante cualquier rechazo de la
 *   renovación que no sea «falla de red o 5xx». Un límite de uso (429) es transitorio: se lo hace pasar por una
 *   caída de red para que el SDK conserve la sesión y vuelva a intentar.
 * - **Una renovación en camino no resucita una sesión cerrada.** Si la sesión guardada ya no está (se cerró en
 *   este navegador mientras se reintentaba renovar), la renovación ni se manda: de otro modo, al volver la red
 *   el SDK guardaría la sesión nueva y el «cerrar sesión» quedaría deshecho.
 */

/** Cuánto se espera a Auth en cada pedido: el mismo tope de 5 s que tenía el BFF hacia Supabase. */
export const TOPE_PEDIDO_AUTH_MS = 5_000;

export interface OpcionesFetchDeAuth {
  /** Cuánto se espera a Auth en cada pedido. */
  topeMs?: number;
  /** ¿Sigue habiendo una sesión guardada en este navegador? Si no, no se manda ninguna renovación. */
  haySesionGuardada: () => Promise<boolean>;
}

function rutaDe(entrada: RequestInfo | URL): URL {
  return new URL(entrada instanceof Request ? entrada.url : String(entrada));
}

/** El pedido, o un rechazo (`TimeoutError`) si Auth no contesta en `ms`. El pedido que queda colgado se aborta. */
async function conTope(base: typeof fetch, entrada: RequestInfo | URL, init: RequestInit | undefined, ms: number) {
  const control = new AbortController();
  const senalDeQuienPide = init?.signal;
  if (senalDeQuienPide?.aborted) control.abort(senalDeQuienPide.reason);
  senalDeQuienPide?.addEventListener("abort", () => control.abort(senalDeQuienPide.reason), { once: true });

  const temporizador = setTimeout(
    () => control.abort(new DOMException("Supabase Auth no contestó a tiempo.", "TimeoutError")),
    ms,
  );
  // Un `fetch` que no atiende la señal (un doble de test, un polyfill) igual se corta: la carrera lo rechaza.
  const abortado = new Promise<never>((_, rechazar) => {
    if (control.signal.aborted) rechazar(control.signal.reason);
    control.signal.addEventListener("abort", () => rechazar(control.signal.reason), { once: true });
  });
  try {
    return await Promise.race([base(entrada, { ...init, signal: control.signal }), abortado]);
  } finally {
    clearTimeout(temporizador);
  }
}

export function crearFetchDeAuth(base: typeof fetch, { topeMs = TOPE_PEDIDO_AUTH_MS, haySesionGuardada }: OpcionesFetchDeAuth): typeof fetch {
  return async (entrada, init) => {
    const url = rutaDe(entrada);
    if (!url.pathname.startsWith("/auth/v1/")) return base(entrada, init);

    const esRenovacion = url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token";
    if (esRenovacion && !(await haySesionGuardada())) {
      throw new TypeError("No se renovó el token: la sesión se cerró en este navegador.");
    }

    const respuesta = await conTope(base, entrada, init, topeMs);
    if (esRenovacion && respuesta.status === 429) {
      void respuesta.body?.cancel().catch(() => undefined);
      throw new TypeError("Supabase limitó las renovaciones (429): falla transitoria, la sesión se conserva.");
    }
    return respuesta;
  };
}
