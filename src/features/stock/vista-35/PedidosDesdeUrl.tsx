"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { AccionesPedidos, DatosDePedidos } from "@/datos/stock/pedidos";

import { PedidosConAcciones } from "./PedidosConAcciones";
import { PARAMETRO_CIUDAD, PARAMETRO_PESTANA, pestanaDeUrl } from "./preseleccion";

/**
 * La vista 35 con la ciudad y la pestaña que manda la URL (`/stock/pedidos?ciudad=<id>&pestana=transferencias`, el «Ver
 * pedidos» y el «Ver transferencias» de Stock, #91). Lee los parámetros en el navegador y no en el servidor para que valgan
 * también en el sitio de prueba (export estático). `acciones` son las server actions con Supabase (#215); sin ellas, las simuladas. La vista los toma una sola vez, al abrir: después se quitan de la dirección.
 */
export function PedidosDesdeUrl({ datos, acciones }: { datos: DatosDePedidos; acciones?: AccionesPedidos }) {
  const parametros = useSearchParams();
  const ciudad = parametros?.get(PARAMETRO_CIUDAD) ?? null;
  const pestana = parametros?.get(PARAMETRO_PESTANA) ?? null;
  const [inicio] = useState(() => ({ ciudad, pestana: pestanaDeUrl(pestana) }));

  useEffect(() => {
    if (ciudad === null && pestana === null) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAMETRO_CIUDAD);
    url.searchParams.delete(PARAMETRO_PESTANA);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [ciudad, pestana]);

  return <PedidosConAcciones datos={datos} acciones={acciones} ciudadInicialId={inicio.ciudad} pestanaInicial={inicio.pestana} />;
}
