import { Button } from "@/components/ui/button";
import type { DatosAcompanamiento } from "@/datos/equipo/contrato";

/** Jornadas finalizadas sin acompañamiento registrado y el % acompañado de la campaña. */
export function Acompanamientos({ datos }: { datos: DatosAcompanamiento }) {
  const { jornadasSinAcompanamiento, porcentajeJornadasAcompanadas } = datos;

  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="border-b border-borde px-4 pt-[14px] pb-2.5 font-serif text-titulo font-semibold text-tinta">
        Acompañamientos
      </div>
      <div className="flex flex-col gap-2.5 px-4 py-3">
        {jornadasSinAcompanamiento.length === 0 ? (
          <p className="text-mini text-tinta-suave">No hay jornadas pendientes de acompañamiento.</p>
        ) : (
          jornadasSinAcompanamiento.map((j) => (
            <div key={j.id} className="flex flex-col gap-1 rounded-control border border-borde px-3 py-[11px]">
              <span className="text-cuerpo font-semibold text-tinta">{j.titulo}</span>
              <span className="text-mini text-tinta-suave">{j.detalle}</span>
              {/* El formulario para registrar acompañamiento todavía no está diseñado: queda sin comportamiento. */}
              <Button
                type="button"
                size="xs"
                className="mt-1 h-auto w-fit rounded-control px-3 py-[5px] text-mini font-semibold"
              >
                Registrar acompañamiento
              </Button>
            </div>
          ))
        )}
        <div className="flex items-center justify-between px-px py-0.5 text-cuerpo">
          <span className="text-tinta-suave">Jornadas acompañadas esta campaña</span>
          <span className="font-mono font-medium text-tinta">{porcentajeJornadasAcompanadas}%</span>
        </div>
      </div>
    </div>
  );
}
