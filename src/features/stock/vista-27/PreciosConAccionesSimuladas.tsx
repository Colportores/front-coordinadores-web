"use client";

import { useState } from "react";

import type { AccionesPrecios, DatosDePrecios } from "@/datos/precios";

import { PreciosVista } from "./PreciosVista";

/** Acciones que validan como el servidor y contestan que sí, sin guardar nada (para el sitio de prueba y los tests). */
export function PreciosConAccionesSimuladas({ datos }: { datos: DatosDePrecios }) {
  const [acciones] = useState<AccionesPrecios>(() => ({
    async guardarPrecios(ciudadId, cambios) {
      const { fuentePreciosSimulada } = await import("@/datos/precios/simulado");
      return fuentePreciosSimulada.guardarPrecios(datos.campaniaId, ciudadId, cambios);
    },
  }));
  return <PreciosVista datos={datos} acciones={acciones} />;
}
