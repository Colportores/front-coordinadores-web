import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { CuentasVista } from "@/features/cuentas/CuentasVista";

/** 41B·01: con el alquiler en 0 el encabezado dice «no se cobra», sin fecha de «dejó de cobrar» en el subtítulo. */
describe("la campaña sin alquiler", () => {
  it("el encabezado dice «no se cobra», el aviso de guardado también y el subtítulo no dice desde cuándo", async () => {
    const datos = armarCuentasSimuladas(new Date("2026-11-04T15:00:00.000Z"));
    const usuario = userEvent.setup();
    render(
      <ProveedorModoDev activo={false}>
        <CuentasVista datos={datos} acciones={crearAccionesSimuladas()} />
      </ProveedorModoDev>,
    );
    expect(screen.getByText(/Alquiler de la campaña:/)).toHaveTextContent("Alquiler de la campaña: $U 18.500 por colportor");
    expect(screen.queryByText(/dejó de cobrar alquiler/)).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Editar" }));
    const campo = screen.getByLabelText(/Alquiler por colportor/);
    await usuario.clear(campo);
    await usuario.type(campo, "0");
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Alquiler de la campaña: no se cobra, para todos los inscriptos.");
    // El encabezado y el aviso de guardado empiezan igual: el encabezado es el que no tiene `role=status`.
    const encabezado = screen.getAllByText(/Alquiler de la campaña:/).find((el) => !el.closest('[role="status"]'));
    expect(encabezado).toHaveTextContent(/^Alquiler de la campaña: no se cobra$/);
    expect(screen.queryByText(/\$U 0 por colportor/)).not.toBeInTheDocument();
    // Cristian, 10/11: una campaña no deja de cobrar a mitad de camino; el subtítulo no inventa desde cuándo.
    expect(screen.queryByText(/dejó de cobrar alquiler/)).not.toBeInTheDocument();
  });
});
