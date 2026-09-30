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

const TODAS_LAS_CIUDADES = "__todas__";

interface CiudadConConteo {
  id: string;
  nombre: string;
  cantidad: number;
}

function agruparPorCiudad(colportores: FilaColportor[]): CiudadConConteo[] {
  const ciudades = new Map<string, CiudadConConteo>();
  for (const c of colportores) {
    const actual = ciudades.get(c.ciudadId);
    if (actual) actual.cantidad += 1;
    else ciudades.set(c.ciudadId, { id: c.ciudadId, nombre: c.ciudadNombre, cantidad: 1 });
  }
  return Array.from(ciudades.values());
}

function FiltroCiudad({
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

/** Tabla de "Mi equipo" con filtro por ciudad (funciona en cliente sobre los datos simulados). */
export function TablaColportores({ colportores }: { colportores: FilaColportor[] }) {
  const [ciudadSeleccionada, setCiudadSeleccionada] = useState<string>(TODAS_LAS_CIUDADES);
  const ciudades = useMemo(() => agruparPorCiudad(colportores), [colportores]);
  const filas =
    ciudadSeleccionada === TODAS_LAS_CIUDADES
      ? colportores
      : colportores.filter((c) => c.ciudadId === ciudadSeleccionada);
  // Fuera del modo dev, Cuentas está oculta hasta su conexión en V2 (flag apagado
  // en staging y producción): el link a su ficha no puede llevar a un 404.
  const cuentasVisible = pestanaVisible("cuentas");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar equipo por ciudad">
        <FiltroCiudad
          etiqueta={`Todas las ciudades · ${colportores.length}`}
          activo={ciudadSeleccionada === TODAS_LAS_CIUDADES}
          onClick={() => setCiudadSeleccionada(TODAS_LAS_CIUDADES)}
        />
        {ciudades.map((c) => (
          <FiltroCiudad
            key={c.id}
            etiqueta={`${c.nombre} · ${c.cantidad}`}
            activo={ciudadSeleccionada === c.id}
            onClick={() => setCiudadSeleccionada(c.id)}
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
                Ciudad
              </th>
              <th scope="col" className="px-2 py-2.5">
                Zonas
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
                <td colSpan={8} className="px-[18px] py-6 text-center text-chico text-tinta-suave">
                  No hay colportores en esta ciudad.
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
                  <td className="px-2 py-[11px] text-tinta-suave">{c.ciudadNombre}</td>
                  <td className="px-2 py-[11px] text-tinta-suave">
                    {c.zonas.length === 0 ? "Sin asignar" : c.zonas.join(", ")}
                  </td>
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
