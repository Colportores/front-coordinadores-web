import { rutaDeAcceso } from "@/auth/guarda";

/**
 * Cómo se entera una pantalla de que la sesión venció *mientras estaba abierta* (issue #41, P3). Next no deja leer el estado HTTP
 * de una server action: un rechazo del proxy llega como `Error` y, si la respuesta es `text/plain`, con su texto como mensaje. Por
 * eso `src/proxy.ts` contesta 401 con esta marca, y la pantalla la reconoce con `esSesionVencida`. Una caída (503) no la lleva: no
 * es una sesión vencida (misma regla que `causaDeFalla`).
 */
export const MARCA_SESION_VENCIDA = "panel-sesion-vencida";

export function esSesionVencida(error: unknown): boolean {
  return error instanceof Error && error.message === MARCA_SESION_VENCIDA;
}

/** La pantalla de acceso con el aviso de sesión vencida (vista 38·05), que al entrar vuelve a la pantalla de donde se vino. */
export function rutaParaVolverAEntrar(): string {
  return rutaDeAcceso("vencida", `${window.location.pathname}${window.location.search}`);
}
