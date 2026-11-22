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

describe("crearAccionesSimuladas · anularCobro (vista 39)", () => {
  const datos = armarCuentasSimuladas(AHORA);
  const VIGENTE = "cobro-florencia-pintos-vigente";
  const PASADO = "cobro-valentina-silva-pasado";
  const ANULADO = "cobro-joaquin-duarte-anulado";

  it("los ejemplos de la vista 39 están: uno dentro del plazo, uno pasado y uno que anuló la colportora desde el teléfono", () => {
    const cobros = datos.tickets.flatMap((t) => (t.cobro ? [t.cobro] : []));
    expect(cobros.find((c) => c.id === VIGENTE)?.anulado).toBeUndefined();
    expect(cobros.find((c) => c.id === PASADO)?.anulado).toBeUndefined();
    expect(cobros.find((c) => c.id === ANULADO)?.anulado).toMatchObject({ origen: "telefono", por: "Joaquín Duarte" });
    // Solo los tickets de tarjeta son cobros: un depósito en banco o un retiro no.
    for (const t of datos.tickets) {
      expect(t.cobro !== undefined).toBe(t.medio === "tarjeta-debito" || t.medio === "tarjeta-credito");
    }
    expect(new Set(cobros.map((c) => c.id)).size).toBe(cobros.length);
  });

  it("anula dentro de las 72 h, con quien anula y la hora, y recuerda el doble toque (`yaEstaba`)", async () => {
    const acciones = crearAccionesSimuladas(datos, () => AHORA.getTime());
    const resultado = await acciones.anularCobro(VIGENTE, "Monto equivocado");
    expect(resultado).toEqual({
      ok: true,
      valor: { yaEstaba: false, anulacion: { en: AHORA.toISOString(), motivo: "Monto equivocado", por: "Marta Pérez", origen: "panel" } },
    });
    expect(await acciones.anularCobro(VIGENTE, "Otro")).toEqual({ ok: true, valor: { yaEstaba: true } });
  });

  it("con «Otro» guarda el texto escrito, sin espacios de más", async () => {
    const acciones = crearAccionesSimuladas(datos, () => AHORA.getTime());
    const resultado = await acciones.anularCobro(VIGENTE, "Otro", "  Se cobró de más  ");
    expect(resultado).toMatchObject({ ok: true, valor: { anulacion: { motivo: "Otro", detalle: "Se cobró de más" } } });
  });

  it("pasadas las 72 h rechaza con el código de plazo y no anula, aunque lo intente de nuevo", async () => {
    const acciones = crearAccionesSimuladas(datos, () => AHORA.getTime());
    const rechazo = await acciones.anularCobro(PASADO, "Monto equivocado");
    expect(rechazo).toEqual({
      ok: false,
      causa: "rechazado",
      codigo: "fuera-de-plazo",
      mensaje: "Pasaron más de 72 h desde el cobro: ya no se puede anular.",
    });
    expect(await acciones.anularCobro(PASADO, "Monto equivocado")).toMatchObject({ ok: false, codigo: "fuera-de-plazo" });
  });

  it("el plazo se mide con la hora de la acción, no con la de la lectura: venció mientras confirmaba", async () => {
    let ahora = Date.parse("2026-10-24T10:20:00-03:00");
    const acciones = crearAccionesSimuladas(datos, () => ahora);
    ahora += 60_000;
    expect(await acciones.anularCobro(VIGENTE, "Monto equivocado")).toMatchObject({ ok: false, codigo: "fuera-de-plazo" });
  });

  it("un cobro que no existe, sin datos o con un motivo fuera de la lista da un rechazo con texto que guía", async () => {
    const acciones = crearAccionesSimuladas(datos, () => AHORA.getTime());
    expect(await acciones.anularCobro("no-existe", "Otro")).toMatchObject({
      ok: false,
      causa: "rechazado",
      mensaje: "No encontramos ese cobro entre los de tu equipo. Recargá la lista de cuentas.",
    });
    expect(await crearAccionesSimuladas().anularCobro(VIGENTE, "Otro")).toMatchObject({ ok: false, causa: "rechazado" });
    // @ts-expect-error un motivo que no es de la lista
    expect(await acciones.anularCobro(VIGENTE, "Porque sí")).toMatchObject({ ok: false, causa: "rechazado" });
  });
});
