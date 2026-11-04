"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { motivoDelRechazo, type MotivoDeRechazo } from "@/auth/sesion-vencida";
import type { AccionesPrecios, CambioDePrecio, DatosDePrecios } from "@/datos/precios";
import { registrarEnvio, registrarFuente, trabajoCambio } from "@/shell/trabajo-pendiente";

import {
  aplicarGuardado,
  cambiosGrandes,
  cambiosParaGuardar,
  cantidadSinGuardar,
  descontarGuardado,
  ID_PESTANA_GENERAL,
  resumirBorrador,
  textoDeGuardado,
  type Borrador,
  type BorradoresPorCiudad,
  type CambioGrande,
  type Edicion,
} from "./modelo";

/** Por qué el último guardado de una ciudad no salió. `error` trae el texto del servidor si lo hubo. */
export type FallaDeGuardado =
  | { ciudadId: string; tipo: "sin-conexion" }
  | { ciudadId: string; tipo: "error"; mensaje: string | null }
  | { ciudadId: string; tipo: "sesion"; motivo: MotivoDeRechazo };

export interface AvisoDeGuardado {
  ciudadId: string;
  texto: string;
}

/** Dónde tiene que quedar el foco después de que React pinte el cambio. */
export interface FocoPendiente {
  clave: string;
  en: "entrada" | "accion";
}

export interface ConfirmacionDeCambiosGrandes {
  ciudadId: string;
  grandes: CambioGrande[];
}

/** Una huella de los cambios de una ciudad, para saber si siguen siendo los mismos que se mandaron. */
function firmaDe(cambios: CambioDePrecio[]): string {
  return JSON.stringify(cambios.map((c) => [c.tipo, c.id, c.precio]));
}

/**
 * El estado de la vista 27: los datos que se muestran (se actualizan al guardar), los borradores de cada ciudad, la pestaña
 * abierta y el guardado. Reglas que sostiene:
 * - **Un guardado a la vez**: un segundo toque (o un segundo atajo) mientras uno está en camino no manda otro.
 * - **Falla ≠ trabado**: el guardado siempre termina con el botón libre y los cambios todavía marcados.
 * - **Lo tocado mientras se guarda no se pierde**: al volver, solo se saca del borrador lo que se mandó y sigue igual.
 * - **Salir con cambios sin guardar no se pierde nada en silencio**: la vista se anota en el shell (`registrarFuente`), así el
 *   menú, atrás/adelante y «‹ Stock» no se van, y cerrar la pestaña pide confirmación.
 * - **Sin conexión**: un guardado que falló por falta de conexión se reintenta solo cuando vuelve internet, y solo si los cambios
 *   siguen siendo exactamente los que se mandaron y confirmaron; si se tocó algo, se guarda a mano (con su confirmación).
 */
