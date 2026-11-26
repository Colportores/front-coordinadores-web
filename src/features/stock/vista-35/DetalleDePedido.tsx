"use client";

import { useId, useState, type KeyboardEvent } from "react";

import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import { cn } from "@/lib/utils";

import { EtiquetaDeEstado } from "./EtiquetaDeEstado";
import { MAXIMO_DEL_MOTIVO, validarMotivo, type Detalle } from "./modelo";

const BOTON =
  "inline-flex min-h-8 cursor-pointer items-center justify-center rounded-control border px-3.5 text-chico font-semibold whitespace-nowrap focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

function Paso({ paso, rotulo }: { paso: Detalle["pasos"][number]; rotulo: string }) {
  const estado = paso.estado === "hecho" ? "hecho" : paso.estado === "actual" ? "estado actual" : "falta";
  return (
    <li
      aria-current={paso.estado === "actual" ? "step" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 text-mini font-semibold whitespace-nowrap",
        paso.estado === "hecho" ? "text-tinta" : paso.estado === "actual" ? "text-marca-media" : "text-tinta-suave",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-[18px] place-items-center rounded-full border-[1.5px] text-[10px] text-superficie",
          paso.estado === "hecho" ? "border-marca-media bg-marca-media" : paso.estado === "actual" ? "border-marca-media bg-superficie" : "border-grafico-neutro bg-superficie",
        )}
      >
        {paso.estado === "hecho" ? "✓" : ""}
      </span>
      {rotulo}
      <span className="sr-only"> ({estado})</span>
      {paso.conLinea && <span aria-hidden="true" className="h-px w-[18px] bg-grafico-neutro" />}
    </li>
  );
}

const BOTON_DE_CANTIDAD =
  "grid size-8 cursor-pointer place-items-center rounded-control border border-grafico-neutro text-[15px] font-semibold text-marca focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grafico-neutro";

/**
 * Lo elegido en la bandeja con todo lo necesario para decidir: dónde está el pedido, el aviso del límite, lo que pide con el
 * costo de la casa editora, la cuenta de quien lo pide y, si está por autorizar, «Autorizar», «Reducir cantidades» (solo un
 * pedido) y «Rechazar». «Reducir cantidades» abre en el mismo lugar el paso de cada producto (de 0 a lo pedido) y «Autorizar
 * reducido» autoriza lo elegido (42A·03). «Rechazar» no rechaza: abre el motivo en el mismo lugar y «Confirmar rechazo» sí (como
 * en Validar tickets). Lo que se decide queda 8 s con «Deshacer» (lo muestra la vista).
 */
