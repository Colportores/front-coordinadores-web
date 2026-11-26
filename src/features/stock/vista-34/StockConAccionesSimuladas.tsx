"use client";

import { useState } from "react";

import type { DatosDeStock } from "@/datos/stock/contrato";
import { crearAccionesSimuladas } from "@/datos/stock/simulado";

import { StockVista } from "./StockVista";

/**
 * La vista 34 con «Pedir transferencia de materiales» simulado (se resuelve en el navegador y no se guarda). Es lo único que hay
 * hasta que se conecte `pedir_transferencia_de_stock` (V2, después del 20/11): ahí este componente pasa a recibir server actions
 * con el mismo contrato.
 */
export function StockConAccionesSimuladas({ datos }: { datos: DatosDeStock }) {
  const [acciones] = useState(() => crearAccionesSimuladas(datos));
  return <StockVista datos={datos} acciones={acciones} />;
}
