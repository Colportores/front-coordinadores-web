import { describe, expect, it } from "vitest";

import type { DatosDePedidos, PedidoDeColportor, TransferenciaDeStock } from "@/datos/stock/pedidos";
import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";

import {
  AMBITO_TODAS,
  aplicarResolucion,
  claveQueLaReemplaza,
  claveVigente,
  construirDetalle,
  construirFilas,
  construirLista,
  construirMundo,
  contarPestanas,
  decisionDe,
  diaYMesDeInstante,
  estaEnPestana,
  etiquetaDe,
  MAXIMO_DEL_MOTIVO,
  money,
  resolverAmbito,
  solicitudesDe,
  superaElLimite,
  textoDeCuando,
  textoDeDecision,
  textoDePestanaVacia,
  validarMotivo,
} from "./modelo";

const AHORA = new Date("2026-10-22T18:00:00-03:00");
const datos = () => crearDatosDePedidosSimulados(AHORA);
const mundo = (d: DatosDePedidos = datos()) => construirMundo(d);

const cuenta = { deuda: 10_000, porCobrar: 0, librosPorEntregar: 0, ultimoDeposito: null };
function pedido(sobre: Partial<PedidoDeColportor> = {}): PedidoDeColportor {
  return {
    id: "p1",
    numero: "#1",
    colportorId: "c1",
    colportorNombre: "Ana Pérez",
    ciudadId: "rivera",
    estado: "POR_AUTORIZAR",
    enviadoEn: "2026-10-22T20:00:00.000Z",
    resueltoEn: null,
    motivoDeRechazo: null,
    lineas: [{ nombre: "Libro", cantidad: 2, costoUnitario: 1000 }],
    cuenta,
    stock: [],
    ...sobre,
  };
}
const vacios = (sobre: Partial<DatosDePedidos> = {}): DatosDePedidos => ({ ...datos(), pedidos: [], transferencias: [], ...sobre });

describe("textoDeCuando", () => {
  const dice = (iso: string) => textoDeCuando(iso, AHORA);
  const antes = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString();

  it("minutos, horas, ayer con la hora de Montevideo, días y, pasada la semana, el día", () => {
    expect(dice(antes(0))).toBe("hace un momento");
    expect(dice(antes(12))).toBe("hace 12 min");
    expect(dice(antes(180))).toBe("hace 3 h");
    expect(dice(new Date("2026-10-21T19:20:00-03:00").toISOString())).toBe("ayer 19:20");
    expect(dice(new Date("2026-10-19T10:00:00-03:00").toISOString())).toBe("hace 3 días");
    expect(dice(new Date("2026-10-15T10:00:00-03:00").toISOString())).toBe("15/10");
  });

  it("el día es el de Montevideo: a las 22:00 de allá sigue siendo el mismo día aunque en UTC ya sea el siguiente", () => {
    expect(diaYMesDeInstante("2026-10-23T01:30:00.000Z")).toBe("22/10");
    expect(dice("2026-10-22T23:30:00-03:00")).toBe("hace un momento");
  });

  it("un instante del futuro (reloj corrido) dice «hace un momento» y una fecha rota no dice nada", () => {
    expect(dice(new Date(AHORA.getTime() + 3_600_000).toISOString())).toBe("hace un momento");
    expect(dice("no es una fecha")).toBe("");
    expect(diaYMesDeInstante("no es una fecha")).toBe("");
  });
});

