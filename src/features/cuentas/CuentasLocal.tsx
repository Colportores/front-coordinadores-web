"use client";

import { useEffect, useState } from "react";

import type { DatosDeCuentas } from "@/datos/cuentas";
import { CuentasConAccionesSimuladas } from "@/features/cuentas/CuentasConAccionesSimuladas";

/**
 * La vista 36 para el sitio de prueba (GitHub Pages, export estático): sin servidor, los datos se arman en el navegador con
 * la fuente SIMULADA (nunca el selector `fuenteCuentas`) a la hora de abrir la página, así «hoy» y «ayer» no quedan
 * congelados en la hora del build. Se carga con `import()` para que los datos de ejemplo vayan en un chunk aparte.
 */
export function CuentasLocal() {
  const [datos, setDatos] = useState<DatosDeCuentas | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vigente = true;
    void import("@/datos/cuentas/simulado")
      .then((m) => m.fuenteCuentasSimulada.obtenerCuentas())
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
        No se pudieron cargar las cuentas. Recargá la página para probar de nuevo.
      </p>
    );
  }
  if (!datos) {
    return (
      <p role="status" className="px-[22px] py-5 text-nav text-tinta-suave">
        Cargando las cuentas…
      </p>
    );
  }
  return <CuentasConAccionesSimuladas datos={datos} />;
}
