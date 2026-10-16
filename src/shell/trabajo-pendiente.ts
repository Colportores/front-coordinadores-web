/**
 * Trabajo a medio mandar de la pestaña actual: lo que una vista dejó dentro del plazo de un «Deshacer» o mandó y todavía no
 * contestó (hoy, las inscripciones de la vista 23). Vive en el shell porque lo necesitan dos que no son la vista:
 * - el menú de secciones, que antes de cambiar de pestaña tiene que mandar y esperar, como «‹ Equipo» y Esc (decisión del
 *   16/10 en #41, pendiente P2: «se envía igual o se avisa; no puede perderse sin aviso»);
 * - el aviso del navegador al cerrar o recargar la pestaña, que tiene que seguir mientras algo no contestó aunque la vista ya se
 *   haya ido (un cambio de ruta la desmonta, pero sus envíos siguen en camino).
 */

/** Cuánto se espera la respuesta antes de dejar salir igual, por si el servidor no contesta (el mismo tope que «‹ Equipo»). */
export const MS_TOPE_ESPERA = 10_000;

/** Quien tiene trabajo a medio mandar mientras su vista está en pantalla. */
export interface FuenteDeTrabajo {
  /** Hay algo dentro del plazo del «Deshacer» o sin contestar. */
  hayPendiente: () => boolean;
  /** Manda ya lo que está dentro del plazo y espera a todo lo que está en camino. `true` si todo salió bien. */
  confirmar: () => Promise<boolean>;
}

const fuentes = new Set<FuenteDeTrabajo>();
/** Los envíos sin contestar de cualquier vista, aunque la vista ya no esté (su cambio de ruta no los cancela). */
const enCamino = new Set<Promise<unknown>>();
let avisandoAlCerrar = false;

function preguntarAlCerrar(evento: BeforeUnloadEvent) {
  evento.preventDefault();
  evento.returnValue = "";
}

export function hayTrabajoPendiente(): boolean {
  return enCamino.size > 0 || [...fuentes].some((f) => f.hayPendiente());
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
  trabajoCambio();
}

/** Cuántas veces se vuelve a mirar si apareció trabajo mientras se esperaba (algo que se añadió en el medio). */
const MAX_VUELTAS = 5;

async function confirmarTodo(): Promise<boolean> {
  for (let vuelta = 0; vuelta < MAX_VUELTAS && hayTrabajoPendiente(); vuelta++) {
    const resultados = await Promise.all([...fuentes].map((f) => f.confirmar()));
    // Lo que ya no tiene vista (un envío huérfano) se espera igual, pero su falla no se puede mostrar.
    await Promise.allSettled([...enCamino]);
    if (!resultados.every(Boolean)) return false;
  }
  return true;
}

/**
 * Manda ya todo lo que está dentro del plazo y espera la respuesta de cada envío. `false` si alguno falló: quien llama se
 * queda donde está para que el aviso de esa vista no se pierda. `true` si salió todo bien o si el servidor no contestó en
 * `MS_TOPE_ESPERA` (para no dejar a la coordinadora sin poder salir).
 */
export async function esperarTrabajoPendiente(): Promise<boolean> {
  let tope: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      confirmarTodo(),
      new Promise<boolean>((resolver) => {
        tope = setTimeout(() => resolver(true), MS_TOPE_ESPERA);
      }),
    ]);
  } finally {
    // Si los envíos contestaron antes, el tope ya no hace falta.
    clearTimeout(tope);
  }
}

/** Solo para los tests: cada uno arranca sin trabajo pendiente de otro. */
export function reiniciarTrabajoPendiente(): void {
  fuentes.clear();
  enCamino.clear();
  trabajoCambio();
}
