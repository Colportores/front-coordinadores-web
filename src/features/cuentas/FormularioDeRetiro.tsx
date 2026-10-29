"use client";

import { useRef, useState, type FormEvent } from "react";

import type { DestinoDeTicket, NuevoRetiro } from "@/datos/cuentas";
import {
  ORDEN_DE_CAMPOS,
  validarRetiro,
  type BorradorDeRetiro,
  type CampoDeRetiro,
  type ErroresDeRetiro,
} from "@/features/cuentas/modelo";
import { cn } from "@/lib/utils";

export interface ColportorElegible {
  id: string;
  nombre: string;
  ciudad: string;
}

const CLASE_CAMPO =
  "min-h-[34px] rounded-control border border-grafico-neutro bg-superficie px-2.5 text-cuerpo text-tinta focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none aria-[invalid=true]:border-peligro";
const CLASE_BOTON =
  "inline-flex min-h-8 cursor-pointer items-center justify-center rounded-control border px-3.5 text-chico font-semibold focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

/**
 * «Registrar retiro»: el coordinador carga el efectivo que retiró de un colportor donde no hay banco. Entra ya validado (lo
 * carga él mismo): acredita y baja la deuda del destino que elige. Sin comprobante. Si falla, el formulario queda abierto con
 * lo cargado y el botón vuelve a habilitarse.
 */
export function FormularioDeRetiro({
  elegibles,
  conCiudades,
  colportorInicial,
  hoy,
  guardando,
  alGuardar,
  alCancelar,
}: {
  elegibles: ColportorElegible[];
  conCiudades: boolean;
  colportorInicial: string;
  /** AAAA-MM-DD en hora de Montevideo: tope del selector de día. */
  hoy: string;
  guardando: boolean;
  /** Devuelve el texto del error si no se pudo guardar, o `null` si salió bien (la vista cierra el formulario). */
  alGuardar: (retiro: NuevoRetiro) => Promise<string | null>;
  alCancelar: () => void;
}) {
  const [borrador, setBorrador] = useState<BorradorDeRetiro>({
    colportorId: elegibles.some((e) => e.id === colportorInicial) ? colportorInicial : "",
    monto: "",
    dia: hoy,
    destino: "",
  });
  const [errores, setErrores] = useState<ErroresDeRetiro>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const formulario = useRef<HTMLFormElement>(null);

  const cambiar = <C extends CampoDeRetiro>(campo: C, valor: BorradorDeRetiro[C]) => {
    setBorrador((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actuales) => {
      if (!actuales[campo]) return actuales;
      const resto = { ...actuales };
      delete resto[campo];
      return resto;
    });
  };

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (guardando) return;
    const { errores: nuevos, retiro } = validarRetiro(borrador, hoy, new Set(elegibles.map((e) => e.id)));
    setErrores(nuevos);
    if (!retiro) {
      const primero = ORDEN_DE_CAMPOS.find((c) => nuevos[c]);
      formulario.current?.querySelector<HTMLElement>(`[data-campo="${primero}"]`)?.focus();
      return;
    }
    setErrorGeneral(null);
    setErrorGeneral(await alGuardar(retiro));
  }

  const idError = (campo: CampoDeRetiro) => `retiro-error-${campo}`;
  const propsDe = (campo: CampoDeRetiro) => ({
    "data-campo": campo,
    "aria-invalid": errores[campo] ? true : undefined,
    "aria-describedby": errores[campo] ? idError(campo) : undefined,
  });
  const mensaje = (campo: CampoDeRetiro) =>
    errores[campo] ? (
      <p id={idError(campo)} className="text-mini text-peligro">
        {errores[campo]}
      </p>
    ) : null;

  return (
    <form
      ref={formulario}
      onSubmit={enviar}
      noValidate
      aria-label="Registrar retiro"
      className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-3.5"
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="font-serif text-titulo font-semibold">Registrar retiro</h3>
        <p className="text-mini text-tinta-suave">
          El efectivo que le retiraste a un colportor. Entra ya validado: sube su «Depositado» y baja la deuda del destino que elijas.
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-3.5">
        <div className="flex flex-col gap-1">
          <label htmlFor="retiro-colportor" className="text-chico font-semibold text-tinta-2">
            Colportor
          </label>
          <select
            id="retiro-colportor"
            {...propsDe("colportorId")}
            value={borrador.colportorId}
            onChange={(e) => cambiar("colportorId", e.target.value)}
            className={CLASE_CAMPO}
          >
            <option value="">Elegí un colportor</option>
            {elegibles.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
                {conCiudades ? ` · ${e.ciudad}` : ""}
              </option>
            ))}
          </select>
          {mensaje("colportorId")}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="retiro-monto" className="text-chico font-semibold text-tinta-2">
            Monto retirado ($U)
          </label>
          <input
            id="retiro-monto"
            {...propsDe("monto")}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={borrador.monto}
            onChange={(e) => cambiar("monto", e.target.value)}
            className={cn(CLASE_CAMPO, "font-mono")}
          />
          {mensaje("monto")}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="retiro-dia" className="text-chico font-semibold text-tinta-2">
            Día del retiro
          </label>
          <input
            id="retiro-dia"
            {...propsDe("dia")}
            type="date"
            max={hoy}
            value={borrador.dia}
            onChange={(e) => cambiar("dia", e.target.value)}
            className={cn(CLASE_CAMPO, "font-mono")}
          />
          {mensaje("dia")}
        </div>
      </div>

      <fieldset className="flex flex-col gap-1 border-0 p-0">
        <legend className="text-chico font-semibold text-tinta-2">Para qué es</legend>
        <div className="flex gap-4 pt-1">
          {(["casa-editora", "alquiler"] as DestinoDeTicket[]).map((destino, indice) => (
            <label key={destino} className="inline-flex min-h-6 cursor-pointer items-center gap-1.5 text-cuerpo">
              <input
                type="radio"
                name="destino-del-retiro"
                value={destino}
                data-campo={indice === 0 ? "destino" : undefined}
                aria-describedby={errores.destino ? idError("destino") : undefined}
                checked={borrador.destino === destino}
                onChange={() => cambiar("destino", destino)}
              />
              {destino === "alquiler" ? "Alquiler" : "Casa editora"}
            </label>
          ))}
        </div>
        {mensaje("destino")}
      </fieldset>

      {errorGeneral && (
        <p role="alert" className="rounded-control bg-peligro-fondo px-3 py-2 text-chico text-peligro">
          {errorGeneral}
        </p>
      )}

      <div className="flex items-center gap-2.5">
        <button
          type="submit"
          aria-disabled={guardando}
          className={cn(CLASE_BOTON, "border-marca bg-marca text-superficie")}
        >
          {guardando ? "Guardando…" : "Guardar retiro"}
        </button>
        <button
          type="button"
          aria-disabled={guardando}
          onClick={() => {
            if (!guardando) alCancelar();
          }}
          className={cn(CLASE_BOTON, "border-borde bg-superficie text-tinta-2")}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
