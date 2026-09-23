import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EstadoTransferencia, TransferenciaStock } from "@/datos/stock";
import { cn } from "@/lib/utils";

const ETIQUETA_ESTADO_RESUELTO: Partial<Record<EstadoTransferencia, string>> = {
  autorizada: "Autorizada",
  rechazada: "Rechazada",
};

const CLASE_ESTADO_RESUELTO: Partial<Record<EstadoTransferencia, string>> = {
  autorizada: "bg-exito-fondo text-exito",
  rechazada: "bg-peligro-fondo text-peligro",
};

/**
 * Transferencias de stock entre colportores (HU-STK-005: el colportor la
 * solicita, el coordinador la autoriza o rechaza acá). "Autorizar" y
 * "Rechazar" no tienen formulario diseñado: quedan sin comportamiento.
 */
export function TransferenciasColportores({ transferencias }: { transferencias: TransferenciaStock[] }) {
  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="px-[18px] pt-3.5 pb-2.5 font-serif text-titulo font-semibold text-tinta">
        Transferencias entre colportores
      </div>
      {transferencias.length === 0 ? (
        <p className="px-[18px] pb-4 text-cuerpo text-tinta-suave">No hay transferencias entre colportores.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-borde hover:bg-transparent">
              <TableHead className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">
                De
              </TableHead>
              <TableHead className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">
                Para
              </TableHead>
              <TableHead className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">
                Producto
              </TableHead>
              <TableHead className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">
                Cant.
              </TableHead>
              <TableHead>
                <span className="sr-only">Estado / acción</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transferencias.map((t) => (
              <TableRow
                key={t.id}
                className={cn(
                  "border-borde-suave text-cuerpo hover:bg-transparent",
                  t.estado === "por_autorizar" && "bg-superficie-calida",
                )}
              >
                <TableCell className="font-semibold text-tinta">{t.colportorOrigen}</TableCell>
                <TableCell className="font-semibold text-tinta">{t.colportorDestino}</TableCell>
                <TableCell className="text-tinta-suave">{t.producto}</TableCell>
                <TableCell className="text-tinta">{t.cantidad}</TableCell>
                <TableCell>
                  {t.estado === "por_autorizar" ? (
                    <div className="flex gap-2">
                      <Button size="sm" className="rounded-control bg-marca text-superficie hover:bg-marca/90">
                        Autorizar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-control border-borde text-peligro hover:bg-peligro-fondo hover:text-peligro"
                      >
                        Rechazar
                      </Button>
                    </div>
                  ) : (
                    <Badge
                      className={cn(
                        "rounded-pastilla text-[10px] font-semibold uppercase",
                        CLASE_ESTADO_RESUELTO[t.estado],
                      )}
                    >
                      {ETIQUETA_ESTADO_RESUELTO[t.estado]}
                      {t.fechaResolucion ? ` · ${t.fechaResolucion}` : ""}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
