"use client";

import { buscarHu, ETIQUETA_ESTADO, ETIQUETA_SCHEMA } from "@/dev/estado-hu";
import { CLASES_ESTADO, CLASES_SCHEMA } from "@/dev/estilos";
import { useModoDev } from "@/dev/ProveedorModoDev";
import { cn } from "@/lib/utils";

/**
 * Chip del modo dev: id de la HU + estado + si su esquema existe en el back.
 * No renderiza nada fuera del modo dev o con los chips ocultos.
 */
export function ChipHu({ hu, className }: { hu: string; className?: string }) {
  const { chipsVisibles } = useModoDev();
  if (!chipsVisibles) return null;

  const registro = buscarHu(hu);
  if (!registro) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-pastilla bg-peligro px-2 py-0.5 font-mono text-etiqueta font-medium text-superficie",
          className,
        )}
      >
        {hu} · no está en estado-hu.ts
      </span>
    );
  }

  const estilos = CLASES_ESTADO[registro.estado];
  const titulo = [
    `${registro.id} — ${registro.titulo}`,
    `Estado: ${ETIQUETA_ESTADO[registro.estado]}`,
    registro.motivo ? `Motivo: ${registro.motivo}` : undefined,
    `Conexión: ${registro.sprintConexion}`,
    `Schema en back: ${ETIQUETA_SCHEMA[registro.schemaEnBack]}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span
      data-testid="chip-hu"
      title={titulo}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pastilla border border-borde bg-superficie py-0.5 pr-2 pl-1 font-mono text-etiqueta leading-4 whitespace-nowrap shadow-xs",
        className,
      )}
    >
      <span className={cn("rounded-pastilla px-1.5 font-semibold", estilos.pastilla)}>
        {ETIQUETA_ESTADO[registro.estado]}
      </span>
      <span className="font-medium text-tinta-2">{registro.id}</span>
      <span className={cn("font-medium", CLASES_SCHEMA[registro.schemaEnBack])}>
        schema: {ETIQUETA_SCHEMA[registro.schemaEnBack]}
      </span>
    </span>
  );
}
