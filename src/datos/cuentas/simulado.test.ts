import { describe, expect, it } from "vitest";

import { fuenteCuentasSimulada, armarCuentasSimuladas, crearAccionesSimuladas, ALQUILER_SIMULADO } from "@/datos/cuentas/simulado";

const AHORA = new Date("2026-10-22T15:00:00.000Z");

describe("armarCuentasSimuladas", () => {
  const datos = armarCuentasSimuladas(AHORA);

  it("arma tres ciudades y 25 colportores siempre igual", () => {
    expect(datos.ciudades.map((c) => c.nombre)).toEqual(["Rivera", "Artigas", "Bella Unión"]);
    expect(datos.colportores).toHaveLength(25);
    expect(armarCuentasSimuladas(AHORA)).toEqual(datos);
    expect(new Set(datos.colportores.map((c) => c.id)).size).toBe(25);
    expect(new Set(datos.tickets.map((t) => t.id)).size).toBe(datos.tickets.length);
  });

  it("el alquiler pagado de cada colportor sale solo de depósitos validados con ese destino", () => {
    for (const c of datos.colportores) {
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
    expect(lectura.colportores).toHaveLength(25);
    expect(Number.isNaN(Date.parse(lectura.ahora))).toBe(false);
  });
});

describe("crearAccionesSimuladas", () => {
  const acciones = crearAccionesSimuladas(() => AHORA);

  it("el retiro vuelve ya validado, sin foto, con el instante del día elegido", async () => {
    const r = await acciones.registrarRetiro({ colportorId: "sofia-cabral", monto: 5000, dia: "2026-10-20", destino: "alquiler" });
    expect(r).toMatchObject({
      ok: true,
      valor: { colportorId: "sofia-cabral", monto: 5000, medio: "retiro-coordinador", estado: "VALIDADO", destino: "alquiler", tieneFoto: false },
    });
  });

  it("cada retiro tiene su id", async () => {
    const a = await acciones.registrarRetiro({ colportorId: "sofia-cabral", monto: 100, dia: "2026-10-22", destino: "casa-editora" });
    const b = await acciones.registrarRetiro({ colportorId: "sofia-cabral", monto: 100, dia: "2026-10-22", destino: "casa-editora" });
    expect(a.ok && b.ok && a.valor.id !== b.valor.id).toBe(true);
  });

  it("rechaza un monto que no es entero mayor que cero y un día futuro", async () => {
    for (const monto of [0, -5, 10.5, Number.NaN]) {
      expect(await acciones.registrarRetiro({ colportorId: "x", monto, dia: "2026-10-22", destino: "alquiler" })).toMatchObject({
        ok: false,
        causa: "rechazado",
      });
    }
    expect(await acciones.registrarRetiro({ colportorId: "x", monto: 100, dia: "2026-10-23", destino: "alquiler" })).toMatchObject({
      ok: false,
      causa: "rechazado",
    });
    expect(await acciones.registrarRetiro({ colportorId: "x", monto: 100, dia: "2026-02-31", destino: "alquiler" })).toMatchObject({
      ok: false,
    });
  });

  it("editarAlquiler acepta 0 y rechaza negativos y decimales", async () => {
    expect(await acciones.editarAlquiler(0)).toEqual({ ok: true, valor: 0 });
    expect(await acciones.editarAlquiler(20000)).toEqual({ ok: true, valor: 20000 });
    expect(await acciones.editarAlquiler(-1)).toMatchObject({ ok: false });
    expect(await acciones.editarAlquiler(1.5)).toMatchObject({ ok: false });
  });
});
