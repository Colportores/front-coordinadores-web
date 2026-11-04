import type { ItemDePrecio } from "@/datos/precios";
import { cn } from "@/lib/utils";

import { etiquetasDe, type TonoDeEtiqueta } from "./modelo";

const CLASES_DE_ETIQUETA: Record<TonoDeEtiqueta, string> = {
  bonificable: "bg-marca-clara text-marca-media",
  misionero: "bg-exito-fondo text-exito",
  revista: "bg-alerta-fondo text-alerta",
  coleccion: "bg-marca text-superficie",
};

/** Cuántos componentes de baja dejan al combo sin ofrecerse hasta corregirlo (HU-CAT-009). Sin artboard: texto decidido en el mapa §2 (04/11). */
export function textoDeComponentesDeBaja(n: number): string {
  return n === 1
    ? "1 componente está dado de baja: el combo no se ofrece hasta que Administración lo corrija."
    : `${n} componentes están dados de baja: el combo no se ofrece hasta que Administración lo corrija.`;
}

/** La primera celda de cada fila: el nombre, sus insignias y, en una colección, lo que lleva. */
export function NombreDeItem({ item }: { item: ItemDePrecio }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 text-cuerpo font-semibold wrap-anywhere text-tinta">{item.nombre}</span>
        {etiquetasDe(item).map((etiqueta) => (
          <span
            key={etiqueta.texto}
            className={cn("rounded-pastilla px-[7px] py-px text-mini font-semibold whitespace-nowrap", CLASES_DE_ETIQUETA[etiqueta.tono])}
          >
            {etiqueta.texto}
          </span>
        ))}
      </div>
      {item.detalle && <span className="text-chico wrap-anywhere text-tinta-suave">{item.detalle}</span>}
      {item.componentesDeBaja > 0 && (
        <span className="text-chico wrap-anywhere text-alerta">{textoDeComponentesDeBaja(item.componentesDeBaja)}</span>
      )}
    </div>
  );
}
