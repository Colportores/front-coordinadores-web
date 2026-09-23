/**
 * Flags del panel. Se leen de variables NEXT_PUBLIC_* que Next.js incrusta en
 * el build, así que cada acceso a process.env tiene que ser literal.
 *
 * - NEXT_PUBLIC_MODO_DEV: prende el modo dev (chips de estado de cada HU,
 *   panel "Estado de HU"). Activo en compose.dev.yml; sin definir en staging
 *   y producción.
 * - NEXT_PUBLIC_PESTANA_STOCK / NEXT_PUBLIC_PESTANA_CUENTAS: flag por pestaña
 *   (issue #3, decisión del 23/09). Stock y Cuentas muestran datos simulados
 *   hasta su conexión en V2, así que ningún coordinador real las puede ver:
 *   si el flag no está definido, siguen al modo dev (visibles en desarrollo,
 *   ocultas en staging y producción). Inicio, Equipo y Reportes no llevan flag.
 */

const VALORES_VERDADEROS = new Set(["1", "true", "si", "sí", "on"]);
const VALORES_FALSOS = new Set(["0", "false", "no", "off"]);

/** `true`/`false` si la variable está definida con un valor reconocible; `undefined` si no. */
export function leerBandera(valor: string | undefined): boolean | undefined {
  if (valor === undefined) return undefined;
  const normalizado = valor.trim().toLowerCase();
  if (VALORES_VERDADEROS.has(normalizado)) return true;
  if (VALORES_FALSOS.has(normalizado)) return false;
  return undefined;
}

export function modoDevActivo(): boolean {
  return leerBandera(process.env.NEXT_PUBLIC_MODO_DEV) ?? false;
}

export type Pestana = "inicio" | "equipo" | "stock" | "cuentas" | "reportes";

/** Pestañas con flag propio. Las demás están siempre visibles. */
function flagDePestana(pestana: Pestana): boolean | undefined {
  switch (pestana) {
    case "stock":
      return leerBandera(process.env.NEXT_PUBLIC_PESTANA_STOCK) ?? modoDevActivo();
    case "cuentas":
      return leerBandera(process.env.NEXT_PUBLIC_PESTANA_CUENTAS) ?? modoDevActivo();
    default:
      return undefined;
  }
}

export function pestanaVisible(pestana: Pestana): boolean {
  return flagDePestana(pestana) ?? true;
}
