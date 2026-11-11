"use client";

import { useState } from "react";

import type { DatosDeValidacion } from "@/datos/cuentas/validar";
import { crearAccionesDeValidacionSimuladas } from "@/datos/cuentas/validar/simulado";

import { ValidarTicketsVista } from "./ValidarTicketsVista";

/**
 * La vista 29 con las decisiones simuladas (se resuelven en el navegador y no se guardan), como el resto de Cuentas hasta
 * que se conecten las RPC: ahí este componente pasa a recibir server actions con el mismo contrato.
 */
export function ValidarTicketsConAccionesSimuladas({ datos }: { datos: DatosDeValidacion }) {
  const [acciones] = useState(() => crearAccionesDeValidacionSimuladas());
  return <ValidarTicketsVista datos={datos} acciones={acciones} />;
}
