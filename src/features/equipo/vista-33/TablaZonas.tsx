import Link from "next/link";

import type { ColportorDeEquipo } from "@/datos/equipo/contrato";
import { diaYMes } from "@/lib/dias";
import { cn } from "@/lib/utils";

import { pluralColportores, type AmbitoResuelto } from "./modelo";

export const CLASE_BOTON_SECUNDARIO =
  "inline-flex min-h-8 items-center justify-center rounded-control border border-borde bg-superficie px-3 text-[11.5px] font-semibold whitespace-nowrap text-tinta-2 hover:bg-fondo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento";
export const CLASE_BOTON_PRIMARIO =
  "inline-flex min-h-8 items-center justify-center rounded-control border border-marca bg-marca px-3 text-[11.5px] font-semibold whitespace-nowrap text-superficie hover:bg-marca-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento";

/** Cabecera de grupo: la ciudad y cuántos colportores tiene. */
export function CabeceraDeGrupo({ nombre, cantidad, columnas }: { nombre: string; cantidad: string; columnas: number }) {
  return (
    <tr className="border-b border-borde bg-superficie-suave">
      <th scope="colgroup" colSpan={columnas} className="px-[18px] py-[7px] text-left font-normal">
        <span className="mr-2.5 text-chico font-bold text-marca">{nombre}</span>
        <span className="text-mini text-tinta-suave">{cantidad}</span>
      </th>
    </tr>
  );
}

function ZonaActual({ colportor }: { colportor: ColportorDeEquipo }) {
  const zona = colportor.zonaActual;
  if (!zona) return <span className="text-tinta-suave">Sin zona</span>;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="wrap-anywhere">{zona.nombre}</span>
      <span className="text-[10.5px] text-tinta-suave">
        {zona.desdeInicial ? `desde antes del ${diaYMes(zona.desde)}` : `desde ${diaYMes(zona.desde)}`}
      </span>
    </span>
  );
}

function ZonasAnteriores({ colportor }: { colportor: ColportorDeEquipo }) {
  const tramos = colportor.zonasAnteriores;
  if (tramos.length === 0) return <span className="text-tinta-tenue">—</span>;
  const nombre = (t: (typeof tramos)[number]) => (t.eliminada ? `${t.nombre} (dada de baja)` : t.nombre);
  const fechas = (t: (typeof tramos)[number]) =>
    t.inicial ? `hasta el ${diaYMes(t.hasta)}` : `${diaYMes(t.desde)} a ${diaYMes(t.hasta)}`;
  return (
    <span className="flex min-w-0 flex-col" title={tramos.map((t) => `${nombre(t)}: ${fechas(t)}`).join(" · ")}>
      <span className="wrap-anywhere">{tramos.map(nombre).join(" · ")}</span>
      <span className="text-[10.5px] text-tinta-suave">{tramos.map(fechas).join(" · ")}</span>
    </span>
  );
}

/**
 * Pestaña «Zonas» de la vista 33 (HU-CAM-006): la zona de hoy de cada colportor, las que tuvo antes con sus fechas y
 * las casas que registró en todas ellas. «Cambiar zona» y «Asignar zona» llevan a la vista 24.
 */
export function TablaZonas({ resuelto }: { resuelto: AmbitoResuelto }) {
  return (
    <table aria-label="Zonas de cada colportor" className="w-full table-fixed border-collapse">
      <colgroup>
        <col className="w-[22%]" />
        <col className="w-[19%]" />
        <col />
        <col className="w-[13%]" />
        <col className="w-[150px]" />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-superficie">
        <tr className="border-b border-borde text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave">
          <th scope="col" className="px-[18px] py-[9px] text-left font-semibold">
            COLPORTOR
          </th>
          <th scope="col" className="px-2 py-[9px] text-left font-semibold">
            ZONA ACTUAL
          </th>
          <th scope="col" className="px-2 py-[9px] text-left font-semibold">
            ZONAS ANTERIORES
          </th>
          <th scope="col" className="px-2 py-[9px] text-right font-semibold">
            CASAS REGISTRADAS
          </th>
          <th scope="col" className="px-[18px] py-[9px] text-right font-semibold">
            <span className="sr-only">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {resuelto.grupos.map((grupo) => (
          <GrupoDeFilas key={grupo.clave} grupo={grupo} conCabecera={resuelto.conCabeceras} />
        ))}
      </tbody>
    </table>
  );
}

function GrupoDeFilas({ grupo, conCabecera }: { grupo: AmbitoResuelto["grupos"][number]; conCabecera: boolean }) {
  return (
    <>
      {conCabecera && <CabeceraDeGrupo nombre={grupo.nombre} cantidad={pluralColportores(grupo.colportores.length)} columnas={5} />}
      {grupo.colportores.map((c) => (
        <tr key={c.id} className={cn("min-h-12 border-b border-borde-suave text-cuerpo", c.zonaActual === null && "bg-superficie-calida")}>
          <th scope="row" className="px-[18px] py-2.5 text-left align-middle font-semibold text-tinta">
            <span className="block wrap-anywhere">{c.nombre}</span>
          </th>
          <td className="px-2 py-2.5 align-middle">
            <ZonaActual colportor={c} />
          </td>
          <td className="px-2 py-2.5 align-middle">
            <ZonasAnteriores colportor={c} />
          </td>
          <td className="px-2 py-2.5 text-right align-middle">
            <span className="flex flex-col items-end">
              <span className="font-mono">{c.casasRegistradas}</span>
              {c.zonasAnteriores.length > 0 && <span className="text-[10.5px] text-tinta-suave">en todas sus zonas</span>}
            </span>
          </td>
          <td className="px-[18px] py-2.5 text-right align-middle">
            {c.zonaActual === null ? (
              <Link href="/ciudades" aria-label={`Asignar zona a ${c.nombre}`} className={CLASE_BOTON_PRIMARIO}>
                Asignar zona
              </Link>
            ) : (
              <Link href="/ciudades" aria-label={`Cambiar zona de ${c.nombre}`} className={CLASE_BOTON_SECUNDARIO}>
                Cambiar zona
              </Link>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
