"use client";

import type { CasaDeCiudad, EstadoDeCasa } from "@/datos/equipo/zonas";
import { contarPorEstado, ESTADOS_VISUALES, textoTotalDeCasas } from "@/features/equipo/zonas/casas/estados";
import { PuntoDeCasa } from "@/features/equipo/zonas/casas/PuntoDeCasa";
import type { FaseDeCasas } from "@/features/equipo/zonas/casas/useCasasDeCiudad";
import { cn } from "@/lib/utils";

interface Props {
  fase: FaseDeCasas;
  casas: readonly CasaDeCiudad[];
  /** Cuántas se ven en el mapa tras destildar estados. */
  mostradas: number;
  ocultos: ReadonlySet<EstadoDeCasa>;
  onAlternar(estado: EstadoDeCasa): void;
}

/**
 * «CASAS POR ESTADO» (diseño 24P·01/02): cada estado con su símbolo y su cantidad, y una casilla para sacarlo del mapa. Los
 * conteos son de toda la ciudad: destildar un estado no los cambia, solo el total «26 de 150 casas». Mientras carga o si falló,
 * los conteos van con «–» y las casillas quedan apagadas (24P·05/07).
 */
export function LeyendaDeCasas({ fase, casas, mostradas, ocultos, onAlternar }: Props) {
  const conDatos = fase === "listo";
  const cuenta = contarPorEstado(casas);
  return (
    <section aria-labelledby="leyenda-de-casas" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 id="leyenda-de-casas" className="font-mono text-etiqueta tracking-etiqueta text-tinta-suave uppercase">
          Casas por estado
        </h3>
        <span className="text-chico text-tinta-suave">{conDatos ? textoTotalDeCasas(casas.length, mostradas) : ""}</span>
      </div>
      <ul className="flex flex-col">
        {ESTADOS_VISUALES.map((e) => {
          const visible = !ocultos.has(e.clave);
          return (
            <li key={e.clave}>
              <label className={cn("flex min-h-[30px] items-center gap-2.5", conDatos ? "cursor-pointer" : "cursor-not-allowed", visible ? "opacity-100" : "opacity-55")}>
                <input
                  type="checkbox"
                  checked={visible}
                  disabled={!conDatos}
                  onChange={() => onAlternar(e.clave)}
                  className="size-4 flex-none cursor-[inherit] accent-marca focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
                />
                <PuntoDeCasa estado={e.clave} lado={18} />
                <span className="flex-1 text-nav text-tinta">{e.nombre}</span>
                <span className="font-mono text-chico text-tinta-2">{conDatos ? cuenta[e.clave] : "–"}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-chico leading-[1.45] text-tinta-suave">Círculo: visita. Cuadrado: venta y cobro. Destildar un estado lo saca del mapa.</p>
    </section>
  );
}
