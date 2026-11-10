"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DescargarInforme, PedidoDeInforme, ResultadoDeInforme } from "@/datos/reportes/informe";

import type { ReporteArmado } from "../horas/armado";
import { nombreDeArchivo, type ContextoDeExportacion, type FormatoDeExportacion } from "./contexto";
import { armarCsv, BOM_UTF8 } from "./csv";
import { bytesDeBase64, descargarArchivo, descargarBytes } from "./descargar";
import { useEnLinea } from "./useEnLinea";

/** Cuánto sigue ocupado el botón de «Datos CSV» después de bajar el archivo (un doble clic cuenta como uno). */
export const PAUSA_DEL_DOBLE_CLIC_MS = 600;
/** Cuánto se espera al servidor por el informe antes de darlo por fallado: el botón no se queda «Preparando…» para siempre. */
export const TOPE_DEL_INFORME_MS = 60_000;

/** Por qué no se puede bajar el «Informe PDF» ahora, dicho para que se sepa qué hacer (`motivoPdf`). */
export const MOTIVO_SIN_CONEXION = "Necesitás conexión para descargar el informe PDF.";
export const MOTIVO_RANGO =
  "El informe PDF todavía no se puede armar con un rango de fechas: elegí Días, Semanas o Meses. «Datos CSV» sí sirve.";
export const MOTIVO_COLPORTORES_ELEGIDOS =
  "El informe PDF todavía no se puede armar con colportores elegidos: sacá la elección para descargarlo. «Datos CSV» sí sirve.";

/** Lo que pasó con el último pedido de exportar, para decírselo a la persona. */
export type ResultadoDeExportacion =
  | { tipo: "listo"; formato: FormatoDeExportacion; archivo: string }
  | {
      tipo: "error";
      formato: FormatoDeExportacion;
      /** Solo el PDF: `sin-conexion` o un rechazo del servidor (con su texto, si lo dio). */
      causa?: "sin-conexion" | "rechazado";
      mensaje?: string;
    };

export interface EstadoDeExportacion {
  /** Qué se está generando ahora, o `null`. Mientras tanto no se acepta otro pedido. */
  ocupado: FormatoDeExportacion | null;
  /** El aviso del último pedido; desaparece en cuanto cambia lo que se ve (otro ámbito o período). */
  resultado: ResultadoDeExportacion | null;
  /** El reporte no tiene ningún colportor ni período que exportar. */
  vacio: boolean;
  /** Por qué el «Informe PDF» no se puede pedir ahora (aunque el CSV sí), o `null`. */
  motivoPdf: string | null;
  exportar: (formato: FormatoDeExportacion) => void;
}

/** Lo que el servidor puede armar: días, semanas o meses. El rango libre y los colportores elegidos todavía no. */
function pedidoDelInforme(contexto: ContextoDeExportacion): PedidoDeInforme | null {
  if (contexto.granularidad === "rango" || contexto.elegidos.length > 0) return null;
  return { ambito: contexto.ambito, granularidad: contexto.granularidad };
}

function motivoSinInforme(contexto: ContextoDeExportacion, enLinea: boolean): string | null {
  if (contexto.granularidad === "rango") return MOTIVO_RANGO;
  if (contexto.elegidos.length > 0) return MOTIVO_COLPORTORES_ELEGIDOS;
  return enLinea ? null : MOTIVO_SIN_CONEXION;
}

/** El pedido o, si el servidor no contesta en `TOPE_DEL_INFORME_MS`, un rechazo sin texto (la vista usa el suyo). */
function conTope(pedido: Promise<ResultadoDeInforme>): Promise<ResultadoDeInforme> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<ResultadoDeInforme>((resolver) => {
    temporizador = setTimeout(() => resolver({ ok: false, causa: "rechazado" }), TOPE_DEL_INFORME_MS);
  });
  return Promise.race([pedido, tope]).finally(() => clearTimeout(temporizador));
}

