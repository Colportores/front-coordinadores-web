"use client";

import { useCallback } from "react";

import type { DatosAnadirColportor, FuenteDatosEquipo } from "@/datos/equipo";
import { AnadirColportor } from "@/features/equipo/AnadirColportor";

/**
 * Siempre la fuente SIMULADA, no el selector `fuenteEquipo` (`@/datos/equipo`):
 * el sitio de prueba no puede hablar con otra fuente el día que `index.ts`
 * apunte a la real. Se carga con `import()` para que sus datos de ejemplo vayan
 * en un chunk aparte, que el navegador baja solo cuando esta vista se usa.
 */
let simulada: Promise<FuenteDatosEquipo> | undefined;
function fuenteSimulada(): Promise<FuenteDatosEquipo> {
  simulada ??= import("@/datos/equipo/simulado").then((m) => m.fuenteEquipoSimulada);
  return simulada;
}

/**
 * La vista 23 para el sitio de prueba (GitHub Pages, export estático): sin
 * servidor no hay server actions, así que inscribir le habla a la fuente
 * simulada desde el navegador. El estado vive en la pestaña: al recargar vuelve
 * a los datos de ejemplo.
 */
export function AnadirColportorLocal({ datos }: { datos: DatosAnadirColportor }) {
  const inscribir = useCallback(
    async (usuarioId: string) => (await fuenteSimulada()).inscribirColportor(datos.campaniaId, usuarioId),
    [datos.campaniaId],
  );

  return <AnadirColportor datos={datos} inscribir={inscribir} />;
}
