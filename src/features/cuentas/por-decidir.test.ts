import { describe, expect, it } from "vitest";

import type { ColportorDeCuentas, DatosDeCuentas, DecisionDeAlquiler, TicketDeCuentas } from "@/datos/cuentas";
import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { aplicarAlquiler, aplicarDecision, filasDe, TODAS } from "@/features/cuentas/modelo";
import {
  alquilerDecidible,
  avisoDePorDecidir,
  lineasDeLaFila,
  sePuedeDecidir,
  TEXTO_FILA_PROPIA,
  textoDeDecidido,
  textoDeFallaAlDecidir,
  textosDeConfirmacion,
  textosDeEleccion,
} from "@/features/cuentas/por-decidir";

const AHORA = "2026-11-04T17:00:00.000Z";

const colportor = (id: string, nombre: string, extra: Partial<ColportorDeCuentas> = {}): ColportorDeCuentas => ({
  id,
  nombre,
  ciudadId: "rivera",
  deuda: 40000,
  depositado: 30000,
  enMano: 2000,
  porCobrar: 1000,
  ...extra,
});

const pago = (id: string, colportorId: string, monto: number, fecha: string, extra: Partial<TicketDeCuentas> = {}): TicketDeCuentas => ({
  id,
  colportorId,
  fecha,
  monto,
  medio: "deposito-banco",
  destino: "alquiler",
  estado: "VALIDADO",
  tieneFoto: true,
  ...extra,
});

const decision = (id: string, colportorId: string, destino: DecisionDeAlquiler["destino"], monto: number, decididoEn: string): DecisionDeAlquiler => ({
  id,
  colportorId,
  destino,
  monto,
  decididoPor: "Marta Pérez",
  decididoEn,
});

function datosDe(colportores: ColportorDeCuentas[], tickets: TicketDeCuentas[], decisiones: DecisionDeAlquiler[] = [], alquiler = 18500): DatosDeCuentas {
  return {
    campaniaId: "c",
    ahora: AHORA,
    alquilerPorColportor: alquiler,
    ciudades: [{ id: "rivera", nombre: "Rivera", departamento: "Rivera", hayBanco: true }],
    colportores,
    tickets,
    decisionesDeAlquiler: decisiones,
  };
}

const BAJA = { fecha: "2026-11-02T12:00:00.000Z" };
const ana = colportor("ana", "Ana Pereira", { baja: BAJA });
const pagosDeAna = [pago("a1", "ana", 5000, "2026-10-14T13:00:00.000Z"), pago("a2", "ana", 4250, "2026-10-28T13:00:00.000Z")];

