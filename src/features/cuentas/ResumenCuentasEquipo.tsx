import type { ResumenCuentasEquipo as ResumenCuentasEquipoDatos } from "@/datos/cuentas";
import { formatMonto } from "@/features/cuentas/formato";

/**
 * Encabezado de la pestaña Cuentas: título y los dos KPI del equipo
 * (deuda total, depositado en la campaña). HU-CTA-005.
 *
 * Nota: el título usa 21px y las cifras 19px, tamaños que no están en la
 * escala de tokens de `globals.css` (se repiten así en Inicio, Equipo,
 * Stock y Reportes) — valor arbitrario de Tailwind, como permite
 * docs/PESTANAS.md para medidas sueltas del diseño. Pendiente para
 * Cristian: sumar un token de tamaño para el título de pestaña.
 */
export function ResumenCuentasEquipo({ resumen }: { resumen: ResumenCuentasEquipoDatos }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-serif text-[21px] font-semibold text-tinta">Estado de cuenta del equipo</h2>
      <div className="flex items-center gap-6">
        <Kpi etiqueta="DEUDA TOTAL EQUIPO" valor={resumen.deudaTotal} className="text-peligro" />
        <Kpi etiqueta="DEPOSITADO CAMPAÑA" valor={resumen.depositadoCampania} className="text-exito" />
      </div>
    </div>
  );
}

function Kpi({ etiqueta, valor, className }: { etiqueta: string; valor: number; className: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">{etiqueta}</span>
      <span className={`font-serif text-[19px] font-semibold ${className}`}>{formatMonto(valor)}</span>
    </div>
  );
}
