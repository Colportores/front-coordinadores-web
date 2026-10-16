import type { CandidatoColportor } from "@/datos/equipo/contrato";

/** Por qué no se puede añadir la cuenta, o `null` si se puede. */
export function motivoBloqueo(c: CandidatoColportor): string | null {
  if (c.estadoCuenta === "suspendida") {
    return "Cuenta suspendida. Pedí a un administrador que la reactive para añadirla.";
  }
  if (c.campaniaActual !== null) return `Está en campaña ${c.campaniaActual}. Reasignar primero.`;
  return null;
}

/** Ayuda bajo el botón cuando la cuenta no se puede añadir: otra campaña o suspendida (se repite, decisión del 30/09). */
export function ayudaBloqueo(c: CandidatoColportor): string | null {
  if (c.estadoCuenta === "suspendida") return "Pedile a un administrador que la reactive.";
  if (c.campaniaActual !== null) return `Pedile al coordinador de ${c.campaniaActual} que lo libere.`;
  return null;
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** "2026-09-22" pasa a "22/09/2026" (sin usar Date: no depende de la zona horaria). */
export function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}