/**
 * Exportar lo que está en pantalla a CSV o a PDF (HU-REP-005). Un solo pedido a la vez: mientras uno se genera, los
 * demás clics se ignoran (doble clic, o PDF y CSV seguidos), y la marca de «ocupado» se apaga siempre, salga bien o
 * mal, para que los botones nunca queden trabados. El archivo se arma con lo que se veía al hacer clic aunque
 * después cambie el filtro.
 *
 * El CSV se arma acá y anda sin conexión. El PDF lo arma el servidor (`descargarInforme`, issue #84): pide conexión, y
 * si la persona sale de la vista mientras se arma, el archivo no se baja después.
 */
export function useExportacion(reporte: ReporteArmado, contexto: ContextoDeExportacion, descargarInforme: DescargarInforme): EstadoDeExportacion {
  const [ocupado, setOcupado] = useState<FormatoDeExportacion | null>(null);
  const [aviso, setAviso] = useState<{ para: ReporteArmado; resultado: ResultadoDeExportacion } | null>(null);
  const enCurso = useRef<FormatoDeExportacion | null>(null);
  const montado = useRef(false);
  const enLinea = useEnLinea();

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const vacio = useMemo(() => !reporte.tabla.filas.some((f) => f.tipo === "fila"), [reporte]);
  const motivoPdf = motivoSinInforme(contexto, enLinea);

  const exportar = useCallback(
    (formato: FormatoDeExportacion) => {
      if (enCurso.current || vacio) return;
      const pedido = formato === "pdf" ? pedidoDelInforme(contexto) : null;
      if (formato === "pdf" && (pedido === null || !enLinea)) return;
      enCurso.current = formato;
      setOcupado(formato);
      setAviso(null);
      const archivo = nombreDeArchivo(reporte.titulo, contexto.granularidad, contexto.hoy, formato, contexto.rango ?? null);

      const liberar = () => {
        enCurso.current = null;
        if (montado.current) setOcupado(null);
      };
      const terminar = (resultado: ResultadoDeExportacion) => {
        if (montado.current) setAviso({ para: reporte, resultado });
        // El CSV se arma al instante: sin esta pausa el botón quedaría libre antes del segundo clic de un doble clic
        // y el navegador bajaría dos archivos. Si falló, se libera ya para poder reintentar.
        if (formato === "csv" && resultado.tipo === "listo") setTimeout(liberar, PAUSA_DEL_DOBLE_CLIC_MS);
        else liberar();
      };

      // `async`: una falla al armar el archivo (no solo al bajarlo) también termina en el aviso de error.
      const trabajo = (async (): Promise<ResultadoDeExportacion> => {
        if (formato === "csv") {
          descargarArchivo(archivo, BOM_UTF8 + armarCsv(reporte), "text/csv;charset=utf-8");
          return { tipo: "listo", formato, archivo };
        }
        if (pedido === null) return { tipo: "error", formato, causa: "rechazado" }; // no pasa: el botón no deja pedirlo
        let respuesta: ResultadoDeInforme;
        try {
          respuesta = await conTope(descargarInforme(pedido));
        } catch {
          // El pedido ni llegó al servidor del panel: es la conexión.
          return { tipo: "error", formato, causa: "sin-conexion" };
        }
        if (!respuesta.ok) return { tipo: "error", formato, causa: respuesta.causa, mensaje: respuesta.mensaje };
        // Si la persona ya salió de la vista, el archivo no se baja de golpe más tarde.
        if (montado.current) descargarBytes(archivo, bytesDeBase64(respuesta.pdfBase64), "application/pdf");
        return { tipo: "listo", formato, archivo };
      })();
      trabajo.then(terminar, () => terminar({ tipo: "error", formato }));
    },
    [reporte, contexto, vacio, enLinea, descargarInforme],
  );

  return { ocupado, resultado: aviso && aviso.para === reporte ? aviso.resultado : null, vacio, motivoPdf, exportar };
}
