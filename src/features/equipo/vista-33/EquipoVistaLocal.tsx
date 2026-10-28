"use client";

import { useMemo } from "react";

import type { DatosEquipoPorCiudad, FuenteDatosEquipo } from "@/datos/equipo";

import type { AccionesEquipo } from "./acciones";
import { EquipoVista } from "./EquipoVista";

/**
 * Siempre la fuente SIMULADA, no el selector `fuenteEquipo` (`@/datos/equipo`): el sitio de prueba no puede hablar con
 * otra fuente el día que `index.ts` apunte a la real. Se carga con `import()` para que sus datos de ejemplo vayan en un
 * chunk aparte, que el navegador baja solo cuando se abren las jornadas o se registra un acompañamiento.
 */
let simulada: Promise<FuenteDatosEquipo> | undefined;
function fuenteSimulada(): Promise<FuenteDatosEquipo> {
  simulada ??= import("@/datos/equipo/simulado").then((m) => m.fuenteEquipoSimulada);
  return simulada;
}

/**
 * La vista 33 para el sitio de prueba (GitHub Pages, export estático): sin servidor no hay server actions, así que las
 * jornadas, el registro y las becas le hablan a la fuente simulada desde el navegador. El estado vive en la pestaña: al recargar
 * vuelve a los datos de ejemplo.
 */
export function EquipoVistaLocal({ datos }: { datos: DatosEquipoPorCiudad }) {
  const acciones = useMemo<AccionesEquipo>(
    () => ({
      jornadasParaAcompanar: async (colportorId) => (await fuenteSimulada()).jornadasParaAcompanar(datos.campaniaId, colportorId),
      registrarAcompanamiento: async (jornadaId, datosDelRegistro) =>
        (await fuenteSimulada()).registrarAcompanamiento(datos.campaniaId, jornadaId, datosDelRegistro),
      elegirCarrera: async (colportorId, carreraId) => (await fuenteSimulada()).elegirCarrera(datos.campaniaId, colportorId, carreraId),
      asignarTipoDeBeca: async (colportorId, tipo) => (await fuenteSimulada()).asignarTipoDeBeca(datos.campaniaId, colportorId, tipo),
    }),
    [datos.campaniaId],
  );
  return <EquipoVista datos={datos} acciones={acciones} />;
}
