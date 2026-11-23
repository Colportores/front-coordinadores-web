import { describe, expect, it } from "vitest";

import type { AnulacionDeCobro, DatosDeCuentas, TicketDeCuentas } from "@/datos/cuentas";
import { armarCuentasSimuladas } from "@/datos/cuentas/simulado";
import {
  estadoDelCobro,
  HORAS_DE_PLAZO,
  limiteDeAnulacion,
  notaDeAnulacionDisponible,
  notaDeCobroAnulado,
  notaFueraDePlazo,
  NOTA_SIN_FECHA_DEL_COBRO,
  textoDeFallaAlAnular,
  textoDeMotivo,
  textoDeQuienAnulo,
  textoDelMotivo,
  textoDeConfirmacion,
  tieneCobroAnulado,
  tituloDelMotivo,
  TEXTO_DE_ERROR,
  TEXTO_SIN_CONEXION_AL_ANULAR,
} from "@/features/cuentas/anular-cobro";
import { aplicarAnulacion, filasDe, kpisDeTickets, pendientesDe, textoDeEstado, ticketsDe, TODAS } from "@/features/cuentas/modelo";
import { esPagoDeAlquilerVigente, esPagoDeAlquilerVivo } from "@/features/cuentas/por-decidir";

// 22/10 12:00 en Montevideo.
const AHORA = new Date("2026-10-22T15:00:00.000Z");
const datos = armarCuentasSimuladas(AHORA);

// Un cobro del 19/10 a las 10:20 (Montevideo): se puede anular hasta el 22/10 a las 10:20.
const COBRO = "2026-10-19T10:20:00-03:00";
const LIMITE = "2026-10-22T10:20:00-03:00";

function ticket(extra: Partial<TicketDeCuentas> = {}): TicketDeCuentas {
  return {
    id: "t1",
    colportorId: "florencia-pintos",
    fecha: COBRO,
    monto: 4800,
    medio: "tarjeta-debito",
    entidad: "Visa",
    numero: "483920",
    destino: "casa-editora",
    estado: "VALIDADO",
    tieneFoto: true,
    cobro: { id: "c1", fecha: COBRO },
    ...extra,
  };
}

const anulacion: AnulacionDeCobro = { en: "2026-10-22T12:05:00-03:00", motivo: "Monto equivocado", por: "Marta Pérez", origen: "panel" };

describe("el plazo de 72 h (39A·01, 39B·01)", () => {
  it("son 72 h desde el cobro, inclusive", () => {
    expect(HORAS_DE_PLAZO).toBe(72);
    expect(limiteDeAnulacion(COBRO)).toBe(Date.parse(LIMITE));
    expect(estadoDelCobro(ticket(), "2026-10-22T10:20:00-03:00", true)).toBe("disponible");
    expect(estadoDelCobro(ticket(), "2026-10-22T10:20:01-03:00", true)).toBe("fuera-de-plazo");
    expect(estadoDelCobro(ticket(), "2026-10-21T09:00:00-03:00", true)).toBe("disponible");
  });

  it("sin conexión se ve pero no se anula; pasado el plazo manda el plazo", () => {
    expect(estadoDelCobro(ticket(), "2026-10-21T09:00:00-03:00", false)).toBe("sin-conexion");
    expect(estadoDelCobro(ticket(), "2026-10-23T09:00:00-03:00", false)).toBe("fuera-de-plazo");
  });

  it("un ticket sin cobro no ofrece nada; uno anulado lo dice; el aviso del servidor de plazo vencido se respeta", () => {
    expect(estadoDelCobro(ticket({ cobro: undefined }), "2026-10-21T09:00:00-03:00", true)).toBe("sin-cobro");
    expect(estadoDelCobro(ticket({ cobro: { id: "c1", fecha: COBRO, anulado: anulacion } }), "2026-10-21T09:00:00-03:00", true)).toBe("anulado");
    expect(estadoDelCobro(ticket(), "2026-10-21T09:00:00-03:00", true, true)).toBe("fuera-de-plazo");
  });

  it("una fecha ilegible no se toma por «dentro del plazo»", () => {
    expect(estadoDelCobro(ticket({ cobro: { id: "c1", fecha: "ayer" } }), "2026-10-21T09:00:00-03:00", true)).toBe("fuera-de-plazo");
    expect(estadoDelCobro(ticket(), "no es una fecha", true)).toBe("fuera-de-plazo");
  });
});

