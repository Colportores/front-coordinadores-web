"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Esquina, FormaZona, TipoForma, VistaPreviaZona } from "@/datos/equipo/zonas";
import { cn } from "@/lib/utils";

export const NOMBRE_MAX = 40;
export const AVISO_NOMBRE_LARGO = `El nombre puede tener hasta ${NOMBRE_MAX} caracteres.`;
export const RADIO_INICIAL_M = 400;
export const RADIO_MIN_M = 1;
export const RADIO_MAX_M = 3000;

export const AYUDA_RADIAL = "Hacé clic en el mapa para poner el centro y arrastrá el punto del borde para cambiar el radio.";
export const AYUDA_ESQUINAS =
  "Hacé clic en las esquinas en orden. El borde sigue las calles; para cerrar, tocá la esquina 1.";

/** «Eliminar zona» (solo al editar): pide confirmación y deja sin zona a los colportores asignados. */
export interface BajaZona {
  nombre: string;
  colportores: number;
  confirmando: boolean;
  onPedir: () => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}

export function textoColportoresSinZona(cantidad: number): string {
  return cantidad === 1 ? "1 colportor queda sin zona" : `${cantidad} colportores quedan sin zona`;
}

interface Props {
  editando: boolean;
  baja?: BajaZona;
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
  baja,
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
  const confirmacion = useRef<HTMLDivElement>(null);
  const botonEliminar = useRef<HTMLButtonElement>(null);
  const estabaConfirmando = useRef(false);
  const confirmando = baja?.confirmando === true;
  // Al pedir la baja el botón desaparece: el foco pasa a la confirmación (y se la trae a la vista); al conservarla, vuelve al botón.
  useEffect(() => {
    if (confirmando) {
      confirmacion.current?.focus();
      confirmacion.current?.scrollIntoView?.({ block: "center" });
    } else if (estabaConfirmando.current) {
      botonEliminar.current?.focus();
    }
    estabaConfirmando.current = confirmando;
  }, [confirmando]);
  // Lo que se está tecleando en el radio cuando todavía no es un número válido (vacío o 0): `null` sigue a la forma.
  const [radioTexto, setRadioTexto] = useState<string | null>(null);
  const nombreLargo = nombre.trim().length > NOMBRE_MAX;
  const puedeGuardar =
    nombre.trim() !== "" &&
    !nombreLargo &&
    formaCompleta(forma) &&
    vistaPrevia !== null &&
    !guardando &&
    !baja?.confirmando &&
    radioTexto === null;

  return (
    <section aria-label={editando ? "Editar zona" : "Nueva zona"} className="flex flex-col gap-3.5 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-[15px] font-semibold text-tinta">{editando ? "Editar zona" : "Nueva zona"}</h3>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          aria-label="Cerrar el formulario de zona"
          className="inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded-control px-1.5 text-nav text-tinta-suave hover:text-tinta disabled:cursor-not-allowed disabled:opacity-50"
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
          aria-invalid={nombreLargo || undefined}
          aria-describedby={nombreLargo ? "aviso-nombre-largo" : undefined}
          className="min-h-10 rounded-control border border-grafico-neutro bg-superficie px-3 text-nav text-tinta outline-none focus-visible:ring-2 focus-visible:ring-acento"
        />
        {nombreLargo ? (
          <span id="aviso-nombre-largo" role="alert" className="text-chico font-medium text-peligro">
            {AVISO_NOMBRE_LARGO}
          </span>
        ) : null}
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
                value={radioTexto ?? forma.radioM ?? ""}
                placeholder={String(RADIO_INICIAL_M)}
                disabled={!forma.centro}
                onChange={(e) => {
                  const valor = Number(e.target.value);
                  if (e.target.value.trim() !== "" && Number.isFinite(valor) && valor > 0) {
                    setRadioTexto(null);
                    onRadio(Math.min(RADIO_MAX_M, Math.max(RADIO_MIN_M, valor)));
                  } else {
                    // Se puede borrar con Backspace para teclear otro valor; hasta entonces no se guarda.
                    setRadioTexto(e.target.value);
                  }
                }}
                onBlur={() => setRadioTexto(null)}
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

      {vistaPrevia ? (
        <p className="text-cuerpo text-tinta-2">
          {vistaPrevia.ubicacionesIncluidas === 0
            ? "No incluye ubicaciones todavía."
            : vistaPrevia.ubicacionesIncluidas === 1
              ? "Incluye 1 ubicación."
              : `Incluye ${vistaPrevia.ubicacionesIncluidas} ubicaciones.`}
        </p>
      ) : null}
      {vistaPrevia?.superposicion ? (
        <p role="status" className="rounded-control bg-alerta-fondo px-3 py-2 text-cuerpo font-medium text-alerta">
          Esta zona se superpone con «{vistaPrevia.superposicion.zonaNombre}» en el tramo marcado en rojo. Podés guardarla igual.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-control bg-peligro-fondo px-3 py-2 text-cuerpo font-medium text-peligro">
          {error}
        </p>
      ) : null}

      <p className="text-chico text-tinta-suave">{forma.tipoForma === "RADIAL" ? AYUDA_RADIAL : AYUDA_ESQUINAS}</p>

      {baja?.confirmando ? (
        <div ref={confirmacion} tabIndex={-1} role="alertdialog" aria-label="Eliminar zona" className="outline-none focus-visible:ring-2 focus-visible:ring-acento flex flex-col gap-2.5 rounded-control border border-peligro bg-peligro-fondo px-3 py-3">
          <p className="text-cuerpo font-medium text-tinta">
            ¿Eliminar la zona «{baja.nombre}»?{" "}
            {baja.colportores === 0 ? "Nadie la trabaja." : `${textoColportoresSinZona(baja.colportores)}.`} Las ubicaciones no se tocan.
          </p>
          <div className="flex items-center gap-2.5">
            <Button type="button" variant="destructive" disabled={guardando} onClick={baja.onConfirmar} className="min-h-9 text-nav font-semibold">
              Sí, eliminar zona
            </Button>
            <Button type="button" variant="outline" disabled={guardando} onClick={baja.onCancelar} className="min-h-9 text-nav font-semibold text-tinta-2">
              No, conservarla
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          disabled={!puedeGuardar}
          onClick={onGuardar}
          className="min-h-9 text-nav font-semibold disabled:bg-borde disabled:text-tinta-suave disabled:opacity-100"
        >
          Guardar zona
        </Button>
        <Button type="button" variant="outline" disabled={guardando} onClick={onCancelar} className="min-h-9 text-nav font-semibold text-tinta-2">
          Cancelar
        </Button>
        {baja && !baja.confirmando ? (
          <Button
            ref={botonEliminar}
            type="button"
            variant="outline"
            disabled={guardando}
            onClick={baja.onPedir}
            className="ml-auto min-h-9 text-nav font-semibold text-peligro"
          >
            Eliminar zona
          </Button>
        ) : null}
      </div>
    </section>
  );
}
