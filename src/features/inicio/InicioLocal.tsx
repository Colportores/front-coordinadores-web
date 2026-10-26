"use client";

import { useEffect, useMemo, useState } from "react";

import type { FuenteDatosInicio, TableroDelDia } from "@/datos/inicio";
import { InicioVista, type AccionesInicio } from "@/features/inicio/InicioVista";

/**
 * Siempre la fuente SIMULADA, no el selector `fuenteInicio` (`@/datos/inicio`): el sitio de prueba no puede hablar con otra
 * fuente el día que `index.ts` apunte a la real. Se carga con `import()` para que sus datos de ejemplo vayan en un chunk
 * aparte, que el navegador baja solo cuando esta vista se usa (el build de staging y producción nunca la renderiza).
 */
let simulada: Promise<FuenteDatosInicio> | undefined;
function fuenteSimulada(): Promise<FuenteDatosInicio> {
  simulada ??= import("@/datos/inicio/simulado").then((m) => m.fuenteInicioSimulada);
  return simulada;
}

/**
 * La vista 31 para el sitio de prueba (GitHub Pages, export estático): sin servidor no hay server actions, así que los
 * datos se arman en el navegador con la fuente simulada, a la hora de abrir la página (así «Actualizado» y «hace 12 min»
 * no quedan congelados en la hora del build).
 */
export function InicioLocal() {
  const [tablero, setTablero] = useState<TableroDelDia | null>(null);
  const acciones = useMemo<AccionesInicio>(
    () => ({
      obtenerDia: async (fecha) => ({ ok: true, tablero: await (await fuenteSimulada()).obtenerTablero({ fecha }) }),
    }),
    [],
  );

  useEffect(() => {
    let vigente = true;
    void fuenteSimulada()
      .then((fuente) => fuente.obtenerTablero())
      .then((datos) => {
        if (vigente) setTablero(datos);
      });
    return () => {
      vigente = false;
    };
  }, []);

  if (!tablero) {
    return (
      <p role="status" className="px-[22px] py-5 text-nav text-tinta-suave">
        Cargando el tablero de Inicio…
      </p>
    );
  }
  return <InicioVista tablero={tablero} acciones={acciones} />;
}
