"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { DatosAcompanamiento, JornadaReciente, UltimoAcompanamiento } from "@/datos/equipo/contrato";

/**
 * Últimos acompañamientos del equipo (colportor, día y quién acompañó) y, desde
 * «Registrar acompañamiento», elegir una de las últimas jornadas para registrarlo
 * (HU-JOR-004). Solo simulado: el estado vive en el cliente hasta que exista el BFF.
 */
export function Acompanamientos({ datos }: { datos: DatosAcompanamiento }) {
  const [ultimos, setUltimos] = useState<UltimoAcompanamiento[]>(datos.ultimosAcompanamientos);
  const [jornadas, setJornadas] = useState<JornadaReciente[]>(datos.jornadasRecientes);
  const [acompanadas, setAcompanadas] = useState(datos.jornadasAcompanadas);
  const [eligiendo, setEligiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Un doble toque dispara dos clicks antes del re-render: el ref corta el segundo.
  const registradas = useRef<Set<string>>(new Set());

  function registrar(jornada: JornadaReciente) {
    if (registradas.current.has(jornada.id)) return;
    registradas.current.add(jornada.id);
    setUltimos((actuales) => [
      {
        id: `reg-${jornada.id}`,
        colportor: jornada.colportor,
        dia: jornada.dia,
        acompaniante: datos.acompaniante,
      },
      ...actuales,
    ]);
    setAcompanadas((actual) => actual + 1);
    setJornadas((actuales) => actuales.filter((j) => j.id !== jornada.id));
    setAviso(`Acompañamiento registrado: jornada de ${jornada.colportor} · ${jornada.dia}.`);
    setEligiendo(false);
  }

  const porcentaje = datos.jornadasTotales === 0 ? 0 : Math.round((acompanadas / datos.jornadasTotales) * 100);

  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="flex items-baseline justify-between border-b border-borde px-4 pt-[14px] pb-2.5">
        <span className="font-serif text-titulo font-semibold text-tinta">Acompañamientos</span>
        {!eligiendo && (
          <button
            type="button"
            onClick={() => {
              setAviso(null);
              setEligiendo(true);
            }}
            className="text-mini font-semibold text-marca-media hover:underline"
          >
            Registrar acompañamiento
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2.5 px-4 py-3">
        {aviso && (
          <p role="status" className="rounded-control bg-superficie-suave px-3 py-2 text-mini text-tinta-2">
            {aviso}
          </p>
        )}

        {eligiendo && (
          <div
            role="group"
            aria-label="Elegir la jornada a acompañar"
            className="flex flex-col gap-2 rounded-control border border-borde px-3 py-[11px]"
          >
            <span className="text-mini font-semibold text-tinta">Elegí la jornada que acompañaste</span>
            {jornadas.length === 0 ? (
              <p className="text-mini text-tinta-suave">No hay jornadas recientes para registrar.</p>
            ) : (
              jornadas.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  aria-label={`Elegir jornada de ${j.colportor} · ${j.dia}`}
                  onClick={() => registrar(j)}
                  className="flex flex-col items-start gap-0.5 rounded-control border border-borde px-3 py-2 text-left hover:bg-fondo"
                >
                  <span className="text-cuerpo font-semibold text-tinta">
                    {j.colportor} · {j.dia}
                  </span>
                  <span className="text-mini text-tinta-suave">{j.detalle}</span>
                </button>
              ))
            )}
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="w-fit text-mini font-semibold text-tinta-2"
              onClick={() => setEligiendo(false)}
            >
              Cancelar
            </Button>
          </div>
        )}

        {ultimos.length === 0 ? (
          <p className="text-mini text-tinta-suave">Todavía no hay acompañamientos registrados.</p>
        ) : (
          <ul className="flex flex-col gap-2.5" aria-label="Últimos acompañamientos">
            {ultimos.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 rounded-control border border-borde px-3 py-[11px]">
                <span className="text-cuerpo font-semibold text-tinta">
                  {a.colportor} · {a.dia}
                </span>
                <span className="text-mini text-tinta-suave">Acompañó {a.acompaniante}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between px-px py-0.5 text-cuerpo">
          <span className="text-tinta-suave">Jornadas acompañadas esta campaña</span>
          <span className="font-mono font-medium text-tinta">{porcentaje}%</span>
        </div>
      </div>
    </div>
  );
}
