import type { CiudadDelDia, ColportorDelDia, EstadoJornada } from "@/datos/inicio";
import {
  ETIQUETA_ESTADO,
  horasTexto,
  jornadaTexto,
  montoTexto,
  resumenDe,
  sinCifras,
  ultimosDatosTexto,
} from "@/features/inicio/modelo";
import { cn } from "@/lib/utils";

const ESTILO_ESTADO: Record<EstadoJornada, { texto: string; punto: string }> = {
  "en-jornada": { texto: "text-exito", punto: "bg-exito" },
  "sin-cerrar": { texto: "text-alerta", punto: "bg-alerta-punto" },
  finalizada: { texto: "text-tinta-suave", punto: "bg-tinta-tenue" },
  "sin-iniciar": { texto: "text-alerta", punto: "bg-alerta-punto" },
};

const CELDA_NUMERO = "px-3 text-right font-mono whitespace-nowrap";

function Cifra({ texto, vacia }: { texto: string; vacia: boolean }) {
  if (!vacia) return <>{texto}</>;
  return (
    <>
      <span aria-hidden className="text-tinta-suave">
        —
      </span>
      <span className="sr-only">sin datos</span>
    </>
  );
}

function FilaDeColportor({ colportor, ahora }: { colportor: ColportorDelDia; ahora: string }) {
  const estilo = ESTILO_ESTADO[colportor.estado];
  const vacia = sinCifras(colportor);
  const ultimos = ultimosDatosTexto(colportor.ultimoPushAt, ahora);
  return (
    <tr className="h-[38px] border-b border-borde-suave text-cuerpo">
      <th scope="row" className="max-w-0 truncate px-[18px] text-left font-semibold" title={colportor.nombre}>
        {colportor.nombre}
      </th>
      <td className={cn("px-3 text-chico font-semibold whitespace-nowrap", estilo.texto)}>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", estilo.punto)} />
          {ETIQUETA_ESTADO[colportor.estado]}
        </span>
      </td>
      <td className={CELDA_NUMERO}>
        <Cifra texto={horasTexto(colportor.horas)} vacia={vacia} />
      </td>
      <td className={CELDA_NUMERO}>
        <Cifra texto={String(colportor.presentaciones)} vacia={vacia} />
      </td>
      <td className={CELDA_NUMERO}>
        <Cifra texto={String(colportor.ventas)} vacia={vacia} />
      </td>
      <td className={CELDA_NUMERO}>
        <Cifra texto={montoTexto(colportor.montoCentavos)} vacia={vacia} />
      </td>
      <td className="max-w-0 px-3 font-mono text-[11.5px] whitespace-nowrap text-tinta-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="shrink-0 text-tinta-tenue">
            ◷
          </span>
          <span className="truncate" title={ultimos}>
            {ultimos}
          </span>
        </span>
      </td>
    </tr>
  );
}

const ENCABEZADO = "sticky top-0 z-[1] border-b border-borde bg-superficie py-2.5 text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave uppercase";

/**
 * Los colportores de la elección. Con más de una ciudad, cada una abre con su cabecera («Rivera · 3 de 10 en jornada»).
 * La columna «Últimos datos» lleva el mismo formato y color en todas las filas, sin umbral ni alerta.
 */
export function TablaDeColportores({ ciudades, ahora, titulo }: { ciudades: CiudadDelDia[]; ahora: string; titulo: string }) {
  const agrupar = ciudades.length > 1;
  const total = ciudades.reduce((n, c) => n + c.colportores.length, 0);

  return (
    <div
      role="region"
      aria-label={`Colportores · ${titulo}`}
      tabIndex={0}
      className="min-h-0 flex-1 overflow-auto rounded-tarjeta border border-borde bg-superficie focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none"
    >
      <table className="w-full min-w-[720px] table-fixed border-collapse">
        <caption className="sr-only">Colportores de {titulo}: horas, presentaciones y ventas del día</caption>
        <colgroup>
          <col className="w-[21%]" />
          <col className="w-[12%]" />
          <col className="w-[8%]" />
          <col className="w-[16%]" />
          <col className="w-[8%]" />
          <col className="w-[12%]" />
          <col className="w-[160px]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={cn(ENCABEZADO, "px-[18px] text-left")}>
              Colportor
            </th>
            <th scope="col" className={cn(ENCABEZADO, "px-3 text-left")}>
              Estado
            </th>
            <th scope="col" className={cn(ENCABEZADO, "px-3 text-right")}>
              Horas
            </th>
            <th scope="col" className={cn(ENCABEZADO, "px-3 text-right")}>
              Presentaciones
            </th>
            <th scope="col" className={cn(ENCABEZADO, "px-3 text-right")}>
              Ventas
            </th>
            <th scope="col" className={cn(ENCABEZADO, "px-3 text-right")}>
              Monto
            </th>
            <th scope="col" className={cn(ENCABEZADO, "px-3 text-left")}>
              Últimos datos
            </th>
          </tr>
        </thead>
        {ciudades.map((ciudad) => (
          <tbody key={ciudad.id}>
            {agrupar && (
              <tr className="border-b border-borde bg-superficie-suave">
                <th scope="colgroup" colSpan={7} className="px-[18px] py-[7px] text-left">
                  <span className="text-chico font-bold text-marca">{ciudad.nombre}</span>
                  <span className="ml-2.5 text-mini font-normal text-tinta-suave">{jornadaTexto(resumenDe([ciudad]))}</span>
                </th>
              </tr>
            )}
            {ciudad.colportores.map((colportor) => (
              <FilaDeColportor key={colportor.id} colportor={colportor} ahora={ahora} />
            ))}
          </tbody>
        ))}
      </table>
      {total === 0 && (
        <p className="px-[18px] py-6 text-center text-chico text-tinta-suave">
          {ciudades.length > 1
            ? "Estas ciudades todavía no tienen colportores en la campaña."
            : "Esta ciudad todavía no tiene colportores en la campaña."}
        </p>
      )}
    </div>
  );
}
