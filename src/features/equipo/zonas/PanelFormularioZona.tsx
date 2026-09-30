"use client";

import { Button } from "@/components/ui/button";
import type { Esquina, FormaZona, TipoForma, VistaPreviaZona } from "@/datos/equipo/zonas";
import { cn } from "@/lib/utils";

export const RADIO_INICIAL_M = 400;
export const RADIO_MIN_M = 1;
export const RADIO_MAX_M = 3000;

export const AYUDA_RADIAL = "Hacé clic en el mapa para poner el centro y arrastrá el punto del borde para cambiar el radio.";
export const AYUDA_ESQUINAS =
  "Hacé clic en las esquinas en orden. El borde sigue las calles; para cerrar, tocá la esquina 1.";

interface Props {
  editando: boolean;
  nombre: string;
  forma: FormaZona;
  /** Nombre de la esquina más cercana al centro de una zona radial. */
  nombreCentro: string | null;
  vistaPrevia: VistaPreviaZona | null;
  guardando: boolean;
  error: string | null;
  onNombre: (nombre: string) => void;
  onTipoForma: (tipo: TipoForma) => void;
  onRadio: (radioM: number) => void;
  onQuitarEsquina: () => void;
  onGuardar: () => void;
  onCancelar: () => void;
}

const OPCIONES_FORMA: { tipo: TipoForma; etiqueta: string }[] = [
  { tipo: "RADIAL", etiqueta: "◯ Radial" },
  { tipo: "ESQUINAS", etiqueta: "⌐ Por esquinas" },
];

const nombreEsquina = (e: Esquina) => `${e.calleA} y ${e.calleB}`;

function Rotulo({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <span id={id} className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">
      {children}
    </span>
  );
}

export function formaCompleta(forma: FormaZona): boolean {
  if (forma.tipoForma === "RADIAL") return Boolean(forma.centro && forma.radioM);
  return Boolean(forma.cerrada && (forma.esquinas?.length ?? 0) >= 3);
}

