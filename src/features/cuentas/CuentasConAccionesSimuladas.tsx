"use client";

import { useState } from "react";

import type { DatosDeCuentas } from "@/datos/cuentas";
import { crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { CuentasVista } from "@/features/cuentas/CuentasVista";

/**
 * La vista 36 con las escrituras simuladas (se resuelven en el navegador y no se guardan). Es lo único que hay hasta que se
 * conecten las RPC (V2, después del 20/11): ahí este componente pasa a recibir server actions con el mismo contrato.
 */
export function CuentasConAccionesSimuladas({ datos }: { datos: DatosDeCuentas }) {
  const [acciones] = useState(() => crearAccionesSimuladas());
  return <CuentasVista datos={datos} acciones={acciones} />;
}
