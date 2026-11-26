"use client";

import { useState } from "react";

import type { AccionesPedidos, DatosDePedidos } from "@/datos/stock/pedidos";
import { crearAccionesSimuladas } from "@/datos/stock/pedidos/simulado";

import type { Pestana } from "./modelo";
import { PedidosVista } from "./PedidosVista";

/**
 * La vista 35 con sus acciones: las server actions que arma la página cuando hay Supabase (#215) o, sin ellas, las decisiones
 * simuladas (se resuelven en el navegador y no se guardan: el sitio de prueba y el panel sin conectar).
 */
export function PedidosConAcciones({
  datos,
  acciones,
  ciudadInicialId,
  pestanaInicial,
}: {
  datos: DatosDePedidos;
  acciones?: AccionesPedidos;
  ciudadInicialId?: string | null;
  pestanaInicial?: Pestana | null;
}) {
  const [simuladas] = useState(() => crearAccionesSimuladas());
  return <PedidosVista datos={datos} acciones={acciones ?? simuladas} ciudadInicialId={ciudadInicialId} pestanaInicial={pestanaInicial} />;
}
