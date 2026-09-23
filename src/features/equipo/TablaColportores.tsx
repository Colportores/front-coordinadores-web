"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { pestanaVisible } from "@/config/flags";
import type { EstadoCobro, FilaColportor } from "@/datos/equipo/contrato";
import { cn } from "@/lib/utils";

const CLASE_ESTADO_COBRO: Record<EstadoCobro, string> = {
  bien: "text-exito",
  atencion: "text-alerta",
  critico: "text-peligro",
};

const TODAS_LAS_ZONAS = "__todas__";

interface ZonaConConteo {
  id: string;
  nombre: string;
  cantidad: number;
}

function agruparPorZona(colportores: FilaColportor[]): ZonaConConteo[] {
  const zonas = new Map<string, ZonaConConteo>();
  for (const c of colportores) {
    const actual = zonas.get(c.zonaId);
    if (actual) actual.cantidad += 1;
    else zonas.set(c.zonaId, { id: c.zonaId, nombre: c.zonaNombre, cantidad: 1 });
  }
  return Array.from(zonas.values());
}

function FiltroZona({
  etiqueta,
  activo,
  onClick,
}: {
  etiqueta: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "rounded-pastilla px-3.5 py-[7px] text-chico font-semibold",
        activo ? "bg-marca text-superficie" : "border border-borde bg-superficie text-tinta-2 hover:bg-fondo",
      )}
    >
      {etiqueta}
    </button>
  );
}

/** Tabla de "Mi equipo" con filtro por zona (funciona en cliente sobre los datos simulados). */
export function TablaColportores({ colportores }: { colportores: FilaColportor[] }) {
  const [zonaSeleccionada, setZonaSeleccionada] = useState<string>(TODAS_LAS_ZONAS);
  const zonas = useMemo(() => agruparPorZona(colportores), [colportores]);
  const filas =
    zonaSeleccionada === TODAS_LAS_ZONAS ? colportores : colportores.filter((c) => c.zonaId === zonaSeleccionada);
  // Fuera del modo dev, Cuentas está oculta hasta su conexión en V2 (flag apagado
  // en staging y producción): el link a su ficha no puede llevar a un 404.
  const cuentasVisible = pestanaVisible("cuentas");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar equipo por zona">
        <FiltroZona
          etiqueta={`Todas las zonas · ${colportores.length}`}
          activo={zonaSeleccionada === TODAS_LAS_ZONAS}
          onClick={() => setZonaSeleccionada(TODAS_LAS_ZONAS)}
        />
        {zonas.map((z) => (
          <FiltroZona
            key={z.id}
            etiqueta={`${z.nombre} · ${z.cantidad}`}
            activo={zonaSeleccionada === z.id}
            onClick={() => setZonaSeleccionada(z.id)}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-borde text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">
              <th scope="col" className="px-[18px] py-2.5">
                Colportor
              </th>
              <th scope="col" className="px-2 py-2.5">
                Zona
              </th>
              <th scope="col" className="px-2 py-2.5">
                Horas sem.
              </th>
              <th scope="col" className="px-2 py-2.5">
                Ventas
              </th>
              <th scope="col" className="px-2 py-2.5">
                Cobrado
              </th>
              <th scope="col" className="px-2 py-2.5">
                Última sync
              </th>
              <th scope="col" className="px-[18px] py-2.5">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-[18px] py-6 text-center text-chico text-tinta-suave">
                  No hay colportores en esta zona.
                </td>
              </tr>
            ) : (
              filas.map((c) => (
                <tr
                  key={c.id}
                  className={cn(
                    "border-b border-borde-suave text-cuerpo last:border-b-0",
                    c.sincronizacionVieja && "bg-superficie-calida",
                  )}
                >
                  <td className="px-[18px] py-[11px] font-semibold text-tinta">{c.nombre}</td>
                  <td className="px-2 py-[11px] text-tinta-suave">{c.zonaNombre}</td>
                  <td className="px-2 py-[11px] font-mono">{c.horasSemana}</td>
                  <td className="px-2 py-[11px] font-mono">{c.ventas}</td>
                  <td className={cn("px-2 py-[11px] font-semibold", CLASE_ESTADO_COBRO[c.estadoCobro])}>
                    {c.porcentajeCobrado}%
                  </td>
                  <td
                    className={cn(
                      "px-2 py-[11px]",
                      c.sincronizacionVieja ? "font-semibold text-peligro" : "text-tinta-suave",
                    )}
                  >
                    {c.sincronizacionVieja && <span aria-hidden>⚠ </span>}
                    {c.ultimaSync}
                    {c.sincronizacionVieja && (
                      <span className="sr-only"> — alerta: sincronización desactualizada</span>
                    )}
                  </td>
                  <td className="px-[18px] py-[11px] text-right">
                    {cuentasVisible && (
                      <Link
                        href="/cuentas"
                        aria-label={`Ver cuenta de ${c.nombre}`}
                        className="text-mini font-semibold text-marca-media hover:underline"
                      >
                        Cuenta
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
