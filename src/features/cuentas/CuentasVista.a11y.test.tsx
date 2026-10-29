import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { CuentasVista } from "@/features/cuentas/CuentasVista";

/** axe en jsdom no mide contraste (no hay layout): el contraste va en la corrida con navegador real. */
async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const AHORA = new Date("2026-10-22T15:00:00.000Z");

function montar() {
  const acciones = crearAccionesSimuladas(() => AHORA);
  return render(
    <ProveedorModoDev activo={false}>
      <CuentasVista datos={armarCuentasSimuladas(AHORA)} acciones={acciones} />
    </ProveedorModoDev>,
  );
}

// axe recorre tablas de 25 filas y tickets: en jsdom tarda más que los 5 s por defecto.
vi.setConfig({ testTimeout: 60_000 });

describe("CuentasVista · accesibilidad (axe A/AA, sin contraste)", () => {
  it("Casa editora, Alquiler y Tickets", async () => {
    const { container } = montar();
    expect(await violaciones(container)).toEqual([]);
    await userEvent.click(screen.getByRole("tab", { name: /Alquiler/ }));
    expect(await violaciones(container)).toEqual([]);
    await userEvent.click(screen.getByRole("tab", { name: /Tickets/ }));
    expect(await violaciones(container)).toEqual([]);
  });

  it("con un ticket abierto, con el formulario de retiro (vacío y con errores) y con el editor del alquiler", async () => {
    const { container } = montar();
    await userEvent.click(screen.getByRole("button", { name: /^Artigas/ }));
    await userEvent.click(screen.getByRole("tab", { name: /Tickets/ }));
    await userEvent.click(screen.getAllByRole("button", { name: /Sofía Cabral/ })[0]);
    expect(await violaciones(container)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));
    expect(await violaciones(container)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Guardar retiro" }));
    expect(await violaciones(container)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.clear(screen.getByLabelText(/Alquiler por colportor/));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await violaciones(container)).toEqual([]);
  });

  it("con la lista de ciudades contraída y con un aviso", async () => {
    const { container } = montar();
    await userEvent.click(screen.getByRole("button", { name: "Contraer ciudades" }));
    expect(await violaciones(container)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Expandir ciudades" }));
    await userEvent.click(screen.getByRole("button", { name: /^Artigas/ }));
    await userEvent.click(screen.getByRole("tab", { name: /Tickets/ }));
    await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await userEvent.selectOptions(screen.getByLabelText("Colportor", { selector: "#retiro-colportor" }), "sofia-cabral");
    await userEvent.type(screen.getByLabelText(/Monto retirado/), "1000");
    await userEvent.click(screen.getByRole("radio", { name: "Alquiler" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar retiro" }));
    await screen.findByRole("status");
    expect(await violaciones(container)).toEqual([]);
  });

  it("los controles chicos miden al menos 24 px (objetivo táctil AA)", async () => {
    const { container } = montar();
    await userEvent.click(screen.getByRole("tab", { name: /Alquiler/ }));
    for (const boton of container.querySelectorAll("th button, [role=columnheader] button")) {
      expect(boton.className).toMatch(/min-h-6/);
    }
    await userEvent.click(screen.getByRole("tab", { name: /Tickets/ }));
    for (const boton of container.querySelectorAll("[role=table] button[aria-expanded]")) {
      expect(boton.className).toMatch(/min-h-6/);
    }
    vi.restoreAllMocks();
  });
});
