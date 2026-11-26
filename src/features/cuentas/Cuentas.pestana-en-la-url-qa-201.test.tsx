import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CargandoCuentas from "@/app/cuentas/loading";
import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { CuentasVista } from "@/features/cuentas/CuentasVista";

/**
 * QA de #81 (PR 201, vista 39), 39B·05: la pestaña elegida viaja en la dirección (`/cuentas?pestana=tickets`) y el esqueleto de
 * carga la muestra activa. Decisión de Cristian (23/11, «Diferir 39B5»): «como el dibujo», antes del merge.
 */

const buscar = vi.hoisted(() => ({ actual: "pestana=tickets" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/cuentas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(buscar.actual),
}));

const AHORA = new Date("2026-10-22T15:00:00.000Z");

function vista() {
  const datos = armarCuentasSimuladas(AHORA);
  return <CuentasVista datos={datos} acciones={crearAccionesSimuladas(datos, () => AHORA.getTime())} />;
}

describe("39B·05: la pestaña elegida va en la dirección", () => {
  it("QA #81: el esqueleto de carga de `/cuentas?pestana=tickets` dibuja «Tickets» activa, no «Alquiler»", () => {
    buscar.actual = "pestana=tickets";
    render(<CargandoCuentas />);

    expect(screen.getByText("Tickets").className).toMatch(/bg-marca/);
    expect(screen.getByText("Alquiler").className).not.toMatch(/bg-marca/);
  });

  it("QA #81: la vista abre con la pestaña de `?pestana=tickets` (sin la dirección, la de siempre)", () => {
    buscar.actual = "pestana=tickets";
    const { unmount } = render(vista());
    expect(screen.getByRole("tab", { name: /^Tickets/ })).toHaveAttribute("aria-selected", "true");
    unmount();

    buscar.actual = "";
    render(vista());
    expect(screen.getByRole("tab", { name: "Casa editora" })).toHaveAttribute("aria-selected", "true");
  });
});
