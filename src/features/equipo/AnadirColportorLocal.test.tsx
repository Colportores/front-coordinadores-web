import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DATOS_ANADIR_COLPORTOR_SIMULADO } from "@/datos/equipo/simulado";
import { AnadirColportorLocal } from "@/features/equipo/AnadirColportorLocal";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("AnadirColportorLocal (vista 23 en el sitio de prueba)", () => {
  it("inscribe contra la fuente simulada desde el navegador", async () => {
    render(<AnadirColportorLocal datos={DATOS_ANADIR_COLPORTOR_SIMULADO} />);

    const primero = screen.getAllByRole("button", { name: /^Añadir a / })[0];
    const nombre = (primero.getAttribute("aria-label") ?? "").replace("Añadir a ", "");
    await userEvent.click(primero);

    expect(await screen.findByRole("button", { name: `Deshacer: ${nombre}` })).toBeInTheDocument();
  });
});
