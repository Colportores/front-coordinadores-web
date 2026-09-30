import { Button } from "@/components/ui/button";
import type { CiudadDeCampania, ZonaDeCiudad } from "@/datos/equipo/zonas";
import { iniciales } from "@/features/equipo/candidatos";
import { TEXTO_CUENTA_SUSPENDIDA } from "@/features/equipo/zonas/tipos";
import { cn } from "@/lib/utils";

export function descripcionForma(z: ZonaDeCiudad): string {
  return z.tipoForma === "RADIAL" ? `Radial · ${z.radioM} m` : `Por esquinas · ${z.esquinas?.length ?? 0} puntos`;
}

function FilaZona({ zona, elegida, onElegir }: { zona: ZonaDeCiudad; elegida: boolean; onElegir: () => void }) {
  return (
    <li className="border-t border-borde-suave">
      <button
        type="button"
        onClick={onElegir}
        aria-label={`Ver la zona ${zona.nombre}`}
        aria-pressed={elegida}
        className={cn(
          "flex w-full cursor-pointer items-start gap-3 px-3.5 py-[11px] text-left hover:bg-fondo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none focus-visible:ring-inset",
          elegida && "bg-superficie-calida",
        )}
      >
        <span
          aria-hidden
          style={{ backgroundColor: zona.color }}
          className={cn("mt-0.5 size-3.5 flex-none", zona.tipoForma === "RADIAL" ? "rounded-full" : "rounded-[3px]")}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex justify-between gap-2">
            <span className="min-w-0 text-[13.5px] font-semibold break-words text-tinta">{zona.nombre}</span>
            <span className="text-[11.5px] whitespace-nowrap text-tinta-suave">{descripcionForma(zona)}</span>
          </span>
          {zona.colportores.length === 0 ? (
            <span className="text-cuerpo font-semibold text-alerta">◔ Sin colportores</span>
          ) : (
            <span className="text-cuerpo break-words text-tinta-2">{zona.colportores.map((c) => c.nombre).join(", ")}</span>
          )}
          <span className="text-[11.5px] text-tinta-suave">{zona.ubicacionesRegistradas} ubicaciones registradas</span>
        </span>
      </button>
    </li>
  );
}

interface Props {
  ciudad: CiudadDeCampania;
  zonas: ZonaDeCiudad[];
  zonaElegidaId: string | null;
  /** Colportor al que se le está buscando zona (tocó «Asignar» en «Sin zona»). */
  asignandoA: string | null;
  /** Se está agregando una ciudad: no se empieza nada nuevo hasta que conteste. */
  bloqueado: boolean;
  onNuevaZona: () => void;
  onElegirZona: (zonaId: string) => void;
  onAsignar: (colportorId: string) => void;
  onCancelarAsignacion: () => void;
}

/** Estado 1 del diseño: zonas de la ciudad y colportores que todavía no tienen zona en ella. */
export function PanelListaZonas({
  ciudad,
  zonas,
  zonaElegidaId,
  asignandoA,
  bloqueado,
  onNuevaZona,
  onElegirZona,
  onAsignar,
  onCancelarAsignacion,
}: Props) {
  const sinZona = ciudad.colportores.filter((c) => c.zonaId === null);
  const buscando = ciudad.colportores.find((c) => c.id === asignandoA);

  return (
    <div className="flex flex-col gap-3.5">
      <section aria-label={`Zonas de ${ciudad.nombre}`} className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
        <div className="flex items-center justify-between px-3.5 py-3">
          <h3 className="font-serif text-[15px] font-semibold text-tinta">Zonas de {ciudad.nombre}</h3>
          <Button type="button" disabled={bloqueado} onClick={onNuevaZona} className="min-h-8 text-nav font-semibold">
            + Nueva zona
          </Button>
        </div>
        {buscando ? (
          <p role="status" className="flex items-center justify-between gap-2 bg-alerta-fondo px-3.5 py-2 text-chico text-tinta-2">
            <span>Elegí la zona para {buscando.nombre}, en la lista o en el mapa.</span>
            <button type="button" onClick={onCancelarAsignacion} className="cursor-pointer font-semibold underline">
              Cancelar
            </button>
          </p>
        ) : null}
        {zonas.length === 0 ? (
          <p className="border-t border-borde-suave px-3.5 py-4 text-cuerpo text-tinta-suave">
            Todavía no hay zonas en {ciudad.nombre}. Creá la primera con «+ Nueva zona».
          </p>
        ) : (
          <ul>
            {zonas.map((z) => (
              <FilaZona key={z.id} zona={z} elegida={z.id === zonaElegidaId} onElegir={() => onElegirZona(z.id)} />
            ))}
          </ul>
        )}
      </section>

      {sinZona.length > 0 ? (
        <section aria-label={`Sin zona en ${ciudad.nombre}`} className="rounded-tarjeta border border-borde bg-superficie">
          <ul>
            {sinZona.map((c) => (
              <li key={c.id} className="flex items-center gap-2.5 px-3.5 py-3">
                <span
                  aria-hidden
                  className="grid size-8 flex-none place-items-center rounded-full bg-alerta-fondo text-chico font-semibold text-alerta"
                >
                  {iniciales(c.nombre)}
                </span>
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-nav font-semibold text-tinta">{c.nombre}</span>
                  <span className="text-chico text-alerta">Sin zona en {ciudad.nombre}</span>
                  {c.suspendido ? <span className="text-chico text-peligro">⊘ {TEXTO_CUENTA_SUSPENDIDA}</span> : null}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={c.suspendido}
                  onClick={() => onAsignar(c.id)}
                  aria-label={`Asignar zona a ${c.nombre}`}
                  className="min-h-8 text-nav font-semibold text-tinta-2"
                >
                  Asignar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
