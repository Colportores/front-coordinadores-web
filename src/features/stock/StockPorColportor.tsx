import type { StockPorColportor as FilaStockColportor } from "@/datos/stock";
import { cn } from "@/lib/utils";

/** Stock por colportor (HU-STK-004), con alerta cuando el stock está bajo. */
export function StockPorColportor({ stock }: { stock: FilaStockColportor[] }) {
  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="border-b border-borde px-4 pt-3.5 pb-2.5 font-serif text-titulo font-semibold text-tinta">
        Stock por colportor
      </div>
      {stock.length === 0 ? (
        <p className="px-4 pt-2 pb-3.5 text-cuerpo text-tinta-suave">No hay colportores con stock registrado.</p>
      ) : (
        <ul className="flex flex-col px-4 pt-2 pb-3">
          {stock.map((fila, indice) => (
            <li
              key={fila.colportorId}
              className={cn(
                "flex items-center justify-between py-2 text-cuerpo",
                indice < stock.length - 1 && "border-b border-borde-suave",
              )}
            >
              <span className={cn("font-semibold", fila.stockBajo ? "text-peligro" : "text-tinta")}>
                {fila.nombre}
              </span>
              <span className={cn("font-mono", fila.stockBajo ? "font-medium text-peligro" : "text-tinta")}>
                {fila.stockBajo && <span aria-hidden="true">⚠ </span>}
                {fila.libros} libros
                {fila.stockBajo && <span className="sr-only"> — stock bajo</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
