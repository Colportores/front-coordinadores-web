import { describe, expect, it } from "vitest";

import {
  buscarHu,
  contarPorEstado,
  estadoDePestana,
  HISTORIAS,
  husDePestana,
  TABLAS_EN_BACK,
} from "@/dev/estado-hu";

const HU_DEL_PANEL = {
  inicio: ["HU-CAM-008"],
  equipo: ["HU-CAM-004", "HU-CAM-006", "HU-CAT-005", "HU-JOR-004"],
  stock: ["HU-STK-001", "HU-STK-003", "HU-STK-004", "HU-STK-005"],
  cuentas: ["HU-CTA-005", "HU-COB-008", "HU-CTA-006"],
  reportes: ["HU-REP-001", "HU-REP-002", "HU-REP-005", "HU-REP-004"],
} as const;

describe("registro estado-hu", () => {
  it("tiene exactamente las 16 HU del panel, sin duplicados", () => {
    const ids = HISTORIAS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(Object.values(HU_DEL_PANEL).flat().sort());
  });

  it("asigna cada HU a su pestaña", () => {
    for (const [pestana, ids] of Object.entries(HU_DEL_PANEL)) {
      expect(husDePestana(pestana as keyof typeof HU_DEL_PANEL).map((h) => h.id).sort()).toEqual([...ids].sort());
    }
  });

  describe("estado inicial", () => {
    it("Stock, Cuentas y HU-REP-004 están bloqueadas y con motivo", () => {
      const bloqueadas = [...HU_DEL_PANEL.stock, ...HU_DEL_PANEL.cuentas, "HU-REP-004"];
      for (const id of bloqueadas) {
        const hu = buscarHu(id);
        expect(hu?.estado, id).toBe("bloqueada");
        expect(hu?.motivo, id).toBeTruthy();
      }
    });

    it("el resto está mockeada", () => {
      const mockeadas = HISTORIAS.filter((h) => h.estado === "mockeada").map((h) => h.id);
      expect(mockeadas.sort()).toEqual(
        [...HU_DEL_PANEL.inicio, ...HU_DEL_PANEL.equipo, "HU-REP-001", "HU-REP-002", "HU-REP-005"].sort(),
      );
    });

    it("toda HU bloqueada tiene motivo y toda HU tiene sprint de conexión", () => {
      for (const h of HISTORIAS) {
        if (h.estado === "bloqueada") expect(h.motivo, h.id).toBeTruthy();
        expect(h.sprintConexion, h.id).toBeTruthy();
      }
    });
  });

  describe("schema en back", () => {
    it("marca cada tabla según las migraciones de backend-supabase", () => {
      for (const h of HISTORIAS) {
        for (const t of h.tablas) expect(t.existe, `${h.id}.${t.nombre}`).toBe(TABLAS_EN_BACK.has(t.nombre));
      }
    });

    it("es coherente con sus tablas: si / parcial / no", () => {
      for (const h of HISTORIAS) {
        const existentes = h.tablas.filter((t) => t.existe).length;
        const esperado = existentes === h.tablas.length ? "si" : existentes === 0 ? "no" : "parcial";
        expect(h.schemaEnBack, h.id).toBe(esperado);
      }
    });

    it("las tablas de 'Stock y cuenta (V2)' todavía no existen", () => {
      for (const tabla of ["stock", "pedido_casa_editora", "transferencia_stock", "estado_cuenta", "deposito", "ticket"]) {
        expect(TABLAS_EN_BACK.has(tabla), tabla).toBe(false);
      }
      expect(buscarHu("HU-CTA-006")?.schemaEnBack).toBe("no");
      expect(buscarHu("HU-STK-004")?.schemaEnBack).toBe("parcial");
      expect(buscarHu("HU-CAM-008")?.schemaEnBack).toBe("si");
    });
  });

  describe("estadoDePestana", () => {
    it("devuelve el estado menos avanzado de sus HU", () => {
      expect(estadoDePestana("inicio")).toBe("mockeada");
      expect(estadoDePestana("stock")).toBe("bloqueada");
      expect(estadoDePestana("cuentas")).toBe("bloqueada");
      expect(estadoDePestana("reportes")).toBe("bloqueada");
    });
  });

  it("cuenta las HU por estado", () => {
    expect(contarPorEstado()).toEqual({ bloqueada: 8, mockeada: 8, implementada: 0, "validada-qa": 0 });
  });
});
