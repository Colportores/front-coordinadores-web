"use client";

import { useEffect, useState } from "react";

import type { DatosDeValidacion } from "@/datos/cuentas/validar";

import { ValidarTicketsConAccionesSimuladas } from "./ValidarTicketsConAccionesSimuladas";

/**
 * La vista 29 para el sitio de prueba (GitHub Pages, export estático): sin servidor, los datos se arman en el navegador con
 * la fuente SIMULADA (nunca el selector `fuenteValidarTickets`) a la hora de abrir la página. Se carga con `import()` para
 * que los datos de ejemplo vayan en un chunk aparte.
 */
export function ValidarTicketsLocal() {
  const [datos, setDatos] = useState<DatosDeValidacion | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vigente = true;
    void import("@/datos/cuentas/validar/simulado")
      .then((m) => m.fuenteValidarTicketsSimulada.obtenerPorValidar())
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
      <p role="alert" className="px-[22px] py-5 text-nav text-tinta">
        No se pudieron cargar los tickets. Recargá la página para probar de nuevo.
      </p>
    );
  }
  if (!datos) {
    return (
      <p role="status" className="px-[22px] py-5 text-nav text-tinta-suave">
        Cargando los tickets…
      </p>
    );
  }
  return <ValidarTicketsConAccionesSimuladas datos={datos} />;
}
