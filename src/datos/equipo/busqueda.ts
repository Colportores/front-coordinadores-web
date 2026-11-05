import { CUENTAS_POR_PAGINA, type CandidatoColportor } from "@/datos/equipo/contrato";

/**
 * La búsqueda de cuentas de la vista 23 hecha en memoria, con las mismas reglas que `buscar_candidatos()` del backend
 * (migración 0015, decisión de Cristian del 30/09). La usa la fuente simulada (desarrollo y sitio de prueba) para
 * que la vista se comporte igual que contra el servidor; la fuente real no la toca.
 */

/** Cuántos pendientes de asignación se sugieren sin buscar (diseño 23). */
export const MAX_SUGERIDOS = 5;

/** Minúsculas, sin tildes y con los espacios colapsados (`normalizar_busqueda()` del backend). */
export function normalizarBusqueda(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Hasta 5 cuentas pendientes de asignación y sin campaña, de la más nueva a la más antigua (decisión del 30/09). */
export function sugeridosDe(candidatos: CandidatoColportor[]): CandidatoColportor[] {
  return candidatos
    .filter((c) => c.estadoCuenta === "pendiente_asignacion" && c.campaniaActual === null)
    // Misma fecha: por id, para que el orden no salte entre cargas.
    .sort((a, b) => b.cuentaCreada.localeCompare(a.cuentaCreada) || a.id.localeCompare(b.id))
    .slice(0, MAX_SUGERIDOS);
}

interface Clave {
  candidato: CandidatoColportor;
  /** `false` va primero: el nombre, el apellido o el email empiezan con lo escrito. */
  noEmpieza: boolean;
  sinNombre: boolean;
  nombre: string;
}

function comparar(a: Clave, b: Clave): number {
  if (a.noEmpieza !== b.noEmpieza) return a.noEmpieza ? 1 : -1;
  if (a.sinNombre !== b.sinNombre) return a.sinNombre ? 1 : -1;
  if (a.nombre !== b.nombre) return a.nombre < b.nombre ? -1 : 1;
  return a.candidato.id < b.candidato.id ? -1 : a.candidato.id > b.candidato.id ? 1 : 0;
}

/**
 * Todas las cuentas que contienen `texto` en el nombre o el email (las suspendidas y las de otra campaña también,
 * con su motivo), primero las que empiezan con él y después alfabético. El apellido se toma como lo que viene después
 * de la primera palabra del nombre: el dato simulado no los separa.
 */
export function ordenarBusqueda(candidatos: CandidatoColportor[], texto: string): CandidatoColportor[] {
  const q = normalizarBusqueda(texto);
  if (q === "") return [];
  return candidatos
    .flatMap((candidato): Clave[] => {
      const nombre = normalizarBusqueda(candidato.nombre);
      const email = normalizarBusqueda(candidato.email);
      if (!nombre.includes(q) && !email.includes(q)) return [];
      const palabras = nombre.split(" ");
      const apellidoEmpieza = palabras.slice(1).some((_, i) => palabras.slice(i + 1).join(" ").startsWith(q));
      return [
        {
          candidato,
          noEmpieza: !(nombre.startsWith(q) || apellidoEmpieza || email.startsWith(q)),
          sinNombre: nombre === "",
          nombre,
        },
      ];
    })
    .sort(comparar)
    .map((c) => c.candidato);
}

/**
 * Una página de la búsqueda: las `CUENTAS_POR_PAGINA` que siguen a `despuesDe`. `null` si esa cuenta ya no está en el
 * resultado (el cursor perdido que el backend responde con `22023`).
 */
export function paginaDeBusqueda(
  candidatos: CandidatoColportor[],
  texto: string,
  despuesDe: string | null,
): { candidatos: CandidatoColportor[]; hayMas: boolean } | null {
  const todos = ordenarBusqueda(candidatos, texto);
  let desde = 0;
  if (despuesDe !== null) {
    const indice = todos.findIndex((c) => c.id === despuesDe);
    if (indice < 0) return null;
    desde = indice + 1;
  }
  const pagina = todos.slice(desde, desde + CUENTAS_POR_PAGINA);
  return { candidatos: pagina, hayMas: pagina.length >= CUENTAS_POR_PAGINA };
}
