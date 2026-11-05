import { describe, expect, it } from "vitest";

import type { DatosDeCuentas, TicketDeCuentas } from "@/datos/cuentas";
import { armarCuentasSimuladas } from "@/datos/cuentas/simulado";
import { aplicarAlquiler, aplicarTicket, filasDe, textoDeSaldo, TODAS } from "@/features/cuentas/modelo";

/**
 * QA de la vista 36 (#129, casilla 1): el alquiler pagado de más baja la deuda con la casa editora. Lo que no se puede
 * perder es la plata: pase lo que pase con el alquiler y los pagos, «deuda − a favor + trasladado» tiene que ser siempre
 * lo mismo, y deshacer los cambios tiene que devolver exactamente el estado de partida.
 */
const ID = "sofia-cabral";
const sinPagosDeAlquiler = (d: DatosDeCuentas): DatosDeCuentas => ({
  ...d,
  tickets: d.tickets.filter((t) => !(t.colportorId === ID && t.destino === "alquiler")),
});
const conDeuda = (d: DatosDeCuentas, deuda: number, aFavor?: number): DatosDeCuentas => ({
  ...d,
  colportores: d.colportores.map((c) => {
    if (c.id !== ID) return c;
    const { aFavor: _viejo, ...resto } = c;
    void _viejo;
    return aFavor === undefined ? { ...resto, deuda } : { ...resto, deuda, aFavor };
  }),
});
const pago = (id: string, monto: number, estado: TicketDeCuentas["estado"] = "VALIDADO"): TicketDeCuentas => ({
  id,
  colportorId: ID,
  fecha: "2026-10-22T14:00:00.000Z",
  monto,
  medio: "deposito-banco",
  entidad: "BROU",
  numero: id,
  destino: "alquiler",
  estado,
  tieneFoto: true,
});
const sofia = (d: DatosDeCuentas) => d.colportores.find((c) => c.id === ID)!;
const fila = (d: DatosDeCuentas) => filasDe(d, TODAS).find((f) => f.colportor.id === ID)!;
/** Lo que la casa editora le cobra en total a Sofía, contando el traslado: no puede cambiar con el alquiler ni con el orden. */
const neto = (d: DatosDeCuentas) => sofia(d).deuda - (sofia(d).aFavor ?? 0) + fila(d).trasladadoAlquiler;

