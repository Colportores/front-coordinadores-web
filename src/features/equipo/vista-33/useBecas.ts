"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BecaDeColportor, DatosDeBecas, ResultadoBeca, TipoDeBeca } from "@/datos/equipo/contrato";
import { mensajeSinConexion } from "@/lib/mensajes";
import { registrarEnvio } from "@/shell/trabajo-pendiente";

import type { AccionesEquipo } from "./acciones";
import { avisoDeBecaAsignada, avisoDeSinBeca } from "./modelo";

const ACCION_GUARDAR = "guardar la beca";

export interface ColportorDeBeca {
  id: string;
  nombre: string;
}

export interface EstadoDeBecas {
  /** La beca de cada colportor como quedó, con lo que se guardó desde esta pantalla encima de lo que trajo el servidor. */
  porColportor: Record<string, BecaDeColportor>;
  /** Los colportores con un guardado en camino o esperando su turno. */
  guardando: ReadonlySet<string>;
  /**
   * Lo último que se pidió asignar a cada uno mientras todavía no contesta el servidor: lo que marca «Apunta a». `null` es
   * «Sin beca»; un colportor que no figura es que no hay nada pedido.
   */
  pedido: Readonly<Record<string, TipoDeBeca | null>>;
  /** Por qué no se pudo guardar lo último de cada colportor. */
  errores: Readonly<Record<string, string>>;
  /** El último guardado que salió bien, para el lector de pantalla. */
  aviso: string;
  elegirCarrera(colportor: ColportorDeBeca, carreraId: string): void;
  /** `null`: «Sin beca». */
  asignarTipo(colportor: ColportorDeBeca, tipo: TipoDeBeca | null): void;
}

function sin<T>(registro: Readonly<Record<string, T>>, clave: string): Record<string, T> {
  const resto = { ...registro };
  delete resto[clave];
  return resto;
}

/**
 * Las becas de la vista 33 (HU-BEC-004, HU-BEC-006): lo que el servidor trajo más lo que se guardó desde la pantalla.
 * Los guardados de un mismo colportor salen de a uno y en el orden en que se pidieron (dos toques seguidos en «Media» y
 * «Completa» terminan en lo último que se tocó, sin que uno pise al otro); los de colportores distintos van en paralelo.
 * Un guardado que falla deja un aviso en esa fila y el botón vuelve a quedar libre. Vive en la vista y no en la tabla:
 * cambiar de pestaña mientras se guarda no pierde la respuesta ni habilita un segundo envío.
 */
export function useBecas(inicial: DatosDeBecas | null, acciones: AccionesEquipo): EstadoDeBecas {
  const [guardadas, setGuardadas] = useState<Record<string, BecaDeColportor>>({});
  const [enCola, setEnCola] = useState<Record<string, number>>({});
  const [pedido, setPedido] = useState<Record<string, TipoDeBeca | null>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");

  // Lo vigente, sin esperar al próximo render: un doble toque dispara dos clicks antes de que React repinte.
  const colas = useRef(new Map<string, Promise<void>>());
  const pendientes = useRef(new Map<string, number>());
  const ultimoPedido = useRef(new Map<string, TipoDeBeca | null>());
  const eligiendoCarrera = useRef(new Set<string>());
  const confirmadas = useRef<Record<string, BecaDeColportor>>({});
  const accionesVigentes = useRef(acciones);
  useEffect(() => {
    accionesVigentes.current = acciones;
  }, [acciones]);
  useEffect(() => {
    confirmadas.current = { ...(inicial?.porColportor ?? {}), ...guardadas };
  }, [inicial, guardadas]);

  const terminar = useCallback((colportor: ColportorDeBeca, resultado: ResultadoBeca, avisar: (beca: BecaDeColportor) => string) => {
    const quedan = (pendientes.current.get(colportor.id) ?? 1) - 1;
    if (quedan > 0) pendientes.current.set(colportor.id, quedan);
    else {
      pendientes.current.delete(colportor.id);
      ultimoPedido.current.delete(colportor.id);
      colas.current.delete(colportor.id);
      setPedido((actual) => sin(actual, colportor.id));
    }
    setEnCola((actual) => (quedan > 0 ? { ...actual, [colportor.id]: quedan } : sin(actual, colportor.id)));
    if (resultado.ok) {
      confirmadas.current = { ...confirmadas.current, [colportor.id]: resultado.beca };
      setGuardadas((actual) => ({ ...actual, [colportor.id]: resultado.beca }));
      setErrores((actual) => sin(actual, colportor.id));
      setAviso(avisar(resultado.beca));
    } else {
      setErrores((actual) => ({ ...actual, [colportor.id]: resultado.mensaje }));
    }
  }, []);

  const encolar = useCallback(
    (colportor: ColportorDeBeca, tarea: () => Promise<ResultadoBeca>, avisar: (beca: BecaDeColportor) => string) => {
      pendientes.current.set(colportor.id, (pendientes.current.get(colportor.id) ?? 0) + 1);
      setEnCola((actual) => ({ ...actual, [colportor.id]: (actual[colportor.id] ?? 0) + 1 }));
      setErrores((actual) => sin(actual, colportor.id));
      const turno = (colas.current.get(colportor.id) ?? Promise.resolve()).then(async () => {
        let resultado: ResultadoBeca;
        try {
          resultado = await tarea();
        } catch {
          resultado = { ok: false, mensaje: mensajeSinConexion(ACCION_GUARDAR) };
        }
        terminar(colportor, resultado, avisar);
      });
      colas.current.set(colportor.id, turno);
      // Cuenta como trabajo sin contestar aunque la vista se vaya antes de que conteste.
      registrarEnvio(turno);
    },
    [terminar],
  );

  const elegirCarrera = useCallback(
    (colportor: ColportorDeBeca, carreraId: string) => {
      // Un doble envío del mismo panel es un solo guardado.
      if (eligiendoCarrera.current.has(colportor.id)) return;
      eligiendoCarrera.current.add(colportor.id);
      encolar(
        colportor,
        async () => {
          try {
            return await accionesVigentes.current.elegirCarrera(colportor.id, carreraId);
          } finally {
            eligiendoCarrera.current.delete(colportor.id);
          }
        },
        (beca) => avisoDeBecaAsignada(colportor.nombre, beca),
      );
    },
    [encolar],
  );

  const asignarTipo = useCallback(
    (colportor: ColportorDeBeca, tipo: TipoDeBeca | null) => {
      // Tocar lo que ya está marcado (o ya se pidió) no manda nada: un doble toque es un solo guardado. «Sin beca» (null)
      // es un valor más, por eso se mira si hay algo pedido y no si el valor es null.
      const vigente = ultimoPedido.current.has(colportor.id)
        ? ultimoPedido.current.get(colportor.id)
        : (confirmadas.current[colportor.id]?.apuntaA ?? null);
      if (vigente === tipo) return;
      ultimoPedido.current.set(colportor.id, tipo);
      setPedido((actual) => ({ ...actual, [colportor.id]: tipo }));
      encolar(
        colportor,
        () => accionesVigentes.current.asignarTipoDeBeca(colportor.id, tipo),
        (beca) => (tipo === null ? avisoDeSinBeca(colportor.nombre, beca) : avisoDeBecaAsignada(colportor.nombre, beca)),
      );
    },
    [encolar],
  );

  return {
    porColportor: { ...(inicial?.porColportor ?? {}), ...guardadas },
    guardando: new Set(Object.keys(enCola)),
    pedido,
    errores,
    aviso,
    elegirCarrera,
    asignarTipo,
  };
}
