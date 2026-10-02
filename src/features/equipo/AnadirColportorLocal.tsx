"use client";

import { useCallback } from "react";

import { fuenteEquipo } from "@/datos/equipo";
import type { DatosAnadirColportor } from "@/datos/equipo";
import { AnadirColportor } from "@/features/equipo/AnadirColportor";

/**
 * La vista 23 para el sitio de prueba (GitHub Pages, export estático): sin
 * servidor no hay server actions, así que inscribir le habla a la fuente
 * simulada desde el navegador. El estado vive en la pestaña: al recargar vuelve
 * a los datos de ejemplo.
 */
export function AnadirColportorLocal({ datos }: { datos: DatosAnadirColportor }) {
  const inscribir = useCallback(
    (usuarioId: string) => fuenteEquipo.inscribirColportor(datos.campaniaId, usuarioId),
    [datos.campaniaId],
  );

  return <AnadirColportor datos={datos} inscribir={inscribir} />;
}
