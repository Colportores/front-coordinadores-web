"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import type { DatosDeStock, TransferenciaPedida } from "@/datos/stock/contrato";
import { cn } from "@/lib/utils";

import {
  cuantoTiene,
  cantidadEntera,
  lineaVacia,
  TEXTO_DE_TRANSFERENCIA,
  TEXTO_SIN_CON_QUIEN_TRANSFERIR,
  TEXTO_TRANSFERENCIA_SIN_CONEXION,
  textoDeLoQueTiene,
  textoDePasaLoQueTiene,
  TITULO_DE_TRANSFERENCIA,
  validarTransferencia,
  type LineaDelFormulario,
} from "./transferencia";

const CLASE_CAMPO =
  "min-h-9 w-full min-w-0 rounded-control border border-grafico-neutro bg-superficie px-2.5 text-cuerpo text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento aria-invalid:border-peligro";
const CLASE_ETIQUETA = "text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave";
const CLASE_ERROR = "text-chico text-peligro";

const FOCALIZABLES = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href]';

/**
 * El formulario de «Pedir transferencia de materiales» (HU-STK-005): quién da, quién recibe y una lista de productos con su
 * cantidad. Valida al pedirla, no mientras se escribe, y cada error dice qué pasó y qué hacer. Mientras está en camino el botón
 * se apaga (el doble toque no manda dos); si falla, vuelve a poder usarse con lo cargado y el aviso dice qué pasó. Esc cancela
 * (salvo en camino) y Tab no sale del diálogo. Sin conexión no se puede pedir, y lo cargado se queda.
 */
