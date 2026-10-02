import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type * as ModuloEquipo from "@/datos/equipo";
import { DATOS_ANADIR_COLPORTOR_SIMULADO } from "@/datos/equipo/simulado";
import { AnadirColportorLocal } from "@/features/equipo/AnadirColportorLocal";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// El selector explota si alguien lo usa: el sitio de prueba tiene que ser siempre la fuente simulada,
// aunque el día de mañana `index.ts` apunte a la real.
vi.mock("@/datos/equipo", async (importOriginal) => ({
  ...(await importOriginal<typeof ModuloEquipo>()),
  fuenteEquipo: new Proxy(
    {},
    {
      get() {
        throw new Error("El sitio de prueba no puede usar el selector de fuente: tiene que ser siempre la simulada.");
      },
    },
  ),
}));

describe("AnadirColportorLocal (vista 23 en el sitio de prueba)", () => {
  it("inscribe contra la fuente simulada desde el navegador", async () => {
    render(<AnadirColportorLocal datos={DATOS_ANADIR_COLPORTOR_SIMULADO} />);

    const primero = screen.getAllByRole("button", { name: /^Añadir a / })[0];
    const nombre = (primero.getAttribute("aria-label") ?? "").replace("Añadir a ", "");
    await userEvent.click(primero);

    expect(await screen.findByRole("button", { name: `Deshacer: ${nombre}` })).toBeInTheDocument();
  });
});
