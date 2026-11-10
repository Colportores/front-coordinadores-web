import type { DestinoDeAlquiler } from "@/datos/cuentas";
import { Pastilla } from "@/features/cuentas/TablaDeFilas";
import { formatMonto } from "@/features/cuentas/formato";
import { ETIQUETA_DE_DESTINO, type AlquilerDecidible } from "@/features/cuentas/por-decidir";
import { cn } from "@/lib/utils";

/**
 * Lo pagado de una fila «por decidir»: lo que sigue contando y, si se devolvió algo, ese monto tachado (41A·06). El tachado
 * no es lo único que lo dice: el lector de pantalla oye «devuelto».
 */
export function CeldaDePagado({ pagado, devuelto }: { pagado: number; devuelto: number }) {
  return (
    <span className="flex flex-col items-end">
      {(pagado > 0 || devuelto === 0) && <span className="font-mono">{formatMonto(pagado)}</span>}
      {devuelto > 0 && (
        <span className="font-mono text-tinta-suave line-through" title="Devuelto al colportor">
          <span className="sr-only">devuelto </span>
          {formatMonto(devuelto)}
        </span>
      )}
    </span>
  );
}

/**
 * El estado de una fila que decide el coordinador: «◔ Por decidir» mientras falte algo, las pastillas de lo decidido (una por
 * destino) cuando ya no, o «Sin pagos» si no pagó nada (41B·01).
 */
export function EstadoDecidible({ alquiler, pagado }: { alquiler: AlquilerDecidible; pagado: number }) {
  if (alquiler.porDecidir > 0) return <Pastilla tono="alerta">◔ Por decidir</Pastilla>;
  const destinos = [...new Set(alquiler.decisiones.map((d) => d.destino))] as DestinoDeAlquiler[];
  if (destinos.length === 0) {
    return <span className="text-mini text-tinta-suave">{pagado === 0 && alquiler.devuelto === 0 ? "Sin pagos" : "—"}</span>;
  }
  return (
    <span className="flex flex-col items-start gap-1 whitespace-normal">
      {destinos.map((destino) => (
        <Pastilla key={destino} tono="neutro">
          {ETIQUETA_DE_DESTINO[destino]}
        </Pastilla>
      ))}
    </span>
  );
}

const VARIANTES = {
  "por-decidir": { borde: "border-solid border-[#A98330]", fondo: "bg-[#A98330]", icono: "!" },
  "sin-conexion": { borde: "border-dashed border-tinta-suave", fondo: "bg-tinta-suave", icono: "✕" },
} as const;

/**
 * La franja de la pestaña Alquiler: cuánto falta decidir (41A·01, 41B·01) o, sin conexión, que se ve pero no se decide (41B·03).
 * Anuncia los cambios con `aria-live` (no es un segundo `role=status`: ese es el del aviso de las escrituras).
 */
export function AvisoDeAlquiler({ variante, texto }: { variante: keyof typeof VARIANTES; texto: string }) {
  const v = VARIANTES[variante];
  return (
    <div aria-live="polite" className={cn("flex items-center gap-3 rounded-tarjeta border-[1.5px] bg-superficie px-3.5 py-2.5", v.borde)}>
      <span aria-hidden className={cn("grid size-5 flex-none place-items-center rounded-full text-[11px] font-bold text-superficie", v.fondo)}>
        {v.icono}
      </span>
      <span className="flex-1 text-[12.5px] leading-[1.45] text-pretty text-tinta [overflow-wrap:anywhere]">{texto}</span>
    </div>
  );
}
