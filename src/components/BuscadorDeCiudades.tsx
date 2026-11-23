"use client";

import {
  ETIQUETA_BUSCAR_CIUDAD,
  PLACEHOLDER_BUSCAR_CIUDAD,
  textoRecuentoDeCiudades,
  textoSinCoincidencias,
} from "@/lib/buscar-ciudades";
import { cn } from "@/lib/utils";

/**
 * El campo para buscar entre las ciudades de la campaña (#186, #195): el mismo en la barra de Ciudades y en las columnas de
 * Inicio, Equipo, Reportes, Stock y Cuentas. Esc borra lo escrito y nada más; Enter elige la primera que coincide. El recuento va
 * con `aria-live` (un solo `role=status` por vista).
 */
export function BuscadorDeCiudades({
  texto,
  alCambiar,
  total,
  coinciden,
  buscando,
  alElegirPrimera,
  className,
}: {
  texto: string;
  alCambiar: (texto: string) => void;
  /** Cuántas ciudades hay. */
  total: number;
  /** Cuántas coinciden con lo escrito. */
  coinciden: number;
  buscando: boolean;
  /** Enter con lo escrito a la vista: elegir la primera que coincide (no se llama si no hay ninguna). */
  alElegirPrimera: () => void;
  /** Clases del campo (el ancho cambia entre la barra y las columnas). */
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <input
        type="search"
        value={texto}
        aria-label={ETIQUETA_BUSCAR_CIUDAD}
        placeholder={PLACEHOLDER_BUSCAR_CIUDAD}
        autoComplete="off"
        onChange={(e) => alCambiar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && texto !== "") {
            // Ese Esc borra lo escrito y nada más (no cierra la tarjeta de una casa abierta en el mapa).
            e.stopPropagation();
            alCambiar("");
          } else if (e.key === "Enter" && buscando && coinciden > 0) {
            // Con lo escrito a la vista, Enter elige la primera ciudad que coincide: se llega sin tocar el mouse.
            alElegirPrimera();
          }
        }}
        className={cn(
          "min-h-9 w-full rounded-control border border-grafico-neutro bg-superficie px-3 text-nav text-tinta outline-none focus-visible:ring-2 focus-visible:ring-acento",
          className,
        )}
      />
      <p aria-live="polite" className="text-mini text-tinta-suave">
        {textoRecuentoDeCiudades(coinciden, total, buscando)}
      </p>
    </div>
  );
}

/** Lo escrito no coincide con ninguna ciudad: dice qué hacer. */
export function SinCoincidenciasDeCiudades({ texto }: { texto: string }) {
  return (
    <p className="rounded-control bg-fondo px-3 py-2 text-cuerpo break-words wrap-anywhere text-tinta-suave">{textoSinCoincidencias(texto)}</p>
  );
}
