"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { DatosDeCuentas } from "@/datos/cuentas";
import { CuentasConAccionesSimuladas } from "@/features/cuentas/CuentasConAccionesSimuladas";
import { PARAMETRO_COLPORTOR, preseleccionDe } from "@/features/cuentas/preseleccion";

/**
 * La vista 36 con el colportor que manda la URL (`/cuentas?colportor=<id>`, el «Ver en Cuentas →» de Stock, #91). Lee el
 * parámetro en el navegador y no en el servidor para que valga también en el sitio de prueba (export estático). La vista lo toma
 * una sola vez, al abrir: después se quita de la dirección para que recargar o volver no repita el aviso.
 */
export function CuentasDesdeUrl({ datos }: { datos: DatosDeCuentas }) {
  const parametros = useSearchParams();
  const pedido = parametros?.get(PARAMETRO_COLPORTOR) ?? null;
  // Una sola vez: cuando el parámetro se quita de la dirección, la vista no vuelve a «todas».
  const [preseleccion] = useState(() => preseleccionDe(datos, pedido));

  useEffect(() => {
    if (pedido === null) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAMETRO_COLPORTOR);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [pedido]);

  return <CuentasConAccionesSimuladas datos={datos} preseleccion={preseleccion} />;
}
