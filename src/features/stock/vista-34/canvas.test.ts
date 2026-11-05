import { describe, expect, it } from "vitest";

import { crearDatosDeStockSimulados } from "@/datos/stock/simulado";

import canvas from "./canvas-34.json";
import {
  construirAvisos,
  construirLista,
  construirMundo,
  construirRiel,
  construirTabla,
  construirTarjetas,
  formatearCantidad,
  resolverAmbito,
  type Ambito,
} from "./modelo";

/**
 * `canvas-34.json` es la salida del script del canvas (`34 Stock por Ciudad.dc.html`, el mismo `renderVals` con la misma
 * semilla por colportor y producto) para 11 escenarios: los 3 artboards de la opción A y 8 más (todas las ciudades, el
 * departamento, Bella Unión, filas de cada tipo abiertas). Acá se compara, celda por celda, con lo que arma el modelo a
 * partir de la fuente simulada. Las diferencias a propósito, todas de redacción o de orden:
 * - «se cuentan juntas» para las revistas (el canvas dice «juntos»; la lista de textos de la propuesta dice «juntas»);
 * - los departamentos van de la A a la Z (como en Inicio y Equipo), el canvas pone Rivera primero;
 * - los colportores de una fila abierta van por nombre, el canvas los pone en el orden de su lista.
 */

const AMBITOS: Record<string, Ambito> = {
  riv: { tipo: "ciudad", ciudadId: "rivera" },
  art: { tipo: "ciudad", ciudadId: "artigas" },
  bu: { tipo: "ciudad", ciudadId: "bella-union" },
  all: { tipo: "todas" },
  "dept-art": { tipo: "departamento", clave: "artigas" },
};

const claveDeFila = (k: string | null) => (k === null ? null : k === k.toUpperCase() ? `categoria:${k}` : `producto:${k}`);

const modelo = construirMundo(crearDatosDeStockSimulados());

describe("vista 34: el modelo da lo mismo que el canvas", () => {
  for (const esc of canvas) {
    describe(`${esc.label}`, () => {
      const resuelto = resolverAmbito(modelo, AMBITOS[esc.sel]);
      const abierta = claveDeFila(esc.open);

      it("título y subtítulo", () => {
        expect(resuelto.titulo).toBe(esc.title);
        expect(resuelto.subtitulo).toBe(esc.sub);
      });

      it("la lista de ciudades, grupo por grupo", () => {
        const lista = construirLista(modelo, resuelto);
        const mia: Record<string, { nombre: string; sub: string; elegida: boolean }[]> = {
          "": [{ nombre: lista.todas.nombre, sub: lista.todas.detalle, elegida: lista.todas.seleccionado }],
        };
        for (const g of lista.grupos) {
          mia[g.titulo ?? ""] = g.nodos.map((n) => ({ nombre: n.nombre, sub: n.detalle, elegida: n.seleccionado }));
        }
        const suya: typeof mia = { "": [] };
        let grupo = "";
        for (const it of esc.lista) {
          if ("grupo" in it) {
            grupo = it.grupo as string;
            suya[grupo] = [];
          } else {
            suya[grupo].push({ nombre: it.nombre as string, sub: it.sub as string, elegida: it.elegida as boolean });
          }
        }
        expect(mia).toEqual(suya);
      });

      it("la lista contraída", () => {
        const riel = construirRiel(construirLista(modelo, resuelto)).map((i) => ({ abr: i.abreviatura, elegida: i.seleccionado }));
        const suyo = esc.riel.map((i) => ({ abr: i.abr, elegida: i.elegida }));
        const orden = (a: { abr: string }, b: { abr: string }) => a.abr.localeCompare(b.abr);
        expect(riel.sort(orden)).toEqual(suyo.sort(orden));
      });

      it("las tarjetas por tipo", () => {
        const tarjetas = construirTarjetas(modelo, resuelto).map((t) => ({
          label: t.etiqueta.toLocaleUpperCase("es"),
          valor: formatearCantidad(t.total),
          extra: t.extra,
          sub: t.detalle,
        }));
        const suyas = esc.resumen.map((t) => ({ label: t.label, valor: t.valor, extra: t.label === "REVISTAS" ? "se cuentan juntas" : t.extra, sub: t.sub }));
        expect(tarjetas).toEqual(suyas);
      });

      it("los avisos", () => {
        const mios = construirAvisos(modelo, resuelto).map((a) => ({ negrita: a.negrita, texto: a.texto, boton: a.boton }));
        const clave = (a: { negrita: string; texto: string }) => `${a.negrita}|${a.texto}`;
        expect(mios.sort((a, b) => clave(a).localeCompare(clave(b)))).toEqual([...esc.avisos].sort((a, b) => clave(a).localeCompare(clave(b))));
      });

      it("la tabla: cabeceras de tipo, filas, estado y quién lo tiene", () => {
        const grupos = construirTabla(modelo, resuelto);
        const mias: unknown[] = [];
        for (const g of grupos) {
          mias.push({ cabecera: g.titulo, sub: g.detalle });
          for (const f of g.filas) {
            const esta = f.clave === abierta;
            mias.push({
              celdas: [
                { t: `${esta ? "▾" : "▸"} ${f.nombre}`, sub: f.nota ?? "" },
                { t: formatearCantidad(f.tiene), sub: "" },
                { t: f.poseedores > 0 ? `${f.poseedores} de ${f.totalPersonas}` : "nadie", sub: "" },
                { t: formatearCantidad(f.porEntregar), sub: "" },
                { t: formatearCantidad(f.entregados), sub: "" },
                { t: formatearCantidad(f.porCobrar), sub: "" },
                { t: `${f.estado.simbolo} ${f.estado.texto}` },
              ],
              abierta: esta,
              subFilas: esta ? f.quien.map((q) => [q.nombre, String(q.tiene), String(q.porEntregar), String(q.entregados), String(q.porCobrar)]).sort() : [],
              vacio: esta && f.quien.length === 0 ? f.sinNadie : "",
            });
          }
        }
        const suyas = esc.filas.map((f) =>
          "cabecera" in f
            ? f
            : { celdas: f.celdas, abierta: f.abierta, subFilas: [...f.subFilas].sort(), vacio: f.vacio },
        );
        expect(mias).toEqual(suyas);
      });
    });
  }
});