export function DetalleDePedido({
  detalle,
  rechazando,
  motivoInicial,
  alAutorizar,
  alAbrirRechazo,
  alCancelarRechazo,
  alConfirmarRechazo,
  alCambiarMotivo,
  alReducir,
  alCambiarCantidad,
  alCancelarReduccion,
  alAutorizarReducido,
}: {
  detalle: Detalle;
  rechazando: boolean;
  motivoInicial: string;
  alAutorizar: () => void;
  alAbrirRechazo: () => void;
  alCancelarRechazo: () => void;
  /** Recibe el motivo ya validado. */
  alConfirmarRechazo: (motivo: string) => void;
  alCambiarMotivo: (texto: string) => void;
  /** Abre «Reducir cantidades» con lo pedido. */
  alReducir: () => void;
  /** Una línea con su cantidad nueva (la vista la deja entre 0 y lo pedido). */
  alCambiarCantidad: (indice: number, cantidad: number) => void;
  alCancelarReduccion: () => void;
  alAutorizarReducido: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const idMotivo = useId();
  const idError = `${idMotivo}-error`;
  const quien = detalle.tipo === "pedido" ? "pedido" : "transferencia";

  const confirmar = () => {
    const valido = validarMotivo(motivoInicial, detalle.tipo);
    if (!valido.ok) {
      setError(valido.error);
      document.querySelector<HTMLElement>('[data-foco="motivo"]')?.focus();
      return;
    }
    setError(null);
    alConfirmarRechazo(valido.motivo);
  };

  const teclasDelMotivo = (evento: KeyboardEvent) => {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      setError(null);
      alCancelarRechazo();
    }
  };

  return (
    <section aria-label={detalle.titulo} className="flex min-w-0 flex-col gap-3.5">
      <div className="flex min-w-0 flex-col gap-[3px]">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 tabIndex={-1} data-foco="detalle" className="font-serif text-[18px] font-semibold wrap-anywhere text-tinta focus-visible:outline-none">
            {detalle.titulo}
          </h3>
          <EtiquetaDeEstado etiqueta={detalle.etiqueta} />
        </div>
        <p className="text-chico wrap-anywhere text-tinta-suave">{detalle.quien}</p>
      </div>

      <ol aria-label={quien === "pedido" ? "Estado del pedido" : "Estado de la transferencia"} className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
        {detalle.pasos.map((paso) => (
          <Paso key={paso.rotulo} paso={paso} rotulo={paso.rotulo} />
        ))}
      </ol>

      {/* Al reducir, el aviso se recalcula con cada cantidad: el lector lo anuncia sin mover el foco. */}
      <div aria-live={detalle.reduccion ? "polite" : undefined} className="empty:hidden">
        {detalle.aviso && (
          <p
            role="note"
            className={cn(
              "flex items-start gap-2.5 rounded-control px-3 py-2.5 text-chico",
              detalle.avisoTono === "exito" ? "bg-exito-fondo text-exito" : "bg-alerta-fondo text-alerta",
            )}
          >
            <span aria-hidden="true" className="leading-tight">
              {detalle.avisoTono === "exito" ? "✓" : "△"}
            </span>
            <span className="leading-snug text-pretty">{detalle.aviso}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
        <div className="flex min-w-0 flex-col">
          <div className="flex justify-between border-b border-borde pb-1.5 text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">
            <span>{detalle.tituloItems}</span>
            <span>COSTO CES</span>
          </div>
          <ul aria-label={detalle.tituloItems.toLocaleLowerCase("es")} className="m-0 list-none p-0">
            {detalle.items.map((item, i) => (
              <li
                key={`${item.nombre}-${i}`}
                className={cn(
                  "grid items-center gap-2.5 border-b border-borde-suave text-chico",
                  detalle.reduccion ? "min-h-[46px] grid-cols-[minmax(0,1fr)_auto_92px]" : "min-h-[34px] grid-cols-[minmax(0,1fr)_40px_92px]",
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold" title={item.nombre}>
                    {item.nombre}
                  </span>
                  <span className="font-mono text-[10.5px] text-tinta-suave">{item.unidad}</span>
                </span>
                {detalle.reduccion ? (
                  <span className="flex items-center justify-end gap-1.5">
                    <span className="mr-1 text-[10.5px] whitespace-nowrap text-tinta-suave">pidió {item.pedida}</span>
                    <button
                      type="button"
                      data-foco={i === 0 ? "cantidad" : undefined}
                      aria-label={`Quitar uno de ${item.nombre}`}
                      aria-disabled={item.cantidadNumero <= 0}
                      onClick={() => {
                        if (item.cantidadNumero > 0) alCambiarCantidad(i, item.cantidadNumero - 1);
                      }}
                      className={BOTON_DE_CANTIDAD}
                    >
                      <span aria-hidden="true">−</span>
                    </button>
                    <span aria-label={`${item.cantidad} unidades de ${item.nombre}`} className="min-w-[30px] text-center font-mono text-[13px] font-semibold">
                      {item.cantidad}
                    </span>
                    <button
                      type="button"
                      aria-label={`Sumar uno a ${item.nombre}`}
                      aria-disabled={item.cantidadNumero >= item.pedida}
                      onClick={() => {
                        if (item.cantidadNumero < item.pedida) alCambiarCantidad(i, item.cantidadNumero + 1);
                      }}
                      className={BOTON_DE_CANTIDAD}
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                  </span>
                ) : (
                  <span aria-label={`${item.cantidad} unidades`} className="text-right font-mono">
                    {item.cantidad}
                  </span>
                )}
                <span className="text-right font-mono whitespace-nowrap">{item.subtotal}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between pt-2 text-cuerpo">
            <span className="font-semibold">{detalle.rotuloDelTotal}</span>
            <span className="font-mono font-medium">{detalle.total}</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="border-b border-borde pb-1.5 text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">{detalle.tituloContexto}</div>
          <dl className="m-0">
            {detalle.contexto.map((fila) => (
              <div key={fila.rotulo} className="flex min-h-8 items-baseline justify-between gap-2.5 border-b border-borde-suave text-chico">
                <dt className="flex flex-col py-1.5 text-tinta-2">
                  {fila.rotulo}
                  {fila.nota && <span className="text-[10.5px] wrap-anywhere text-tinta-suave">{fila.nota}</span>}
                </dt>
                <dd className={cn("m-0 font-mono whitespace-nowrap", fila.negrita && "font-semibold")}>{fila.valor}</dd>
              </div>
            ))}
          </dl>
          {/* El destino (la cuenta del colportor en Cuentas) no existe todavía: queda inerte con el tooltip estándar. */}
          <AccionNoDisponible className="mt-2 inline-flex min-h-6 self-start text-[11.5px] font-semibold text-marca-media">Ver en Cuentas →</AccionNoDisponible>
        </div>
      </div>

      {detalle.puedeDecidir && !rechazando && !detalle.reduccion && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            data-foco="autorizar"
            aria-label={`Autorizar ${detalle.nombreCorto}`}
            onClick={alAutorizar}
            className={cn(BOTON, "border-marca bg-marca text-superficie")}
          >
            Autorizar
          </button>
          {detalle.puedeReducir && (
            <button
              type="button"
              data-foco="reducir"
              aria-label={`Reducir cantidades de ${detalle.nombreCorto}`}
              onClick={alReducir}
              className={cn(BOTON, "border-borde bg-superficie text-tinta-2")}
            >
              Reducir cantidades
            </button>
          )}
          <button
            type="button"
            data-foco="rechazar"
            aria-label={`Rechazar ${detalle.nombreCorto}`}
            onClick={alAbrirRechazo}
            className={cn(BOTON, "border-borde bg-superficie text-peligro")}
          >
            Rechazar
          </button>
          <span className="ml-1.5 text-[11.5px] text-pretty text-tinta-suave">{detalle.notaDeAccion}</span>
        </div>
      )}

      {detalle.puedeDecidir && !rechazando && detalle.reduccion && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            data-foco="autorizar"
            aria-disabled={detalle.reduccion.sinCambios || detalle.reduccion.sinNada}
            aria-label={`Autorizar reducido ${detalle.nombreCorto}`}
            onClick={() => {
              if (!detalle.reduccion?.sinCambios && !detalle.reduccion?.sinNada) alAutorizarReducido();
            }}
            className={cn(BOTON, "border-marca bg-marca text-superficie")}
          >
            Autorizar reducido
          </button>
          <button type="button" data-foco="cancelar-reduccion" onClick={alCancelarReduccion} className={cn(BOTON, "border-borde bg-superficie text-tinta-2")}>
            Cancelar
          </button>
          <span className="ml-1.5 text-[11.5px] text-pretty text-tinta-suave">{detalle.notaDeAccion}</span>
        </div>
      )}

      {detalle.puedeDecidir && rechazando && (
        <div className="flex flex-col gap-2 rounded-control border border-borde p-3">
          <label htmlFor={idMotivo} className="text-etiqueta font-semibold tracking-etiqueta text-peligro">
            MOTIVO DEL RECHAZO · OBLIGATORIO
          </label>
          <textarea
            id={idMotivo}
            data-foco="motivo"
            value={motivoInicial}
            maxLength={MAXIMO_DEL_MOTIVO}
            rows={3}
            placeholder={`Contale al colportor por qué no se autoriza ${quien === "pedido" ? "el pedido" : "la transferencia"}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? idError : undefined}
            onChange={(e) => {
              alCambiarMotivo(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={teclasDelMotivo}
            className={cn(
              "min-h-[72px] w-full resize-y rounded-control border bg-superficie px-3 py-2.5 text-nav text-tinta placeholder:text-tinta-suave focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none",
              error ? "border-peligro" : "border-borde",
            )}
          />
          {error && (
            <p id={idError} role="alert" className="flex items-center gap-[7px] text-cuerpo font-medium text-peligro">
              <span aria-hidden="true" className="grid size-4 place-items-center rounded-full bg-peligro text-[10px] font-bold text-superficie">
                !
              </span>
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              data-foco="cancelar-rechazo"
              onClick={() => {
                setError(null);
                alCancelarRechazo();
              }}
              className={cn(BOTON, "min-h-9 border-transparent bg-transparent text-marca-media")}
            >
              Cancelar
            </button>
            <button type="button" data-foco="confirmar-rechazo" onClick={confirmar} className={cn(BOTON, "min-h-9 border-peligro bg-peligro text-superficie")}>
              Confirmar rechazo
            </button>
          </div>
        </div>
      )}

      {detalle.nota && <p className="rounded-control bg-superficie-suave px-3 py-2.5 text-chico wrap-anywhere text-pretty text-tinta-2">{detalle.nota}</p>}
    </section>
  );
}
