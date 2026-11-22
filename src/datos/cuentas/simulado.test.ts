import { describe, expect, it } from "vitest";

import { fuenteCuentasSimulada, armarCuentasSimuladas, crearAccionesSimuladas, ALQUILER_SIMULADO } from "@/datos/cuentas/simulado";
import { TEXTO_ALQUILER_CON_PAGOS } from "@/features/cuentas/por-decidir";

const AHORA = new Date("2026-10-22T15:00:00.000Z");

describe("armarCuentasSimuladas", () => {
  const datos = armarCuentasSimuladas(AHORA);

  it("arma tres ciudades y 26 colportores siempre igual", () => {
    expect(datos.ciudades.map((c) => c.nombre)).toEqual(["Rivera", "Artigas", "Bella Unión"]);
    expect(datos.colportores).toHaveLength(26);
    expect(armarCuentasSimuladas(AHORA)).toEqual(datos);
    expect(new Set(datos.colportores.map((c) => c.id)).size).toBe(26);
    expect(new Set(datos.tickets.map((t) => t.id)).size).toBe(datos.tickets.length);
  });

  it("el alquiler pagado de cada colportor inscripto sale solo de depósitos validados con ese destino", () => {
    for (const c of datos.colportores.filter((x) => !x.baja)) {
      const pagado = datos.tickets
        .filter((t) => t.colportorId === c.id && t.destino === "alquiler" && t.estado === "VALIDADO")
        .reduce((total, t) => total + t.monto, 0);
      expect([0, 5000, 9250, ALQUILER_SIMULADO]).toContain(pagado);
    }
  });

  it("Rivera tiene banco y nunca hay retiros; Artigas y Bella Unión no tienen y sus retiros no llevan foto ni número", () => {
    const ciudadDe = new Map(datos.colportores.map((c) => [c.id, c.ciudadId]));
    const retiros = datos.tickets.filter((t) => t.medio === "retiro-coordinador");
    expect(retiros.length).toBeGreaterThan(0);
    for (const t of retiros) {
      expect(ciudadDe.get(t.colportorId)).not.toBe("rivera");
      expect(t.tieneFoto).toBe(false);
      expect(t.numero).toBeUndefined();
      expect(t.estado).toBe("VALIDADO");
    }
  });

  it("deja a la vista lo que muestra el diseño: dos por validar y un rechazo con motivo", () => {
    const sofia = datos.tickets.find((t) => t.id === "sofia-cabral-por-validar");
    expect(sofia).toMatchObject({ estado: "PENDIENTE", monto: 18500, medio: "tarjeta-debito", entidad: "Visa", numero: "483920" });
    expect(datos.tickets.filter((t) => t.estado === "PENDIENTE")).toHaveLength(2);
    const bruno = datos.tickets.filter((t) => t.estado === "RECHAZADO");
    expect(bruno).toHaveLength(1);
    expect(bruno[0].motivoRechazo).toBe("Foto ilegible");
  });

  it("la fuente arma la lectura a la hora del pedido", async () => {
    const lectura = await fuenteCuentasSimulada.obtenerCuentas();
    expect(lectura.colportores).toHaveLength(26);
    expect(Number.isNaN(Date.parse(lectura.ahora))).toBe(false);
  });
});

describe("crearAccionesSimuladas", () => {
  const datos = armarCuentasSimuladas(AHORA);
  const sinPagosDeAlquiler = { ...datos, tickets: datos.tickets.filter((t) => t.destino !== "alquiler") };

  it("editarAlquiler acepta 0 sin pagos de alquiler y rechaza negativos y decimales", async () => {
    const acciones = crearAccionesSimuladas(sinPagosDeAlquiler);
    expect(await acciones.editarAlquiler(0)).toEqual({ ok: true, valor: 0 });
    expect(await acciones.editarAlquiler(20000)).toEqual({ ok: true, valor: 20000 });
    expect(await acciones.editarAlquiler(-1)).toMatchObject({ ok: false });
    expect(await acciones.editarAlquiler(1.5)).toMatchObject({ ok: false });
  });

  it("editarAlquiler con pagos de alquiler rechaza 0 con el aviso de la decisión «Alquiler a 0» y deja cambiar el monto", async () => {
    const acciones = crearAccionesSimuladas(datos);
    expect(await acciones.editarAlquiler(0)).toEqual({ ok: false, causa: "rechazado", mensaje: TEXTO_ALQUILER_CON_PAGOS });
    expect(await acciones.editarAlquiler(20000)).toEqual({ ok: true, valor: 20000 });
    // Sigue rechazando después de cambiar el monto: los pagos siguen ahí.
    expect(await acciones.editarAlquiler(0)).toMatchObject({ ok: false, causa: "rechazado" });
  });
});
