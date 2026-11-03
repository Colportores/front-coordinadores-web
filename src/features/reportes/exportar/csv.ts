import type { ReporteArmado } from "../horas/armado";
import type { ColumnaDeReporte } from "../horas/calculo";

/**
 * «Datos CSV» de la vista 32 (HU-REP-005): lo que está en la tabla de la pantalla —el ámbito y el período que se
 * ven— en cifras sin formato, una fila por colportor (o, con un colportor elegido, por período). Solo lleva lo que
 * la pantalla ya muestra: ciudad, colportor y sus cifras. Nunca datos de clientes (el contrato de datos no los trae).
 */

/** Marca de orden de bytes: sin ella Excel abre el archivo UTF-8 con las tildes rotas. */
export const BOM_UTF8 = "﻿";
const FIN_DE_LINEA = "\r\n";

const ENCABEZADO_DE_CIFRA: Record<ColumnaDeReporte, string> = {
  horas: "Horas",
  diasTrabajados: "Días trabajados",
  promedio: "Promedio de horas por día trabajado",
  acompaniadas: "Jornadas con acompañamiento",
  presentaciones: "Presentaciones",
  ventas: "Ventas",
  monto: "Monto ($U)",
  porCobrar: "% por cobrar",
};

/**
 * Un texto como celda: entre comillas si hace falta (coma, comilla, salto de línea) y, si una planilla lo tomaría
 * por una fórmula (empieza con `=`, `+`, `-`, `@`, tabulación o retorno), con un apóstrofe adelante.
 */
export function celdaDeTexto(texto: string): string {
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return /[",\r\n]/.test(seguro) || seguro !== seguro.trim() ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/** Una cifra sin formato: punto decimal, hasta dos decimales; vacía si ese período no tiene datos. */
export function celdaDeCifra(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return "";
  return String(Math.round(valor * 100) / 100);
}

/** El CSV (sin la marca de orden de bytes, que se antepone al armar el archivo). */
export function armarCsv(reporte: ReporteArmado): string {
  const { resuelto, tabla } = reporte;
  const elegido = resuelto.colportor;
  const ciudadDe = new Map<string, string>();
  for (const ciudad of resuelto.ciudades) for (const colportor of ciudad.colportores) ciudadDe.set(colportor.id, ciudad.nombre);

  const lineas: string[] = [
    ["Ciudad", "Colportor", "Período", ...tabla.columnas.map((c) => ENCABEZADO_DE_CIFRA[c.clave]), "Nota"]
      .map(celdaDeTexto)
      .join(","),
  ];

  for (const fila of tabla.filas) {
    if (fila.tipo === "grupo") continue; // el encabezado de ciudad ya va en cada fila
    const [ciudad, colportor, periodo] = elegido
      ? [elegido.ciudad.nombre, elegido.colportor.nombre, fila.nombre]
      : [ciudadDe.get(fila.clave) ?? "", fila.nombre, reporte.rotuloDelPeriodo ?? ""];
    lineas.push(
      [
        celdaDeTexto(ciudad),
        celdaDeTexto(colportor),
        celdaDeTexto(periodo),
        ...fila.celdas.map((celda) => celdaDeCifra(celda.crudo)),
        celdaDeTexto(fila.nota ?? ""),
      ].join(","),
    );
  }

  return lineas.join(FIN_DE_LINEA) + FIN_DE_LINEA;
}
