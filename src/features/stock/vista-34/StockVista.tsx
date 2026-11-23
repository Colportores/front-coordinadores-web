"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AccionesDeStock, DatosDeStock, TransferenciaPedida } from "@/datos/stock/contrato";
import { useEnLinea } from "@/lib/en-linea";
import { mensajeSinConexion } from "@/lib/mensajes";
import { cn } from "@/lib/utils";
import { registrarEnvio } from "@/shell/trabajo-pendiente";

import { hrefTransferencias } from "../vista-35/preseleccion";
import { AvisosDeStock } from "./AvisosDeStock";
import { DialogoDeTransferencia } from "./DialogoDeTransferencia";
import { ListaDeCiudades, RielDeCiudades } from "./ListaDeCiudades";
import {
  AMBITO_TODAS,
  construirAvisos,
  construirAvisosDePedidos,
  construirLista,
  construirMundo,
  construirRiel,
  construirTabla,
  construirTarjetas,
  mismoAmbito,
  resolverAmbito,
  totalDePedidosPorAutorizar,
  type Ambito,
  type AvisoDeStock,
} from "./modelo";
import { TablaDeProductos } from "./TablaDeProductos";
import { TarjetasPorTipo } from "./TarjetasPorTipo";
import { textoDeTransferenciaArmada, TITULO_DE_TRANSFERENCIA } from "./transferencia";

const CLASE_ENLACE =
  "inline-flex min-h-8 flex-none items-center gap-1.5 text-chico font-semibold whitespace-nowrap text-marca-media hover:text-marca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento";
const CLASE_ACCION =
  "inline-flex min-h-8 flex-none cursor-pointer items-center rounded-control border border-borde bg-superficie px-3.5 text-chico font-semibold whitespace-nowrap text-tinta-2 hover:bg-fondo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento";

/** Cuántos avisos de «Armaste la transferencia…» quedan a la vista: las últimas, para que la segunda no tape a la primera. */
const MAXIMO_DE_AVISOS = 3;

interface AvisoDeTransferencia {
  id: number;
  texto: string;
}

function textoVacio(titulo: string, esTodas: boolean, sinProductos: boolean): string {
  if (sinProductos) return "La campaña todavía no tiene productos en el catálogo. Cuando los tenga, vas a ver acá su stock.";
  return esTodas
    ? "Todavía no hay colportores en esta campaña. Cuando haya, vas a ver acá su stock."
    : `Todavía no hay colportores en ${titulo}. Cuando asignes alguno a una de sus zonas, aparece acá su stock.`;
}

/**
 * Vista 34 (HU-STK-010): el stock de la campaña por ciudad. A la izquierda la lista de ciudades por departamento (que se
 * contrae); a la derecha las tarjetas por tipo, los avisos de pedidos por autorizar, de producto agotado o que no alcanza y la
 * tabla por producto, donde cada fila se abre para ver quién lo tiene (con su «Ver en Cuentas →») y los ajustes que cargó la
 * colportora. Es de lectura: cambiar de ciudad o abrir una fila no pide nada al servidor. Lo único que escribe es «Pedir
 * transferencia de materiales», por `acciones` y una a la vez (sin `acciones`, la vista es solo de lectura y el botón no está).
 */
