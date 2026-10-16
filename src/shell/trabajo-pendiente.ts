import { useSyncExternalStore } from "react";

/**
 * Trabajo a medio mandar de la pestaña actual: lo que una vista dejó dentro del plazo de un «Deshacer» o mandó y todavía no
 * contestó (hoy, las inscripciones de la vista 23). Vive en el shell porque lo necesitan quienes no son la vista:
 * - todo lo que cambia de pantalla (el menú de secciones, «‹ Equipo», Esc, atrás y adelante del navegador): antes de irse
 *   manda y espera, y solo se va si salió todo bien (decisión del 16/10 en #41, pendiente P2: «se envía igual o se avisa;
 *   no puede perderse sin aviso»). Hay una sola espera a la vez y el menú muestra su estado;
 * - el aviso del navegador al cerrar o recargar la pestaña, que tiene que seguir mientras algo no contestó aunque la vista ya se
 *   haya ido (un cambio de ruta la desmonta, pero sus envíos siguen en camino).
 */

/** Cuánto se espera la respuesta antes de dejar salir igual, por si el servidor no contesta. */
export const MS_TOPE_ESPERA = 10_000;

/** Cuántas veces se vuelve a mirar si apareció trabajo mientras se esperaba (algo que se añadió en el medio). */
const MAX_VUELTAS = 5;

/** Quien tiene trabajo a medio mandar mientras su vista está en pantalla. */
export interface FuenteDeTrabajo {
  /** Hay algo dentro del plazo del «Deshacer», todavía sin mandar. */
  hayPorMandar: () => boolean;
  /** Manda ya lo que está dentro del plazo y espera a lo que ella tiene en camino. `true` si todo salió bien. */
  confirmar: () => Promise<boolean>;
}

/** Cómo terminó una espera: `listo` (salió todo bien, o el servidor no contestó a tiempo), `fallo` o `ocupado` (ya había otra). */
export type SalidaDeEspera = "listo" | "fallo" | "ocupado";

const fuentes = new Set<FuenteDeTrabajo>();
/** Los envíos sin contestar de cualquier vista, aunque la vista ya no esté (su cambio de ruta no los cancela). */
const enCamino = new Set<Promise<unknown>>();
/**
 * Los envíos que ya agotaron un tope: siguen contando para el aviso de cerrar la pestaña, pero ninguna espera nueva los
 * espera. Si no, con un servidor colgado cada clic del menú, cada atrás y cada «‹ Equipo» esperarían otros 10 s.
 */
const abandonados = new Set<Promise<unknown>>();
let avisandoAlCerrar = false;
let esperando = false;
/** Cada reinicio (solo en los tests) invalida las esperas que quedaron colgadas de antes. */
let generacion = 0;
const oyentesDeEspera = new Set<() => void>();

function preguntarAlCerrar(evento: BeforeUnloadEvent) {
  evento.preventDefault();
  evento.returnValue = "";
}

/** Hay algo dentro del plazo o sin contestar, aunque ya se le haya agotado el tope a una espera: lo que importa al cerrar la pestaña. */
export function hayTrabajoPendiente(): boolean {
  return enCamino.size > 0 || [...fuentes].some((f) => f.hayPorMandar());
}

/** Hay algo que vale la pena esperar antes de irse: lo que está dentro del plazo y lo que está en camino sin haber agotado un tope. */
export function hayQueEsperar(): boolean {
  return [...fuentes].some((f) => f.hayPorMandar()) || [...enCamino].some((e) => !abandonados.has(e));
}

/** Un envío al que una espera ya le dio su tope: las esperas nuevas no lo vuelven a esperar. */
export function fueAbandonado(envio: Promise<unknown>): boolean {
  return abandonados.has(envio);
}

/** Hay una espera en marcha (venga del menú, de «‹ Equipo», de Esc o de atrás/adelante). */
export function estaEsperando(): boolean {
  return esperando;
}

function cambiarEsperando(valor: boolean) {
  if (esperando === valor) return;
  esperando = valor;
  for (const oyente of [...oyentesDeEspera]) oyente();
}

function suscribirEsperando(oyente: () => void) {
  oyentesDeEspera.add(oyente);
  return () => {
    oyentesDeEspera.delete(oyente);
  };
}

/** Para mostrar en el menú que se está esperando, sin importar quién empezó la espera. */
export function useEsperandoTrabajo(): boolean {
  return useSyncExternalStore(suscribirEsperando, estaEsperando, () => false);
}

/** Pone o saca el aviso de cerrar la pestaña según haya trabajo. Las fuentes lo llaman cada vez que su trabajo cambia. */
export function trabajoCambio(): void {
  if (typeof window === "undefined") return;
  const hay = hayTrabajoPendiente();
  if (hay && !avisandoAlCerrar) {
    window.addEventListener("beforeunload", preguntarAlCerrar);
    avisandoAlCerrar = true;
  } else if (!hay && avisandoAlCerrar) {
    window.removeEventListener("beforeunload", preguntarAlCerrar);
    avisandoAlCerrar = false;
  }
}

