"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { CiudadDeCampania, ZonaDeCiudad } from "@/datos/equipo/zonas";
import { iniciales } from "@/features/equipo/candidatos";
import { TEXTO_CUENTA_SUSPENDIDA } from "@/features/equipo/zonas/tipos";
import { descripcionForma } from "@/features/equipo/zonas/PanelListaZonas";
import { cn } from "@/lib/utils";

interface Props {
  ciudad: CiudadDeCampania;
  zona: ZonaDeCiudad;
  /** Colportor preelegido en el desplegable (viene de «Asignar» en «Sin zona»). */
  colportorInicialId: string | null;
  ocupado: boolean;
  /** Se está agregando una ciudad: «Editar forma» espera. */
  bloqueado: boolean;
  error: string | null;
  onCerrar: () => void;
  onEditarForma: () => void;
  onAsignar: (colportorId: string) => void;
  /** «Quitar»: deja al colportor sin zona. */
  onQuitar: (colportorId: string) => void;
}


function Avatar({ nombre, alerta }: { nombre: string; alerta?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 flex-none place-items-center rounded-full text-chico font-semibold",
        alerta ? "bg-alerta-fondo text-alerta" : "bg-marca-clara text-marca",
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}

/** Estado 4 del diseño: una zona, quién la trabaja y a quién asignarle. */
export function PanelDetalleZona({
  ciudad,
  zona,
  colportorInicialId,
  ocupado,
  bloqueado,
  error,
  onCerrar,
  onEditarForma,
  onAsignar,
  onQuitar,
}: Props) {
  const [elegidoId, setElegidoId] = useState<string | null>(colportorInicialId);
  const [abierto, setAbierto] = useState(false);
  const elegido = ciudad.colportores.find((c) => c.id === elegidoId) ?? null;
  const yaEstaAhi = elegido?.zonaId === zona.id;

  return (
    <section aria-label={`Zona ${zona.nombre}`} className="flex flex-col gap-3.5 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            style={{ backgroundColor: zona.color }}
            className={cn("mt-1.5 size-3.5 flex-none", zona.tipoForma === "RADIAL" ? "rounded-full" : "rounded-[3px]")}
          />
          <div className="flex flex-col gap-0.5">
            <h3 className="font-serif text-titulo font-semibold break-words text-tinta">{zona.nombre}</h3>
            <span className="text-chico text-tinta-suave">
              {descripcionForma(zona)} · {zona.ubicacionesRegistradas} ubicaciones
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          disabled={ocupado || bloqueado}
          aria-label="Cerrar el detalle de la zona"
          className="cursor-pointer rounded-control px-1.5 text-nav text-tinta-suave hover:text-tinta disabled:cursor-not-allowed disabled:opacity-50"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">
          COLPORTORES · {zona.colportores.length}
        </h4>
        {zona.colportores.length === 0 ? (
          <span className="text-cuerpo font-semibold text-alerta">◔ Nadie trabaja esta zona</span>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {zona.colportores.map((c) => (
              <li key={c.id} className="flex items-center gap-2.5 text-nav text-tinta">
                <Avatar nombre={c.nombre} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="break-words">{c.nombre}</span>
                  {c.suspendido ? <span className="text-chico text-peligro">⊘ Suspendida</span> : null}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={() => onQuitar(c.id)}
                  aria-label={`Quitar a ${c.nombre} de ${zona.nombre}`}
                  className="text-chico font-semibold text-tinta-2"
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h4 id="asignar-colportor" className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">
          ASIGNAR COLPORTOR
        </h4>
        <div
          className="relative"
          onKeyDown={(e) => {
            if (e.key === "Escape" && abierto) {
              e.stopPropagation();
              setAbierto(false);
            }
          }}
        >
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={abierto}
            aria-labelledby="asignar-colportor valor-colportor"
            onClick={() => setAbierto((a) => !a)}
            className="flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-control border border-grafico-neutro bg-superficie px-3 text-left text-nav text-tinta focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
          >
            <span id="valor-colportor">{elegido ? elegido.nombre : "Elegir colportor"}</span>
            <span aria-hidden className="text-tinta-suave">
              {abierto ? "▴" : "▾"}
            </span>
          </button>
          {abierto ? (
            <ul
              role="listbox"
              aria-labelledby="asignar-colportor"
              className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-control border border-borde bg-superficie shadow-lg"
            >
              {ciudad.colportores.length === 0 ? (
                <li role="presentation" className="px-3 py-3 text-chico text-tinta-suave">
                  No hay colportores de la campaña en {ciudad.nombre}.
                </li>
              ) : null}
              {ciudad.colportores.map((c) => (
                <li key={c.id} role="option" aria-selected={c.id === elegidoId} aria-disabled={c.suspendido ? "true" : undefined}>
                  <button
                    type="button"
                    disabled={c.suspendido}
                    onClick={() => {
                      setElegidoId(c.id);
                      setAbierto(false);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-fondo focus-visible:bg-fondo focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-transparent",
                      c.id === elegidoId && "bg-superficie-calida",
                    )}
                  >
                    <Avatar nombre={c.nombre} alerta={c.zonaId === null} />
                    <span className="flex flex-col">
                      <span className="text-nav font-semibold text-tinta">{c.nombre}</span>
                      {c.suspendido ? (
                        <span className="text-chico text-peligro">⊘ {TEXTO_CUENTA_SUSPENDIDA}</span>
                      ) : (
                        <span className={cn("text-chico", c.zonaId === null ? "text-alerta" : "text-tinta-suave")}>
                          {c.zonaNombre ? `hoy en ${c.zonaNombre}` : "◔ Sin zona"}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="text-chico text-tinta-suave">
          Elegir a alguien con zona lo cambia de zona; sus ubicaciones registradas no se mueven.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-control bg-peligro-fondo px-3 py-2 text-cuerpo font-medium text-peligro">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          disabled={!elegido || yaEstaAhi || ocupado}
          onClick={() => elegido && onAsignar(elegido.id)}
          className="min-h-9 text-nav font-semibold disabled:bg-borde disabled:text-tinta-suave disabled:opacity-100"
        >
          Asignar a {zona.nombre}
        </Button>
        <Button type="button" variant="outline" disabled={bloqueado || ocupado} onClick={onEditarForma} className="min-h-9 text-nav font-semibold text-tinta-2">
          Editar forma
        </Button>
      </div>
      {yaEstaAhi ? <p className="text-chico text-tinta-suave">{elegido?.nombre} ya trabaja esta zona.</p> : null}
    </section>
  );
}