export function usePrecios(inicial: DatosDePrecios, acciones: AccionesPrecios) {
  const [datos, setDatos] = useState(inicial);
  const [borradores, setBorradores] = useState<BorradoresPorCiudad>({});
  const [activa, setActiva] = useState<string>(ID_PESTANA_GENERAL);
  const [guardandoEn, setGuardandoEn] = useState<string | null>(null);
  const [falla, setFalla] = useState<FallaDeGuardado | null>(null);
  const [aviso, setAviso] = useState<AvisoDeGuardado | null>(null);
  const [confirmacion, setConfirmacion] = useState<ConfirmacionDeCambiosGrandes | null>(null);
  const [enLinea, setEnLinea] = useState(true);
  const [intentoDeSalir, setIntentoDeSalir] = useState(false);
  const [foco, setFoco] = useState<FocoPendiente | null>(null);

  const guardando = useRef(false);
  const reintentoAlVolver = useRef<string | null>(null);
  const [enCola, setEnCola] = useState<string | null>(null);
  /** Lo que se mandó (y el usuario ya confirmó) la última vez que falló por falta de conexión: lo único que se reintenta solo. */
  const firmaEnCola = useRef<string | null>(null);
  const ponerEnCola = useCallback((ciudadId: string | null, cambios?: CambioDePrecio[]) => {
    firmaEnCola.current = ciudadId !== null && cambios ? firmaDe(cambios) : null;
    reintentoAlVolver.current = ciudadId;
    setEnCola(ciudadId);
  }, []);
  const ultimo = useRef({ datos, borradores, acciones });
  const sinGuardar = cantidadSinGuardar(datos, borradores);

  useEffect(() => {
    ultimo.current = { datos, borradores, acciones };
  }, [datos, borradores, acciones]);

  // Mientras haya algo sin guardar o en camino, el shell no deja salir sin avisar.
  useEffect(() => {
    const quitar = registrarFuente({
      hayPorMandar: () => cantidadSinGuardar(ultimo.current.datos, ultimo.current.borradores) > 0,
      confirmar: async () => {
        if (cantidadSinGuardar(ultimo.current.datos, ultimo.current.borradores) === 0) return true;
        setIntentoDeSalir(true);
        return false;
      },
    });
    return quitar;
  }, []);
  useEffect(() => {
    trabajoCambio();
    if (sinGuardar === 0) setIntentoDeSalir(false);
  }, [sinGuardar]);

  // El foco que pidió una acción se pone cuando la fila ya está pintada.
  useEffect(() => {
    if (!foco) return;
    const campo = document.querySelector<HTMLElement>(`[data-${foco.en === "entrada" ? "precio" : "accion"}="${CSS.escape(foco.clave)}"]`);
    campo?.focus();
    if (foco.en === "entrada" && campo instanceof HTMLInputElement) campo.select();
    setFoco(null);
  }, [foco, borradores]);

  const editarBorrador = useCallback((ciudadId: string, cambiar: (borrador: Borrador) => Borrador) => {
    setBorradores((actual) => ({ ...actual, [ciudadId]: cambiar(actual[ciudadId] ?? {}) }));
    setAviso(null);
  }, []);

  const elegirPestana = useCallback((id: string) => {
    setActiva(id);
    setAviso(null);
  }, []);

  /** Manda los cambios de `ciudadId` tal como están ahora. Un solo guardado a la vez. */
  const enviar = useCallback(async (ciudadId: string) => {
    if (guardando.current) return;
    const { datos: vistos, borradores: actuales, acciones: aqui } = ultimo.current;
    const enviado = actuales[ciudadId] ?? {};
    const cambios = cambiosParaGuardar(vistos, ciudadId, enviado);
    if (cambios.length === 0) return;

    guardando.current = true;
    setGuardandoEn(ciudadId);
    setFalla(null);
    ponerEnCola(null);
    setConfirmacion(null);

    let envio: ReturnType<AccionesPrecios["guardarPrecios"]>;
    try {
      envio = aqui.guardarPrecios(ciudadId, cambios);
    } catch (error) {
      envio = Promise.reject(error);
    }
    // El navegador avisa al cerrar la pestaña mientras la respuesta no llegó.
    registrarEnvio(envio.catch(() => undefined));

    try {
      const resultado = await envio;
      if (resultado.ok) {
        const guardadas = new Set(cambios.map((c: CambioDePrecio) => `${c.tipo}:${c.id}`));
        setDatos((d) => aplicarGuardado(d, ciudadId, cambios));
        setBorradores((actual) => ({ ...actual, [ciudadId]: descontarGuardado(actual[ciudadId] ?? {}, enviado, guardadas) }));
        const ciudad = vistos.ciudades.find((c) => c.id === ciudadId)?.nombre ?? "la ciudad";
        setAviso({ ciudadId, texto: textoDeGuardado(cambios, ciudad) });
      } else if (resultado.causa === "sin-conexion") {
        ponerEnCola(ciudadId, cambios);
        setFalla({ ciudadId, tipo: "sin-conexion" });
      } else {
        setFalla({ ciudadId, tipo: "error", mensaje: resultado.mensaje ?? null });
      }
    } catch (error) {
      const motivo = motivoDelRechazo(error);
      if (motivo) {
        setFalla({ ciudadId, tipo: "sesion", motivo });
      } else if (typeof navigator !== "undefined" && navigator.onLine === false) {
        ponerEnCola(ciudadId, cambios);
        setFalla({ ciudadId, tipo: "sin-conexion" });
      } else {
        setFalla({ ciudadId, tipo: "error", mensaje: null });
      }
    } finally {
      guardando.current = false;
      setGuardandoEn(null);
    }
  }, [ponerEnCola]);

  /** «Guardar cambios»: si algún cambio pasa del umbral, antes pide confirmar (27A·03). */
  const guardar = useCallback(
    (ciudadId: string) => {
      if (guardando.current) return;
      const { datos: vistos, borradores: actuales } = ultimo.current;
      const cambios = cambiosParaGuardar(vistos, ciudadId, actuales[ciudadId] ?? {});
      if (cambios.length === 0) return;
      const grandes = cambiosGrandes(vistos, ciudadId, cambios);
      if (grandes.length > 0) {
        setConfirmacion({ ciudadId, grandes });
        return;
      }
      void enviar(ciudadId);
    },
    [enviar],
  );

  const volverAEditar = useCallback(() => setConfirmacion(null), []);

  // Conexión: el botón se frena sin ella, y un guardado que no salió por eso sale solo al volver.
  useEffect(() => {
    setEnLinea(typeof navigator === "undefined" ? true : navigator.onLine);
    const alVolver = () => {
      setEnLinea(true);
      const pendiente = reintentoAlVolver.current;
      if (pendiente) {
        // Solo se reintenta solo lo que ya se mandó y se confirmó. Si después se tocó algo, el valor nuevo no pasó por la
        // confirmación de cambios grandes (ni se sabe si está terminado de tipear): queda marcado para guardarlo a mano.
        const { datos: vistos, borradores: actuales } = ultimo.current;
        if (firmaDe(cambiosParaGuardar(vistos, pendiente, actuales[pendiente] ?? {})) === firmaEnCola.current) {
          void enviar(pendiente);
        } else {
          ponerEnCola(null);
          setFalla((f) => (f?.tipo === "sin-conexion" ? null : f));
        }
      } else setFalla((f) => (f?.tipo === "sin-conexion" ? null : f));
    };
    const alIrse = () => setEnLinea(false);
    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alIrse);
    return () => {
      window.removeEventListener("online", alVolver);
      window.removeEventListener("offline", alIrse);
    };
  }, [enviar, ponerEnCola]);

  // --- Acciones de cada fila ---------------------------------------------------------------------------------------

  const agregarExcepcion = useCallback(
    (ciudadId: string, clave: string, sugerido: number | null) => {
      editarBorrador(ciudadId, (b) => ({ ...b, [clave]: { tipo: "valor", texto: sugerido === null ? "" : String(sugerido), tocado: false } }));
      setFoco({ clave, en: "entrada" });
    },
    [editarBorrador],
  );

  const escribir = useCallback(
    (ciudadId: string, clave: string, texto: string) => {
      editarBorrador(ciudadId, (b) => ({ ...b, [clave]: { tipo: "valor", texto, tocado: true } }));
    },
    [editarBorrador],
  );

  const quitarExcepcion = useCallback(
    (ciudadId: string, clave: string) => {
      editarBorrador(ciudadId, (b) => ({ ...b, [clave]: { tipo: "quitar" } }));
      setFoco({ clave, en: "accion" });
    },
    [editarBorrador],
  );

  /** «Revertir», «Deshacer» y Esc: la fila vuelve a lo que está guardado. */
  const revertir = useCallback(
    (ciudadId: string, clave: string, devolverFoco = true) => {
      editarBorrador(ciudadId, (b) => {
        const { [clave]: _descartada, ...resto } = b;
        void _descartada;
        return resto;
      });
      if (devolverFoco) setFoco({ clave, en: "accion" });
    },
    [editarBorrador],
  );

  /** Al soltar un campo: si no cambia nada (el valor que ya rige, o vacío sin tocar) la edición sobra. */
  const soltar = useCallback(
    (ciudadId: string, clave: string) => {
      const { datos: vistos, borradores: actuales } = ultimo.current;
      const edicion: Edicion | undefined = actuales[ciudadId]?.[clave];
      if (!edicion || edicion.tipo !== "valor") return;
      const item = vistos.items.find((i) => i.clave === clave);
      if (!item) return;
      const solo = resumirBorrador(vistos, ciudadId, { [clave]: edicion });
      if (solo.cambios.length === 0) revertir(ciudadId, clave, false);
    },
    [revertir],
  );

  const descartar = useCallback(
    (ciudadId: string) => {
      editarBorrador(ciudadId, () => ({}));
      setFalla((f) => (f?.ciudadId === ciudadId ? null : f));
      if (reintentoAlVolver.current === ciudadId) ponerEnCola(null);
    },
    [editarBorrador, ponerEnCola],
  );

  return {
    datos,
    borradores,
    activa,
    elegirPestana,
    guardandoEn,
    falla,
    aviso,
    confirmacion,
    enLinea,
    intentoDeSalir,
    foco,
    sinGuardar,
    reintentoEnCola: enCola,
    guardar,
    enviar,
    volverAEditar,
    agregarExcepcion,
    escribir,
    quitarExcepcion,
    revertir,
    soltar,
    descartar,
  };
}
