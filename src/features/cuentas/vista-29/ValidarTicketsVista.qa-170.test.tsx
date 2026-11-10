import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccionesValidarTickets, DatosDeValidacion, ResultadoDeAccion } from "@/datos/cuentas/validar";
import { armarValidacionSimulada } from "@/datos/cuentas/validar/simulado";
import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { ValidarTicketsVista } from "./ValidarTicketsVista";

/**
 * QA de la vista 29 conectada (#170, PR #173): lo que cambia al llegar las decisiones desde el servidor. Lo que documenta un
 * hallazgo va con `skip`.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const AHORA = new Date("2026-11-10T14:00:00.000Z");
const simulados = (): DatosDeValidacion => armarValidacionSimulada(AHORA);

function montar(rechazar: AccionesValidarTickets["rechazar"]) {
  const acciones = {
    validar: vi.fn(async () => ({ ok: true as const, valor: { resueltoEn: AHORA.toISOString(), yaEstaba: false } })),
    rechazar: vi.fn(rechazar),
    enlaceDeFoto: vi.fn(async (): Promise<ResultadoDeAccion<string>> => ({ ok: true, valor: "data:image/svg+xml,foto" })),
  } satisfies AccionesValidarTickets;
  render(<ValidarTicketsVista datos={simulados()} acciones={acciones} />);
  return acciones;
}

const tocar = (el: HTMLElement) => act(async () => fireEvent.click(el));
const panel = () => screen.getByRole("region");

async function rechazarConMotivo(texto: string) {
  await tocar(within(panel()).getByRole("button", { name: /^Rechazar/ }));
  const campo = within(panel()).getByLabelText("MOTIVO DEL RECHAZO · OBLIGATORIO");
  await act(async () => fireEvent.change(campo, { target: { value: texto } }));
  await tocar(within(panel()).getByRole("button", { name: "Confirmar rechazo" }));
  return campo;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/cuentas/validar-tickets");
});

afterEach(() => {
  vi.restoreAllMocks();
  reiniciarTrabajoPendiente();
});

describe("rechazar sin conexión (decisión del 10/11 en #168, P1)", () => {
  it.skip("QA #170: el rechazo que no llegó por falta de conexión dice «Necesitás conexión para rechazar el depósito de X» y deja el motivo escrito", async () => {
    // Con la conexión real, una caída del servidor (la server action tira) es el caso común. Hoy el aviso es el de 36R·07B
    // («No pudimos guardar el rechazo…»), que no dice que falta la conexión. La decisión del 10/11 (P1, opción b) pide:
    // «Necesitás conexión para rechazar el depósito de X. El motivo sigue escrito: revisá la conexión y probá de nuevo.»
    montar(async () => ({ ok: false, causa: "sin-conexion" }));
    const campo = await rechazarConMotivo("Foto ilegible");

    expect(within(panel()).getByRole("alert")).toHaveTextContent(
      /Necesitás conexión para rechazar el depósito de .+\. El motivo sigue escrito: revisá la conexión y probá de nuevo\./,
    );
    expect(campo).toHaveValue("Foto ilegible");
  });
});

describe("rechazar con la base rechazando (conexión real)", () => {
  it("el texto de la base se muestra, el motivo sigue escrito y se puede volver a intentar", async () => {
    const texto = "Este ticket ya no está pendiente: otra persona lo resolvió. Recargá la lista para ver cómo quedó.";
    const acciones = montar(async () => ({ ok: false, causa: "rechazado", mensaje: texto }));
    const campo = await rechazarConMotivo("Foto ilegible");

    expect(within(panel()).getByRole("alert")).toHaveTextContent(texto);
    expect(campo).toHaveValue("Foto ilegible");
    const reintentar = within(panel()).getByRole("button", { name: "Reintentar" });
    expect(reintentar).toBeEnabled();
    await tocar(reintentar);
    expect(acciones.rechazar).toHaveBeenCalledTimes(2);
  });
});
