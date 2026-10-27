/**
 * El correo con el que se entró en esta pestaña, para dejarlo escrito en las pantallas de «Tu sesión venció» (05) y «Cerraste
 * sesión» (07): el canvas de la vista 38 vacía solo la contraseña (decisión del agente de decisiones, 27/10, regla R3).
 *
 * Vive en `sessionStorage` y no en la URL ni en una cookie: es de esta pestaña, se va al cerrarla y nunca viaja en un pedido ni
 * queda en el historial. Si el navegador no deja usarlo (modo privado, datos bloqueados), la pantalla sale con el correo vacío.
 * No es un dato de la sesión: no autentica nada.
 */
const CLAVE = "panel-ultimo-correo";

export function leerUltimoCorreo(): string {
  try {
    return window.sessionStorage.getItem(CLAVE) ?? "";
  } catch {
    return "";
  }
}

export function guardarUltimoCorreo(correo: string): void {
  try {
    window.sessionStorage.setItem(CLAVE, correo);
  } catch {
    // Sin almacenamiento: la próxima pantalla de acceso sale con el correo vacío.
  }
}

export function olvidarUltimoCorreo(): void {
  try {
    window.sessionStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar.
  }
}
