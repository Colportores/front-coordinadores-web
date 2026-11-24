import { describe, expect, it } from "vitest";

import type { DatosDePedidos, PedidoDeColportor, TransferenciaDeStock } from "@/datos/stock/pedidos";
import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";

import {
  AMBITO_TODAS,
  aplicarResolucion,
  aplicarResolucionConEfecto,
  cantidadesAutorizadas,
  cantidadesPedidas,
  claveQueLaReemplaza,
  claveVigente,
  construirDetalle,
  construirFilas,
  construirLista,
  construirMundo,
  contarPestanas,
  decisionDe,
  deshacerResolucion,
  diaYMesDeInstante,
  estaEnPestana,
  etiquetaDe,
  MAXIMO_DEL_MOTIVO,
  money,
  nombreDeDeshacer,
  notaDelLimite,
  resolucionProvisional,
  resolverAmbito,
  solicitudesDe,
  superaElLimite,
  textoDeCuando,
  textoDeDecisionDiferida,
  textoDePestanaVacia,
  validarLimite,
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
    expect(textoDePestanaVacia("PEND", "Rivera", 1)).toBe("No hay pedidos por autorizar en Rivera. Tenés 1 transferencia por autorizar.");
    expect(textoDePestanaVacia("PEND", "Rivera", 3)).toBe("No hay pedidos por autorizar en Rivera. Tenés 3 transferencias por autorizar.");
    expect(textoDePestanaVacia("AUT", "Rivera", 3)).toBe("No hay pedidos autorizados en Rivera.");
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

  it("sin límite fijado (o con un valor que no es un monto) no hay aviso ni etiqueta", () => {
    for (const limiteDeDeuda of [null, -5, Number.NaN]) {
      const m = mundo(vacios({ limiteDeDeuda, pedidos: [pedido({ cuenta: { ...cuenta, deuda: 9_000_000 } })] }));
      expect(m.limite).toBeNull();
      expect(construirDetalle(m, m.todas[0]).aviso).toBeNull();
      expect(etiquetaDe(m.todas[0], m.limite).texto).toBe("Por autorizar");
    }
  });

  it("un límite en cero es un límite (decisión P9): todo pedido con deuda lo supera", () => {
    const m = mundo(vacios({ limiteDeDeuda: 0, pedidos: [pedido({ cuenta: { ...cuenta, deuda: 1_000 } })] }));
    expect(m.limite).toBe(0);
    expect(construirDetalle(m, m.todas[0]).aviso).toContain("supera el límite de $U 0");
    expect(etiquetaDe(m.todas[0], m.limite).texto).toBe("△ Supera el límite");
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

  it("al autorizar un pedido la deuda de quien lo pidió sube en todas sus cuentas, y la de los demás no se mueve", () => {
    const d = datos();
    const antes = d.pedidos.find((p) => p.numero === "#231")!;
    const otro = { ...antes, id: "pedido-232", numero: "#232", lineas: [{ nombre: "Pamplona", cantidad: 10, costoUnitario: 120 }] };
    const conOtro = { ...d, pedidos: [...d.pedidos, otro] };

    const despues = aplicarResolucion(conOtro, { tipo: "pedido", id: antes.id, estado: "AUTORIZADO", resueltoEn: "2026-10-22T21:00:00.000Z", motivoDeRechazo: null });

    expect(despues.pedidos.find((p) => p.id === antes.id)!.cuenta.deuda).toBe(22_100 + 36_040);
    expect(despues.pedidos.find((p) => p.id === "pedido-232")!.cuenta.deuda).toBe(22_100 + 36_040);
    expect(despues.pedidos.filter((p) => p.colportorId !== antes.colportorId)).toEqual(conOtro.pedidos.filter((p) => p.colportorId !== antes.colportorId));
    // El aviso del límite del otro pedido ya cuenta la deuda nueva.
    const m = mundo(despues);
    expect(construirDetalle(m, m.todas.find((s) => s.numero === "#232")!).aviso).toContain("$U 59.340");
    expect(construirDetalle(m, m.todas.find((s) => s.numero === "#231")!).contexto.find((f) => f.rotulo === "Deuda actual")).toMatchObject({ valor: "$U 58.140", nota: "incluye este pedido" });
  });

  it("rechazar un pedido no mueve ninguna deuda", () => {
    const d = datos();
    const antes = d.pedidos.find((p) => p.numero === "#231")!;
    const despues = aplicarResolucion(d, { tipo: "pedido", id: antes.id, estado: "RECHAZADO", resueltoEn: "2026-10-22T21:00:00.000Z", motivoDeRechazo: "No" });
    expect(despues.pedidos.map((p) => p.cuenta)).toEqual(d.pedidos.map((p) => p.cuenta));
  });

  it("autorizar una transferencia pasa la deuda de quien da a quien recibe; rechazarla no mueve nada", () => {
    const d = datos();
    const t = d.transferencias.find((x) => x.numero === "T-18")!;
    const deuda = (xs: DatosDePedidos, numero: string) => xs.pedidos.find((p) => p.numero === numero)!.cuenta.deuda;

    const autorizada = aplicarResolucion(d, { tipo: "transferencia", id: t.id, estado: "AUTORIZADA", resueltoEn: "2026-10-22T21:00:00.000Z", motivoDeRechazo: null });
    expect(deuda(autorizada, "#224")).toBe(31_000 - 2_900); // Valentina, quien da
    expect(deuda(autorizada, "#230")).toBe(14_300 + 2_900); // Lucía, quien recibe
    expect(deuda(autorizada, "#231")).toBe(22_100);

    const rechazada = aplicarResolucion(d, { tipo: "transferencia", id: t.id, estado: "RECHAZADA", resueltoEn: "2026-10-22T21:00:00.000Z", motivoDeRechazo: "Sin stock" });
    expect(rechazada.pedidos).toEqual(d.pedidos);
  });

  it("la deuda de quien da nunca queda por debajo de cero", () => {
    const d = datos();
    const t = d.transferencias.find((x) => x.numero === "T-18")!;
    const chica = { ...d, pedidos: d.pedidos.map((p) => (p.numero === "#224" ? { ...p, cuenta: { ...p.cuenta, deuda: 1_000 } } : p)) };
    const r = aplicarResolucion(chica, { tipo: "transferencia", id: t.id, estado: "AUTORIZADA", resueltoEn: "2026-10-22T21:00:00.000Z", motivoDeRechazo: null });
    expect(r.pedidos.find((p) => p.numero === "#224")!.cuenta.deuda).toBe(0);
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

  it("money junta miles con punto", () => {
    expect(money(1234567)).toBe("$U 1.234.567");
  });
});

describe("«Deshacer» de 8 s de las transferencias (#110)", () => {
  const instante = "2026-10-22T21:00:00.000Z";
  const t18 = () => datos().transferencias.find((x) => x.numero === "T-18")!;
  const solicitud = (d: DatosDePedidos) => solicitudesDe(resolverAmbito(construirMundo(d), AMBITO_TODAS), "TRF").find((s) => s.numero === "T-18")!;
  const deuda = (xs: DatosDePedidos, numero: string) => xs.pedidos.find((p) => p.numero === numero)!.cuenta.deuda;

  it("la resolución provisional es la de una decisión aceptada, con el instante y el motivo", () => {
    const s = solicitud(datos());
    expect(resolucionProvisional(s, "autorizar", "", instante)).toEqual({ tipo: "transferencia", id: t18().id, estado: "AUTORIZADA", resueltoEn: instante, motivoDeRechazo: null });
    expect(resolucionProvisional(s, "rechazar", "Sin stock", instante)).toMatchObject({ estado: "RECHAZADA", motivoDeRechazo: "Sin stock" });
  });

  it("deshacer una autorización devuelve la deuda y deja la transferencia por autorizar", () => {
    const d = datos();
    const s = solicitud(d);
    const { datos: autorizada, efecto } = aplicarResolucionConEfecto(d, resolucionProvisional(s, "autorizar", "", instante));
    const vuelta = deshacerResolucion(autorizada, "transferencia", t18().id, efecto);

    expect(vuelta).toEqual(d);
    expect(deuda(vuelta, "#224")).toBe(31_000);
    expect(deuda(vuelta, "#230")).toBe(14_300);
  });

  it("deshacer un rechazo borra el motivo y no toca ninguna deuda", () => {
    const d = datos();
    const { datos: rechazada, efecto } = aplicarResolucionConEfecto(d, resolucionProvisional(solicitud(d), "rechazar", "Sin stock", instante));
    expect(rechazada.transferencias.find((x) => x.id === t18().id)).toMatchObject({ estado: "RECHAZADA", motivoDeRechazo: "Sin stock" });
    expect(deshacerResolucion(rechazada, "transferencia", t18().id, efecto)).toEqual(d);
  });

  it("solo mueve lo suyo: otra decisión sobre los mismos colportores en el medio se conserva", () => {
    const d = datos();
    const { datos: autorizada, efecto } = aplicarResolucionConEfecto(d, resolucionProvisional(solicitud(d), "autorizar", "", instante));
    const conOtra = { ...autorizada, pedidos: autorizada.pedidos.map((p) => (p.numero === "#230" ? { ...p, cuenta: { ...p.cuenta, deuda: p.cuenta.deuda + 1_000 } } : p)) };
    expect(deuda(deshacerResolucion(conOtra, "transferencia", t18().id, efecto), "#230")).toBe(14_300 + 1_000);
  });

  it("si la deuda de quien da era menor que lo transferido (el piso en cero), deshacer devuelve lo que se descontó, no el costo entero", () => {
    const d = datos();
    const chica = { ...d, pedidos: d.pedidos.map((p) => (p.numero === "#224" ? { ...p, cuenta: { ...p.cuenta, deuda: 1_000 } } : p)) };
    const { datos: autorizada, efecto } = aplicarResolucionConEfecto(chica, resolucionProvisional(solicitud(chica), "autorizar", "", instante));
    expect(deuda(autorizada, "#224")).toBe(0);
    expect(deuda(autorizada, "#230")).toBe(14_300 + 2_900);

    const vuelta = deshacerResolucion(autorizada, "transferencia", t18().id, efecto);
    expect(vuelta).toEqual(chica);
    expect(deuda(vuelta, "#224")).toBe(1_000);
    expect(deuda(vuelta, "#230")).toBe(14_300);
  });

  it("el efecto trae solo los pedidos que cambiaron y un rechazo no mueve nada", () => {
    const d = datos();
    const { efecto } = aplicarResolucionConEfecto(d, resolucionProvisional(solicitud(d), "autorizar", "", instante));
    expect(Object.keys(efecto).sort()).toEqual(d.pedidos.filter((p) => p.numero === "#224" || p.numero === "#230").map((p) => p.id).sort());
    expect(aplicarResolucionConEfecto(d, resolucionProvisional(solicitud(d), "rechazar", "No", instante)).efecto).toEqual({});
  });

  it("lo que está por autorizar, no existe o es un pedido no se toca", () => {
    const d = datos();
    expect(deshacerResolucion(d, "transferencia", t18().id)).toBe(d);
    expect(deshacerResolucion(d, "transferencia", "no-existe")).toBe(d);
    expect(deshacerResolucion(d, "pedido", d.pedidos[0].id)).toBe(d);
  });

  it("los textos del aviso dicen qué se decidió, a quién le pasa la deuda y qué botón es", () => {
    const s = solicitud(datos());
    expect(textoDeDecisionDiferida(s, "autorizar")).toBe("Autorizaste la transferencia T-18 de Valentina Silva: la deuda de $U 2.900 pasa a Lucía cuando se cierre este aviso.");
    expect(textoDeDecisionDiferida(s, "rechazar")).toBe("Rechazaste la transferencia T-18 de Valentina Silva. Cuando se cierre este aviso, el colportor recibe el motivo.");
    expect(nombreDeDeshacer(s, "autorizar")).toBe("Deshacer · 8 s: autorización de la transferencia T-18");
    expect(nombreDeDeshacer(s, "rechazar")).toBe("Deshacer · 8 s: rechazo de la transferencia T-18");
  });
});

describe("reducir cantidades y «Deshacer» de los pedidos (#93, 42A·03 y 42A·04)", () => {
  const instante = "2026-10-22T21:00:00.000Z";
  const p231 = () => datos().pedidos.find((p) => p.numero === "#231")!;
  const solicitud = (d: DatosDePedidos = datos(), numero = "#231") => construirMundo(d).todas.find((s) => s.numero === numero)!;
  const deuda = (xs: DatosDePedidos, numero: string) => xs.pedidos.find((p) => p.numero === numero)!.cuenta.deuda;
  // #231 pidió 10 + 8 + 30 = 48 unidades por $U 36.040: lo autorizado, 5 + 4 + 30 = 39.
  const reducidas = [5, 4, 30];

  it("arranca con lo pedido y nunca pasa de ahí ni baja de cero", () => {
    const s = solicitud();
    expect(cantidadesPedidas(s)).toEqual([10, 8, 30]);
    expect(cantidadesAutorizadas(s, [99, -3, 7.9])).toEqual([
      { nombre: "La Gran Esperanza", cantidad: 10 },
      { nombre: "El Deseado de Todas las Gentes", cantidad: 0 },
      { nombre: "Revista Vida Feliz", cantidad: 7 },
    ]);
  });

  it("el detalle recalcula el monto, la deuda con el pedido y dice si todavía pasa el límite", () => {
    const m = mundo();
    const s = solicitud();
    const det = construirDetalle(m, s, reducidas);
    // 5 × 1.450 + 4 × 1.980 + 30 × 190 = 20.870 → deuda 22.100 + 20.870 = 42.970: ya no pasa los $U 50.000.
    expect(det.reduccion).toEqual({ unidadesPedidas: 48, unidadesAutorizadas: 39, sinCambios: false, sinNada: false });
    expect(det.tituloItems).toBe("LO QUE AUTORIZÁS");
    expect(det.rotuloDelTotal).toBe("Monto reducido");
    expect(det.total).toBe("$U 20.870");
    expect(det.aviso).toBe("Reducido a 39 de 48. Con este monto la deuda queda en $U 42.970 y ya no pasa el límite de $U 50.000.");
    expect(det.avisoTono).toBe("exito");
    expect(det.etiqueta.texto).toBe("Por autorizar");
    expect(det.items.map((i) => [i.cantidad, i.pedida])).toEqual([["5", 10], ["4", 8], ["30", 30]]);
  });

  it("si reducido todavía pasa el límite lo dice con cuánto", () => {
    const m = mundo({ ...datos(), limiteDeDeuda: 30_000 });
    const det = construirDetalle(m, m.todas.find((s) => s.numero === "#231")!, reducidas);
    expect(det.aviso).toBe("Reducido a 39 de 48. La deuda con el pedido todavía pasa el límite por $U 12.970.");
    expect(det.avisoTono).toBe("alerta");
    expect(det.etiqueta.texto).toBe("△ Supera el límite");
  });

  it("sin bajar nada o con todo en cero no se puede autorizar reducido", () => {
    const m = mundo();
    const s = solicitud();
    expect(construirDetalle(m, s, [10, 8, 30]).reduccion).toMatchObject({ sinCambios: true, sinNada: false });
    const nada = construirDetalle(m, s, [0, 0, 0]);
    expect(nada.reduccion).toMatchObject({ sinNada: true });
    expect(nada.aviso).toBe("No queda nada para autorizar: subí alguna cantidad, o cancelá y rechazá el pedido.");
    expect(nada.notaDeAccion).toBe("Dejá al menos un producto con cantidad para autorizar.");
  });

  it("solo un pedido por autorizar se puede reducir (no una transferencia ni un pedido ya autorizado)", () => {
    const m = mundo();
    expect(construirDetalle(m, solicitud()).puedeReducir).toBe(true);
    expect(construirDetalle(m, solicitud(datos(), "T-18")).puedeReducir).toBe(false);
    expect(construirDetalle(m, solicitud(datos(), "#224")).puedeReducir).toBe(false);
    expect(construirDetalle(m, solicitud(datos(), "T-18"), [1]).reduccion).toBeNull();
    expect(construirDetalle(m, solicitud(), [1, 2]).reduccion).toBeNull();
  });

  it("autorizar reducido guarda lo autorizado junto a lo pedido y suma a la deuda solo lo autorizado", () => {
    const d = datos();
    const r = resolucionProvisional(solicitud(d), "autorizar", "", instante, cantidadesAutorizadas(solicitud(d), reducidas));
    expect(r.cantidades).toHaveLength(3);
    const despues = aplicarResolucion(d, r);

    expect(despues.pedidos.find((p) => p.numero === "#231")?.lineas.map((l) => [l.cantidad, l.cantidadAutorizada])).toEqual([[10, 5], [8, 4], [30, 30]]);
    expect(deuda(despues, "#231")).toBe(22_100 + 20_870);
    const s = solicitud(despues);
    expect(s.estado).toBe("AUT");
    expect(s.reducido).toBe(true);
    expect(s.total).toBe(20_870);

    const det = construirDetalle(construirMundo(despues), s);
    expect(det.tituloItems).toBe("LO QUE AUTORIZASTE");
    expect(det.rotuloDelTotal).toBe("Monto autorizado");
    expect(det.nota).toBe("Reducido: autorizaste 39 de los 48 que pidió.");
    expect(det.items[0]).toMatchObject({ cantidad: "5", unidad: "$U 1.450 c/u · pidió 10" });
    expect(det.items[2].unidad).toBe("$U 190 c/u");
    expect(construirFilas(construirMundo(despues), [s])[0]).toMatchObject({ que: "3 productos · 39 de 48 unidades · reducido", monto: "$U 20.870" });
  });

  it("un producto sacado (en cero) no cuenta como producto en la fila", () => {
    const d = datos();
    const despues = aplicarResolucion(d, resolucionProvisional(solicitud(d), "autorizar", "", instante, cantidadesAutorizadas(solicitud(d), [0, 8, 30])));
    expect(construirFilas(construirMundo(despues), [solicitud(despues)])[0].que).toBe("2 productos · 38 de 48 unidades · reducido");
  });

  it("autorizar sin reducir sigue igual: la fila y el detalle no hablan de reducción", () => {
    const d = datos();
    const despues = aplicarResolucion(d, resolucionProvisional(solicitud(d), "autorizar", "", instante));
    const s = solicitud(despues);
    expect(s.reducido).toBe(false);
    expect(deuda(despues, "#231")).toBe(22_100 + 36_040);
    expect(construirDetalle(construirMundo(despues), s).tituloItems).toBe("LO QUE PIDE");
  });

  it("deshacer una autorización reducida devuelve la deuda y las líneas; un rechazo, el estado", () => {
    const d = datos();
    const id = p231().id;
    const cant = cantidadesAutorizadas(solicitud(d), reducidas);
    const { datos: autorizado, efecto } = aplicarResolucionConEfecto(d, resolucionProvisional(solicitud(d), "autorizar", "", instante, cant));
    const vuelta = deshacerResolucion(autorizado, "pedido", id, efecto);
    expect(deuda(vuelta, "#231")).toBe(22_100);
    expect(vuelta.pedidos.find((p) => p.id === id)).toMatchObject({ estado: "POR_AUTORIZAR", resueltoEn: null });
    expect(solicitud(vuelta).total).toBe(36_040);

    const { datos: rechazado, efecto: sinEfecto } = aplicarResolucionConEfecto(d, resolucionProvisional(solicitud(d), "rechazar", "No", instante));
    expect(sinEfecto).toEqual({});
    expect(rechazado.pedidos.find((p) => p.id === id)).toMatchObject({ estado: "RECHAZADO", motivoDeRechazo: "No" });
    expect(deshacerResolucion(rechazado, "pedido", id, sinEfecto).pedidos.find((p) => p.id === id)).toMatchObject({ estado: "POR_AUTORIZAR", motivoDeRechazo: null });
  });

  it("lo autorizado de un pedido que no se autorizó, o que se autorizó de más, no cuenta", () => {
    const d = datos();
    const raro = { ...d, pedidos: d.pedidos.map((p) => (p.numero === "#231" ? { ...p, lineas: p.lineas.map((l) => ({ ...l, cantidadAutorizada: 1 })) } : p)) };
    expect(solicitud(raro).total).toBe(36_040);
    const pasado = { ...d, pedidos: d.pedidos.map((p) => (p.numero === "#224" ? { ...p, lineas: p.lineas.map((l) => ({ ...l, cantidadAutorizada: 99 })) } : p)) };
    expect(solicitud(pasado, "#224").total).toBe(12 * 1450);
  });

  it("los avisos de un pedido dicen qué se decidió, con las cantidades y a quién le llega", () => {
    const s = solicitud();
    const cant = cantidadesAutorizadas(s, reducidas);
    expect(textoDeDecisionDiferida(s, "autorizar")).toBe("Autorizaste el pedido #231 de Emiliano Sosa: se suman $U 36.040 a la deuda de Emiliano cuando se cierre este aviso.");
    expect(textoDeDecisionDiferida(s, "autorizar", cant)).toBe(
      "Autorizaste el pedido #231 de Emiliano Sosa, reducido a 39 de 48 unidades: se suman $U 20.870 a la deuda de Emiliano cuando se cierre este aviso.",
    );
    expect(textoDeDecisionDiferida(s, "rechazar")).toBe("Rechazaste el pedido #231 de Emiliano Sosa. Cuando se cierre este aviso, Emiliano recibe el motivo.");
    expect(nombreDeDeshacer(s, "autorizar")).toBe("Deshacer · 8 s: autorización del pedido #231");
    expect(nombreDeDeshacer(s, "rechazar")).toBe("Deshacer · 8 s: rechazo del pedido #231");
  });

  it("la decisión lleva las cantidades solo si se redujo", () => {
    const s = solicitud();
    expect(decisionDe(s, "autorizar")).toEqual({ tipo: "pedido", id: p231().id, accion: "autorizar" });
    expect(decisionDe(s, "autorizar", "", [{ nombre: "x", cantidad: 1 }])).toMatchObject({ cantidades: [{ nombre: "x", cantidad: 1 }] });
    expect(decisionDe(s, "rechazar", "No")).toEqual({ tipo: "pedido", id: p231().id, accion: "rechazar", motivo: "No" });
  });
});

describe("el límite de deuda de la campaña (#93, 42A·02)", () => {
  it("valida lo que se escribe: pesos enteros con o sin puntos y con «$U»", () => {
    expect(validarLimite("35000")).toEqual({ ok: true, limite: 35_000 });
    expect(validarLimite("35.000")).toEqual({ ok: true, limite: 35_000 });
    expect(validarLimite(" $U 1.235.000 ")).toEqual({ ok: true, limite: 1_235_000 });
    expect(validarLimite("$ 35 000")).toEqual({ ok: true, limite: 35_000 });
  });

  it("rechaza lo vacío, lo que no es un monto, los centavos, el cero y lo desmedido, y dice qué hacer", () => {
    expect(validarLimite("")).toEqual({ ok: false, error: "Escribí el límite por colportor, en pesos." });
    expect(validarLimite("   ")).toMatchObject({ ok: false });
    expect(validarLimite("mucho")).toMatchObject({ ok: false, error: expect.stringContaining("pesos enteros") });
    expect(validarLimite("35,50")).toMatchObject({ ok: false });
    expect(validarLimite("35.5")).toMatchObject({ ok: false });
    expect(validarLimite("-5")).toMatchObject({ ok: false });
    expect(validarLimite("0")).toEqual({ ok: false, error: "El límite tiene que ser mayor que cero." });
    expect(validarLimite("1.000.000.000")).toEqual({ ok: false, error: "El límite es demasiado alto: usá hasta $U 999.999.999." });
  });

  it("la nota cuenta qué pasa con los pedidos por autorizar de toda la campaña", () => {
    // Con $U 50.000: #231 (58.140) y #228 (26.000 + 19.800 = 45.800 no) → solo #231 lo pasa.
    const m = mundo();
    expect(notaDelLimite(m, 60_000)).toBe("Hoy 1 pedido por autorizar pasa el límite de $U 50.000. Con $U 60.000 ninguno lo pasa.");
    expect(notaDelLimite(m, 55_000)).toBe("Hoy 1 pedido por autorizar pasa el límite de $U 50.000. Con $U 55.000 lo sigue pasando, por $U 3.140.");
    expect(notaDelLimite(m, 20_000)).toMatch(/^Hoy 1 pedido por autorizar pasa el límite de \$U 50\.000\. Con \$U 20\.000 lo pasan \d+, el que más por \$U 38\.140\.$/);
  });

  it("sin límite fijado o con un límite que nadie pasa lo dice distinto", () => {
    expect(notaDelLimite(mundo({ ...datos(), limiteDeDeuda: null }), 30_000)).toMatch(/^Hoy no hay límite fijado, así que ningún pedido avisa\. Con \$U 30\.000 (1 lo pasa|lo pasan \d+)/);
    expect(notaDelLimite(mundo({ ...datos(), limiteDeDeuda: 900_000 }), 800_000)).toBe("Hoy ningún pedido por autorizar pasa el límite de $U 900.000. Con $U 800.000 ninguno lo pasa.");
  });

  it("los pedidos ya resueltos y las transferencias no cuentan", () => {
    const d = datos();
    const solo = { ...d, pedidos: d.pedidos.filter((p) => p.estado !== "POR_AUTORIZAR") };
    expect(notaDelLimite(mundo(solo), 10)).toBe("Hoy ningún pedido por autorizar pasa el límite de $U 50.000. Con $U 10 ninguno lo pasa.");
  });
});
