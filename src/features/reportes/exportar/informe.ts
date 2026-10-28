import type { ReporteArmado } from "../horas/armado";
import { ETIQUETA_DE_GRANULARIDAD, fechaCompleta, type ContextoDeExportacion } from "./contexto";

/**
 * «Informe PDF» de la vista 32 (HU-REP-005): una página lista para imprimir o guardar como PDF con la marca del
 * panel, los filtros que se están aplicando (ámbito, agrupación y período), las cifras con su gráfico y la tabla.
 * Es un documento aparte, hecho solo con texto escapado: lo que ve la persona en pantalla no se toca.
 */

const COLOR_MARCA = "#002856";

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ESTILOS = `
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: Inter, "Segoe UI", Arial, sans-serif; font-size: 11px; color: #0e1a2b; }
.marca { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 8px 12px; background: ${COLOR_MARCA}; color: #fff; border-radius: 4px; }
.marca strong { font-size: 13px; letter-spacing: .04em; }
.marca span { font-size: 10px; }
h1 { margin: 14px 0 2px; font-family: "Source Serif 4", Georgia, serif; font-size: 22px; color: ${COLOR_MARCA}; overflow-wrap: anywhere; }
.subtitulo { margin: 0 0 10px; color: #5b6b82; font-size: 12px; overflow-wrap: anywhere; }
dl.filtros { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; margin: 0 0 14px; padding: 8px 12px; border: 1px solid #cfd6e1; border-radius: 4px; background: #f4f7fb; }
dl.filtros dt { font-weight: 600; color: #2a3a52; }
dl.filtros dd { margin: 0; overflow-wrap: anywhere; }
.cifras { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.cifra { border: 1px solid #e3e7ee; border-radius: 4px; padding: 8px 10px; break-inside: avoid; }
.cifra h3 { margin: 0; font-size: 9px; letter-spacing: .12em; color: #5b6b82; }
.cifra .valor { font-family: "Source Serif 4", Georgia, serif; font-size: 22px; font-weight: 600; color: ${COLOR_MARCA}; }
.cifra .tendencia { margin-left: 6px; font-size: 11px; color: #0e1a2b; }
.cifra p { margin: 1px 0 0; font-size: 10px; color: #5b6b82; overflow-wrap: anywhere; }
.barras { display: flex; align-items: flex-end; gap: 3px; height: 40px; margin-top: 6px; border-bottom: 1px solid #cfd6e1; }
.barras span { flex: 1; background: #13407a; border-radius: 2px 2px 0 0; }
.barras span.en-curso { background: repeating-linear-gradient(45deg, #13407a 0 3px, #fff 3px 5px); }
.rotulos { display: flex; gap: 3px; }
.rotulos span { flex: 1; overflow: hidden; text-align: center; font-size: 8px; color: #5b6b82; white-space: nowrap; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
th, td { padding: 5px 8px; border-bottom: 1px solid #e3e7ee; vertical-align: top; }
thead th { font-size: 9px; letter-spacing: .06em; color: #5b6b82; text-align: right; }
thead th:first-child, tbody th { text-align: left; }
tbody th { font-weight: 600; overflow-wrap: anywhere; }
td { text-align: right; white-space: nowrap; }
tr { break-inside: avoid; }
tr.grupo th { background: #f3f1ea; color: ${COLOR_MARCA}; font-weight: 700; }
tr.grupo th small { margin-left: 8px; font-weight: 400; color: #5b6b82; }
.nota { display: block; font-weight: 400; font-size: 9.5px; color: #5b6b82; }
.vacio { padding: 14px 8px; color: #5b6b82; }
footer { margin-top: 14px; font-size: 9.5px; color: #5b6b82; }
`;

