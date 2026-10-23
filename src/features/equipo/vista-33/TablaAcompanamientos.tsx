"use client";

import { Fragment } from "react";

import type { ColportorDeEquipo, DatosEquipoPorCiudad } from "@/datos/equipo/contrato";
import { diaConSemana, diasEntre, hace } from "@/lib/dias";
import { cn } from "@/lib/utils";

import type { AccionesEquipo } from "./acciones";
import {
  diasSinAcompanar,
  ordenarPorDiasSinAcompanar,
  pluralColportores,
  semanasAcompanadas,
  semanasDeLaCampania,
  textoHoras,
  ultimoAcompanamiento,
  type AmbitoResuelto,
  type Semana,
} from "./modelo";
import { RegistrarAcompanamiento, type AcompanamientoRegistrado } from "./RegistrarAcompanamiento";
import { CabeceraDeGrupo, CLASE_BOTON_SECUNDARIO } from "./TablaZonas";

const COLUMNAS = 7;

function textoSemanas(semanas: Semana[]): string {
  if (semanas.length === 0) return "SEMANAS";
  const primera = semanas[0].numero;
  const ultima = semanas[semanas.length - 1].numero;
  return primera === ultima ? `SEMANA S${primera}` : `SEMANAS S${primera} A S${ultima}`;
}

function Semanas({ colportor, semanas }: { colportor: ColportorDeEquipo; semanas: Semana[] }) {
  const tuvo = semanasAcompanadas(colportor, semanas);
  const conAcompanamiento = semanas.filter((_, i) => tuvo[i]).map((s) => `S${s.numero}`);
  const resumen = conAcompanamiento.length === 0 ? "ninguna semana" : conAcompanamiento.join(", ");
  return (
    <span role="img" aria-label={`Semanas con acompañamiento: ${resumen}`} className="flex items-center gap-[5px]">
      {semanas.map((s, i) => (
        <span
          key={s.numero}
          title={`S${s.numero}: ${tuvo[i] ? "acompañado" : "sin acompañamiento"}`}
          className={cn(
            "grid size-4 flex-none place-items-center rounded-full border-[1.5px] text-[9px] text-superficie",
            tuvo[i] ? "border-marca-media bg-marca-media" : s.actual ? "border-tinta-tenue bg-superficie" : "border-grafico-neutro bg-superficie",
          )}
        >
          <span aria-hidden="true">{tuvo[i] ? "✓" : ""}</span>
        </span>
      ))}
    </span>
  );
}

function SinAcompanar({ colportor, datos }: { colportor: ColportorDeEquipo; datos: DatosEquipoPorCiudad }) {
  const ultimo = ultimoAcompanamiento(colportor);
  const dias = diasSinAcompanar(colportor, datos.campaniaInicio, datos.hoy);
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-mono">{ultimo ? hace(dias) : "Nunca"}</span>
      <span className="text-[10.5px] text-tinta-suave">
        {ultimo ? `último: ${diaConSemana(ultimo)}` : `${dias} ${dias === 1 ? "día" : "días"} desde el inicio`}
      </span>
    </span>
  );
}

