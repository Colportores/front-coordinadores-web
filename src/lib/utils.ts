import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge tiene que conocer los tokens propios de globals.css: sin esto,
 * `text-etiqueta` (tamaño) y `text-tinta` (color) se toman como el mismo grupo
 * y `cn()` descarta uno de los dos.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["etiqueta", "mini", "chico", "cuerpo", "nav", "titulo", "cifra"],
      radius: ["control", "tarjeta", "pastilla"],
      tracking: ["etiqueta"],
      spacing: ["topbar"],
    },
  },
});

/** Combina clases de Tailwind resolviendo conflictos (helper estándar de shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
