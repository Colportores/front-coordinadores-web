"use client";

import { useMemo } from "react";

import { fuenteZonas } from "@/datos/equipo/zonas";
import type { DatosZonas } from "@/datos/equipo/zonas";
import { ZonasCampania, type AccionesZonas } from "@/features/equipo/zonas/ZonasCampania";

/**
 * La vista 24 para el sitio de prueba (GitHub Pages, export estático): sin
 * servidor no hay server actions, así que las acciones le hablan a la fuente
 * simulada desde el navegador. El estado vive en la pestaña: al recargar vuelve
 * a los datos de ejemplo.
 */
export function ZonasCampaniaLocal({ datos }: { datos: DatosZonas }) {
  const acciones = useMemo<AccionesZonas>(
    () => ({
      esquinaMasCercana: (ciudadId, punto) => fuenteZonas.esquinaMasCercana(ciudadId, punto),
      tramoPorCalles: (ciudadId, desde, hasta) => fuenteZonas.tramoPorCalles(ciudadId, desde, hasta),
      vistaPreviaZona: (entrada) => fuenteZonas.vistaPreviaZona(entrada),
      guardarZona: (entrada) => fuenteZonas.guardarZona(entrada),
      asignarZona: (usuarioId, zonaId) => fuenteZonas.asignarZona(datos.campaniaId, usuarioId, zonaId),
      quitarZona: (usuarioId) => fuenteZonas.quitarZona(datos.campaniaId, usuarioId),
      eliminarZona: (zonaId) => fuenteZonas.eliminarZona(datos.campaniaId, zonaId),
      buscarCiudades: (texto) => fuenteZonas.buscarCiudades(datos.campaniaId, texto),
      agregarCiudad: (catalogoId) => fuenteZonas.agregarCiudad(datos.campaniaId, catalogoId),
    }),
    [datos.campaniaId],
  );

  return <ZonasCampania datos={datos} acciones={acciones} />;
}
