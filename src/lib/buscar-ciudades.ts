import { normalizarBusqueda } from "@/datos/equipo/busqueda";

/**
 * La búsqueda de ciudades que comparten Ciudades (la barra, #186) y las columnas de Inicio, Equipo, Reportes, Stock y Cuentas (#195):
 * mismo umbral, mismos textos, mismo orden y mismo estado «sin resultados». Es una función pura sobre cualquier cosa con nombre.
 */

/**
 * Desde cuántas ciudades se suma el campo para buscar entre ellas (#186). Hasta ahí se ven todas de un vistazo y el campo
 * sobra; con más, ubicar una a ojo deja de ser razonable (los evaluadores preguntaron por 150).
 */
export const CIUDADES_PARA_BUSCAR = 8;

export const ETIQUETA_BUSCAR_CIUDAD = "Buscar entre las ciudades de la campaña";

export const PLACEHOLDER_BUSCAR_CIUDAD = "Buscar ciudad…";

/** Lo que se anuncia (y se ve) cuando lo escrito no coincide con ninguna ciudad: dice qué hacer. */
export function textoSinCoincidencias(texto: string): string {
  return `Ninguna ciudad de la campaña coincide con «${texto.trim()}». Revisá lo escrito o borralo para ver todas.`;
}

/** El recuento que acompaña al campo y se anuncia con `aria-live`: «150 ciudades» sin buscar, «3 de 150 ciudades» buscando. */
export function textoRecuentoDeCiudades(coinciden: number, total: number, buscando: boolean): string {
  return buscando ? `${coinciden} de ${total} ciudades` : `${total} ciudades`;
}

export function hayBuscadorDeCiudades(cantidad: number): boolean {
  return cantidad > CIUDADES_PARA_BUSCAR;
}

/** A-Z en castellano sin mirar tildes ni mayúsculas; mismo nombre, por `desempate` (el id), para que el orden no salte entre cargas. */
export function ordenarPorNombre<T extends { nombre: string }>(items: readonly T[], desempate: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const porNombre = a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    if (porNombre !== 0) return porNombre;
    const da = desempate(a);
    const db = desempate(b);
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

/**
 * Búsqueda blanda: sin distinguir mayúsculas ni tildes, con coincidencia parcial en cualquier parte del nombre. Primero las que
 * empiezan con lo escrito y después las que solo lo contienen, cada grupo A-Z (decisión P4 de #186). Vacío: todas, en el orden de la
 * fuente, como el canvas 24 · 01 (P1 de la QA de #186, 18/11).
 */
export function coincidenciasPorNombre<T extends { nombre: string }>(items: readonly T[], texto: string, desempate: (item: T) => string): T[] {
  const buscado = normalizarBusqueda(texto);
  if (buscado === "") return [...items];
  const empiezan: T[] = [];
  const contienen: T[] = [];
  for (const item of ordenarPorNombre(items, desempate)) {
    const nombre = normalizarBusqueda(item.nombre);
    if (nombre.startsWith(buscado)) empiezan.push(item);
    else if (nombre.includes(buscado)) contienen.push(item);
  }
  return [...empiezan, ...contienen];
}

/** Lo que una columna de ciudades dibuja mientras se busca. */
export interface VistaDeBusqueda<T> {
  /** Cuántas ciudades hay en total (sin contar «Todas las ciudades» ni «Todo el departamento»). */
  total: number;
  /** Las ciudades que coinciden con lo escrito, en el orden de la regla. */
  coinciden: T[];
  /** Lo que se ve: «Todas las ciudades», el ámbito elegido (aunque no coincida) y las que coinciden. */
  visibles: T[];
}

/**
 * Las columnas de ciudades tienen, además de las ciudades, ámbitos que no son una ciudad («Todas las ciudades», «Todo el
 * departamento»). Esos no se buscan por nombre. Buscando, siempre se ven «Todas» y el ámbito elegido (no se pierde de vista
 * cuál es), seguidos de las ciudades que coinciden.
 */
export function buscarEnColumna<T extends { clave: string; nombre: string }>(
  nodos: readonly T[],
  esCiudad: (nodo: T) => boolean,
  texto: string,
  claveElegida: string,
  claveTodas = "todas",
): VistaDeBusqueda<T> {
  const ciudades = nodos.filter(esCiudad);
  const coinciden = coincidenciasPorNombre(ciudades, texto, (n) => n.clave);
  const fijos = nodos.filter((n) => n.clave === claveTodas);
  const elegida = claveElegida === claveTodas ? undefined : nodos.find((n) => n.clave === claveElegida);
  const visibles = [...fijos, ...(elegida ? [elegida] : []), ...coinciden.filter((n) => n.clave !== elegida?.clave)];
  return { total: ciudades.length, coinciden, visibles };
}
