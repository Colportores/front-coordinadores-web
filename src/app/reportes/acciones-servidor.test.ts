import { afterEach, describe, expect, it, vi } from "vitest";

import { informeNoDisponible, type PedidoDeInforme } from "@/datos/reportes/informe";

const PEDIDO: PedidoDeInforme = { ambito: { tipo: "departamento", departamento: "Rivera" }, granularidad: "mes" };
const CAMPANIA = "6f0c2a52-6a0e-4f53-9a43-5a2e6f3c9a11";

const { pedirInformePdf, crearSupabaseDeServidor, leerCampaniaElegida } = vi.hoisted(() => ({
  pedirInformePdf: vi.fn(),
  crearSupabaseDeServidor: vi.fn(),
  leerCampaniaElegida: vi.fn(),
}));
vi.mock("@/datos/reportes/informe-edge", () => ({ pedirInformePdf }));
vi.mock("@/auth/supabase-servidor", () => ({ crearSupabaseDeServidor }));
vi.mock("@/datos/shell/campania-elegida-servidor", () => ({ leerCampaniaElegida }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function accion() {
  const { crearAccionesReportes } = await import("./acciones-servidor");
  return crearAccionesReportes();
}

function conSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
}

describe("server actions de Reportes (issue #84)", () => {
  it("con Supabase configurado le pide el informe a la función con la sesión del pedido y la campaña de la cookie", async () => {
    conSupabase();
    const supabase = { functions: {} };
    crearSupabaseDeServidor.mockResolvedValue(supabase);
    leerCampaniaElegida.mockResolvedValue(CAMPANIA);
    pedirInformePdf.mockResolvedValue({ ok: true, pdfBase64: "JVBERi0=" });

    expect(await (await accion()).descargarInforme(PEDIDO)).toEqual({ ok: true, pdfBase64: "JVBERi0=" });
    expect(pedirInformePdf).toHaveBeenCalledWith(supabase, PEDIDO, CAMPANIA);
  });

  it("sin campaña elegida, manda null", async () => {
    conSupabase();
    crearSupabaseDeServidor.mockResolvedValue({});
    leerCampaniaElegida.mockResolvedValue(null);
    pedirInformePdf.mockResolvedValue({ ok: false, causa: "sin-conexion" });

    expect(await (await accion()).descargarInforme(PEDIDO)).toEqual({ ok: false, causa: "sin-conexion" });
    expect(pedirInformePdf).toHaveBeenCalledWith({}, PEDIDO, null);
  });

  it("sin Supabase detrás (desarrollo sin variables, puente de la demo) no hay función: avisa y no toca la red ni las cookies", async () => {
    expect(await (await accion()).descargarInforme(PEDIDO)).toEqual(await informeNoDisponible(PEDIDO));
    expect(crearSupabaseDeServidor).not.toHaveBeenCalled();
    expect(pedirInformePdf).not.toHaveBeenCalled();
  });
});