describe("alquilerDecidible", () => {
  it("una inscripción viva en una campaña que cobra no se decide", () => {
    const lucia = colportor("lucia", "Lucía Fernández");
    const datos = datosDe([lucia], [pago("l1", "lucia", 9250, "2026-10-14T13:00:00.000Z")]);
    expect(alquilerDecidible(datos, lucia)).toMatchObject({ decide: false, porDecidir: 0 });
  });

  it("quien se dio de baja: todo lo pagado validado queda por decidir (los pendientes y rechazados no)", () => {
    const datos = datosDe(
      [ana],
      [...pagosDeAna, pago("a3", "ana", 1000, "2026-11-01T13:00:00.000Z", { estado: "PENDIENTE" }), pago("a4", "ana", 700, "2026-11-01T13:00:00.000Z", { estado: "RECHAZADO" })],
    );
    const a = alquilerDecidible(datos, ana);
    expect(a).toMatchObject({ decide: true, porDecidir: 9250, devuelto: 0, aCuenta: 0 });
    expect(a.pagosPorDecidir.map((t) => t.id)).toEqual(["a1", "a2"]);
    expect(sePuedeDecidir(ana, a)).toBe(true);
  });

  it("en una campaña que no cobra alquiler, lo pagado de cualquiera se decide", () => {
    const lucia = colportor("lucia", "Lucía Fernández");
    const datos = datosDe([lucia], [pago("l1", "lucia", 9250, "2026-10-14T13:00:00.000Z")], [], 0);
    expect(alquilerDecidible(datos, lucia)).toMatchObject({ decide: true, porDecidir: 9250 });
  });

  it("«Devolver resto»: $U 12.000 a cuenta y $U 3.000 nuevos: solo los 3.000 están por decidir y son el pago de después", () => {
    const datos = datosDe(
      [ana],
      [pago("v", "ana", 12000, "2026-10-10T13:00:00.000Z"), pago("n", "ana", 3000, "2026-11-03T13:00:00.000Z")],
      [decision("d1", "ana", "a-cuenta", 12000, "2026-10-12T17:00:00.000Z")],
    );
    const a = alquilerDecidible(datos, ana);
    expect(a).toMatchObject({ porDecidir: 3000, aCuenta: 12000 });
    expect(a.pagosPorDecidir.map((t) => t.id)).toEqual(["n"]);
  });

  it("un pago hecho antes pero validado después de la decisión cuenta como de después", () => {
    const datos = datosDe(
      [ana],
      [pago("v", "ana", 12000, "2026-10-10T13:00:00.000Z"), pago("n", "ana", 3000, "2026-10-11T13:00:00.000Z", { validadoEn: "2026-10-20T13:00:00.000Z" })],
      [decision("d1", "ana", "se-lo-queda", 12000, "2026-10-12T17:00:00.000Z")],
    );
    expect(alquilerDecidible(datos, ana).pagosPorDecidir.map((t) => t.id)).toEqual(["n"]);
  });

  it("lo devuelto no cuenta como pagado ni queda por decidir", () => {
    const datos = datosDe([ana], pagosDeAna.map((t) => ({ ...t, anulado: { en: "2026-11-04T17:20:00.000Z" } })), [
      decision("d1", "ana", "devolver", 9250, "2026-11-04T17:20:00.000Z"),
    ]);
    expect(alquilerDecidible(datos, ana)).toMatchObject({ porDecidir: 0, devuelto: 9250 });
  });

  it("la fila propia tiene algo por decidir pero no se ofrece la acción", () => {
    const marta = colportor("marta", "Marta Pérez", { baja: BAJA, esVos: true });
    const datos = datosDe([marta], [pago("m1", "marta", 5000, "2026-10-14T13:00:00.000Z")]);
    const a = alquilerDecidible(datos, marta);
    expect(a.porDecidir).toBe(5000);
    expect(sePuedeDecidir(marta, a)).toBe(false);
    expect(lineasDeLaFila(marta, a)).toEqual(["Baja de la campaña el 02/11", TEXTO_FILA_PROPIA]);
    expect(avisoDePorDecidir([{ colportor: marta, alquiler: a }], false)).toBeNull();
  });
});

