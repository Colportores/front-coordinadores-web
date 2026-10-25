import { describe, expect, it } from "vitest";

import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";

import canvas from "./canvas-35.json";
import {
  AMBITO_TODAS,
  construirDetalle,
  construirFilas,
  construirLista,
  construirMundo,
  contarPestanas,
  resolverAmbito,
  solicitudesDe,
  type Ambito,
  type Pestana,
} from "./modelo";

/**
 * `canvas-35.json` es la salida del script de `35 Pedidos y Transferencias.dc.html` (la clase `Component` ejecutada con un
 * `DCLogic` vacío): lo que el canvas dibuja en cada ciudad y pestaña, y el detalle de cada pedido y transferencia. Acá se
 * compara celda por celda con lo que arma la vista a partir de los datos simulados. Las diferencias son pocas y están
 * dichas en cada prueba.
 */

// El «hoy» del canvas: el 22/10 a la tarde (de ahí salen sus «15/10», «12/10»…).
const AHORA = new Date("2026-10-22T18:00:00-03:00");
const mundo = () => construirMundo(crearDatosDePedidosSimulados(AHORA));

const AMBITOS: Record<string, Ambito> = {
  all: AMBITO_TODAS,
  riv: { tipo: "ciudad", ciudadId: "rivera" },
  "dept-art": { tipo: "departamento", clave: "artigas" },
  art: { tipo: "ciudad", ciudadId: "artigas" },
  bu: { tipo: "ciudad", ciudadId: "bella-union" },
};

const PESTANA: Record<string, Pestana> = { ALL: "ALL", PEND: "PEND", AUT: "AUT", DES: "DES", REC: "REC", RECH: "RECH", TRF: "TRF" };

