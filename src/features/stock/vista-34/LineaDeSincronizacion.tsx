import { cn } from "@/lib/utils";

/**
 * «Sincronizó el 22/10 a las 18:30» bajo el nombre del colportor. Pasados dos días va en rojo (42B·01), con «△» y un texto solo
 * para el lector: el color no es lo único que lo dice.
 */
export function LineaDeSincronizacion({ texto, vieja }: { texto: string; vieja: boolean }) {
  return (
    <span className={cn("block text-mini font-normal wrap-anywhere", vieja ? "font-semibold text-peligro" : "text-tinta-suave")}>
      {vieja && <span aria-hidden="true">△ </span>}
      {texto}
      {vieja && <span className="sr-only"> (hace más de dos días)</span>}
    </span>
  );
}
