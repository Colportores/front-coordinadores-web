import { rutaDeAcceso, type MotivoDeAcceso } from "@/auth/guarda";
import { MENSAJE_SESION_VENCIDA } from "@/lib/mensajes";

/**
 * Cómo se entera una pantalla de que el proxy le cerró la puerta *mientras estaba abierta* (issue #41, P3). Next no deja leer el
 * estado HTTP de una server action: un rechazo del proxy llega como `Error` y, si la respuesta es `text/plain`, con su texto como
 * mensaje. Por eso `src/proxy.ts` contesta 401 con una marca que lleva el motivo (los mismos de la pantalla de acceso), y la
 * pantalla la reconoce con `motivoDelRechazo`. Una caída (503) no lleva marca: no es un problema de la cuenta (misma regla que
 * `causaDeFalla`).
 */
export type MotivoDeRechazo = Extract<MotivoDeAcceso, "vencida" | "sin-acceso" | "suspendida">;

const PREFIJO = "panel-acceso:";
const MOTIVOS: readonly MotivoDeRechazo[] = ["vencida", "sin-acceso", "suspendida"];

export function marcaDeRechazo(motivo: MotivoDeRechazo): string {
  return `${PREFIJO}${motivo}`;
}

/** El motivo que dice el rechazo del proxy; `null` si el error es otra cosa (una caída, un texto parecido). */
export function motivoDelRechazo(error: unknown): MotivoDeRechazo | null {
  if (!(error instanceof Error)) return null;
  return MOTIVOS.find((motivo) => error.message === marcaDeRechazo(motivo)) ?? null;
}

/**
 * El aviso: «Tu sesión venció.» solo si venció; con «sin acceso» o «suspendida» no se dice una sesión que no venció (la pantalla
 * de acceso explica el motivo con su texto) y se dice qué no se pudo hacer. `accion` es lo que se intentaba («buscar cuentas»);
 * sin ella, el aviso va detrás del nombre de la cuenta («No se pudo añadir a X. …»).
 */
export function mensajeDeRechazo(motivo: MotivoDeRechazo, accion?: string): string {
  if (motivo === "vencida") return MENSAJE_SESION_VENCIDA;
  return accion ? `No se pudo ${accion}. Volvé a entrar para seguir.` : "Volvé a entrar para seguir.";
}

/**
 * La pantalla de acceso con el motivo. Solo la sesión vencida vuelve a la pantalla de donde se vino; «sin acceso» y «suspendida»
 * no (la cuenta no sirve para el panel), igual que la guarda de rutas.
 */
export function rutaParaVolverAEntrar(motivo: MotivoDeRechazo): string {
  return motivo === "vencida"
    ? rutaDeAcceso(motivo, `${window.location.pathname}${window.location.search}`)
    : rutaDeAcceso(motivo);
}
