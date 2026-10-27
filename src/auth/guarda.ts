import type { ResultadoAcceso } from "@/auth/acceso";
import { RUTA_INICIAL } from "@/shell/pestanas";

/**
 * La guarda de rutas del panel (issue #18, vista 38): qué hace `src/proxy.ts` con cada resultado de `verificarAcceso`. Es la
 * decisión sola, sin Next: la prueban `guarda.test.ts` y el proxy la ejecuta.
 */

export const RUTA_ACCESO = "/acceso";

/**
 * Por qué se llegó a la pantalla de acceso. Cada uno es un artboard de la vista 38: `vencida` (05), `sin-acceso` (04),
 * `no-disponible` (06) y `cerrada` (07). Sin motivo: la pantalla de siempre (01).
 */
export type MotivoDeAcceso = "vencida" | "sin-acceso" | "no-disponible" | "cerrada";

const MOTIVOS: readonly MotivoDeAcceso[] = ["vencida", "sin-acceso", "no-disponible", "cerrada"];

export function motivoDeAccesoValido(valor: unknown): MotivoDeAcceso | null {
  return MOTIVOS.find((m) => m === valor) ?? null;
}

/**
 * La cabecera con la que el proxy le avisa al layout que esta pantalla va sin el marco del panel (topbar y pestañas): la
 * pantalla de acceso es de quien todavía no entró. El proxy la borra de todo pedido y la pone él solo en `/acceso`.
 */
export const CABECERA_SIN_MARCO = "x-panel-sin-marco";

const LARGO_MAXIMO_DEL_DESTINO = 512;

/**
 * Adónde se vuelve después de entrar. Viene de la URL (`?siguiente=`), así que no se confía: solo vale una ruta del propio
 * panel (empieza con una sola `/`, sin `\`, sin caracteres de control y de largo razonable) que no sea la pantalla de acceso;
 * cualquier otra cosa, como `//sitio.malo`, `https://sitio.malo` o `/\sitio.malo`, es la pantalla inicial.
 */
export function destinoSeguro(valor: unknown): string {
  if (typeof valor !== "string" || valor.length === 0 || valor.length > LARGO_MAXIMO_DEL_DESTINO) return RUTA_INICIAL;
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.includes("\\")) return RUTA_INICIAL;
  if (/[\u0000-\u001f\u007f]/.test(valor)) return RUTA_INICIAL;
  let url: URL;
  try {
    url = new URL(valor, "http://panel.invalido");
  } catch {
    return RUTA_INICIAL;
  }
  if (url.origin !== "http://panel.invalido") return RUTA_INICIAL;
  // `new URL` normaliza `/.//sitio.malo`, `/..//x` y `/%2e//x` a `//sitio.malo`: el chequeo de arriba mira el texto sin normalizar, y
  // el navegador lee un `//` inicial como otro sitio. Se vuelve a mirar el camino ya normalizado.
  if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return RUTA_INICIAL;
  if (url.pathname === RUTA_ACCESO || url.pathname.startsWith(`${RUTA_ACCESO}/`)) return RUTA_INICIAL;
  return `${url.pathname}${url.search}`;
}

/** La URL (relativa) de la pantalla de acceso. `siguiente` solo se agrega si es distinto del destino por defecto. */
export function rutaDeAcceso(motivo: MotivoDeAcceso | null, siguiente?: string): string {
  const consulta = new URLSearchParams();
  if (motivo) consulta.set("motivo", motivo);
  const destino = destinoSeguro(siguiente);
  if (destino !== RUTA_INICIAL) consulta.set("siguiente", destino);
  const texto = consulta.toString();
  return texto ? `${RUTA_ACCESO}?${texto}` : RUTA_ACCESO;
}

export type DecisionDeGuarda =
  | { tipo: "pasar" }
  /** Va a la pantalla de acceso. */
  | { tipo: "a-acceso"; motivo: MotivoDeAcceso | null };

/**
 * Qué se hace con un pedido a una pantalla del panel según lo que dice `verificarAcceso`:
 * - `ok`: pasa.
 * - `sin-sesion`: a la pantalla de acceso (la 01).
 * - `sesion-vencida`: a la pantalla de acceso, con el aviso de sesión vencida (la 05).
 * - `sin-acceso`: a la pantalla «Sin acceso al panel» (la 04): entró alguien que no es coordinador vigente.
 * - `no-disponible`: a la pantalla «El panel no está disponible» (la 06), que no es una sesión vencida ni cierra nada.
 */
export function decidirGuarda(resultado: ResultadoAcceso): DecisionDeGuarda {
  switch (resultado.tipo) {
    case "ok":
      return { tipo: "pasar" };
    case "sin-sesion":
      return { tipo: "a-acceso", motivo: null };
    case "sesion-vencida":
      return { tipo: "a-acceso", motivo: "vencida" };
    case "sin-acceso":
      return { tipo: "a-acceso", motivo: "sin-acceso" };
    case "no-disponible":
      return { tipo: "a-acceso", motivo: "no-disponible" };
  }
}