function filtrosDelInforme(reporte: ReporteArmado, contexto: ContextoDeExportacion): { etiqueta: string; valor: string }[] {
  const elegido = reporte.resuelto.colportor;
  return [
    { etiqueta: "Ver", valor: elegido ? `${elegido.colportor.nombre} (${elegido.ciudad.nombre})` : reporte.titulo },
    { etiqueta: "Agrupado por", valor: ETIQUETA_DE_GRANULARIDAD[contexto.granularidad] },
    { etiqueta: "Período", valor: reporte.periodo || (contexto.granularidad === "rango" ? "Sin rango válido" : "Todavía no hay un período completo") },
    { etiqueta: "Al día", valor: fechaCompleta(contexto.hoy) },
  ];
}

/** El documento completo (HTML) del informe. `titulo` es el del documento: el que sugiere el navegador al guardar. */
export function armarInformeHtml(reporte: ReporteArmado, contexto: ContextoDeExportacion, titulo: string): string {
  const e = escaparHtml;
  const { tabla } = reporte;

  const filtros = filtrosDelInforme(reporte, contexto)
    .map((f) => `<dt>${e(f.etiqueta)}</dt><dd>${e(f.valor)}</dd>`)
    .join("");

  const cifras = reporte.tarjetas
    .map((t) => {
      const barras = t.barras
        .map((b) => {
          const alto = b.sinDatos ? 0 : Math.max(2, Math.round(b.proporcion * 38));
          return `<span${b.enCurso ? ' class="en-curso"' : ""} style="height:${alto}px"></span>`;
        })
        .join("");
      const rotulos = t.barras.map((b) => `<span>${e(b.rotulo)}</span>`).join("");
      return (
        `<section class="cifra"><h3>${e(t.etiqueta)}</h3>` +
        `<div><span class="valor">${e(t.valor)}</span>${t.tendencia ? `<span class="tendencia">${e(t.tendencia.texto)}</span>` : ""}</div>` +
        `<p>${e(t.nota)}</p>${t.campania ? `<p>${e(t.campania)}</p>` : ""}` +
        (t.barras.length > 0 ? `<div class="barras">${barras}</div><div class="rotulos">${rotulos}</div>` : "") +
        `</section>`
      );
    })
    .join("");

  const columnas = tabla.columnas.length + 1;
  const encabezados = tabla.columnas.map((c) => `<th scope="col">${e(c.encabezado)}</th>`).join("");
  const filas =
    tabla.filas.length === 0
      ? `<tr><td class="vacio" colspan="${columnas}" style="text-align:left">Todavía no hay colportores para mostrar acá.</td></tr>`
      : tabla.filas
          .map((fila) => {
            if (fila.tipo === "grupo") {
              return `<tr class="grupo"><th scope="rowgroup" colspan="${columnas}">${e(fila.nombre)}<small>${e(fila.detalle)}</small></th></tr>`;
            }
            const celdas = fila.celdas
              .map((c) => `<td>${e(c.valor)}${c.tendencia ? ` <small>${e(c.tendencia.texto)}</small>` : ""}</td>`)
              .join("");
            return `<tr><th scope="row">${e(fila.nombre)}${fila.nota ? `<span class="nota">${e(fila.nota)}</span>` : ""}</th>${celdas}</tr>`;
          })
          .join("");

  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${e(titulo)}</title>` +
    `<style>${ESTILOS}</style></head><body>` +
    `<div class="marca"><strong>Colportaje</strong><span>Coordinador · Reportes</span></div>` +
    `<h1>${e(reporte.titulo)}</h1><p class="subtitulo">${e(reporte.subtitulo)}</p>` +
    `<dl class="filtros">${filtros}</dl>` +
    (cifras ? `<div class="cifras">${cifras}</div>` : "") +
    `<table aria-label="${e(tabla.descripcion)}"><thead><tr><th scope="col">${e(tabla.primeraColumna)}</th>${encabezados}</tr></thead><tbody>${filas}</tbody></table>` +
    `<footer>Informe generado desde el panel del coordinador el ${e(fechaCompleta(contexto.hoy))}. Muestra lo mismo que la pantalla; no incluye datos de clientes.</footer>` +
    `</body></html>`
  );
}