function Historial({ colportor }: { colportor: ColportorDeEquipo }) {
  const lista = colportor.acompanamientos.slice().sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
  return (
    <section
      id={`historial-${colportor.id}`}
      aria-label={`Historial de acompañamientos de ${colportor.nombre}`}
      className="flex flex-col gap-1.5 border-b border-borde bg-marca-clara/40 py-2.5 pr-[18px] pl-[34px]"
    >
      <h3 className="text-etiqueta font-semibold tracking-[0.13em] wrap-anywhere text-tinta-suave">
        HISTORIAL DE ACOMPAÑAMIENTOS · {colportor.nombre.toUpperCase()}
      </h3>
      {lista.length === 0 ? (
        <p className="text-chico text-tinta-suave">Todavía no se lo acompañó en esta campaña.</p>
      ) : (
        <ul className="flex flex-col">
          {lista.map((a) => (
            <li
              key={a.jornadaId}
              className="grid min-h-[30px] grid-cols-[96px_70px_minmax(0,1fr)] items-center gap-3.5 border-b border-borde text-chico last:border-b-0"
            >
              <span className="font-mono">{diaConSemana(a.dia)}</span>
              <span className="font-mono text-tinta-2">{textoHoras(a.horas)}</span>
              <span className="wrap-anywhere">
                <span className="sr-only">Acompañó: </span>
                {a.acompanante}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Pestaña «Acompañamientos» de la vista 33 (HU-JOR-004): por colportor, las semanas acompañadas, el total, los días sin
 * acompañar (de cualquier coordinador, sin umbral ni color), el historial que se abre debajo de la fila (se pueden abrir
 * varios) y el registro de un acompañamiento sobre una jornada ya terminada.
 */
export function TablaAcompanamientos({
  resuelto,
  datos,
  acciones,
  historialesAbiertos,
  registrandoId,
  alAlternarHistorial,
  alAbrirRegistro,
  alCerrarRegistro,
  alRegistrar,
}: {
  resuelto: AmbitoResuelto;
  datos: DatosEquipoPorCiudad;
  acciones: AccionesEquipo;
  historialesAbiertos: ReadonlySet<string>;
  registrandoId: string | null;
  alAlternarHistorial: (colportorId: string) => void;
  alAbrirRegistro: (colportorId: string) => void;
  alCerrarRegistro: () => void;
  alRegistrar: (colportorId: string, registrado: AcompanamientoRegistrado) => void;
}) {
  const semanas = semanasDeLaCampania(datos.campaniaInicio, datos.campaniaFin, datos.hoy);
  const aunNoEmpezo = diasEntre(datos.hoy, datos.campaniaInicio) > 0;

  return (
    <table aria-label="Acompañamientos de cada colportor" className="w-full table-fixed border-collapse">
      <colgroup>
        <col className="w-[20%]" />
        <col className="w-[14%]" />
        <col className="w-[196px]" />
        <col className="w-[64px]" />
        <col />
        <col className="w-[140px]" />
        <col className="w-[204px]" />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-superficie">
        <tr className="border-b border-borde text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave">
          <th scope="col" className="px-[18px] py-[9px] text-left font-semibold">
            COLPORTOR
          </th>
          <th scope="col" className="px-2 py-[9px] text-left font-semibold">
            ZONA
          </th>
          <th scope="col" className="px-2 py-[9px] text-left font-semibold">
            {textoSemanas(semanas)}
          </th>
          <th scope="col" className="px-2 py-[9px] text-right font-semibold">
            TOTAL
          </th>
          <th scope="col" className="px-2 py-[9px] text-left font-semibold">
            SIN ACOMPAÑAR
          </th>
          <th scope="col" className="px-2 py-[9px] text-right font-semibold">
            <span className="sr-only">Historial</span>
          </th>
          <th scope="col" className="px-[18px] py-[9px] text-right font-semibold">
            <span className="sr-only">Registrar</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {resuelto.grupos.map((grupo) => (
          <Fragment key={grupo.clave}>
            {resuelto.conCabeceras && (
              <CabeceraDeGrupo nombre={grupo.nombre} cantidad={pluralColportores(grupo.colportores.length)} columnas={COLUMNAS} />
            )}
            {ordenarPorDiasSinAcompanar(grupo.colportores, datos.campaniaInicio, datos.hoy).map((c) => {
              const historialAbierto = historialesAbiertos.has(c.id);
              const registrando = registrandoId === c.id;
              return (
                <Fragment key={c.id}>
                  <tr className={cn("min-h-12 border-b border-borde-suave text-cuerpo", historialAbierto && "bg-marca-clara/40")}>
                    <th scope="row" className="px-[18px] py-2.5 text-left align-middle font-semibold text-tinta">
                      <span className="block wrap-anywhere">{c.nombre}</span>
                    </th>
                    <td className="px-2 py-2.5 align-middle wrap-anywhere">
                      {c.zonaActual ? c.zonaActual.nombre : <span className="text-tinta-suave">Sin zona</span>}
                    </td>
                    <td className="px-2 py-2.5 align-middle">
                      <Semanas colportor={c} semanas={semanas} />
                    </td>
                    <td className="px-2 py-2.5 text-right align-middle font-mono font-semibold">{c.acompanamientos.length}</td>
                    <td className="px-2 py-2.5 align-middle">
                      {aunNoEmpezo ? <span className="text-tinta-suave">La campaña todavía no empezó</span> : <SinAcompanar colportor={c} datos={datos} />}
                    </td>
                    <td className="px-2 py-2.5 text-right align-middle">
                      <button
                        type="button"
                        aria-expanded={historialAbierto}
                        aria-controls={historialAbierto ? `historial-${c.id}` : undefined}
                        aria-label={`${historialAbierto ? "Ocultar historial" : "Ver historial"} de ${c.nombre}`}
                        onClick={() => alAlternarHistorial(c.id)}
                        className={CLASE_BOTON_SECUNDARIO}
                      >
                        {historialAbierto ? "Ocultar historial" : "Ver historial"}
                      </button>
                    </td>
                    <td className="px-[18px] py-2.5 text-right align-middle">
                      <button
                        type="button"
                        data-foco={`registrar:${c.id}`}
                        aria-expanded={registrando}
                        aria-label={`Registrar acompañamiento de ${c.nombre}`}
                        onClick={() => (registrando ? alCerrarRegistro() : alAbrirRegistro(c.id))}
                        className={CLASE_BOTON_SECUNDARIO}
                      >
                        Registrar acompañamiento
                      </button>
                    </td>
                  </tr>
                  {historialAbierto && (
                    <tr>
                      <td colSpan={COLUMNAS} className="p-0">
                        <Historial colportor={c} />
                      </td>
                    </tr>
                  )}
                  {registrando && (
                    <tr>
                      <td colSpan={COLUMNAS} className="p-0">
                        <RegistrarAcompanamiento
                          colportor={c}
                          acciones={acciones}
                          alRegistrar={(registrado) => alRegistrar(c.id, registrado)}
                          alCerrar={alCerrarRegistro}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

