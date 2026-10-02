"use client";

import { useMemo } from "react";

import type { DatosZonas, FuenteDatosZonas } from "@/datos/equipo/zonas";
import { ZonasCampania, type AccionesZonas } from "@/features/equipo/zonas/ZonasCampania";

/**
 * Siempre la fuente SIMULADA, no el selector `fuenteZonas` (`@/datos/equipo/zonas`):
 * el sitio de prueba no puede hablar con otra fuente el día que `index.ts` apunte
 * a la real. Se carga con `import()` para que sus datos de ejemplo vayan en un
 * chunk aparte, que el navegador baja solo cuando esta vista se usa (el build de
 * staging y producción nunca la renderiza).
 */
let simulada: Promise<FuenteDatosZonas> | undefined;
function fuenteSimulada(): Promise<FuenteDatosZonas> {
  simulada ??= import("@/datos/equipo/zonas/simulado").then((m) => m.fuenteZonasSimulada);
  return simulada;
}

/**
 * La vista 24 para el sitio de prueba (GitHub Pages, export estático): sin
 * servidor no hay server actions, así que las acciones le hablan a la fuente
 * simulada desde el navegador. El estado vive en la pestaña: al recargar vuelve
 * a los datos de ejemplo.
 */
export function ZonasCampaniaLocal({ datos }: { datos: DatosZonas }) {
  const acciones = useMemo<AccionesZonas>(
    () => ({
      esquinaMasCercana: async (ciudadId, punto) => (await fuenteSimulada()).esquinaMasCercana(ciudadId, punto),
      tramoPorCalles: async (ciudadId, desde, hasta) => (await fuenteSimulada()).tramoPorCalles(ciudadId, desde, hasta),
      vistaPreviaZona: async (entrada) => (await fuenteSimulada()).vistaPreviaZona(entrada),
      guardarZona: async (entrada) => (await fuenteSimulada()).guardarZona(entrada),
      asignarZona: async (usuarioId, zonaId) => (await fuenteSimulada()).asignarZona(datos.campaniaId, usuarioId, zonaId),
      quitarZona: async (usuarioId) => (await fuenteSimulada()).quitarZona(datos.campaniaId, usuarioId),
      eliminarZona: async (zonaId) => (await fuenteSimulada()).eliminarZona(datos.campaniaId, zonaId),
      buscarCiudades: async (texto) => (await fuenteSimulada()).buscarCiudades(datos.campaniaId, texto),
      agregarCiudad: async (catalogoId) => (await fuenteSimulada()).agregarCiudad(datos.campaniaId, catalogoId),
    }),
    [datos.campaniaId],
  );

  return <ZonasCampania datos={datos} acciones={acciones} />;
}
