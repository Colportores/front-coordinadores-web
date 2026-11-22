"use client";

import { useSearchParams } from "next/navigation";
import { type ComponentProps, useEffect } from "react";

import { PARAMETRO_COLPORTOR } from "@/features/equipo/zonas/preseleccion";
import { ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";

type Props = Omit<ComponentProps<typeof ZonasCampania>, "colportorPreseleccionadoId">;

/**
 * La vista 24 con el colportor que manda la URL (`/ciudades?colportor=<id>`, el «Asignar zona» de Inicio, #187). Lee el parámetro
 * en el navegador y no en el servidor para que valga también en el sitio de prueba (export estático). La vista lo toma una sola
 * vez, al abrir: después se quita de la dirección para que recargar o volver no repita el aviso de quien ya se resolvió.
 */
export function ZonasCampaniaDesdeUrl(props: Props) {
  const parametros = useSearchParams();
  const colportorId = parametros?.get(PARAMETRO_COLPORTOR) ?? null;

  useEffect(() => {
    if (colportorId === null) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAMETRO_COLPORTOR);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [colportorId]);

  return <ZonasCampania {...props} colportorPreseleccionadoId={colportorId} />;
}
