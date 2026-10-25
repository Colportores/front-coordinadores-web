/**
 * La campaña que eligió la coordinadora en el selector del topbar (#70) vive en una cookie de sesión del navegador: así
 * «queda mientras recorre las pestañas» y el servidor, que arma cada pestaña, la lee en cada pedido
 * (`src/datos/shell/campania-elegida-servidor.ts`). Es solo un id: el servidor lo cree únicamente si figura en la lista de
 * campañas de quien llama (`campaniaProvisoria`, `crearFuenteShellRpc`), así que una cookie vieja o ajena no da acceso a nada.
 */
export const COOKIE_CAMPANIA_ELEGIDA = "campania-elegida";

/** Guarda la elección para los próximos pedidos al servidor. Solo en el navegador. */
export function guardarCampaniaElegida(id: string): void {
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_CAMPANIA_ELEGIDA}=${encodeURIComponent(id)}; Path=/; SameSite=Lax${seguro}`;
}
