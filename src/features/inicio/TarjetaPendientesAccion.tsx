import Link from "next/link";

import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import { pestanaVisible } from "@/config/flags";
import type { PendienteAccion, PuntoMapaRegion, TonoPendiente } from "@/datos/inicio";
import { MiniMapaRegion } from "@/features/inicio/MiniMapaRegion";
import { cn } from "@/lib/utils";

const CLASE_ACCION_PRINCIPAL = "rounded-control bg-marca px-3 py-[5px] text-mini font-semibold text-superficie";

const ETIQUETA_TONO: Record<TonoPendiente, string> = {
  hoy: "bg-alerta-fondo text-alerta",
  atraso: "bg-peligro-fondo text-peligro",
  "por-autorizar": "bg-alerta-fondo text-alerta",
  nueva: "bg-marca-clara text-marca-media",
};

/**
 * "Pendientes de acción": validaciones, autorizaciones y asignaciones que
 * esperan al coordinador, con el mini mapa de la región debajo.
 * Los atajos llevan a la pestaña donde se resuelve cada pendiente; los
 * botones sin formulario diseñado (rechazar, ver foto) quedan sin comportamiento.
 */
export function TarjetaPendientesAccion({
  pendientes,
  mapa,
}: {
  pendientes: PendienteAccion[];
  mapa: PuntoMapaRegion[];
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="border-b border-borde px-4 pt-[14px] pb-[10px] font-serif text-titulo font-semibold">
        Pendientes de acción
      </div>

      <div className="flex flex-col gap-[10px] px-4 py-3">
        {pendientes.length === 0 ? (
          <p className="text-chico text-tinta-suave">No tenés pendientes por ahora.</p>
        ) : (
          pendientes.map((pendiente) => (
            <div key={pendiente.id} className="flex flex-col gap-[3px] rounded-control border border-borde p-[11px]">
              <div className="flex justify-between text-cuerpo">
                <span className="font-semibold">{pendiente.titulo}</span>
                <span
                  className={cn(
                    "rounded-pastilla px-[7px] py-0.5 text-mini font-semibold",
                    ETIQUETA_TONO[pendiente.tono],
                  )}
                >
                  {pendiente.etiqueta}
                </span>
              </div>
              <div className="text-[11.5px] text-tinta-suave">{pendiente.detalle}</div>
              <div className="mt-[5px] flex gap-2">
                {pestanaVisible(pendiente.accionPrincipal.pestana) ? (
                  <Link href={pendiente.accionPrincipal.href} className={CLASE_ACCION_PRINCIPAL}>
                    {pendiente.accionPrincipal.texto}
                  </Link>
                ) : (
                  <AccionNoDisponible className={CLASE_ACCION_PRINCIPAL}>
                    {pendiente.accionPrincipal.texto}
                  </AccionNoDisponible>
                )}
                {pendiente.accionSecundaria && (
                  <AccionNoDisponible
                    className={cn(
                      "rounded-control border border-borde px-3 py-[5px] text-mini font-semibold",
                      pendiente.accionSecundaria.tono === "peligro" ? "text-peligro" : "text-tinta-2",
                    )}
                  >
                    {pendiente.accionSecundaria.texto}
                  </AccionNoDisponible>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-borde px-4 py-3">
        <MiniMapaRegion puntos={mapa} />
      </div>
    </div>
  );
}