export function StockVista({ datos, acciones }: { datos: DatosDeStock; acciones?: AccionesDeStock }) {
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_TODAS);
  const [listaAbierta, setListaAbierta] = useState(true);
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  const [pidiendo, setPidiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorDeTransferencia, setErrorDeTransferencia] = useState<string | null>(null);
  const [armadas, setArmadas] = useState<AvisoDeTransferencia[]>([]);
  const enLinea = useEnLinea();
  const ocupado = useRef(false);
  const numeroDeAviso = useRef(0);
  const raiz = useRef<HTMLDivElement>(null);
  // Al apagar el botón que tenía el foco (contraer la lista) o al saltar a una fila, el foco va a su par.
  const focoPendiente = useRef<string | null>(null);

  const mundo = useMemo(() => construirMundo(datos), [datos]);
  const resuelto = useMemo(() => resolverAmbito(mundo, ambito), [mundo, ambito]);
  const lista = useMemo(() => construirLista(mundo, resuelto), [mundo, resuelto]);
  const riel = useMemo(() => construirRiel(lista), [lista]);
  const tarjetas = useMemo(() => construirTarjetas(mundo, resuelto), [mundo, resuelto]);
  const avisos = useMemo(() => construirAvisos(mundo, resuelto), [mundo, resuelto]);
  const avisosDePedidos = useMemo(() => construirAvisosDePedidos(mundo, resuelto), [mundo, resuelto]);
  const pedidosPorAutorizar = totalDePedidosPorAutorizar(avisosDePedidos);
  const grupos = useMemo(() => construirTabla(mundo, resuelto), [mundo, resuelto]);

  useEffect(() => {
    const clave = focoPendiente.current;
    if (!clave) return;
    focoPendiente.current = null;
    const destino = Array.from(raiz.current?.querySelectorAll<HTMLElement>("[data-foco]") ?? []).find((el) => el.dataset.foco === clave);
    destino?.focus();
    destino?.scrollIntoView?.({ block: "nearest" });
  });

  const elegir = (destino: Ambito) => {
    if (mismoAmbito(ambito, destino)) return;
    setAmbito(destino);
  };

  const alternar = useCallback((clave: string) => {
    setAbiertas((anteriores) => {
      const siguientes = new Set(anteriores);
      if (!siguientes.delete(clave)) siguientes.add(clave);
      return siguientes;
    });
  }, []);

  // «Ver quién tiene» habla de una ciudad: si se está mirando varias, pasa a esa ciudad y abre la fila del producto.
  const verQuienTiene = (aviso: AvisoDeStock) => {
    setAmbito({ tipo: "ciudad", ciudadId: aviso.ciudadId });
    setAbiertas((anteriores) => new Set(anteriores).add(aviso.unidadClave));
    focoPendiente.current = `fila:${aviso.unidadClave}`;
  };

  // Una sola escritura a la vez: el doble toque y una segunda mientras la primera está en camino se ignoran. Si falla, todo vuelve a
  // poder usarse con lo cargado y el aviso dice qué pasó.
  async function pedirTransferencia(pedido: TransferenciaPedida) {
    if (!acciones || ocupado.current) return;
    ocupado.current = true;
    setEnviando(true);
    setErrorDeTransferencia(null);
    const envio = (async () => {
      try {
        return await acciones.pedirTransferencia(pedido);
      } catch {
        return { ok: false, causa: "sin-conexion" } as const;
      }
    })();
    registrarEnvio(envio);
    try {
      const resultado = await envio;
      if (!resultado.ok) {
        setErrorDeTransferencia(
          resultado.causa === "sin-conexion"
            ? mensajeSinConexion("pedir la transferencia")
            : (resultado.mensaje ?? "No se pudo pedir la transferencia. Probá de nuevo; si sigue igual, avisá al equipo."),
        );
        return;
      }
      const nombre = (id: string) => datos.colportores.find((c) => c.id === id)?.nombre ?? "";
      const unidades = pedido.lineas.reduce((suma, l) => suma + l.cantidad, 0);
      const texto = textoDeTransferenciaArmada(resultado.valor.numero, nombre(pedido.origenId), nombre(pedido.destinoId), unidades);
      numeroDeAviso.current += 1;
      const id = numeroDeAviso.current;
      setArmadas((previas) => [{ id, texto }, ...previas].slice(0, MAXIMO_DE_AVISOS));
      setPidiendo(false);
      focoPendiente.current = "pedir-transferencia";
    } finally {
      ocupado.current = false;
      setEnviando(false);
    }
  }

  function cerrarElDialogo() {
    if (ocupado.current) return;
    setPidiendo(false);
    setErrorDeTransferencia(null);
    focoPendiente.current = "pedir-transferencia";
  }

  const sinProductos = mundo.totalProductos === 0;
  const vacio = resuelto.personas.length === 0 || sinProductos;

  return (
    <div
      ref={raiz}
      className={cn("grid min-h-0 flex-1 bg-fondo", listaAbierta ? "grid-cols-[320px_minmax(0,1fr)]" : "grid-cols-[68px_minmax(0,1fr)]")}
    >
      {listaAbierta ? (
        <ListaDeCiudades
          lista={lista}
          alElegir={elegir}
          alContraer={() => {
            focoPendiente.current = "alternar";
            setListaAbierta(false);
          }}
        />
      ) : (
        <RielDeCiudades
          items={riel}
          alElegir={elegir}
          alExpandir={() => {
            focoPendiente.current = "alternar";
            setListaAbierta(true);
          }}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden px-[22px] pt-[18px] pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-[3px]">
            <h2 className="font-serif text-[22px] font-semibold wrap-anywhere text-tinta">{resuelto.titulo}</h2>
            <p className="text-chico text-tinta-suave">{resuelto.subtitulo}</p>
          </div>
          <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1">
            {acciones && (
              <button
                type="button"
                data-foco="pedir-transferencia"
                onClick={() => {
                  setErrorDeTransferencia(null);
                  setPidiendo(true);
                }}
                className={CLASE_ACCION}
              >
                {TITULO_DE_TRANSFERENCIA}
              </button>
            )}
            <nav aria-label="Otras vistas de stock" className="flex flex-none flex-wrap items-center gap-x-4">
              <Link href="/stock/precios" className={CLASE_ENLACE}>
                Precios de venta →
              </Link>
              <Link href="/stock/pedidos" className={CLASE_ENLACE}>
                Pedidos y transferencias{" "}
                {pedidosPorAutorizar > 0 && (
                  <>
                    <span
                      aria-hidden="true"
                      className="rounded-pastilla bg-alerta-fondo px-1.5 font-mono text-[10.5px] font-medium text-alerta"
                    >
                      {pedidosPorAutorizar}
                    </span>
                    <span className="sr-only">
                      {pedidosPorAutorizar === 1 ? "(1 pedido por autorizar)" : `(${pedidosPorAutorizar} pedidos por autorizar)`}
                    </span>
                  </>
                )}{" "}
                <span>→</span>
              </Link>
            </nav>
          </div>
        </div>

        <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
          {armadas.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-control bg-exito-fondo px-3 py-2 text-chico text-exito">
              <span className="min-w-0 wrap-anywhere">
                {a.texto}{" "}
                <Link href={hrefTransferencias()} className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento">
                  Ver transferencias →
                </Link>
              </span>
              <button
                type="button"
                aria-label="Cerrar el aviso"
                onClick={() => setArmadas((previas) => previas.filter((x) => x.id !== a.id))}
                className="inline-flex min-h-6 min-w-6 flex-none cursor-pointer items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          ))}
        </div>

        {vacio ? (
          <p role="status" className="rounded-tarjeta border border-borde bg-superficie px-[18px] py-6 text-center text-chico text-tinta-suave">
            {textoVacio(resuelto.titulo, resuelto.ambito.tipo === "todas", sinProductos)}
          </p>
        ) : (
          <>
            <TarjetasPorTipo tarjetas={tarjetas} />
            <AvisosDeStock avisos={avisos} avisosDePedidos={avisosDePedidos} alVerQuienTiene={verQuienTiene} />
            <div className="min-h-0 flex-1 overflow-auto rounded-tarjeta border border-borde bg-superficie">
              <TablaDeProductos grupos={grupos} abiertas={abiertas} nombreDelLugar={resuelto.titulo} alAlternar={alternar} />
            </div>
          </>
        )}
      </div>

      {pidiendo && acciones && (
        <DialogoDeTransferencia
          datos={datos}
          enviando={enviando}
          error={errorDeTransferencia}
          enLinea={enLinea}
          alCancelar={cerrarElDialogo}
          alPedir={(pedido) => void pedirTransferencia(pedido)}
        />
      )}
    </div>
  );
}
