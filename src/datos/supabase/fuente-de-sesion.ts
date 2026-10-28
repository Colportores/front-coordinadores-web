import type { ClienteRpc } from "@/datos/supabase/cliente";

/**
 * Una fuente de datos que habla con las RPC de Supabase **con la sesión de quien hace el pedido** (issue #18, decisión «Sesión
 * panel»). Las fuentes de `src/datos/*` se eligen una vez, al cargar el módulo, pero la sesión es de cada pedido (viene de la
 * cookie): por eso esto no es la fuente sino una fachada que, en cada llamada a un método, arma el cliente de RPC con el JWT
 * de esa cookie, crea la fuente con él y le pasa la llamada. Las vistas siguen importando `fuenteX` y no se enteran.
 *
 * Sirve solo en el servidor (componentes de servidor y server actions); el módulo con las cookies se importa recién al usarla,
 * así no entra a ningún bundle del navegador ni del sitio de prueba.
 *
 * `crear` tiene que devolver una fuente de métodos (todos asíncronos) y no guardar estado entre llamadas: se crea una por llamada.
 */
export function fuenteDeSesion<F extends object>(crear: (cliente: ClienteRpc) => F): F {
  return new Proxy({} as F, {
    get(_destino, propiedad) {
      // `then` y los símbolos los miran `await`, `console.log` y los tests: la fachada no es una promesa ni un iterable.
      if (typeof propiedad === "symbol" || propiedad === "then") return undefined;
      return async (...argumentos: unknown[]) => {
        const { clienteRpcDeSesion } = await import("@/auth/supabase-servidor");
        const fuente = crear(await clienteRpcDeSesion()) as Record<string, unknown>;
        const metodo = fuente[propiedad];
        if (typeof metodo !== "function") throw new Error(`La fuente de datos no tiene el método ${propiedad}.`);
        return (metodo as (...a: unknown[]) => unknown).apply(fuente, argumentos);
      };
    },
  });
}
