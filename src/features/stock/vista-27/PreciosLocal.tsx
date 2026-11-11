"use client";

import { useEffect, useState } from "react";

import type { DatosDePrecios } from "@/datos/precios";

import { EsqueletoDePrecios } from "./EsqueletoDePrecios";
import { PreciosConAccionesSimuladas } from "./PreciosConAccionesSimuladas";

/**
 * La vista 27 para el sitio de prueba (GitHub Pages, export estático): sin servidor, los datos se arman en el navegador con la
 * fuente SIMULADA (nunca el selector `fuentePrecios`) y las acciones también. Se carga con `import()` para que los datos de
 * ejemplo vayan en un chunk aparte.
 */
export function PreciosLocal() {
  const [datos, setDatos] = useState<DatosDePrecios | null | undefined>(undefined);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vigente = true;
    void import("@/datos/precios/simulado")
      .then((m) => m.fuentePreciosSimulada.obtenerPrecios())
      .then((cargados) => {
        if (vigente) setDatos(cargados);
      })
      .catch(() => {
        if (vigente) setFallo(true);
      });
    return () => {
      vigente = false;
    };
  }, []);

  if (fallo) {
    return (
      <p role="alert" className="text-nav text-tinta">
        No se pudieron cargar los precios. Recargá la página para probar de nuevo.
      </p>
    );
  }
  if (!datos) return <EsqueletoDePrecios />;
  return <PreciosConAccionesSimuladas datos={datos} />;
}
