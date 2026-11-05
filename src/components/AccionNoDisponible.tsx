"use client";

import * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Texto único del tooltip: issue #15. */
export const TEXTO_ACCION_NO_DISPONIBLE = "Disponible cuando se conecte esta función";

type AccionNoDisponibleProps = Omit<
  React.ComponentProps<"button">,
  "disabled" | "aria-disabled" | "type" | "title"
> &
  Partial<VariantProps<typeof buttonVariants>>;

function evitarActivacion(evento: React.SyntheticEvent) {
  evento.preventDefault();
}

/**
 * Botón para una acción cuyo formulario todavía no está diseñado
 * (docs/PESTANAS.md §6): se ve atenuado, un tooltip explica por qué y el
 * lector de pantalla lo anuncia como no disponible. No hace nada al hacer
 * click ni con teclado (issue #15).
 *
 * Si el sitio original usaba `<Button variant/size>`, pasá esos mismos
 * `variant`/`size` acá para mantener el estilo. Si era un `<button>` con
 * clases propias, dejá `variant`/`size` sin definir y pasá esas clases en
 * `className`.
 */
export function AccionNoDisponible({ className, variant, size, ...props }: AccionNoDisponibleProps) {
  const clasesVariante = variant || size ? buttonVariants({ variant, size }) : undefined;

  return (
    <button
      type="button"
      {...props}
      aria-disabled="true"
      title={TEXTO_ACCION_NO_DISPONIBLE}
      className={cn(clasesVariante, "cursor-not-allowed opacity-60", className)}
      onClick={evitarActivacion}
      onKeyDown={(evento) => {
        if (evento.key === "Enter" || evento.key === " ") evitarActivacion(evento);
      }}
    />
  );
}
