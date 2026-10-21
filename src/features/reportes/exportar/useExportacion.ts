"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ReporteArmado } from "../horas/armado";
import { nombreDeArchivo, type ContextoDeExportacion, type FormatoDeExportacion } from "./contexto";
import { armarCsv, BOM_UTF8 } from "./csv";
import { descargarArchivo, imprimirDocumento, retirarDocumentoDeImpresion } from "./descargar";
import { armarInformeHtml } from "./informe";

/** Cuánto sigue ocupado el botón de «Datos CSV» después de bajar el archivo (un doble clic cuenta como uno). */
export const PAUSA_DEL_DOBLE_CLIC_MS = 600;

/** Lo que pasó con el último pedido de exportar, para decírselo a la persona. */
export type ResultadoDeExportacion =
  | { tipo: "listo"; formato: FormatoDeExportacion; archivo: string }
  | { tipo: "error"; formato: FormatoDeExportacion };

export interface EstadoDeExportacion {
  /** Qué se está generando ahora, o `null`. Mientras tanto no se acepta otro pedido. */
  ocupado: FormatoDeExportacion | null;
  /** El aviso del último pedido; desaparece en cuanto cambia lo que se ve (otro ámbito o período). */
  resultado: ResultadoDeExportacion | null;
  /** El reporte no tiene ningún colportor ni período que exportar. */
  vacio: boolean;
  exportar: (formato: FormatoDeExportacion) => void;
}

/**
 * Exportar lo que está en pantalla a CSV o a PDF (HU-REP-005). Un solo pedido a la vez: mientras uno se genera, los
 * demás clics se ignoran (doble clic, o PDF y CSV seguidos), y la marca de «ocupado» se apaga siempre, salga bien o
 * mal, para que los botones nunca queden trabados. El archivo se arma con lo que se veía al hacer clic aunque
 * después cambie el filtro.
 */
export function useExportacion(reporte: ReporteArmado, contexto: ContextoDeExportacion): EstadoDeExportacion {
  const [ocupado, setOcupado] = useState<FormatoDeExportacion | null>(null);
  const [aviso, setAviso] = useState<{ para: ReporteArmado; resultado: ResultadoDeExportacion } | null>(null);
  const enCurso = useRef<FormatoDeExportacion | null>(null);
  const montado = useRef(false);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      retirarDocumentoDeImpresion();
    };
  }, []);

  const vacio = useMemo(() => !reporte.tabla.filas.some((f) => f.tipo === "fila"), [reporte]);

  const exportar = useCallback(
    (formato: FormatoDeExportacion) => {
      if (enCurso.current || vacio) return;
      enCurso.current = formato;
      setOcupado(formato);
      setAviso(null);
      const archivo = nombreDeArchivo(reporte.titulo, contexto.granularidad, contexto.hoy, formato);

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
      const trabajo = (async () => {
        if (formato === "csv") descargarArchivo(archivo, BOM_UTF8 + armarCsv(reporte), "text/csv;charset=utf-8");
        else await imprimirDocumento(armarInformeHtml(reporte, contexto, archivo.replace(/\.pdf$/, "")));
      })();
      trabajo.then(
        () => terminar({ tipo: "listo", formato, archivo }),
        () => terminar({ tipo: "error", formato }),
      );
    },
    [reporte, contexto, vacio],
  );

  return { ocupado, resultado: aviso && aviso.para === reporte ? aviso.resultado : null, vacio, exportar };
}
