"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { ResumenCoordinador } from "@/datos/shell/contrato";
import { estadoDePestana, ETIQUETA_ESTADO } from "@/dev/estado-hu";
import { CLASES_ESTADO } from "@/dev/estilos";
import { useModoDev } from "@/dev/ProveedorModoDev";
import { cn } from "@/lib/utils";
import type { DefinicionPestana } from "@/shell/pestanas";

function EstadoPestana({ pestana }: { pestana: DefinicionPestana }) {
  const { chipsVisibles } = useModoDev();
  const estado = estadoDePestana(pestana.id);
  if (!chipsVisibles || !estado) return null;
  return (
    <span
      data-testid={`estado-pestana-${pestana.id}`}
      title={`Estado de las HU de ${pestana.etiqueta}: ${ETIQUETA_ESTADO[estado]}`}
      className="ml-1.5 inline-flex items-center"
    >
      <span aria-hidden className={cn("size-1.5 rounded-pastilla", CLASES_ESTADO[estado].punto)} />
      <span className="sr-only">(HU: {ETIQUETA_ESTADO[estado]})</span>
    </span>
  );
}

export function Topbar({ resumen, pestanas }: { resumen: ResumenCoordinador; pestanas: DefinicionPestana[] }) {
  const ruta = usePathname();

  return (
    <header className="z-10 flex items-center justify-between border-b border-borde bg-superficie px-[22px]">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-[11px]">
          <div
            aria-hidden
            className="grid size-8 place-items-center rounded-pastilla bg-marca font-serif text-chico font-semibold text-superficie"
          >
            UU
          </div>
          <span className="font-serif text-titulo font-semibold">Colportaje</span>
          <span className="rounded-pastilla bg-marca-clara px-[9px] py-[3px] text-etiqueta font-bold tracking-[.12em] text-marca-media">
            COORDINADOR
          </span>
        </div>
        <nav aria-label="Secciones del panel">
          <ul className="flex gap-1 text-nav">
            {pestanas.map((p) => {
              const activa = ruta === p.ruta || ruta.startsWith(`${p.ruta}/`);
              return (
                <li key={p.id}>
                  <Link
                    href={p.ruta}
                    aria-current={activa ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center rounded-control px-3.5 py-2 focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none",
                      activa ? "bg-marca-clara font-semibold text-marca" : "text-tinta-2 hover:bg-fondo",
                    )}
                  >
                    {p.etiqueta}
                    <EstadoPestana pestana={p} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        {/* Cambiar de región/campaña: el selector no está diseñado; queda sin comportamiento. */}
        <button
          type="button"
          className="rounded-control border border-borde bg-superficie px-3 py-[7px] text-chico text-tinta-suave focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
        >
          {resumen.region} · {resumen.campania} <span aria-hidden>▾</span>
        </button>
        <div
          role="img"
          aria-label={`Cuenta: ${resumen.nombre}`}
          className="grid size-8 place-items-center rounded-pastilla bg-marca-clara text-chico font-semibold text-marca"
        >
          {resumen.iniciales}
        </div>
      </div>
    </header>
  );
}
