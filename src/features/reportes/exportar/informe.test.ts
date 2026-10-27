import { describe, expect, it } from "vitest";

import { AMBITO_TODAS, type Ambito } from "../horas/ambito";
import { armarReporte } from "../horas/armado";
import type { Granularidad } from "../horas/calculo";
import { colportor, datosDePruebaConVentas, horasConstantes } from "../horas/datos-de-prueba";
import type { ContextoDeExportacion } from "./contexto";
import { armarInformeHtml, escaparHtml } from "./informe";

const contexto = (granularidad: Granularidad): ContextoDeExportacion => ({ granularidad, hoy: "2026-10-21" });

function informeDe(ambito: Ambito, granularidad: Granularidad, datos = datosDePruebaConVentas()) {
  return armarInformeHtml(armarReporte(datos, ambito, granularidad), contexto(granularidad), "reportes-prueba");
}

/** El informe como documento, para preguntarle por lo que se ve y no por cómo está escrito. */
function documento(html: string) {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("escaparHtml", () => {
  it("no deja pasar nada que el navegador tome por etiqueta o por atributo", () => {
    expect(escaparHtml(`<img src=x onerror="alert('x')"> & más`)).toBe("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; más");
  });
});

describe("armarInformeHtml · el informe PDF de la vista 32", () => {
  const doc = documento(informeDe(AMBITO_TODAS, "semana"));

  it("lleva el nombre del archivo como título del documento (el navegador lo sugiere al guardar)", () => {
    expect(doc.title).toBe("reportes-prueba");
    expect(doc.documentElement.lang).toBe("es");
  });

  it("lleva la marca del panel, el título del reporte y lo que se está mirando", () => {
    expect(doc.querySelector(".marca")?.textContent).toBe("ColportajeCoordinador · Reportes");
    expect(doc.querySelector("h1")?.textContent).toBe("Todas las ciudades");
    expect(doc.querySelector(".subtitulo")?.textContent).toBe("4 colportores · S2 contra S1");
  });

  it("muestra los filtros aplicados: qué se ve, cómo se agrupa, el período y el día", () => {
    const filtros = Array.from(doc.querySelectorAll("dl.filtros dt")).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(filtros).toEqual([
      ["Ver", "Todas las ciudades"],
      ["Agrupado por", "Semanas"],
      ["Período", "S2 contra S1"],
      ["Al día", "21/10/2026"],
    ]);
  });

  it("trae las cifras con su tendencia y la tabla con una fila por colportor agrupada por ciudad", () => {
    expect(Array.from(doc.querySelectorAll(".cifra h3")).map((h) => h.textContent)).toEqual(["HORAS", "PRESENTACIONES", "VENTAS"]);
    expect(doc.querySelector(".cifra .valor")?.textContent).toBe("122");
    expect(doc.querySelector(".cifra .tendencia")?.textContent).toBe("▼ 12%");

    const tabla = doc.querySelector("table")!;
    expect(Array.from(tabla.querySelectorAll("thead th")).map((th) => th.textContent)).toEqual([
      "COLPORTOR · S2",
      "HORAS",
      "PRESENTACIONES",
      "VENTAS",
      "MONTO",
    ]);
    const filas = Array.from(tabla.querySelectorAll("tbody tr")).map((tr) => (tr.firstElementChild?.textContent ?? "").trim());
    expect(filas).toEqual(["Rivera2 colportores", "Ana Silva", "Beto Techera", "Artigas1 colportor", "Carla Rey", "Bella Unión1 colportor", "Darío Viera"]);
    expect(tabla.querySelector("tbody tr.grupo th")?.getAttribute("scope")).toBe("rowgroup");
  });

  it("dice que no incluye datos de clientes y no trae scripts", () => {
    expect(doc.querySelector("footer")?.textContent).toContain("no incluye datos de clientes");
    expect(doc.querySelectorAll("script, iframe, object, embed, link")).toHaveLength(0);
  });

  it("pide al navegador conservar los colores al imprimir", () => {
    expect(doc.querySelector("style")?.textContent).toContain("print-color-adjust: exact");
  });
});

describe("armarInformeHtml · otros ámbitos y períodos", () => {
  it("un colportor: dice su ciudad y trae una fila por período", () => {
    const doc = documento(informeDe({ tipo: "colportor", colportorId: "ana" }, "semana"));
    expect(doc.querySelector("dl.filtros dd")?.textContent).toBe("Ana Silva (Rivera)");
    expect(doc.querySelectorAll("tbody tr").length).toBeGreaterThanOrEqual(2);
    expect(doc.querySelector("thead th")?.textContent).toBe("SEMANA");
  });

  it("por días y por meses lo dice en «Agrupado por»", () => {
    expect(documento(informeDe(AMBITO_TODAS, "dia")).querySelectorAll("dl.filtros dd")[1].textContent).toBe("Días");
    expect(documento(informeDe(AMBITO_TODAS, "mes")).querySelectorAll("dl.filtros dd")[1].textContent).toBe("Meses");
  });

  it("sin colportores: el informe lo dice en vez de dejar la tabla en blanco", () => {
    const vacio = { ...datosDePruebaConVentas(), ciudades: [] };
    const doc = documento(informeDe(AMBITO_TODAS, "semana", vacio));
    expect(doc.querySelector("tbody")?.textContent).toBe("Todavía no hay colportores para mostrar acá.");
  });
});

describe("armarInformeHtml · datos límite", () => {
  it("un nombre con etiquetas HTML sale como texto, no como código", () => {
    const datos = datosDePruebaConVentas();
    datos.ciudades[0].colportores[0] = colportor("x", '<img src=x onerror="alert(1)"> <b>Ana</b>', horasConstantes("2026-10-05", "2026-10-21", 6));
    datos.ciudades[0].nombre = "</title><script>alert(1)</script>";
    const html = informeDe(AMBITO_TODAS, "semana", datos);
    const doc = documento(html);

    expect(html).not.toContain("<script>alert");
    expect(doc.querySelectorAll("img, b, script")).toHaveLength(0);
    expect(doc.body.textContent).toContain('<img src=x onerror="alert(1)"> <b>Ana</b>');
    expect(doc.body.textContent).toContain("</title><script>alert(1)</script>");
  });

  it("un título raro no puede cerrar el <title> del documento", () => {
    const reporte = armarReporte(datosDePruebaConVentas(), AMBITO_TODAS, "semana");
    const doc = documento(armarInformeHtml(reporte, contexto("semana"), "a</title><script>x</script>"));
    expect(doc.title).toBe("a</title><script>x</script>");
    expect(doc.querySelectorAll("script")).toHaveLength(0);
  });

  it("una lista larga (500 colportores) entra entera, con el encabezado que se repite en cada página", () => {
    const datos = datosDePruebaConVentas();
    datos.ciudades[0].colportores = Array.from({ length: 500 }, (_, i) =>
      colportor(`c${i}`, `Colportor ${i}`, horasConstantes("2026-10-05", "2026-10-21", 6)),
    );
    const html = informeDe({ tipo: "ciudad", ciudadId: "rivera" }, "semana", datos);
    expect(documento(html).querySelectorAll("tbody tr")).toHaveLength(500);
    expect(html).toContain("thead { display: table-header-group; }");
  });

  it("un nombre larguísimo se parte en vez de salirse de la hoja", () => {
    const html = informeDe(AMBITO_TODAS, "semana");
    expect(html).toContain("overflow-wrap: anywhere");
  });
});
