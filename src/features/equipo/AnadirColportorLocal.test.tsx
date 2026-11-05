import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as ModuloEquipo from "@/datos/equipo";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("busca contra la fuente simulada desde el navegador, con la campaña de los datos", async () => {
    const espia = vi.spyOn(fuenteEquipoSimulada, "buscarCandidatos");
    render(<AnadirColportorLocal datos={DATOS_ANADIR_COLPORTOR_SIMULADO} />);

    await userEvent.type(screen.getByRole("textbox", { name: "Buscar por email o nombre" }), "silva");

    expect(await screen.findByRole("button", { name: "Elegir a Rodrigo Silva" })).toBeInTheDocument();
    expect(espia).toHaveBeenLastCalledWith(DATOS_ANADIR_COLPORTOR_SIMULADO.campaniaId, "silva", null);
  });

  it("manda la inscripción a la fuente simulada cuando se cierran los avisos (Esc), con la campaña de los datos", async () => {
    const espia = vi.spyOn(fuenteEquipoSimulada, "inscribirColportor");
    render(<AnadirColportorLocal datos={DATOS_ANADIR_COLPORTOR_SIMULADO} />);
    const sugerido = DATOS_ANADIR_COLPORTOR_SIMULADO.sugeridos[0];

    await userEvent.click(screen.getByRole("button", { name: `Añadir a ${sugerido.nombre}` }));
    expect(espia).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}{Escape}"); // el primero devuelve el foco del «Deshacer»; el segundo manda ya

    await vi.waitFor(() => expect(espia).toHaveBeenCalledExactlyOnceWith(DATOS_ANADIR_COLPORTOR_SIMULADO.campaniaId, sugerido.id));
  });

  it("inscribe contra la fuente simulada desde el navegador", async () => {
    render(<AnadirColportorLocal datos={DATOS_ANADIR_COLPORTOR_SIMULADO} />);

    const primero = screen.getAllByRole("button", { name: /^Añadir a / })[0];
    const nombre = (primero.getAttribute("aria-label") ?? "").replace("Añadir a ", "");
    await userEvent.click(primero);

    expect(await screen.findByRole("button", { name: `Deshacer: ${nombre}` })).toBeInTheDocument();
  });
});
