import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EstadoPedidoCasaEditora, PedidoCasaEditora } from "@/datos/stock";
import { formatearMonto } from "@/features/stock/formato";
import { cn } from "@/lib/utils";

const ETIQUETA_ESTADO: Record<EstadoPedidoCasaEditora, string> = {
  por_autorizar: "Por autorizar",
  despachado: "Despachado",
  entregado: "Entregado",
};

const CLASE_ESTADO: Record<EstadoPedidoCasaEditora, string> = {
  por_autorizar: "bg-alerta-fondo text-alerta",
  despachado: "bg-marca-clara text-marca-media",
  entregado: "bg-exito-fondo text-exito",
};

/**
 * Lista de pedidos a casa editora del equipo (HU-STK-001). El botón
 * "Autorizar" de la fila por autorizar no tiene formulario diseñado todavía
 * (HU-STK-003, autorización según situación financiera): queda sin comportamiento.
 */
export function PedidosCasaEditora({ pedidos }: { pedidos: PedidoCasaEditora[] }) {
  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="px-[18px] pt-3.5 pb-2.5 font-serif text-titulo font-semibold text-tinta">
        Pedidos a casa editora
      </div>
      {pedidos.length === 0 ? (
        <p className="px-[18px] pb-4 text-cuerpo text-tinta-suave">Todavía no hay pedidos a casa editora.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-borde hover:bg-transparent">
              <TableHead className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">
                N°
              </TableHead>
              <TableHead className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">
                Solicita
              </TableHead>
              <TableHead className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">
                Libros
              </TableHead>
              <TableHead className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">
                Monto
              </TableHead>
              <TableHead className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">
                Estado
              </TableHead>
              <TableHead>
                <span className="sr-only">Acción</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pedidos.map((pedido) => (
              <TableRow
                key={pedido.id}
                className={cn(
                  "border-borde-suave text-cuerpo hover:bg-transparent",
                  pedido.estado === "por_autorizar" && "bg-superficie-calida",
                )}
              >
                <TableCell className="font-mono text-tinta">{pedido.id}</TableCell>
                <TableCell className="text-tinta-suave">{pedido.solicitante}</TableCell>
                <TableCell className="text-tinta">{pedido.libros}</TableCell>
                <TableCell className="font-mono text-tinta">{formatearMonto(pedido.monto)}</TableCell>
                <TableCell>
                  <Badge className={cn("rounded-pastilla text-[10px] font-semibold uppercase", CLASE_ESTADO[pedido.estado])}>
                    {ETIQUETA_ESTADO[pedido.estado]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {pedido.estado === "por_autorizar" ? (
                    <Button size="sm" className="rounded-control bg-marca text-superficie hover:bg-marca/90">
                      Autorizar
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="px-0 font-semibold text-marca-media hover:bg-transparent hover:text-marca-media">
                      Ver
                    </Button>
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
