import type { CandidatoColportor } from "@/datos/equipo/contrato";

/** Por qué no se puede añadir la cuenta, o `null` si se puede. */
export function motivoBloqueo(c: CandidatoColportor): string | null {
  if (c.estadoCuenta === "suspendida") {
    return "Cuenta suspendida. Pedí a un administrador que la reactive para añadirla.";
  }
  if (c.enOtraCampania) return c.campaniaActual !== null ? `Está en campaña ${c.campaniaActual}. Reasignar primero.` : "Está en otra campaña. Reasignar primero.";
  return null;
}

/** Ayuda bajo el botón cuando la cuenta no se puede añadir: otra campaña o suspendida (se repite, decisión del 30/09). */
export function ayudaBloqueo(c: CandidatoColportor): string | null {
  if (c.estadoCuenta === "suspendida") return "Pedile a un administrador que la reactive.";
  if (c.enOtraCampania) return c.campaniaActual !== null ? `Pedile al coordinador de ${c.campaniaActual} que lo libere.` : "Pedile al coordinador de la otra campaña que lo libere.";
  return null;
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    // `Array.from` parte por caracteres, no por unidades UTF-16: `p[0]` cortaría un emoji a la mitad («�»).
    .map((p) => Array.from(p)[0]?.toUpperCase())
    .join("");
}

/** Cuántos caracteres del texto buscado se repiten en el título de la lista; el resto se ve en el buscador. */
export const MAX_CARACTERES_TITULO = 60;

/** Acorta el texto a `max` caracteres (no unidades UTF-16: un emoji no se parte) y lo marca con «…». */
export function recortarConPuntos(texto: string, max: number): string {
  const caracteres = Array.from(texto);
  return caracteres.length <= max ? texto : `${caracteres.slice(0, max).join("").trimEnd()}…`;
}

/** "2026-09-22" pasa a "22/09/2026" (sin usar Date: no depende de la zona horaria). */
export function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}