describe("los textos del canvas 39", () => {
  it("la nota del botón dice hasta cuándo se puede y qué pasa", () => {
    expect(notaDeAnulacionDisponible(COBRO)).toBe(
      "Se puede anular hasta el 22/10 · 10:20 (72 h después del cobro). Anular deja el cobro sin efecto y le avisa a la colportora.",
    );
  });

  it("pasado el plazo dice cuándo fue el cobro y hasta cuándo se podía", () => {
    expect(notaFueraDePlazo(COBRO)).toBe("Pasaron más de 72 h desde el cobro (19/10 · 10:20). Se podía anular hasta el 22/10 a las 10:20.");
  });

  it("con la fecha del cobro ilegible no falla: no se ofrece y dice por qué (QA ronda 1: antes tiraba un RangeError)", () => {
    expect(() => notaFueraDePlazo("ayer")).not.toThrow();
    expect(notaFueraDePlazo("ayer")).toBe("No se puede anular este cobro: no se pudo leer la fecha en que se registró. Recargá la página.");
    expect(notaFueraDePlazo("")).toBe(NOTA_SIN_FECHA_DEL_COBRO);
    expect(notaDeAnulacionDisponible("ayer")).toBe("Anular deja el cobro sin efecto y le avisa a la colportora.");
  });

  it("el diálogo dice el monto, quién, el medio y cuándo, y después qué cambia", () => {
    const t = ticket();
    expect(tituloDelMotivo(t)).toBe("Anular el cobro de $U 4.800");
    expect(textoDelMotivo("Ana Pereira", t)).toBe("Ana Pereira · tarjeta de débito Visa · 19/10 10:20. Elegí el motivo.");
    expect(textoDelMotivo("Ana Pereira", ticket({ medio: "tarjeta-credito", entidad: undefined }))).toBe(
      "Ana Pereira · tarjeta de crédito · 19/10 10:20. Elegí el motivo.",
    );
    expect(textoDeConfirmacion("Ana Pereira", t)).toBe(
      "El cobro de $U 4.800 deja de contar: el saldo de la venta vuelve a subir y el ticket queda anulado. Ana Pereira lo ve en su teléfono con el motivo. No se puede deshacer.",
    );
    expect(notaDeCobroAnulado("Ana Pereira")).toBe("Cobro anulado. No cuenta en la cuenta de Ana Pereira ni en el saldo de la venta.");
  });

  it("el motivo «Otro» lleva lo que se escribió; los demás, solo el motivo; quién anuló aclara si fue el teléfono", () => {
    expect(textoDeMotivo("Otro", "  Me equivoqué de cliente  ")).toBe("Otro: Me equivoqué de cliente");
    expect(textoDeMotivo("Otro")).toBe("Otro");
    expect(textoDeMotivo("Otro", "   ")).toBe("Otro");
    expect(textoDeMotivo("Monto equivocado", "ignorado")).toBe("Monto equivocado");
    expect(textoDeQuienAnulo("Ana Pereira", "telefono")).toBe("Ana Pereira (desde el teléfono)");
    expect(textoDeQuienAnulo("Marta Pérez", "panel")).toBe("Marta Pérez");
  });

  it("un fallo dice lo que contestó el servidor o el texto de siempre, nunca un código", () => {
    expect(textoDeFallaAlAnular("sin-conexion")).toBe("Necesitás conexión para anular un cobro. Revisá la conexión y probá de nuevo.");
    expect(textoDeFallaAlAnular("sin-conexion", "ignorado")).toBe(TEXTO_SIN_CONEXION_AL_ANULAR);
    expect(textoDeFallaAlAnular("rechazado")).toBe(TEXTO_DE_ERROR);
    expect(textoDeFallaAlAnular("rechazado", "No encontramos ese cobro entre los de tu equipo.")).toBe(
      "No encontramos ese cobro entre los de tu equipo.",
    );
  });
});