describe("textos de la fila y del aviso", () => {
  it("por decidir sin decisiones, una decisión y varias (con lo nuevo aparte)", () => {
    const sola = datosDe([ana], pagosDeAna);
    expect(lineasDeLaFila(ana, alquilerDecidible(sola, ana))).toEqual(["Baja de la campaña el 02/11"]);

    const decidida = aplicarDecision(sola, decision("d1", "ana", "devolver", 9250, "2026-11-04T17:20:00.000Z"));
    expect(lineasDeLaFila(ana, alquilerDecidible(decidida, ana))).toEqual(["Baja 02/11 · decidió Marta Pérez · 04/11 14:20"]);

    const resto = datosDe(
      [ana],
      [pago("v", "ana", 12000, "2026-10-10T13:00:00.000Z"), pago("n", "ana", 3000, "2026-11-03T13:00:00.000Z")],
      [decision("d1", "ana", "a-cuenta", 12000, "2026-10-12T17:00:00.000Z")],
    );
    expect(lineasDeLaFila(ana, alquilerDecidible(resto, ana))).toEqual([
      "Baja 02/11",
      "$U 12.000 a cuenta del próximo depósito · decidió Marta Pérez · 12/10 14:00",
      "$U 3.000 pagados después: por decidir",
    ]);
  });

  it("sin fecha de baja dice solo «Baja de la campaña»", () => {
    const sinFecha = { ...ana, baja: { fecha: null } };
    expect(lineasDeLaFila(sinFecha, alquilerDecidible(datosDe([sinFecha], pagosDeAna), sinFecha))).toEqual(["Baja de la campaña"]);
  });

  it("el aviso dice cuánto falta decidir, según el caso", () => {
    const fila = (d: DatosDeCuentas) => filasDe(d, TODAS).map((f) => ({ colportor: f.colportor, alquiler: f.alquiler }));
    expect(avisoDePorDecidir(fila(datosDe([ana], pagosDeAna)), false)).toBe(
      "Ana Pereira se dio de baja y había pagado $U 9.250 de alquiler. Falta decidir qué se hace con ese monto.",
    );
    const lucia = colportor("lucia", "Lucía Fernández");
    const valentina = colportor("valentina", "Valentina Silva");
    const bruno = colportor("bruno", "Bruno Techera");
    const sinAlquiler = datosDe(
      [lucia, valentina, bruno],
      [pago("l", "lucia", 9250, "2026-10-14T13:00:00.000Z"), pago("v", "valentina", 5000, "2026-10-09T13:00:00.000Z")],
      [],
      0,
    );
    expect(avisoDePorDecidir(fila(sinAlquiler), true)).toBe("Esta campaña no cobra alquiler y 2 colportores habían pagado: $U 14.250 por decidir.");
    const dos = datosDe([ana, { ...lucia, baja: BAJA }], [...pagosDeAna, pago("l", "lucia", 1000, "2026-10-14T13:00:00.000Z")]);
    expect(avisoDePorDecidir(fila(dos), false)).toBe("2 colportores dados de baja tienen $U 10.250 de alquiler por decidir.");
    const resto = datosDe(
      [ana],
      [pago("v", "ana", 12000, "2026-10-10T13:00:00.000Z"), pago("n", "ana", 3000, "2026-11-03T13:00:00.000Z")],
      [decision("d1", "ana", "a-cuenta", 12000, "2026-10-12T17:00:00.000Z")],
    );
    expect(avisoDePorDecidir(fila(resto), false)).toBe(
      "Ana Pereira pagó $U 3.000 de alquiler después de la última decisión. Falta decidir qué se hace con ese monto.",
    );
    expect(avisoDePorDecidir([], false)).toBeNull();
  });
});