/** Estados 2 y 3 del diseño: nueva zona (radial o por esquinas) y edición de la forma de una zona. */
export function PanelFormularioZona({
  editando,
  nombre,
  forma,
  nombreCentro,
  vistaPrevia,
  guardando,
  error,
  onNombre,
  onTipoForma,
  onRadio,
  onQuitarEsquina,
  onGuardar,
  onCancelar,
}: Props) {
  const esquinas = forma.esquinas ?? [];
  const puedeGuardar = nombre.trim() !== "" && formaCompleta(forma) && vistaPrevia !== null && !vistaPrevia.superposicion && !guardando;

  return (
    <section aria-label={editando ? "Editar zona" : "Nueva zona"} className="flex flex-col gap-3.5 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-[15px] font-semibold text-tinta">{editando ? "Editar zona" : "Nueva zona"}</h3>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Cerrar el formulario de zona"
          className="cursor-pointer rounded-control px-1.5 text-nav text-tinta-suave hover:text-tinta"
        >
          ✕
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <Rotulo>NOMBRE</Rotulo>
        <input
          type="text"
          value={nombre}
          onChange={(e) => onNombre(e.target.value)}
          className="min-h-10 rounded-control border border-grafico-neutro bg-superficie px-3 text-nav text-tinta outline-none focus-visible:ring-2 focus-visible:ring-acento"
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5">
          <Rotulo>FORMA</Rotulo>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {OPCIONES_FORMA.map((o) => (
            <label
              key={o.tipo}
              className={cn(
                "flex min-h-10 cursor-pointer items-center justify-center rounded-control border text-nav font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acento",
                forma.tipoForma === o.tipo
                  ? "border-marca bg-marca-clara text-marca"
                  : "border-grafico-neutro bg-superficie text-tinta-2 hover:bg-fondo",
              )}
            >
              <input
                type="radio"
                name="forma"
                value={o.tipo}
                checked={forma.tipoForma === o.tipo}
                onChange={() => onTipoForma(o.tipo)}
                className="sr-only"
              />
              {o.etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      {forma.tipoForma === "RADIAL" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Rotulo id="centro-zona">CENTRO</Rotulo>
            <div aria-labelledby="centro-zona" className="flex min-h-10 items-center justify-between rounded-control border border-borde bg-fondo px-3 text-nav">
              {forma.centro ? (
                <span className="text-tinta">{nombreCentro ?? "Punto elegido en el mapa"}</span>
              ) : (
                <span className="text-tinta-tenue">Sin elegir</span>
              )}
              <span className="text-chico text-tinta-suave">clic en el mapa</span>
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <Rotulo>RADIO</Rotulo>
            <span className="flex min-h-10 items-center gap-2 rounded-control border border-grafico-neutro bg-superficie px-3 focus-within:ring-2 focus-within:ring-acento">
              <input
                type="number"
                min={RADIO_MIN_M}
                max={RADIO_MAX_M}
                step={50}
                value={forma.radioM ?? ""}
                placeholder={String(RADIO_INICIAL_M)}
                disabled={!forma.centro}
                onChange={(e) => {
                  const valor = Number(e.target.value);
                  if (Number.isFinite(valor) && valor > 0) onRadio(Math.min(RADIO_MAX_M, Math.max(RADIO_MIN_M, valor)));
                }}
                className="min-w-0 flex-1 bg-transparent text-nav text-tinta outline-none disabled:text-tinta-tenue"
              />
              <span aria-hidden className="text-nav text-tinta-suave">
                m
              </span>
            </span>
          </label>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Rotulo id="esquinas-zona">ESQUINAS · {esquinas.length}</Rotulo>
          {esquinas.length > 0 ? (
            <ol aria-labelledby="esquinas-zona" className="flex flex-col gap-1">
              {esquinas.map((e, i) => (
                <li key={`${e.lon},${e.lat}`} className="flex items-center gap-2.5 text-nav text-tinta">
                  <span
                    aria-hidden
                    className="grid size-5 flex-none place-items-center rounded-full bg-marca-media text-etiqueta font-bold text-superficie"
                  >
                    {i + 1}
                  </span>
                  {nombreEsquina(e)}
                </li>
              ))}
            </ol>
          ) : null}
          {esquinas.length > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={onQuitarEsquina} className="w-fit text-chico font-semibold text-tinta-2">
              Quitar
            </Button>
          ) : null}
        </div>
      )}

      {vistaPrevia && !vistaPrevia.superposicion ? (
        <p className="text-cuerpo text-tinta-2">
          {editando
            ? vistaPrevia.ubicacionesQueCambian === 0
              ? "Ninguna ubicación cambia de zona."
              : `Al guardar, ${vistaPrevia.ubicacionesQueCambian} ubicaciones cambian de zona.`
            : `Incluye ${vistaPrevia.ubicacionesIncluidas} ubicaciones ya registradas.`}
        </p>
      ) : null}
      {vistaPrevia?.superposicion ? (
        <p role="alert" className="rounded-control bg-peligro-fondo px-3 py-2 text-cuerpo font-medium text-peligro">
          Esta zona se superpone con «{vistaPrevia.superposicion.zonaNombre}». Ajustá el borde para que solo compartan la calle.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-control bg-peligro-fondo px-3 py-2 text-cuerpo font-medium text-peligro">
          {error}
        </p>
      ) : null}

      <p className="text-chico text-tinta-suave">{forma.tipoForma === "RADIAL" ? AYUDA_RADIAL : AYUDA_ESQUINAS}</p>

      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          disabled={!puedeGuardar}
          onClick={onGuardar}
          className="min-h-9 text-nav font-semibold disabled:bg-borde disabled:text-tinta-suave disabled:opacity-100"
        >
          Guardar zona
        </Button>
        <Button type="button" variant="outline" onClick={onCancelar} className="min-h-9 text-nav font-semibold text-tinta-2">
          Cancelar
        </Button>
      </div>
    </section>
  );
}
