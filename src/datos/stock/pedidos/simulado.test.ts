import { describe, expect, it } from "vitest";

import { crearAccionesSimuladas, crearDatosDePedidosSimulados, fuentePedidosSimulada, LIMITE_DE_EJEMPLO } from "./simulado";

describe("datos simulados de pedidos y transferencias", () => {
  const ahora = new Date("2026-10-22T18:00:00-03:00");

  it("trae los diez pedidos y las dos transferencias del canvas con el límite de $U 50.000", () => {
    const d = crearDatosDePedidosSimulados(ahora);
    expect(d.pedidos).toHaveLength(10);
    expect(d.transferencias).toHaveLength(2);
    expect(d.limiteDeDeuda).toBe(LIMITE_DE_EJEMPLO);
    expect(d.ahora).toBe(ahora.toISOString());
    expect(d.ciudades.map((c) => c.nombre)).toEqual(["Rivera", "Artigas", "Bella Unión"]);
  });

  it("los ids son únicos y todos los pedidos y transferencias apuntan a una ciudad que existe", () => {
    const d = crearDatosDePedidosSimulados(ahora);
    const ids = [...d.pedidos.map((p) => p.id), ...d.transferencias.map((t) => t.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const ciudades = new Set(d.ciudades.map((c) => c.id));
    for (const x of [...d.pedidos, ...d.transferencias]) expect(ciudades.has(x.ciudadId ?? "")).toBe(true);
  });

  it("las fechas son relativas a «ahora»: a cualquier hora los pendientes quedan del más nuevo al más viejo", () => {
    for (const hora of ["00:05", "02:00", "12:00", "23:55"]) {
      const d = crearDatosDePedidosSimulados(new Date(`2026-10-22T${hora}:00-03:00`));
      const pendientes = d.pedidos.filter((p) => p.estado === "POR_AUTORIZAR");
      const ordenados = [...pendientes].sort((a, b) => Date.parse(b.enviadoEn) - Date.parse(a.enviadoEn));
      expect(ordenados.map((p) => p.numero), hora).toEqual(pendientes.map((p) => p.numero));
    }
  });

  it("la fuente devuelve datos y las acciones simuladas resuelven sin guardar nada", async () => {
    expect(await fuentePedidosSimulada.obtenerPedidos()).not.toBeNull();
    const acciones = crearAccionesSimuladas();

    expect(await acciones.decidir({ tipo: "pedido", id: "x", accion: "autorizar" })).toMatchObject({ ok: true, valor: { estado: "AUTORIZADO", motivoDeRechazo: null } });
    expect(await acciones.decidir({ tipo: "transferencia", id: "x", accion: "autorizar" })).toMatchObject({ ok: true, valor: { estado: "AUTORIZADA" } });
    expect(await acciones.decidir({ tipo: "pedido", id: "x", accion: "rechazar", motivo: " No " })).toMatchObject({
      ok: true,
      valor: { estado: "RECHAZADO", motivoDeRechazo: "No" },
    });
    expect(await acciones.decidir({ tipo: "transferencia", id: "x", accion: "rechazar", motivo: "No" })).toMatchObject({ ok: true, valor: { estado: "RECHAZADA" } });
  });

  it("rechazar sin motivo no se acepta", async () => {
    const r = await crearAccionesSimuladas().decidir({ tipo: "pedido", id: "x", accion: "rechazar", motivo: "  " });
    expect(r).toMatchObject({ ok: false, causa: "rechazado" });
  });
});
