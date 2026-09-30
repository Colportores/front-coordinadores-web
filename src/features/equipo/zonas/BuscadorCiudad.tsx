"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CiudadDelCatalogo } from "@/datos/equipo/zonas";

export const MENSAJE_BUSQUEDA_SIN_CONEXION = "No se pudo buscar en el catálogo. Revisá la conexión y probá de nuevo.";

interface Props {
  buscar: (texto: string) => Promise<CiudadDelCatalogo[]>;
  /** Ciudades del catálogo que ya están en la campaña (no se ofrecen de nuevo). */
  excluidas: ReadonlySet<string>;
  /** Se está agregando la ciudad elegida: nada más se puede tocar. */
  ocupado: boolean;
  /** Aviso de la última ciudad que no se pudo agregar. */
  error: string | null;
  onElegir: (ciudad: CiudadDelCatalogo) => void;
  onCerrar: () => void;
}

/** «+ Agregar ciudad»: buscador del catálogo por nombre o provincia, sin las ciudades que ya están en la campaña. */
export function BuscadorCiudad({ buscar, excluidas, ocupado, error, onElegir, onCerrar }: Props) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<CiudadDelCatalogo[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);
  // Cada búsqueda nueva invalida a la anterior: una respuesta vieja no pisa a la de lo último que se escribió.
  const version = useRef(0);

  useEffect(() => {
    const esta = ++version.current;
    // Un temporizador en cero mantiene fuera del cuerpo del efecto el cambio de estado («cargando»).
    const arranque = setTimeout(() => {
      setResultados(null);
      setFallo(false);
      buscar(texto)
        .then((encontradas) => {
          if (esta === version.current) setResultados(encontradas);
        })
        .catch(() => {
          if (esta === version.current) setFallo(true);
        });
    }, 0);
    return () => clearTimeout(arranque);
  }, [texto, intento, buscar]);

  const ofrecidas = resultados?.filter((c) => !excluidas.has(c.id)) ?? null;

  return (
    <section
      aria-label="Agregar ciudad"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !ocupado) onCerrar();
      }}
      className="flex max-w-[460px] flex-col gap-2.5 rounded-tarjeta border border-borde bg-superficie px-4 py-3.5"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-[15px] font-semibold text-tinta">Agregar ciudad a la campaña</h3>
        <button
          type="button"
          onClick={onCerrar}
          disabled={ocupado}
          aria-label="Cerrar el buscador de ciudades"
          className="cursor-pointer rounded-control px-1.5 text-nav text-tinta-suave hover:text-tinta disabled:cursor-not-allowed disabled:opacity-50"
        >
          ✕
        </button>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">BUSCAR POR NOMBRE O PROVINCIA</span>
        <input
          type="search"
          value={texto}
          autoFocus
          disabled={ocupado}
          onChange={(e) => setTexto(e.target.value)}
          className="min-h-10 rounded-control border border-grafico-neutro bg-superficie px-3 text-nav text-tinta outline-none focus-visible:ring-2 focus-visible:ring-acento"
        />
      </label>

      {fallo ? (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-control bg-peligro-fondo px-3 py-2 text-cuerpo font-medium text-peligro">
          <span>{MENSAJE_BUSQUEDA_SIN_CONEXION}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setIntento((n) => n + 1)} className="text-chico font-semibold text-tinta-2">
            Reintentar
          </Button>
        </div>
      ) : ofrecidas === null ? (
        <p role="status" className="text-cuerpo text-tinta-suave">
          Buscando ciudades…
        </p>
      ) : ofrecidas.length === 0 ? (
        <p role="status" className="text-cuerpo text-tinta-suave">
          {texto.trim() === ""
            ? "Ya están todas las ciudades del catálogo en la campaña."
            : `No hay ciudades que coincidan con «${texto.trim()}».`}
        </p>
      ) : (
        <ul aria-label="Ciudades del catálogo" className="max-h-60 overflow-auto rounded-control border border-borde">
          {ofrecidas.map((c) => (
            <li key={c.id} className="border-t border-borde-suave first:border-t-0">
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onElegir(c)}
                aria-label={`Agregar ${c.nombre}, ${c.provincia}`}
                className="flex w-full cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-fondo focus-visible:bg-fondo focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="min-w-0 text-nav font-semibold break-words text-tinta">{c.nombre}</span>
                <span className="flex-none text-chico text-tinta-suave">{c.provincia}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {ocupado ? (
        <p role="status" className="text-chico text-tinta-suave">
          Agregando la ciudad…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-control bg-peligro-fondo px-3 py-2 text-cuerpo font-medium text-peligro">
          {error}
        </p>
      ) : null}
    </section>
  );
}
