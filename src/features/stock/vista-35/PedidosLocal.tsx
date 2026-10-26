"use client";

import { useEffect, useState } from "react";

import type { DatosDePedidos } from "@/datos/stock/pedidos";

import { PedidosConAccionesSimuladas } from "./PedidosConAccionesSimuladas";
import { SinCampaniaParaPedidos } from "./SinCampaniaParaPedidos";

/**
 * La vista 35 para el sitio de prueba (GitHub Pages, export estático): sin servidor, los datos se arman en el navegador con la
 * fuente SIMULADA (nunca el selector `fuentePedidos`) a la hora de abrir la página, así «hace 3 h» y «ayer» no quedan
 * congelados en la hora del build. Se carga con `import()` para que los datos de ejemplo vayan en un chunk aparte.
 */
export function PedidosLocal() {
  const [datos, setDatos] = useState<DatosDePedidos | null | undefined>(undefined);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vigente = true;
    void import("@/datos/stock/pedidos/simulado")
      .then((m) => m.fuentePedidosSimulada.obtenerPedidos())
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
        No se pudieron cargar los pedidos. Recargá la página para probar de nuevo.
      </p>
    );
  }
  if (datos === undefined) {
    return (
      <p role="status" className="px-[22px] py-5 text-nav text-tinta-suave">
        Cargando los pedidos y las transferencias…
      </p>
    );
  }
  if (datos === null) return <SinCampaniaParaPedidos />;
  return <PedidosConAccionesSimuladas datos={datos} />;
}
