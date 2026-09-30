import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { ColportorSinZona } from "@/datos/equipo/contrato";

/** Colportores agregados al equipo que todavía no tienen zona. */
export function SinZonaAsignada({ colportores }: { colportores: ColportorSinZona[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border border-alerta-punto bg-superficie-calida px-4 py-[13px]">
      <span className="text-cuerpo font-semibold text-tinta">Sin zona asignada · {colportores.length}</span>
      {colportores.length === 0 ? (
        <span className="text-mini text-tinta-suave">Todo el equipo tiene zona asignada.</span>
      ) : (
        colportores.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5">
            <span className="text-mini text-tinta-suave">
              {c.nombre} · {c.nota}
            </span>
            <Button asChild size="xs" className="h-auto w-fit rounded-control px-3 py-[5px] text-mini font-semibold">
              <Link href="/equipo/zonas">Asignar zona</Link>
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
