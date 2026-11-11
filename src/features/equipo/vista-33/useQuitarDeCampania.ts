"use client";

import { useRef, useState } from "react";

import type { ResultadoQuitarDeCampania } from "@/datos/equipo/contrato";
import { registrarEnvio } from "@/shell/trabajo-pendiente";

import type { AccionesEquipo } from "./acciones";
import type { FallaAlQuitar, PasoDeQuitar } from "./DialogoQuitarDeCampania";
import { avisoDeQuitado } from "./quitar-de-campania";

export interface ColportorPorQuitar {
  id: string;
  nombre: string;
}

export interface EstadoDeQuitar {
  /** A quién se está por quitar (el diálogo abierto); `null` si no hay diálogo. */
  abierto: ColportorPorQuitar | null;
  paso: PasoDeQuitar;
  quitando: boolean;
  falla: FallaAlQuitar | null;
  /** Los que se quitaron desde esta pantalla: la vista los saca de la lista sin esperar a que el servidor la vuelva a leer. */
  quitados: ReadonlySet<string>;
  /** Cómo quedó lo último que se quitó. */
  aviso: string | null;
  abrir(colportor: ColportorPorQuitar): void;
  seguir(): void;
  volver(): void;
  cancelar(): void;
  confirmar(): void;
}

/** Dónde queda el foco al cerrar el diálogo: el botón de la fila (se canceló) o el aviso (se quitó). */
export type FocoTrasQuitar = { tipo: "fila"; colportorId: string } | { tipo: "aviso" };

/**
 * «Quitar de la campaña» de la vista 33 (HU-CAM-005): el diálogo de dos pasos y el envío. Un solo envío a la vez (el ref
 * `ocupado` corta el doble toque antes de que React repinte); mientras sale, el diálogo no se cierra. Una falla de red deja el
 * botón libre para «Reintentar» y un rechazo de la base lo dice y solo deja cerrar. Al quitarlo, la fila se va y el aviso dice
 * qué hacer si fue un error. El envío cuenta como trabajo sin contestar aunque la vista se vaya antes de que conteste.
 */
export function useQuitarDeCampania(acciones: AccionesEquipo, alCerrar: (foco: FocoTrasQuitar) => void): EstadoDeQuitar {
  const [abierto, setAbierto] = useState<ColportorPorQuitar | null>(null);
  const [paso, setPaso] = useState<PasoDeQuitar>("que-pasa");
  const [quitando, setQuitando] = useState(false);
  const [falla, setFalla] = useState<FallaAlQuitar | null>(null);
  const [quitados, setQuitados] = useState<ReadonlySet<string>>(new Set());
  const [aviso, setAviso] = useState<string | null>(null);
  const ocupado = useRef(false);

  function abrir(colportor: ColportorPorQuitar) {
    if (ocupado.current) return;
    setAbierto(colportor);
    setPaso("que-pasa");
    setFalla(null);
  }

  function cancelar() {
    if (ocupado.current || !abierto) return;
    alCerrar({ tipo: "fila", colportorId: abierto.id });
    setAbierto(null);
    setFalla(null);
  }

  function confirmar() {
    const colportor = abierto;
    const quitar = acciones.quitarDeCampania;
    if (ocupado.current || !colportor || !quitar) return;
    ocupado.current = true;
    setQuitando(true);
    setFalla(null);
    const envio = (async () => {
      let resultado: ResultadoQuitarDeCampania | null;
      try {
        resultado = await quitar(colportor.id);
      } catch {
        resultado = null;
      }
      ocupado.current = false;
      setQuitando(false);
      if (resultado === null) {
        setFalla({ tipo: "red" });
      } else if (!resultado.ok) {
        setFalla({ tipo: "rechazo", mensaje: resultado.mensaje });
      } else {
        setQuitados((anteriores) => new Set(anteriores).add(colportor.id));
        setAviso(avisoDeQuitado(colportor.nombre));
        setAbierto(null);
        alCerrar({ tipo: "aviso" });
      }
    })();
    registrarEnvio(envio);
  }

  return {
    abierto,
    paso,
    quitando,
    falla,
    quitados,
    aviso,
    abrir,
    seguir: () => setPaso("confirmar"),
    volver: () => {
      if (ocupado.current) return;
      setPaso("que-pasa");
      setFalla(null);
    },
    cancelar,
    confirmar,
  };
}
