import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import AnadirColportorPagina from "@/app/equipo/anadir/page";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("AnadirColportorPagina", () => {
  it("arma la vista 23 con el título de la pestaña y los datos de la campaña", async () => {
    const jsx = await AnadirColportorPagina();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Añadir colportor" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Añadir colportor a Verano 2026" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ya en tu equipo" })).toBeInTheDocument();
  });

  it("en modo dev marca la sección con la HU-CAM-004", async () => {
    const jsx = await AnadirColportorPagina();
    const { container } = render(<ProveedorModoDev activo>{jsx}</ProveedorModoDev>);

    expect(container.querySelector('[data-hu="HU-CAM-004"]')).not.toBeNull();
  });

  it("en el build del sitio de prueba (export estático) arma la misma vista, con la inscripción en el navegador", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    const jsx = await AnadirColportorPagina();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Añadir colportor" })).toBeInTheDocument();
    const primero = screen.getAllByRole("button", { name: /^Añadir a / })[0];
    const nombre = (primero.getAttribute("aria-label") ?? "").replace("Añadir a ", "");
    await userEvent.click(primero);
    expect(await screen.findByRole("button", { name: `Deshacer: ${nombre}` })).toBeInTheDocument();
  });
});