describe("textos del diálogo", () => {
  const a = alquilerDecidible(datosDe([ana], pagosDeAna), ana);

  it("elegir: título, texto y los tres destinos (41A·02)", () => {
    const t = textosDeEleccion(ana, a);
    expect(t.titulo).toBe("¿Qué hacés con los $U 9.250 que pagó Ana?");
    expect(t.texto).toBe("Ana Pereira se dio de baja de la campaña el 02/11. Elegí un solo destino para todo el monto.");
    expect(t.opciones.map((o) => [o.titulo, o.detalle])).toEqual([
      ["Devolverlo al colportor", "Se anulan sus 2 pagos de alquiler."],
      ["Dejarlo a cuenta", "Queda para su próximo depósito."],
      ["Quedárselo", "Lo conserva el coordinador."],
    ]);
  });

  it("confirmar: cada destino dice qué pasa con la plata (41A·04)", () => {
    expect(textosDeConfirmacion(ana, a, "devolver")).toEqual({
      titulo: "¿Devolverle $U 9.250 a Ana?",
      texto: "Se anulan sus 2 pagos de alquiler (14/10 y 28/10). Queda registrado que lo decidiste vos, hoy. No se puede cambiar después.",
      boton: "Sí, devolver",
    });
    expect(textosDeConfirmacion(ana, a, "a-cuenta")).toMatchObject({
      titulo: "¿Dejar $U 9.250 a cuenta del próximo depósito de Ana?",
      boton: "Sí, dejar a cuenta",
    });
    expect(textosDeConfirmacion(ana, a, "se-lo-queda")).toMatchObject({ titulo: "¿Quedarte con los $U 9.250 de Ana?", boton: "Sí, quedármelo" });
  });

  it("la decisión es definitiva (Cristian, 10/11): los tres destinos lo dicen antes de confirmar", () => {
    expect(textosDeConfirmacion(ana, a, "a-cuenta").texto).toBe(
      "Se descuentan de su deuda con la casa editora. Queda registrado que lo decidiste vos, hoy. No se puede cambiar después.",
    );
    expect(textosDeConfirmacion(ana, a, "se-lo-queda").texto).toBe(
      "La plata queda con el coordinador y su deuda con la casa editora no cambia. Queda registrado que lo decidiste vos, hoy. No se puede cambiar después.",
    );
    for (const destino of ["devolver", "a-cuenta", "se-lo-queda"] as const) {
      expect(textosDeConfirmacion(ana, a, destino).texto).toMatch(/ No se puede cambiar después\.$/);
    }
  });

  it("con una decisión anterior, devolver dice que anula solo lo de después y que lo decidido queda como estaba", () => {
    const resto = datosDe(
      [ana],
      [pago("v", "ana", 12000, "2026-10-10T13:00:00.000Z"), pago("n", "ana", 3000, "2026-11-03T13:00:00.000Z")],
      [decision("d1", "ana", "a-cuenta", 12000, "2026-10-12T17:00:00.000Z")],
    );
    const r = alquilerDecidible(resto, ana);
    const e = textosDeEleccion(ana, r);
    expect(e.titulo).toBe("¿Qué hacés con los $U 3.000 que pagó Ana después?");
    expect(e.texto).toBe(
      "Ana Pereira pagó $U 3.000 después de la última decisión. Lo ya decidido ($U 12.000 a cuenta del próximo depósito) queda como estaba. Elegí un solo destino para estos $U 3.000.",
    );
    expect(e.opciones[0].detalle).toBe("Se anula solo el pago que llegó después. Lo ya decidido queda como estaba.");
    expect(textosDeConfirmacion(ana, r, "devolver").texto).toBe(
      "Se anula solo lo que pagó después de la última decisión (03/11). Lo ya decidido ($U 12.000 a cuenta del próximo depósito) queda como estaba. Queda registrado que lo decidiste vos, hoy. No se puede cambiar después.",
    );
  });

  it("un solo pago y la campaña sin alquiler", () => {
    const lucia = colportor("lucia", "Lucía Fernández");
    const d = datosDe([lucia], [pago("l1", "lucia", 9250, "2026-10-14T13:00:00.000Z")], [], 0);
    const r = alquilerDecidible(d, lucia);
    expect(textosDeEleccion(lucia, r).texto).toBe("La campaña no cobra alquiler y Lucía Fernández había pagado $U 9.250. Elegí un solo destino para todo el monto.");
    expect(textosDeEleccion(lucia, r).opciones[0].detalle).toBe("Se anula su pago de alquiler.");
    expect(textosDeConfirmacion(lucia, r, "devolver").texto).toBe("Se anula su pago de alquiler (14/10). Queda registrado que lo decidiste vos, hoy. No se puede cambiar después.");
  });

  it("los avisos de después y de error", () => {
    expect(textoDeDecidido("Ana Pereira", { destino: "devolver", monto: 9250 })).toBe("Listo. Se devolvieron $U 9.250 a Ana Pereira.");
    expect(textoDeDecidido("Ana Pereira", { destino: "a-cuenta", monto: 9250 })).toBe("Listo. $U 9.250 de Ana Pereira quedan a cuenta de su próximo depósito.");
    expect(textoDeDecidido("Ana Pereira", { destino: "se-lo-queda", monto: 9250 })).toBe("Listo. Los $U 9.250 de Ana Pereira quedan con el coordinador.");
    expect(textoDeFallaAlDecidir("rechazado")).toBe("No pudimos guardar la decisión. No cambió nada: probá de nuevo.");
    expect(textoDeFallaAlDecidir("rechazado", "Del servidor.")).toBe("Del servidor.");
    expect(textoDeFallaAlDecidir("sin-conexion")).toMatch(/^Sin conexión/);
  });
});