describe("QA · alquiler pagado de más (#129)", () => {
  const partida = conDeuda(aplicarAlquiler(sinPagosDeAlquiler(armarCuentasSimuladas(new Date("2026-10-22T15:00:00.000Z"))), 2500), 1000);

  it("la plata se conserva con cualquier secuencia de alquileres y pagos, y nunca queda deuda ni a favor negativos", () => {
    let d = partida;
    const base = neto(d);
    // Secuencia fija pero sin patrón: alquiler sube, baja, pagos grandes y chicos, un PENDIENTE y un RECHAZADO en el medio.
    const pasos: Array<["alq", number] | ["pago", number, TicketDeCuentas["estado"]?]> = [
      ["pago", 3000],
      ["alq", 4000],
      ["pago", 700, "PENDIENTE"],
      ["alq", 0],
      ["pago", 250],
      ["alq", 2500],
      ["pago", 9999, "RECHAZADO"],
      ["alq", 100],
      ["pago", 1],
      ["alq", 18500],
      ["alq", 2500],
      ["pago", 40000],
      ["alq", 1],
      ["alq", 999999],
    ];
    pasos.forEach((p, i) => {
      d = p[0] === "alq" ? aplicarAlquiler(d, p[1]) : aplicarTicket(d, pago(`p${i}`, p[1], p[2]));
      expect(sofia(d).deuda, `paso ${i}`).toBeGreaterThanOrEqual(0);
      expect(sofia(d).aFavor ?? 0, `paso ${i}`).toBeGreaterThanOrEqual(0);
      // Con alquiler 0 el panel no traslada (va en #132) y el neto contable no se puede comparar con el de antes.
      if (d.alquilerPorColportor > 0) expect(neto(d), `paso ${i}`).toBe(base);
    });
  });

  it("subir el alquiler y volver al de antes devuelve exactamente el mismo estado (deuda y a favor)", () => {
    for (const [deuda, aFavor] of [[1000, undefined], [0, undefined], [0, 300], [200, undefined]] as const) {
      const con = aplicarTicket(conDeuda(partida, deuda, aFavor), pago("g", 3000));
      for (const sube of [2501, 3000, 3001, 4000, 100000]) {
        const vuelta = aplicarAlquiler(aplicarAlquiler(con, sube), 2500);
        expect(sofia(vuelta).deuda, `${deuda}/${aFavor} → ${sube}`).toBe(sofia(con).deuda);
        expect(sofia(vuelta).aFavor ?? 0, `${deuda}/${aFavor} → ${sube}`).toBe(sofia(con).aFavor ?? 0);
      }
    }
  });

  it("pago PENDIENTE o RECHAZADO no traslada ni mueve la deuda", () => {
    for (const estado of ["PENDIENTE", "RECHAZADO"] as const) {
      const d = aplicarTicket(partida, pago("x", 5000, estado));
      expect(fila(d).trasladadoAlquiler, estado).toBe(0);
      expect(fila(d).pagadoAlquiler, estado).toBe(0);
      expect(fila(d).debeAlquiler, estado).toBe(2500);
      expect(sofia(d).deuda, estado).toBe(1000);
    }
  });

  it("deuda 0: el sobrante queda «a favor» y la fila lo dice; al volver el alquiler a subir, primero se come lo a favor", () => {
    const d = aplicarTicket(conDeuda(partida, 0), pago("a", 3000));
    expect(sofia(d)).toMatchObject({ deuda: 0, aFavor: 500 });
    expect(textoDeSaldo(sofia(d).deuda, sofia(d).aFavor ?? 0)).toBe("a favor $U 500");
    const sube = aplicarAlquiler(d, 2800); // el traslado baja de 500 a 200
    expect(sofia(sube)).toMatchObject({ deuda: 0, aFavor: 200 });
    const sube2 = aplicarAlquiler(d, 4000); // ya no hay traslado: 500 salen de lo a favor
    expect(sofia(sube2).deuda).toBe(0);
    expect(sofia(sube2).aFavor ?? 0).toBe(0);
  });

  it("un pago exactamente igual al alquiler no traslada; uno de un peso más traslada 1", () => {
    expect(fila(aplicarTicket(partida, pago("e", 2500))).trasladadoAlquiler).toBe(0);
    expect(fila(aplicarTicket(partida, pago("e", 2501))).trasladadoAlquiler).toBe(1);
  });

  it("dos pagos que juntos pasan del alquiler trasladan solo la suma de lo que sobra, sin contar dos veces", () => {
    const d = aplicarTicket(aplicarTicket(partida, pago("1", 2000)), pago("2", 1000));
    expect(fila(d).pagadoAlquiler).toBe(2500);
    expect(fila(d).trasladadoAlquiler).toBe(500);
    expect(sofia(d).deuda).toBe(500);
  });

  it("repetir el mismo ticket (mismo id) no traslada dos veces", () => {
    const una = aplicarTicket(partida, pago("dup", 3000));
    const dos = aplicarTicket(una, pago("dup", 3000));
    expect(dos).toBe(una);
  });

  it("alquiler 0 con pagos hechos: no se traslada nada, pero al ponerle alquiler después sí, sin perder plata", () => {
    const sinAlquiler = aplicarTicket(aplicarAlquiler(partida, 0), pago("z", 3000));
    expect(fila(sinAlquiler).trasladadoAlquiler).toBe(0);
    expect(sofia(sinAlquiler).deuda).toBe(1000);
    const conAlquiler = aplicarAlquiler(sinAlquiler, 2500);
    expect(fila(conAlquiler).trasladadoAlquiler).toBe(500);
    expect(sofia(conAlquiler).deuda).toBe(500);
  });
});
