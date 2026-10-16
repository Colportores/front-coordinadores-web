/**
 * Lectura de lo que devuelve una RPC. Las fuentes de datos (`src/datos/<pestaña>/rpc.ts`) no confían en la forma
 * de la respuesta: la validan campo por campo y, si no es la del contrato de la base, fallan con
 * `RespuestaInesperada` (un cambio en el backend, no un rechazo del usuario) en vez de mostrar datos a medias.
 */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La respuesta de una RPC no tiene la forma del contrato de la base (migraciones 0015, 0033…). */
export class RespuestaInesperada extends Error {
  constructor(rpc: string, detalle: string) {
    super(`La RPC ${rpc} devolvió algo que el panel no entiende: ${detalle}.`);
    this.name = "RespuestaInesperada";
  }
}

export type Objeto = Record<string, unknown>;

export function esObjeto(valor: unknown): valor is Objeto {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Una función `returns table` contesta una lista de filas (vacía si no hay ninguna). */
export function filas(rpc: string, respuesta: unknown): Objeto[] {
  if (!Array.isArray(respuesta) || !respuesta.every(esObjeto)) throw new RespuestaInesperada(rpc, "no es una lista de filas");
  return respuesta;
}

/** Una función que devuelve una sola fila (`returns jsonb` o un tipo compuesto) contesta un objeto. */
export function objeto(rpc: string, respuesta: unknown): Objeto {
  if (!esObjeto(respuesta)) throw new RespuestaInesperada(rpc, "no es un objeto");
  return respuesta;
}

export function cadena(rpc: string, fila: Objeto, campo: string): string {
  const valor = fila[campo];
  if (typeof valor !== "string") throw new RespuestaInesperada(rpc, `\`${campo}\` no es un texto`);
  return valor;
}

export function cadenaONula(rpc: string, fila: Objeto, campo: string): string | null {
  const valor = fila[campo];
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") throw new RespuestaInesperada(rpc, `\`${campo}\` no es un texto ni null`);
  return valor;
}

export function numero(rpc: string, fila: Objeto, campo: string): number {
  const valor = fila[campo];
  if (typeof valor !== "number" || !Number.isFinite(valor)) throw new RespuestaInesperada(rpc, `\`${campo}\` no es un número`);
  return valor;
}

export function booleano(rpc: string, fila: Objeto, campo: string): boolean {
  const valor = fila[campo];
  if (typeof valor !== "boolean") throw new RespuestaInesperada(rpc, `\`${campo}\` no es verdadero o falso`);
  return valor;
}

export function lista(rpc: string, fila: Objeto, campo: string): unknown[] {
  const valor = fila[campo];
  if (!Array.isArray(valor)) throw new RespuestaInesperada(rpc, `\`${campo}\` no es una lista`);
  return valor;
}

/** Los elementos de una lista dentro de una fila (un `jsonb` armado con `jsonb_agg`), cada uno un objeto. */
export function listaDeObjetos(rpc: string, fila: Objeto, campo: string): Objeto[] {
  const elementos = lista(rpc, fila, campo);
  if (!elementos.every(esObjeto)) throw new RespuestaInesperada(rpc, `\`${campo}\` tiene un elemento que no es un objeto`);
  return elementos as Objeto[];
}

/** «Nombre Apellido»; si la cuenta no tiene ninguno, lo que se pase de alternativa, para que la fila no quede sin título. */
export function nombreVisible(nombre: string, apellido: string, alternativa: string): string {
  return `${nombre} ${apellido}`.trim() || alternativa;
}
