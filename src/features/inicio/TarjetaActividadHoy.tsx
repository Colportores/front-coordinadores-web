import Link from "next/link";

import type { ActividadColportorHoy, EstadoJornadaColportor } from "@/datos/inicio";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const ESTADO: Record<EstadoJornadaColportor, { etiqueta: string; punto: string; texto: string }> = {
  "en-jornada": { etiqueta: "En jornada", punto: "bg-exito", texto: "text-exito" },
  finalizada: { etiqueta: "Finalizada", punto: "bg-tinta-tenue", texto: "text-tinta-suave" },
  "sin-iniciar": { etiqueta: "Sin iniciar", punto: "bg-alerta-punto", texto: "text-alerta" },
};

/** Tabla "Actividad de hoy": quién está en jornada, dónde y cuánto vendió. */
export function TarjetaActividadHoy({ filas }: { filas: ActividadColportorHoy[] }) {
  return (
    <div className="rounded-tarjeta border border-borde bg-superficie">
      <div className="flex items-baseline justify-between px-[18px] pt-[14px] pb-[10px]">
        <span className="font-serif text-titulo font-semibold">Actividad de hoy</span>
        <Link href="/equipo" className="text-mini font-semibold text-marca-media hover:underline">
          Ver equipo →
        </Link>
      </div>

      {filas.length === 0 ? (
        <p className="px-[18px] pb-4 text-chico text-tinta-suave">Todavía no hay actividad registrada hoy.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[29%] px-[18px] text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">
                Colportor
              </TableHead>
              <TableHead className="w-[22%] text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">
                Zona
              </TableHead>
              <TableHead className="w-[16%] text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">
                Horas hoy
              </TableHead>
              <TableHead className="w-[16%] text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">
                Ventas hoy
              </TableHead>
              <TableHead className="w-[17%] px-[18px] text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">
                Estado
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => {
              const estado = ESTADO[fila.estado];
              return (
                <TableRow
                  key={fila.id}
                  className={cn("border-borde-suave hover:bg-transparent", fila.estado === "sin-iniciar" && "bg-superficie-calida")}
                >
                  <TableCell className="px-[18px] py-[11px] text-cuerpo font-semibold whitespace-normal">
                    {fila.colportor}
                  </TableCell>
                  <TableCell className="py-[11px] text-cuerpo text-tinta-suave whitespace-normal">
                    {fila.zona}
                  </TableCell>
                  <TableCell className="py-[11px] font-mono text-cuerpo">
                    {fila.horasHoy ?? <span className="text-tinta-tenue">—</span>}
                  </TableCell>
                  <TableCell className="py-[11px] font-mono text-cuerpo">
                    {fila.ventasHoy ?? <span className="text-tinta-tenue">—</span>}
                  </TableCell>
                  <TableCell className="px-[18px] py-[11px]">
                    <span className={cn("inline-flex items-center gap-1.5 text-mini font-semibold", estado.texto)}>
                      <span className={cn("size-[7px] rounded-full", estado.punto)} />
                      {estado.etiqueta}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
