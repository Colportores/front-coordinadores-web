/**
 * Qué clase de falla es una respuesta de Supabase (PostgREST o Auth), con el mismo criterio que tenía el
 * BFF del coordinador (issue #18, ADR-013): **una configuración faltante o un Supabase caído no es una
 * sesión vencida.** Si lo fuera, todo el equipo vería la pantalla de login en loop cada vez que el
 * servicio se cae, y no podría hacer nada para arreglarlo.
 *
 * - `sesion-vencida`: el servidor dijo que el token no sirve (vencido, mal firmado, sin claims). Es la
 *   única causa que manda a la persona a iniciar sesión de nuevo.
 * - `no-disponible`: no hubo respuesta (sin red, timeout), el servicio falló (5xx, límite de tráfico) o
 *   la respuesta no dice nada de la sesión (por ejemplo, una clave anónima mal cargada). La sesión sigue
 *   en pie: se avisa y se ofrece reintentar.
 * - `rechazo`: la base contestó y dijo que no a esa llamada (permiso, regla de negocio). El código
 *   (`SQLSTATE` propio de la RPC, `42501`…) lo traduce la fuente de datos de cada pestaña (ADR-013).
 */
export type CausaFalla = "sesion-vencida" | "no-disponible" | "rechazo";

export interface FallaSupabase {
  /** Estado HTTP de la respuesta; 0 si no hubo respuesta (sin red, cancelada). */
  estado: number;
  /** Código de PostgREST (`PGRST…`), `SQLSTATE` de la RPC o código de Auth; vacío si no vino ninguno. */
  codigo: string;
}

/**
 * PostgREST contesta 401 con `PGRST3xx` cuando el JWT no sirve (`PGRST301` vencido o inválido, `PGRST302`
 * sin credenciales, `PGRST303` claims inválidos) y con `42501` cuando se pide algo sin estar autenticado.
 * Un 401 sin ninguno de esos códigos lo manda el gateway (por ejemplo «Invalid API key»): la sesión no
 * tiene la culpa.
 */
function esRechazoDeToken({ estado, codigo }: FallaSupabase): boolean {
  return estado === 401 && (codigo.startsWith("PGRST3") || codigo === "42501" || codigo === "bad_jwt");
}

export function causaDeFalla(falla: FallaSupabase): CausaFalla {
  if (esRechazoDeToken(falla)) return "sesion-vencida";
  // 408 y 429 son del servicio (tiempo y límite de tráfico), no una respuesta de la base a esa llamada.
  if (falla.estado === 0 || falla.estado === 408 || falla.estado === 429 || falla.estado >= 500) return "no-disponible";
  // Un 401 que no es del token (clave anónima mal cargada, gateway) no habla de la sesión: no desloguea.
  if (falla.estado === 401) return "no-disponible";
  return "rechazo";
}
