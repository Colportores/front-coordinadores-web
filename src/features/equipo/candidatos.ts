import type { CandidatoColportor } from "@/datos/equipo/contrato";

/** Cuántos pendientes de asignación se sugieren sin buscar (diseño 23). */
export const MAX_SUGERIDOS = 5;

/** Minúsculas y sin tildes, para buscar "jose" y encontrar "José". */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** Hasta 5 cuentas pendientes de asignación y sin campaña, de la más nueva a la más antigua (decisión del 30/09). */
export function sugeridos(candidatos: CandidatoColportor[]): CandidatoColportor[] {
  return candidatos
    .filter((c) => c.estadoCuenta === "pendiente_asignacion" && c.campaniaActual === null)
    .sort((a, b) => b.cuentaCreada.localeCompare(a.cuentaCreada))
    .slice(0, MAX_SUGERIDOS);
}

/** Busca por nombre o email; las suspendidas y las de otra campaña aparecen igual (con su motivo). */
export function buscarCandidatos(candidatos: CandidatoColportor[], consulta: string): CandidatoColportor[] {
  const q = normalizar(consulta);
  if (q === "") return [];
  return candidatos.filter((c) => normalizar(c.nombre).includes(q) || normalizar(c.email).includes(q));
}

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