describe("aplicarDecision", () => {
  it("devolver anula los pagos (no los borra), baja Depositado y vuelve a poner la plata en mano; la deuda no se mueve", () => {
    const datos = datosDe([ana], pagosDeAna);
    const d = decision("d1", "ana", "devolver", 9250, "2026-11-04T17:20:00.000Z");
    const despues = aplicarDecision(datos, d);
    expect(despues.tickets).toHaveLength(2);
    expect(despues.tickets.every((t) => t.anulado?.en === d.decididoEn)).toBe(true);
    expect(despues.colportores[0]).toMatchObject({ depositado: 30000 - 9250, enMano: 2000 + 9250, deuda: 40000 });
    expect(alquilerDecidible(despues, ana)).toMatchObject({ porDecidir: 0, devuelto: 9250 });
    expect(aplicarDecision(despues, d)).toBe(despues);
  });

  it("«Devolver resto»: devolver los $U 3.000 nuevos anula solo ese pago; los $U 12.000 a cuenta y la deuda quedan como estaban", () => {
    const datos = datosDe(
      [ana],
      [pago("v", "ana", 12000, "2026-10-10T13:00:00.000Z"), pago("n", "ana", 3000, "2026-11-03T13:00:00.000Z")],
      [decision("d1", "ana", "a-cuenta", 12000, "2026-10-12T17:00:00.000Z")],
    );
    const despues = aplicarDecision(datos, decision("d2", "ana", "devolver", 3000, "2026-11-04T17:20:00.000Z"));
    expect(despues.tickets.find((t) => t.id === "v")?.anulado).toBeUndefined();
    expect(despues.tickets.find((t) => t.id === "n")?.anulado).toBeDefined();
    expect(despues.colportores[0]).toMatchObject({ deuda: 40000, depositado: 27000 });
    expect(alquilerDecidible(despues, ana)).toMatchObject({ porDecidir: 0, aCuenta: 12000, devuelto: 3000 });
  });

  it("a cuenta baja la deuda con la casa editora; se lo queda no la mueve", () => {
    const datos = datosDe([ana], pagosDeAna);
    expect(aplicarDecision(datos, decision("d1", "ana", "a-cuenta", 9250, AHORA)).colportores[0].deuda).toBe(40000 - 9250);
    expect(aplicarDecision(datos, decision("d1", "ana", "se-lo-queda", 9250, AHORA)).colportores[0]).toMatchObject({ deuda: 40000, depositado: 30000 });
  });

  it("si la campaña empieza a cobrar, lo decidido de quien sigue inscripto deja de valer y lo dejado a cuenta vuelve a la deuda", () => {
    const lucia = colportor("lucia", "Lucía Fernández");
    const sinAlquiler = datosDe([lucia], [pago("l1", "lucia", 9250, "2026-10-14T13:00:00.000Z")], [], 0);
    const aCuenta = aplicarDecision(sinAlquiler, decision("d1", "lucia", "a-cuenta", 9250, AHORA));
    expect(aCuenta.colportores[0].deuda).toBe(40000 - 9250);
    const cobra = aplicarAlquiler(aCuenta, 18500);
    expect(cobra.decisionesDeAlquiler).toEqual([]);
    expect(cobra.colportores[0].deuda).toBe(40000);
  });
});

describe("decidirAlquiler simulado", () => {
  const datos = armarCuentasSimuladas(new Date("2026-10-22T15:00:00.000Z"));

  it("decide todo lo por decidir y el segundo toque contesta que ya estaba", async () => {
    const acciones = crearAccionesSimuladas(datos);
    const primero = await acciones.decidirAlquiler("santiago-pereira", "devolver");
    expect(primero).toMatchObject({ ok: true, valor: { yaEstaba: false, decision: { monto: 9250, destino: "devolver", decididoPor: "Marta Pérez" } } });
    expect(await acciones.decidirAlquiler("santiago-pereira", "a-cuenta")).toEqual({ ok: true, valor: { yaEstaba: true } });
  });

  it("rechaza la fila propia, la de una inscripción viva y sin datos", async () => {
    const acciones = crearAccionesSimuladas(datos);
    expect(await acciones.decidirAlquiler("marta-perez", "devolver")).toMatchObject({ ok: false, mensaje: /tu propio alquiler/ });
    expect(await acciones.decidirAlquiler("lucia-fernandez", "devolver")).toMatchObject({ ok: false, mensaje: /sigue vigente/ });
    expect(await crearAccionesSimuladas().decidirAlquiler("x", "devolver")).toMatchObject({ ok: false, causa: "rechazado" });
  });

  it("«Devolver resto» en los datos de ejemplo: Martín devuelve solo los $U 3.000 de después", async () => {
    const acciones = crearAccionesSimuladas(datos);
    expect(await acciones.decidirAlquiler("martin-olivera", "devolver")).toMatchObject({ ok: true, valor: { decision: { monto: 3000 } } });
  });
});
