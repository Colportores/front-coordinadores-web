"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AcompanamientoDeColportor, DatosEquipoPorCiudad } from "@/datos/equipo/contrato";
import { cn } from "@/lib/utils";

import type { AccionesEquipo } from "./acciones";
import { FranjaPendientes, type Pendiente } from "./FranjaPendientes";
import { ListaDeCiudades, RielDeCiudades } from "./ListaDeCiudades";
import {
  AMBITO_TODAS,
  construirLista,
  construirRiel,
  mismoAmbito,
  pluralAcompanamientos,
  pluralColportores,
  resolverAmbito,
  type Ambito,
  type VistaEquipo,
} from "./modelo";
import type { AcompanamientoRegistrado } from "./RegistrarAcompanamiento";
import { TablaAcompanamientos } from "./TablaAcompanamientos";
import { TablaZonas } from "./TablaZonas";

const VISTAS: { valor: VistaEquipo; etiqueta: string }[] = [
  { valor: "zonas", etiqueta: "Zonas" },
  { valor: "acompanamientos", etiqueta: "Acompañamientos" },
];

/** Agrega a los datos los acompañamientos que se registraron desde esta pantalla y todavía no volvieron del servidor. */
function conRegistrados(datos: DatosEquipoPorCiudad, registrados: Record<string, AcompanamientoDeColportor[]>): DatosEquipoPorCiudad {
  if (Object.keys(registrados).length === 0) return datos;
  return {
    ...datos,
    colportores: datos.colportores.map((c) => {
      const nuevos = (registrados[c.id] ?? []).filter((r) => !c.acompanamientos.some((a) => a.jornadaId === r.jornadaId));
      return nuevos.length === 0 ? c : { ...c, acompanamientos: [...nuevos, ...c.acompanamientos] };
    }),
  };
}

function pendientesDe(sinZona: string[], solicitudes: number, vista: VistaEquipo): Pendiente[] {
  const pendientes: Pendiente[] = [];
  // En «Zonas» la colportora sin zona ya está en la tabla, con su botón «Asignar zona».
  if (vista !== "zonas" && sinZona.length > 0) {
    pendientes.push({
      clave: "sin-zona",
      etiqueta: "EQUIPO",
      texto: sinZona.length === 1 ? `${sinZona[0]} no tiene zona asignada` : `${sinZona.length} colportores no tienen zona asignada`,
      accion: "Asignar zona",
      href: "/ciudades",
    });
  }
  if (solicitudes > 0) {
    pendientes.push({
      clave: "solicitudes",
      etiqueta: "SOLICITUD",
      texto: solicitudes === 1 ? "1 persona pidió entrar a la campaña" : `${solicitudes} personas pidieron entrar a la campaña`,
      accion: "Revisar",
      href: "/equipo/anadir",
    });
  }
  return pendientes;
}

/**
 * Vista 33 (HU-JOR-004, HU-CAM-006): el equipo de la campaña por ciudad. A la izquierda la lista de ciudades por
 * departamento (que se contrae); a la derecha la tabla de zonas o la de acompañamientos de la ciudad elegida, con la
 * acción de cada tema en la misma fila. Cambiar de ciudad o de pestaña no pide nada al servidor: solo abrir las
 * jornadas de un colportor y registrar un acompañamiento hablan con él.
 */
