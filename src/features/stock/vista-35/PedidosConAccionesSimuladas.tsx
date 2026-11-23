"use client";

import { useState } from "react";

import type { DatosDePedidos } from "@/datos/stock/pedidos";
import { crearAccionesSimuladas } from "@/datos/stock/pedidos/simulado";

import type { Pestana } from "./modelo";
import { PedidosVista } from "./PedidosVista";

/**
 * La vista 35 con las decisiones simuladas (se resuelven en el navegador y no se guardan). Es lo único que hay hasta que se
 * conecten las RPC de la bandeja (V2, después del 20/11): ahí este componente pasa a recibir server actions con el mismo
 * contrato.
 */
export function PedidosConAccionesSimuladas({
  datos,
  ciudadInicialId,
  pestanaInicial,
}: {
  datos: DatosDePedidos;
  ciudadInicialId?: string | null;
  pestanaInicial?: Pestana | null;
}) {
  const [acciones] = useState(() => crearAccionesSimuladas());
  return <PedidosVista datos={datos} acciones={acciones} ciudadInicialId={ciudadInicialId} pestanaInicial={pestanaInicial} />;
}