/** Una vista con trabajo a medio mandar se anota mientras está en pantalla. Devuelve cómo borrarla. */
export function registrarFuente(fuente: FuenteDeTrabajo): () => void {
  fuentes.add(fuente);
  trabajoCambio();
  return () => {
    fuentes.delete(fuente);
    trabajoCambio();
  };
}

/** Un envío que salió: cuenta como trabajo hasta que contesta, aunque la vista que lo mandó ya no esté. */
export function registrarEnvio(envio: Promise<unknown>): void {
  enCamino.add(envio);
  trabajoCambio();
  void envio.then(
    () => soltarEnvio(envio),
    () => soltarEnvio(envio),
  );
}

function soltarEnvio(envio: Promise<unknown>) {
  enCamino.delete(envio);
  abandonados.delete(envio);
  trabajoCambio();
}

/** Lo que una espera tiene que esperar de los envíos en camino: todos menos los que ya agotaron un tope. */
function enviosEsperables(): Promise<unknown>[] {
  return [...enCamino].filter((e) => !abandonados.has(e));
}

async function confirmarTodo(espera: { vencida: boolean }): Promise<boolean> {
  for (let vuelta = 0; vuelta < MAX_VUELTAS && hayQueEsperar(); vuelta++) {
    const resultados = await Promise.all([...fuentes].map((f) => f.confirmar()));
    // Lo que ya no tiene vista (un envío huérfano) se espera igual, pero su falla no se puede mostrar.
    await Promise.allSettled(enviosEsperables());
    // Si el tope ya ganó, quien esperaba se fue: lo que se anote ahora (una vista nueva con su «Deshacer») no es de esta espera.
    if (espera.vencida) return true;
    if (!resultados.every(Boolean)) return false;
  }
  return true;
}

/**
 * Manda ya todo lo que está dentro del plazo y espera la respuesta de cada envío. Hay una sola espera a la vez: si ya
 * hay otra, esta se ignora (`ocupado`) y gana el primer destino. `fallo` si alguno falló: quien llama se queda donde
 * está para que el aviso de esa vista no se pierda. `listo` si salió todo bien, si no había nada que esperar o si el
 * servidor no contestó en `MS_TOPE_ESPERA` (para no dejar a la coordinadora sin poder salir): los envíos que quedaron
 * colgados se abandonan, así que las esperas siguientes no los esperan de nuevo.
 */
export async function esperarTrabajoPendiente(): Promise<SalidaDeEspera> {
  if (esperando) return "ocupado";
  if (!hayQueEsperar()) return "listo";
  const espera = { vencida: false, generacion };
  cambiarEsperando(true);
  let tope: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      confirmarTodo(espera).then((ok): SalidaDeEspera => (ok ? "listo" : "fallo")),
      new Promise<SalidaDeEspera>((resolver) => {
        tope = setTimeout(() => {
          espera.vencida = true;
          if (espera.generacion === generacion) for (const envio of enCamino) abandonados.add(envio);
          resolver("listo");
        }, MS_TOPE_ESPERA);
      }),
    ]);
  } finally {
    // Si los envíos contestaron antes, el tope ya no hace falta.
    espera.vencida = true;
    clearTimeout(tope);
    if (espera.generacion === generacion) cambiarEsperando(false);
  }
}

/**
 * Dónde está la persona en el historial: la clave de la entrada actual si el navegador tiene la Navigation API (cada entrada
 * tiene la suya y un reemplazo la conserva), y si no, la ruta. Sirve para saber, después de esperar, si se fue por su cuenta.
 */
export function ubicacionActual(): string {
  if (typeof window === "undefined") return "";
  const clave = (window as unknown as { navigation?: { currentEntry?: { key?: unknown } | null } }).navigation?.currentEntry?.key;
  return typeof clave === "string" ? `entrada:${clave}` : `ruta:${window.location.pathname}`;
}

/**
 * Espera el trabajo pendiente y, si salió todo bien, hace `irA` (el cambio de pantalla que la persona eligió al empezar la
 * espera). Si mientras tanto ya se fue por su cuenta (un segundo atrás que el navegador no deja frenar, por ejemplo), no
 * navega: llevarla al destino viejo la devolvería a una pantalla que ya dejó. Devuelve cómo terminó la espera.
 */
export async function esperarYSalir(irA: () => void): Promise<SalidaDeEspera> {
  const dondeEstaba = ubicacionActual();
  const salida = await esperarTrabajoPendiente();
  if (salida === "listo" && ubicacionActual() === dondeEstaba) irA();
  return salida;
}

/** Solo para los tests: cada uno arranca sin trabajo pendiente ni esperas de otro. */
export function reiniciarTrabajoPendiente(): void {
  generacion++;
  fuentes.clear();
  enCamino.clear();
  abandonados.clear();
  cambiarEsperando(false);
  trabajoCambio();
}