export function DialogoDeTransferencia({
  datos,
  enviando,
  error,
  enLinea,
  alCancelar,
  alPedir,
}: {
  datos: DatosDeStock;
  enviando: boolean;
  /** Lo que dijo la base o la red cuando no se pudo; vacío mientras no haya pasado nada. */
  error: string | null;
  enLinea: boolean;
  alCancelar: () => void;
  alPedir: (pedido: TransferenciaPedida) => void;
}) {
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const claveSiguiente = useRef(2);
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [lineas, setLineas] = useState<LineaDelFormulario[]>([lineaVacia(1)]);
  const [intentos, setIntentos] = useState(0);
  // El campo al que va el foco tras el próximo cambio (un error, una fila nueva o una fila que se sacó).
  const focoPendiente = useRef<string | null>(null);
  const setFoco = (campo: string | null) => {
    focoPendiente.current = campo;
  };

  const colportores = useMemo(() => {
    const ciudades = new Map(datos.ciudades.map((c) => [c.id, c.nombre]));
    return [...datos.colportores]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      .map((c) => ({ id: c.id, nombre: c.nombre, rotulo: `${c.nombre}${c.ciudadId !== null && ciudades.has(c.ciudadId) ? ` · ${ciudades.get(c.ciudadId)}` : ""}` }));
  }, [datos]);
  const productos = datos.productos;
  const nombreDe = (colportorId: string) => colportores.find((c) => c.id === colportorId)?.nombre ?? "";
  const posible = colportores.length >= 2 && productos.length > 0;

  const validacion = validarTransferencia({ origenId, destinoId, lineas });
  const errores = intentos > 0 ? validacion.errores : null;

  useEffect(() => {
    (raiz.current?.querySelector<HTMLElement>("[data-primero]") ?? raiz.current?.querySelector<HTMLElement>("button"))?.focus();
  }, []);

  // Tras un intento con errores, el foco va al primer campo con problema.
  useEffect(() => {
    const campo = focoPendiente.current;
    if (campo === null) return;
    focoPendiente.current = null;
    raiz.current?.querySelector<HTMLElement>(`[data-campo="${campo}"]`)?.focus();
  });

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      if (!enviando) alCancelar();
    } else if (evento.key === "Tab") {
      const todos = Array.from(raiz.current?.querySelectorAll<HTMLElement>(FOCALIZABLES) ?? []);
      const primero = todos[0];
      const ultimo = todos[todos.length - 1];
      if (!primero || !ultimo) return;
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }
  }

  function pedir() {
    if (enviando || !enLinea || !posible) return;
    setIntentos((n) => n + 1);
    if (validacion.pedido === null) {
      const e = validacion.errores;
      const primeraConError = lineas.find((l) => e.lineas[l.clave]);
      setFoco(
        e.origen !== null
          ? "origen"
          : e.destino !== null
            ? "destino"
            : e.sinLineas !== null
              ? `producto-${lineas[0]?.clave}`
              : primeraConError
                ? `${e.lineas[primeraConError.clave].producto !== null ? "producto" : "cantidad"}-${primeraConError.clave}`
                : null,
      );
      return;
    }
    alPedir(validacion.pedido);
  }

  function cambiarLinea(clave: number, cambio: Partial<LineaDelFormulario>) {
    setLineas((previas) => previas.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
  }

  function sumarLinea() {
    const clave = claveSiguiente.current++;
    setLineas((previas) => [...previas, lineaVacia(clave)]);
    setFoco(`producto-${clave}`);
  }

  function sacarLinea(clave: number) {
    setLineas((previas) => previas.filter((l) => l.clave !== clave));
    setFoco("sumar");
  }

  const usados = new Set(lineas.map((l) => l.productoId).filter((p) => p !== ""));
  const sinProductosLibres = productos.every((p) => usados.has(p.id));

  return (
    // El fondo no es un control: solo recibe las teclas (Esc y el ciclo de Tab) de lo que está dentro del diálogo.
    <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4" onKeyDown={alTeclear}>
      <div
        ref={raiz}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-texto`}
        className="flex max-h-full w-full max-w-xl flex-col gap-3 overflow-auto rounded-tarjeta border border-borde bg-superficie px-[22px] py-5 shadow-lg"
      >
        <h2 id={`${id}-titulo`} className="font-serif text-[19px] font-semibold text-tinta">
          {TITULO_DE_TRANSFERENCIA}
        </h2>
        <p id={`${id}-texto`} className="text-nav text-tinta-2">
          {posible ? TEXTO_DE_TRANSFERENCIA : TEXTO_SIN_CON_QUIEN_TRANSFERIR}
        </p>

        {posible && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`${id}-origen`} className={CLASE_ETIQUETA}>
                  QUIÉN DA LOS LIBROS
                </label>
                <select
                  id={`${id}-origen`}
                  data-primero=""
                  data-campo="origen"
                  value={origenId}
                  aria-invalid={errores?.origen ? true : undefined}
                  aria-describedby={errores?.origen ? `${id}-origen-error` : undefined}
                  onChange={(e) => {
                    setOrigenId(e.target.value);
                    // Quien da no puede ser quien recibe: si ya estaba elegido como destino, se vuelve a elegir.
                    if (e.target.value === destinoId) setDestinoId("");
                  }}
                  className={CLASE_CAMPO}
                >
                  <option value="">Elegí a quien da</option>
                  {colportores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
                {errores?.origen && (
                  <p id={`${id}-origen-error`} className={CLASE_ERROR}>
                    {errores.origen}
                  </p>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`${id}-destino`} className={CLASE_ETIQUETA}>
                  QUIÉN LOS RECIBE
                </label>
                <select
                  id={`${id}-destino`}
                  data-campo="destino"
                  value={destinoId}
                  aria-invalid={errores?.destino ? true : undefined}
                  aria-describedby={errores?.destino ? `${id}-destino-error` : undefined}
                  onChange={(e) => setDestinoId(e.target.value)}
                  className={CLASE_CAMPO}
                >
                  <option value="">Elegí a quien recibe</option>
                  {colportores
                    .filter((c) => c.id !== origenId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.rotulo}
                      </option>
                    ))}
                </select>
                {errores?.destino && (
                  <p id={`${id}-destino-error`} className={CLASE_ERROR}>
                    {errores.destino}
                  </p>
                )}
              </div>
            </div>

            <fieldset className="flex min-w-0 flex-col gap-2 border-0 p-0">
              <legend className={cn(CLASE_ETIQUETA, "mb-1")}>QUÉ SE TRANSFIERE</legend>
              {lineas.map((l, indice) => {
                const e = errores?.lineas[l.clave];
                const tiene = cuantoTiene(datos, origenId, l.productoId);
                const pedida = cantidadEntera(l.cantidad);
                return (
                  <div key={l.clave} className="flex flex-col gap-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_96px_auto] items-start gap-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <select
                          aria-label={`Producto ${indice + 1}`}
                          data-campo={`producto-${l.clave}`}
                          value={l.productoId}
                          aria-invalid={e?.producto ? true : undefined}
                          aria-describedby={e?.producto ? `${id}-producto-${l.clave}-error` : undefined}
                          onChange={(ev) => cambiarLinea(l.clave, { productoId: ev.target.value })}
                          className={CLASE_CAMPO}
                        >
                          <option value="">Elegí un producto</option>
                          {productos
                            .filter((p) => p.id === l.productoId || !usados.has(p.id))
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nombre}
                              </option>
                            ))}
                        </select>
                        {e?.producto && (
                          <p id={`${id}-producto-${l.clave}-error`} className={CLASE_ERROR}>
                            {e.producto}
                          </p>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          aria-label={`Cantidad del producto ${indice + 1}`}
                          data-campo={`cantidad-${l.clave}`}
                          value={l.cantidad}
                          placeholder="Cantidad"
                          aria-invalid={e?.cantidad ? true : undefined}
                          aria-describedby={e?.cantidad ? `${id}-cantidad-${l.clave}-error` : undefined}
                          onChange={(ev) => cambiarLinea(l.clave, { cantidad: ev.target.value })}
                          className={cn(CLASE_CAMPO, "text-right font-mono")}
                        />
                        {e?.cantidad && (
                          <p id={`${id}-cantidad-${l.clave}-error`} className={CLASE_ERROR}>
                            {e.cantidad}
                          </p>
                        )}
                      </div>
                      {lineas.length > 1 ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => sacarLinea(l.clave)}
                          aria-label={`Sacar el producto ${indice + 1}`}
                          className="min-h-9 text-chico font-semibold"
                        >
                          Sacar
                        </Button>
                      ) : (
                        <span aria-hidden="true" />
                      )}
                    </div>
                    {tiene !== null && (
                      <p className={cn("text-chico", pedida !== null && pedida > tiene ? "text-alerta" : "text-tinta-suave")}>
                        {pedida !== null && pedida > tiene ? textoDePasaLoQueTiene(nombreDe(origenId), tiene) : textoDeLoQueTiene(nombreDe(origenId), tiene)}
                      </p>
                    )}
                  </div>
                );
              })}
              {errores?.sinLineas && <p className={CLASE_ERROR}>{errores.sinLineas}</p>}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  data-campo="sumar"
                  disabled={sinProductosLibres}
                  onClick={sumarLinea}
                  className="min-h-8 text-chico font-semibold"
                >
                  Sumar otro producto
                </Button>
              </div>
            </fieldset>
          </>
        )}

        {!enLinea && (
          <p role="status" className="rounded-control bg-alerta-fondo px-3 py-2 text-chico text-alerta">
            {TEXTO_TRANSFERENCIA_SIN_CONEXION}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-control bg-peligro-fondo px-3 py-2 text-chico text-peligro">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={alCancelar} disabled={enviando} className="min-h-9 text-nav font-semibold">
            Cancelar
          </Button>
          {posible && (
            <Button
              type="button"
              onClick={pedir}
              aria-disabled={enviando || !enLinea ? true : undefined}
              className="min-h-9 text-nav font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
              {enviando ? "Pidiendo…" : "Pedir transferencia"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