describe("vista 35 contra el canvas", () => {
  it("el canvas tiene 35 escenarios (5 ámbitos por 7 pestañas), 3 artboards y 12 detalles", () => {
    expect(canvas.escenarios).toHaveLength(35);
    expect(canvas.artboards).toHaveLength(3);
    expect(Object.keys(canvas.detalles)).toHaveLength(12);
  });

  describe.each(canvas.escenarios.map((e) => [`${e.sel} · ${e.tab}`, e] as const))("%s", (_nombre, esperado) => {
    const m = mundo();
    const resuelto = resolverAmbito(m, AMBITOS[esperado.sel]);
    const pestana = PESTANA[esperado.tab];

    it("título, subtítulo y pestañas con su conteo", () => {
      expect(resuelto.titulo).toBe(esperado.title);
      expect(resuelto.subtitulo).toBe(esperado.sub);
      expect(contarPestanas(resuelto).map((p) => [p.rotulo, String(p.n)])).toEqual(esperado.tabs);
    });

    it("la lista de ciudades dice cuántos hay por autorizar (los departamentos van de la A a la Z, no como el canvas)", () => {
      const lista = construirLista(m, resuelto);
      const mias = new Map([lista.todas, ...lista.grupos.flatMap((g) => g.nodos)].map((n) => [n.nombre, n.detalle]));
      expect(mias.size).toBe(esperado.lista.length);
      for (const [nombre, detalle] of esperado.lista) expect(mias.get(nombre)).toBe(detalle);
    });

    it("las filas de la bandeja: número, quién, qué, monto y etiqueta, en el mismo orden", () => {
      const filas = construirFilas(m, solicitudesDe(resuelto, pestana));
      expect(filas.map((f) => ({ num: f.numero, who: f.quien, what: f.que, amount: f.monto, tag: f.etiqueta.texto }))).toEqual(esperado.filas);
    });
  });

  it("los tres artboards: abren la pestaña y el pedido que dibujan", () => {
    const m = mundo();
    const [uno, dos, tres] = canvas.artboards;
    const ab = (sel: string, tab: Pestana) => construirFilas(m, solicitudesDe(resolverAmbito(m, AMBITOS[sel]), tab));

    expect(uno.detalle).toBe("Pedido #231");
    expect(ab("all", "PEND")[0].numero).toBe("#231");
    expect(ab("all", "PEND")[0].etiqueta.texto).toBe("△ Supera el límite");
    expect(dos.detalle).toBe("Transferencia T-18");
    expect(ab("riv", "TRF")[0].numero).toBe("T-18");
    expect(tres.detalle).toBe("Pedido #219");
    expect(ab("all", "DES").map((f) => f.numero)).toContain("#219");
    expect(canvas.artboards.map((a) => a.filas.length)).toEqual([ab("all", "PEND").length, ab("riv", "TRF").length, ab("all", "DES").length]);
  });

  describe.each(Object.entries(canvas.detalles))("detalle de %s", (id, esperado) => {
    const m = mundo();
    const solicitud = m.todas.find((s) => s.numero === id);
    const detalle = solicitud ? construirDetalle(m, solicitud) : null;

    it("existe en los datos", () => {
      expect(solicitud).toBeDefined();
    });

    it("título, etiqueta, pasos, aviso y lo que pide con su costo", () => {
      expect(detalle?.titulo).toBe(esperado.title);
      expect(detalle?.etiqueta.texto).toBe(esperado.tag);
      expect(detalle?.pasos.map((p) => p.rotulo)).toEqual(esperado.steps.map(([rotulo]) => rotulo));
      expect(detalle?.aviso).toBe(esperado.warn);
      expect(detalle?.tituloItems).toBe(esperado.itemsTitle);
      expect(detalle?.items.map((i) => [i.nombre, i.cantidad, i.unidad, i.subtotal])).toEqual(esperado.items);
      expect(detalle?.rotuloDelTotal).toBe(esperado.totL);
      expect(detalle?.total).toBe(esperado.totT);
    });

    it("los pasos hechos llevan ✓ donde el canvas los marca", () => {
      expect(detalle?.pasos.map((p) => (p.estado === "hecho" ? "✓" : ""))).toEqual(esperado.steps.map(([, marca]) => marca));
    });

    it("la cuenta de quien pide", () => {
      expect(detalle?.tituloContexto).toBe(esperado.ctxTitle);
      const mias = (detalle?.contexto ?? []).map((c) => [c.rotulo, c.valor, c.nota, c.negrita ? "600" : "400"]);
      if (solicitud?.tipo === "pedido" && solicitud.estado !== "PEND") {
        // Ya autorizado (o rechazado), «Deuda con este pedido» no existe: la deuda de hoy ya lleva el pedido (o nunca lo llevó).
        const sinConPedido = esperado.ctx.filter(([rotulo]) => rotulo !== "Deuda con este pedido");
        expect(mias.map((f) => f[0])).toEqual(sinConPedido.map((f) => f[0]));
        expect(mias.filter((f) => f[0] !== "Deuda actual")).toEqual(sinConPedido.filter((f) => f[0] !== "Deuda actual"));
        expect(mias.find((f) => f[0] === "Deuda actual")?.[1]).toBe(sinConPedido[0][1]);
      } else {
        expect(mias).toEqual(esperado.ctx);
      }
    });

    it("Autorizar y Rechazar aparecen solo si está por autorizar, con la nota del canvas", () => {
      expect(detalle?.puedeDecidir).toBe(esperado.canAct);
      if (esperado.actNote) expect(detalle?.notaDeAccion).toBe(esperado.actNote);
    });

    it("la nota de estado", () => {
      if (esperado.noteBox === null) {
        expect(detalle?.nota).toBeNull();
      } else {
        // El canvas corta la nota del despachado #216 en la primera frase; la vista dice las dos siempre.
        expect(detalle?.nota).toContain(esperado.noteBox.split(" Natalia ")[0]);
        if (id !== "#216") expect(detalle?.nota).toBe(esperado.noteBox);
      }
    });
  });
});
