"use client";

import { useState } from "react";

import type { DatosDeCuentas } from "@/datos/cuentas";
import { crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { CuentasVista } from "@/features/cuentas/CuentasVista";
import type { PreseleccionDeCuentas } from "@/features/cuentas/preseleccion";

/**
 * La vista 36 con las escrituras simuladas (se resuelven en el navegador y no se guardan). Es lo único que hay hasta que se
 * conecten las RPC (V2, después del 20/11): ahí este componente pasa a recibir server actions con el mismo contrato.
 */
export function CuentasConAccionesSimuladas({ datos, preseleccion }: { datos: DatosDeCuentas; preseleccion?: PreseleccionDeCuentas }) {
  const [acciones] = useState(() => crearAccionesSimuladas(datos));
  return <CuentasVista datos={datos} acciones={acciones} preseleccion={preseleccion} />;
}