export function EquipoVista({ datos, acciones }: { datos: DatosEquipoPorCiudad; acciones: AccionesEquipo }) {
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_TODAS);
  const [vista, setVista] = useState<VistaEquipo>("zonas");
  const [listaAbierta, setListaAbierta] = useState(true);
  const [historialesAbiertos, setHistorialesAbiertos] = useState<ReadonlySet<string>>(new Set());
  const [registrandoId, setRegistrandoId] = useState<string | null>(null);
  const [registrados, setRegistrados] = useState<Record<string, AcompanamientoDeColportor[]>>({});
  const raiz = useRef<HTMLDivElement>(null);
  // Al apagar el botón que tenía el foco (contraer la lista, cerrar el registro) el foco se devuelve a su par.
  const focoPendiente = useRef<string | null>(null);

  const actuales = useMemo(() => conRegistrados(datos, registrados), [datos, registrados]);
  const resuelto = useMemo(() => resolverAmbito(actuales, ambito), [actuales, ambito]);
  const lista = useMemo(() => construirLista(actuales, resuelto), [actuales, resuelto]);
  const riel = useMemo(() => construirRiel(lista), [lista]);

  useEffect(() => {
    const clave = focoPendiente.current;
    if (!clave) return;
    focoPendiente.current = null;
    Array.from(raiz.current?.querySelectorAll<HTMLElement>("[data-foco]") ?? [])
      .find((el) => el.dataset.foco === clave)
      ?.focus();
  });

  const elegir = (destino: Ambito) => {
    if (mismoAmbito(ambito, destino)) return;
    setAmbito(destino);
    setRegistrandoId(null);
  };

  const alternarHistorial = useCallback((colportorId: string) => {
    setHistorialesAbiertos((abiertos) => {
      const siguientes = new Set(abiertos);
      if (!siguientes.delete(colportorId)) siguientes.add(colportorId);
      return siguientes;
    });
  }, []);

  const cerrarRegistro = () => {
    if (registrandoId) focoPendiente.current = `registrar:${registrandoId}`;
    setRegistrandoId(null);
  };

  const alRegistrar = useCallback((colportorId: string, { jornada, dia, acompanante }: AcompanamientoRegistrado) => {
    setRegistrados((anteriores) => {
      const delColportor = anteriores[colportorId] ?? [];
      if (delColportor.some((r) => r.jornadaId === jornada.id)) return anteriores;
      return { ...anteriores, [colportorId]: [{ jornadaId: jornada.id, dia, horas: jornada.horas, acompanante, acompananteEsVos: true }, ...delColportor] };
    });
  }, []);

  const total = resuelto.colportores.length;
  const sinZona = resuelto.sinZona.map((c) => c.nombre);
  const totalAcompanamientos = resuelto.colportores.reduce((suma, c) => suma + c.acompanamientos.length, 0);
  const subtitulo = [
    pluralColportores(resuelto.conZona) + (sinZona.length > 0 ? ` + ${sinZona.length} sin zona` : ""),
    resuelto.departamento ? `Departamento ${resuelto.departamento}` : null,
    vista === "acompanamientos" ? `${pluralAcompanamientos(totalAcompanamientos)} en la campaña` : null,
    vista === "acompanamientos" ? "ordenado por días sin acompañar" : null,
  ]
    .filter((parte): parte is string => parte !== null)
    .join(" · ");

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
            <p className="text-chico text-tinta-suave">{subtitulo}</p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Link
              href="/equipo/anadir"
              className="inline-flex min-h-8 items-center rounded-control border border-borde bg-superficie px-3.5 text-chico font-semibold text-tinta-2 hover:bg-fondo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
            >
              + Añadir colportor
            </Link>
            <div role="group" aria-label="Ver" className="flex overflow-hidden rounded-control border border-borde bg-superficie">
              {VISTAS.map(({ valor, etiqueta }) => {
                const activa = valor === vista;
                return (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => {
                      setVista(valor);
                      setRegistrandoId(null);
                    }}
                    className={cn(
                      "inline-flex min-h-8 items-center border-r border-borde px-3.5 text-chico font-semibold last:border-r-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acento",
                      activa ? "bg-marca text-superficie" : "bg-superficie text-tinta-2 hover:bg-marca-clara",
                    )}
                  >
                    {etiqueta}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <FranjaPendientes pendientes={pendientesDe(sinZona, datos.solicitudesPendientes, vista)} />

        <div className="min-h-0 flex-1 overflow-auto rounded-tarjeta border border-borde bg-superficie">
          {total === 0 ? (
            <p role="status" className="px-[18px] py-6 text-center text-chico text-tinta-suave">
              {resuelto.ambito.tipo === "todas"
                ? "Todavía no hay colportores en esta campaña. Añadilos con «+ Añadir colportor»."
                : `Todavía no hay colportores en ${resuelto.titulo}. Cuando asignes alguno a una de sus zonas, aparece acá.`}
            </p>
          ) : vista === "zonas" ? (
            <TablaZonas resuelto={resuelto} />
          ) : (
            <TablaAcompanamientos
              resuelto={resuelto}
              datos={actuales}
              acciones={acciones}
              historialesAbiertos={historialesAbiertos}
              registrandoId={registrandoId}
              alAlternarHistorial={alternarHistorial}
              alAbrirRegistro={setRegistrandoId}
              alCerrarRegistro={cerrarRegistro}
              alRegistrar={alRegistrar}
            />
          )}
        </div>
      </div>
    </div>
  );
}
