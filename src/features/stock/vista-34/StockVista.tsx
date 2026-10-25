"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import type { DatosDeStock } from "@/datos/stock/contrato";
import { cn } from "@/lib/utils";

import { AvisosDeStock } from "./AvisosDeStock";
import { ListaDeCiudades, RielDeCiudades } from "./ListaDeCiudades";
import {
  AMBITO_TODAS,
  construirAvisos,
  construirLista,
  construirMundo,
  construirRiel,
  construirTabla,
  construirTarjetas,
  mismoAmbito,
  resolverAmbito,
  type Ambito,
  type AvisoDeStock,
} from "./modelo";
import { TablaDeProductos } from "./TablaDeProductos";
import { TarjetasPorTipo } from "./TarjetasPorTipo";

function textoVacio(titulo: string, esTodas: boolean, sinProductos: boolean): string {
  if (sinProductos) return "La campaña todavía no tiene productos en el catálogo. Cuando los tenga, vas a ver acá su stock.";
  return esTodas
    ? "Todavía no hay colportores en esta campaña. Cuando haya, vas a ver acá su stock."
    : `Todavía no hay colportores en ${titulo}. Cuando asignes alguno a una de sus zonas, aparece acá su stock.`;
}

/**
 * Vista 34 (HU-STK-010): el stock de la campaña por ciudad. A la izquierda la lista de ciudades por departamento (que se
 * contrae); a la derecha las tarjetas por tipo, los avisos de producto agotado o que no alcanza y la tabla por producto,
 * donde cada fila se abre para ver quién lo tiene. Es de lectura: cambiar de ciudad o abrir una fila no pide nada al
 * servidor.
 */
export function StockVista({ datos }: { datos: DatosDeStock }) {
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_TODAS);
  const [listaAbierta, setListaAbierta] = useState(true);
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  const raiz = useRef<HTMLDivElement>(null);
  // Al apagar el botón que tenía el foco (contraer la lista) o al saltar a una fila, el foco va a su par.
  const focoPendiente = useRef<string | null>(null);

  const mundo = useMemo(() => construirMundo(datos), [datos]);
  const resuelto = useMemo(() => resolverAmbito(mundo, ambito), [mundo, ambito]);
  const lista = useMemo(() => construirLista(mundo, resuelto), [mundo, resuelto]);
  const riel = useMemo(() => construirRiel(lista), [lista]);
  const tarjetas = useMemo(() => construirTarjetas(mundo, resuelto), [mundo, resuelto]);
  const avisos = useMemo(() => construirAvisos(mundo, resuelto), [mundo, resuelto]);
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
          {/* La vista 35 (pedidos y transferencias) todavía no existe: no hay a dónde ir. */}
          <AccionNoDisponible className="inline-flex min-h-8 flex-none items-center text-chico font-semibold whitespace-nowrap text-marca-media">
            Pedidos y transferencias →
          </AccionNoDisponible>
        </div>

        {vacio ? (
          <p role="status" className="rounded-tarjeta border border-borde bg-superficie px-[18px] py-6 text-center text-chico text-tinta-suave">
            {textoVacio(resuelto.titulo, resuelto.ambito.tipo === "todas", sinProductos)}
          </p>
        ) : (
          <>
            <TarjetasPorTipo tarjetas={tarjetas} />
            <AvisosDeStock avisos={avisos} alVerQuienTiene={verQuienTiene} />
            <div className="min-h-0 flex-1 overflow-auto rounded-tarjeta border border-borde bg-superficie">
              <TablaDeProductos grupos={grupos} abiertas={abiertas} nombreDelLugar={resuelto.titulo} alAlternar={alternar} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
