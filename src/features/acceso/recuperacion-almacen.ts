/**
 * Lo que la recuperación de la contraseña (vista 40) guarda en el navegador. Nada de esto autentica ni es un secreto, y si el
 * navegador no deja usar el almacenamiento (modo privado, datos bloqueados) la pantalla anda igual, sin recordar.
 *
 * - **El correo que ya estaba escrito en el login** (`sessionStorage`, de esta pestaña, se va al cerrarla): el canvas pide que
 *   «¿Olvidaste tu contraseña?» llegue con el correo puesto. No viaja por la URL: no queda en el historial ni en un pedido.
 * - **La hora del último pedido de un enlace** (`localStorage`): la espera de 60 s entre pedidos (HU-AUTH-004) no se reinicia al
 *   salir de la pantalla y volver (canvas 40A-06). Es por navegador y no por correo: guardar el correo diría qué se pidió.
 */

const CLAVE_DEL_CORREO = "panel-correo-a-recuperar";
const CLAVE_DEL_ENVIO = "panel-recuperacion-ultimo-envio";

/** Entre un pedido de enlace y el siguiente (HU-AUTH-004: máximo 1 por minuto). */
export const ESPERA_ENTRE_PEDIDOS_MS = 60_000;

export function guardarCorreoAPedir(correo: string): void {
  try {
    if (correo) window.sessionStorage.setItem(CLAVE_DEL_CORREO, correo);
    else window.sessionStorage.removeItem(CLAVE_DEL_CORREO);
  } catch {
    // Sin almacenamiento: la pantalla de recuperar sale con el correo vacío.
  }
}

export function leerCorreoAPedir(): string {
  try {
    return window.sessionStorage.getItem(CLAVE_DEL_CORREO) ?? "";
  } catch {
    return "";
  }
}

export function guardarUltimoEnvio(ahora: number): void {
  try {
    window.localStorage.setItem(CLAVE_DEL_ENVIO, String(ahora));
  } catch {
    // Sin almacenamiento: la espera vale solo mientras la pantalla está abierta.
  }
}

/** La hora (ms) del último pedido, o 0 si no hay o no se entiende. Es el valor crudo: no cambia con el reloj. */
export function leerUltimoEnvio(): number {
  try {
    const valor = Number(window.localStorage.getItem(CLAVE_DEL_ENVIO));
    return Number.isFinite(valor) && valor > 0 ? valor : 0;
  } catch {
    return 0;
  }
}

/**
 * Cuántos milisegundos faltan para poder pedir otro enlace. Nunca más de 60 s: si la hora guardada quedó en el futuro (el reloj se
 * atrasó) se cuenta como recién enviada, no como una espera de horas.
 */
export function esperaRestanteMs(ultimoEnvio: number, ahora: number): number {
  if (ultimoEnvio <= 0) return 0;
  const hasta = Math.min(ultimoEnvio + ESPERA_ENTRE_PEDIDOS_MS, ahora + ESPERA_ENTRE_PEDIDOS_MS);
  return Math.max(0, hasta - ahora);
}