describe("aplicarAnulacion: un cobro anulado deja de contarse", () => {
  const colportor = (d: DatosDeCuentas, id: string) => {
    const c = d.colportores.find((x) => x.id === id);
    if (!c) throw new Error(id);
    return c;
  };
  const sinTickets = (extra: TicketDeCuentas[]): DatosDeCuentas => ({ ...datos, tickets: extra });

  it("el ticket queda con su cobro anulado y no se toca el original", () => {
    const original = sinTickets([ticket()]);
    const despues = aplicarAnulacion(original, "t1", anulacion);
    expect(despues.tickets[0].cobro?.anulado).toEqual(anulacion);
    expect(tieneCobroAnulado(despues.tickets[0])).toBe(true);
    expect(original.tickets[0].cobro?.anulado).toBeUndefined();
    expect(textoDeEstado(despues.tickets[0])).toBe("Cobro anulado");
  });

  it("un cobro de casa editora validado baja «Depositado», sube la deuda y devuelve el saldo a «Por cobrar»", () => {
    const antes = sinTickets([ticket()]);
    const despues = aplicarAnulacion(antes, "t1", anulacion);
    const a = colportor(antes, "florencia-pintos");
    const d = colportor(despues, "florencia-pintos");
    expect(d.depositado).toBe(a.depositado - 4800);
    expect(d.porCobrar).toBe(a.porCobrar + 4800);
    expect(d.deuda).toBe(a.deuda + 4800);
    expect(d.enMano).toBe(a.enMano);
  });

  it("lo que había quedado «a favor» se quita primero y el resto vuelve a la deuda", () => {
    const base = sinTickets([ticket()]);
    const conFavor: DatosDeCuentas = {
      ...base,
      colportores: base.colportores.map((c) => (c.id === "florencia-pintos" ? { ...c, deuda: 0, aFavor: 1800 } : c)),
    };
    const d = colportor(aplicarAnulacion(conFavor, "t1", anulacion), "florencia-pintos");
    expect(d.aFavor).toBe(0);
    expect(d.deuda).toBe(3000);
  });

  it("un depósito de alquiler anulado deja de contar como pagado y su traslado a la deuda se deshace", () => {
    const alquiler = ticket({ id: "t2", destino: "alquiler", monto: 20000, cobro: { id: "c2", fecha: COBRO } });
    const antes = sinTickets([alquiler]);
    const filaAntes = filasDe(antes, TODAS).find((f) => f.colportor.id === "florencia-pintos");
    const despues = aplicarAnulacion(antes, "t2", anulacion);
    const filaDespues = filasDe(despues, TODAS).find((f) => f.colportor.id === "florencia-pintos");
    expect(filaAntes?.pagadoAlquiler).toBe(18500);
    expect(filaDespues?.pagadoAlquiler).toBe(0);
    expect(filaDespues?.debeAlquiler).toBe(18500);
    expect(colportor(despues, "florencia-pintos").depositado).toBe(colportor(antes, "florencia-pintos").depositado - 20000);
    expect(esPagoDeAlquilerVigente(despues.tickets[0])).toBe(false);
    expect(esPagoDeAlquilerVivo(despues.tickets[0])).toBe(false);
  });

  it("un cobro por validar o rechazado no había acreditado nada: no mueve la plata", () => {
    for (const estado of ["PENDIENTE", "RECHAZADO"] as const) {
      const antes = sinTickets([ticket({ estado })]);
      const despues = aplicarAnulacion(antes, "t1", anulacion);
      expect(despues.colportores).toEqual(antes.colportores);
      expect(tieneCobroAnulado(despues.tickets[0])).toBe(true);
    }
  });

  it("anular dos veces (doble toque) o un ticket sin cobro o inexistente no cambia nada", () => {
    const una = aplicarAnulacion(sinTickets([ticket()]), "t1", anulacion);
    expect(aplicarAnulacion(una, "t1", { ...anulacion, motivo: "Otro" })).toBe(una);
    const sinCobro = sinTickets([ticket({ cobro: undefined })]);
    expect(aplicarAnulacion(sinCobro, "t1", anulacion)).toBe(sinCobro);
    expect(aplicarAnulacion(sinCobro, "no-existe", anulacion)).toBe(sinCobro);
  });

  it("lo anulado no cuenta como validado ni como por validar, ni como último depósito, y no estorba el filtro de tickets", () => {
    const antes = sinTickets([ticket({ id: "v" }), ticket({ id: "p", estado: "PENDIENTE", cobro: { id: "cp", fecha: COBRO } })]);
    const despues = aplicarAnulacion(aplicarAnulacion(antes, "v", anulacion), "p", anulacion);
    const todos = ticketsDe(despues, TODAS, "");
    expect(todos).toHaveLength(2);
    expect(kpisDeTickets(todos).find((k) => k.rotulo === "VALIDADOS")?.valor).toBe("0");
    expect(kpisDeTickets(todos).find((k) => k.rotulo === "POR VALIDAR")?.valor).toBe("0");
    expect(pendientesDe(despues, TODAS)).toHaveLength(0);
    expect(filasDe(despues, TODAS).find((f) => f.colportor.id === "florencia-pintos")?.ultimoDeposito).toBeNull();
    expect(filasDe(antes, TODAS).find((f) => f.colportor.id === "florencia-pintos")?.ultimoDeposito).not.toBeNull();
  });
});