describe("mundo y ámbitos", () => {
  it("ordena las solicitudes de la más nueva a la más vieja y junta pedidos y transferencias", () => {
    const m = mundo();
    expect(m.todas).toHaveLength(12);
    expect(m.todas.map((s) => s.numero).slice(0, 3)).toEqual(["T-18", "#231", "#230"]);
  });

  it("un pedido repetido cuenta una sola vez", () => {
    const base = datos();
    const m = mundo({ ...base, pedidos: [...base.pedidos, base.pedidos[0]] });
    expect(m.todas).toHaveLength(12);
  });

  it("un pedido de una ciudad que ya no figura, o de un colportor sin zona, va a «Sin ciudad» y entra en «Todas»", () => {
    const base = vacios({ pedidos: [pedido({ id: "a", ciudadId: null }), pedido({ id: "b", ciudadId: "fantasma" }), pedido({ id: "c" })] });
    const m = mundo(base);
    expect(m.sinCiudad.map((s) => s.id)).toEqual(expect.arrayContaining(["a", "b"]));
    expect(resolverAmbito(m, AMBITO_TODAS).solicitudes).toHaveLength(3);
    const sin = resolverAmbito(m, { tipo: "sin-ciudad" });
    expect(sin.titulo).toBe("Sin ciudad");
    expect(sin.solicitudes).toHaveLength(2);
    const lista = construirLista(m, sin);
    expect(lista.grupos.at(-1)?.nodos[0]).toMatchObject({ nombre: "Sin ciudad", detalle: "2 por autorizar", seleccionado: true });
    // Ningún departamento los cuenta.
    expect(resolverAmbito(m, { tipo: "departamento", clave: "artigas" }).solicitudes).toEqual([]);
  });

  it("un ámbito que desapareció vuelve a «Todas las ciudades»", () => {
    const m = mundo();
    expect(resolverAmbito(m, { tipo: "ciudad", ciudadId: "no-existe" }).titulo).toBe("Todas las ciudades");
    expect(resolverAmbito(m, { tipo: "departamento", clave: "rivera" }).titulo).toBe("Todas las ciudades");
    expect(resolverAmbito(m, { tipo: "sin-ciudad" }).titulo).toBe("Todas las ciudades");
  });

  it("sin pedidos todo da cero y la lista no inventa avisos", () => {
    const m = mundo(vacios());
    const r = resolverAmbito(m, AMBITO_TODAS);
    expect(r.subtitulo).toBe("0 por autorizar · 0 en la campaña");
    expect(construirLista(m, r).todas.detalle).toBe("");
    expect(contarPestanas(r).map((p) => p.n)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("una lista larga se arma entera (300 pedidos) y las pestañas la cuentan", () => {
    const muchos = Array.from({ length: 300 }, (_, i) => pedido({ id: `p${i}`, numero: `#${i}`, enviadoEn: new Date(AHORA.getTime() - i * 60_000).toISOString() }));
    const m = mundo(vacios({ pedidos: muchos }));
    const r = resolverAmbito(m, AMBITO_TODAS);
    expect(contarPestanas(r)[1].n).toBe(300);
    expect(construirFilas(m, solicitudesDe(r, "PEND"))).toHaveLength(300);
  });
});

describe("pestañas", () => {
  it("«Todos» y las de estado son de pedidos; «Transferencias», solo de ellas", () => {
    const m = mundo();
    const t = m.todas.find((s) => s.numero === "T-18")!;
    const p = m.todas.find((s) => s.numero === "#231")!;
    expect(estaEnPestana(t, "TRF")).toBe(true);
    expect(estaEnPestana(t, "ALL")).toBe(false);
    expect(estaEnPestana(t, "PEND")).toBe(false);
    expect(estaEnPestana(p, "PEND")).toBe(true);
    expect(estaEnPestana(p, "AUT")).toBe(false);
  });

  it("cada pestaña vacía dice qué pasa y en qué lugar", () => {
    expect(textoDePestanaVacia("PEND", "Rivera")).toBe("No hay pedidos por autorizar en Rivera.");
    expect(textoDePestanaVacia("TRF", "el departamento Artigas")).toBe("No hay transferencias en el departamento Artigas.");
    expect(textoDePestanaVacia("ALL", "la campaña")).toMatch(/Todavía no hay pedidos en la campaña/);
  });

  it("la fila abierta es la elegida si sigue en la lista y si no la primera; al salir una, queda la que ocupa su lugar", () => {
    const m = mundo();
    const filas = construirFilas(m, solicitudesDe(resolverAmbito(m, AMBITO_TODAS), "PEND"));
    const claves = filas.map((f) => f.clave);
    expect(claveVigente(filas, null)).toBe(claves[0]);
    expect(claveVigente(filas, claves[2])).toBe(claves[2]);
    expect(claveVigente(filas, "pedido:fantasma")).toBe(claves[0]);
    expect(claveVigente([], "x")).toBeNull();
    expect(claveQueLaReemplaza(filas, claves[1])).toBe(claves[2]);
    expect(claveQueLaReemplaza(filas, claves.at(-1)!)).toBe(claves.at(-2));
    expect(claveQueLaReemplaza(filas.slice(0, 1), claves[0])).toBeNull();
    expect(claveQueLaReemplaza(filas, "otra")).toBeNull();
  });
});

describe("el límite avisa y no bloquea", () => {
  it("supera el límite solo un pedido por autorizar cuya deuda con el pedido pasa de lo fijado", () => {
    const m = mundo();
    const por = (n: string) => m.todas.find((s) => s.numero === n)!;
    expect(superaElLimite(por("#231"), m.limite)).toBe(true); // 22.100 + 36.040
    expect(superaElLimite(por("#230"), m.limite)).toBe(false);
    expect(superaElLimite(por("#224"), m.limite)).toBe(false); // ya autorizado
    expect(superaElLimite(por("T-18"), m.limite)).toBe(false);
    expect(etiquetaDe(por("#231"), m.limite)).toEqual({ texto: "△ Supera el límite", tono: "alerta" });
  });

  it("justo en el límite no lo supera; un peso más, sí", () => {
    const en = (deuda: number) => {
      const m = mundo(vacios({ limiteDeDeuda: 12_000, pedidos: [pedido({ cuenta: { ...cuenta, deuda } })] }));
      return superaElLimite(m.todas[0], m.limite);
    };
    expect(en(10_000)).toBe(false); // 10.000 + 2 × 1.000 = 12.000
    expect(en(10_001)).toBe(true);
  });

  it("sin límite fijado (o en cero) no hay aviso ni etiqueta", () => {
    for (const limiteDeDeuda of [null, 0]) {
      const m = mundo(vacios({ limiteDeDeuda, pedidos: [pedido({ cuenta: { ...cuenta, deuda: 9_000_000 } })] }));
      expect(m.limite).toBeNull();
      expect(construirDetalle(m, m.todas[0]).aviso).toBeNull();
      expect(etiquetaDe(m.todas[0], m.limite).texto).toBe("Por autorizar");
    }
  });

  it("el aviso dice cuánto se pasa y que se puede autorizar igual; el detalle sigue permitiendo decidir", () => {
    const m = mundo();
    const d = construirDetalle(m, m.todas.find((s) => s.numero === "#231")!);
    expect(d.aviso).toBe("Con este pedido la deuda queda en $U 58.140 y supera el límite de $U 50.000 por $U 8.140. Podés autorizarlo igual.");
    expect(d.puedeDecidir).toBe(true);
  });
});

describe("datos raros del servidor", () => {
  it("cantidades y costos negativos o que no son número cuentan como cero", () => {
    const m = mundo(
      vacios({
        pedidos: [pedido({ lineas: [{ nombre: "Rota", cantidad: -3, costoUnitario: Number.NaN }, { nombre: "Buena", cantidad: 2.9, costoUnitario: 500 }] })],
      }),
    );
    expect(m.todas[0].total).toBe(1000);
    expect(construirDetalle(m, m.todas[0]).items.map((i) => i.cantidad)).toEqual(["0", "2"]);
  });

  it("un pedido sin productos no rompe nada", () => {
    const m = mundo(vacios({ pedidos: [pedido({ lineas: [] })] }));
    const [fila] = construirFilas(m, m.todas);
    expect(fila.que).toBe("0 productos · 0 unidades");
    expect(fila.monto).toBe("$U 0");
  });

  it("textos largos se conservan enteros (la vista los corta con CSS, no el modelo)", () => {
    const largo = "Nombre ".repeat(60).trim();
    const m = mundo(vacios({ pedidos: [pedido({ colportorNombre: largo })] }));
    expect(construirFilas(m, m.todas)[0].quien).toBe(largo);
  });

  it("sin depósito dice que todavía no depositó; sin stock informado, una raya", () => {
    const m = mundo(vacios({ pedidos: [pedido()] }));
    const filas = construirDetalle(m, m.todas[0]).contexto;
    expect(filas.find((f) => f.rotulo === "Último depósito")?.valor).toBe("Todavía no depositó");
    expect(filas.find((f) => f.rotulo === "Stock de estos productos")?.valor).toBe("—");
  });

  it("una transferencia que pide más de lo que tiene quien da dice cuánto le falta", () => {
    const t: TransferenciaDeStock = {
      id: "t1",
      numero: "T-1",
      deId: "a",
      deNombre: "Ana Pérez",
      aId: "b",
      aNombre: "Beto Gómez",
      ciudadId: "rivera",
      estado: "POR_AUTORIZAR",
      pedidaEn: "2026-10-22T20:00:00.000Z",
      resueltaEn: null,
      motivoDeRechazo: null,
      lineas: [{ nombre: "Libro", cantidad: 5, costoUnitario: 100, tieneQuienDa: 3, debeEntregarQuienRecibe: 1, tieneQuienRecibe: 0 }],
    };
    const m = mundo(vacios({ transferencias: [t] }));
    const ctx = construirDetalle(m, m.todas[0]).contexto;
    expect(ctx[0]).toMatchObject({ rotulo: "Ana tiene", valor: "3", nota: "le faltan 2" });
  });

  it("una transferencia con varios productos nombra el producto en cada fila", () => {
    const t: TransferenciaDeStock = {
      id: "t2",
      numero: "T-2",
      deId: "a",
      deNombre: "Ana Pérez",
      aId: "b",
      aNombre: "Beto Gómez",
      ciudadId: "rivera",
      estado: "POR_AUTORIZAR",
      pedidaEn: "2026-10-22T20:00:00.000Z",
      resueltaEn: null,
      motivoDeRechazo: null,
      lineas: [
        { nombre: "Libro A", cantidad: 1, costoUnitario: 100, tieneQuienDa: 3, debeEntregarQuienRecibe: 1, tieneQuienRecibe: 0 },
        { nombre: "Libro B", cantidad: 2, costoUnitario: 50, tieneQuienDa: 5, debeEntregarQuienRecibe: 0, tieneQuienRecibe: 1 },
      ],
    };
    const m = mundo(vacios({ transferencias: [t] }));
    const [fila] = construirFilas(m, m.todas);
    expect(fila.que).toBe("2 productos · 3 unidades");
    expect(construirDetalle(m, m.todas[0]).contexto.map((c) => c.rotulo)).toContain("Ana tiene de Libro B");
  });
});

describe("decidir", () => {
  it("el motivo es obligatorio, sin espacios de más y con tope", () => {
    expect(validarMotivo("   ", "pedido")).toEqual({ ok: false, error: "Escribí el motivo para rechazar el pedido." });
    expect(validarMotivo("", "transferencia")).toEqual({ ok: false, error: "Escribí el motivo para rechazar la transferencia." });
    expect(validarMotivo("  Excede la capacidad de pago  ", "pedido")).toEqual({ ok: true, motivo: "Excede la capacidad de pago" });
    expect(validarMotivo("x".repeat(MAXIMO_DEL_MOTIVO), "pedido").ok).toBe(true);
    expect(validarMotivo("x".repeat(MAXIMO_DEL_MOTIVO + 1), "pedido").ok).toBe(false);
  });

  it("arma la decisión que viaja", () => {
    const m = mundo();
    const s = m.todas.find((x) => x.numero === "#231")!;
    expect(decisionDe(s, "autorizar")).toEqual({ tipo: "pedido", id: s.id, accion: "autorizar" });
    expect(decisionDe(s, "rechazar", "No")).toEqual({ tipo: "pedido", id: s.id, accion: "rechazar", motivo: "No" });
  });

  it("aplica la resolución a un pedido por autorizar y no toca a los demás", () => {
    const d = datos();
    const antes = d.pedidos.find((p) => p.numero === "#231")!;
    const despues = aplicarResolucion(d, { tipo: "pedido", id: antes.id, estado: "AUTORIZADO", resueltoEn: "2026-10-22T21:00:00.000Z", motivoDeRechazo: null });
    expect(despues.pedidos.find((p) => p.id === antes.id)).toMatchObject({ estado: "AUTORIZADO", resueltoEn: "2026-10-22T21:00:00.000Z" });
    expect(despues.pedidos.filter((p) => p.id !== antes.id)).toEqual(d.pedidos.filter((p) => p.id !== antes.id));
    expect(despues.transferencias).toEqual(d.transferencias);
  });

  it("lo que ya no está por autorizar no se vuelve a tocar (otro coordinador llegó antes)", () => {
    const d = datos();
    const ya = d.pedidos.find((p) => p.estado === "DESPACHADO")!;
    expect(aplicarResolucion(d, { tipo: "pedido", id: ya.id, estado: "RECHAZADO", resueltoEn: "2026-10-22T21:00:00.000Z", motivoDeRechazo: "x" })).toEqual(d);
  });

  it("rechaza una transferencia con su motivo y un estado que no le toca se ignora", () => {
    const d = datos();
    const t = d.transferencias.find((x) => x.numero === "T-18")!;
    const r = aplicarResolucion(d, { tipo: "transferencia", id: t.id, estado: "RECHAZADA", resueltoEn: "2026-10-22T21:00:00.000Z", motivoDeRechazo: "Sin stock" });
    expect(r.transferencias.find((x) => x.id === t.id)).toMatchObject({ estado: "RECHAZADA", motivoDeRechazo: "Sin stock" });
    expect(aplicarResolucion(d, { tipo: "transferencia", id: t.id, estado: "AUTORIZADO", resueltoEn: "x", motivoDeRechazo: null })).toEqual(d);
    expect(aplicarResolucion(d, { tipo: "pedido", id: d.pedidos[0].id, estado: "AUTORIZADA", resueltoEn: "x", motivoDeRechazo: null })).toEqual(d);
  });

  it("una transferencia rechazada tiene sus pasos, su etiqueta y su nota con el motivo", () => {
    const d = datos();
    const t = d.transferencias.find((x) => x.numero === "T-18")!;
    const m = mundo(aplicarResolucion(d, { tipo: "transferencia", id: t.id, estado: "RECHAZADA", resueltoEn: AHORA.toISOString(), motivoDeRechazo: "Sin stock" }));
    const det = construirDetalle(m, m.todas.find((s) => s.numero === "T-18")!);
    expect(det.etiqueta).toEqual({ texto: "Rechazada", tono: "peligro" });
    expect(det.pasos.map((p) => [p.rotulo, p.estado])).toEqual([["Por autorizar", "hecho"], ["Rechazada", "hecho"]]);
    expect(det.nota).toBe("Rechazada el 22/10. Motivo: “Sin stock”");
    expect(det.puedeDecidir).toBe(false);
  });

  it("los avisos de lo que salió bien dicen qué pasó con la deuda", () => {
    const m = mundo();
    const por = (n: string) => m.todas.find((s) => s.numero === n)!;
    expect(textoDeDecision(por("#231"), "autorizar")).toBe("Pedido #231 de Emiliano Sosa autorizado: se sumaron $U 36.040 a su deuda.");
    expect(textoDeDecision(por("#231"), "rechazar")).toBe("Pedido #231 de Emiliano Sosa rechazado: el colportor recibe el motivo.");
    expect(textoDeDecision(por("T-18"), "autorizar")).toBe("Transferencia T-18 de Valentina Silva autorizada: la deuda de $U 2.900 pasó a Lucía.");
  });

  it("money junta miles con punto", () => {
    expect(money(1234567)).toBe("$U 1.234.567");
  });
});
