import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { CuentasVista } from "@/features/cuentas/CuentasVista";
import { hrefCuentasDe, preseleccionDe, TEXTO_COLPORTOR_NO_ENCONTRADO } from "@/features/cuentas/preseleccion";

// «Ver en Cuentas →» de la vista 34 (#91): Cuentas abre en la ciudad del colportor con su fila resaltada.

const AHORA = new Date("2026-10-22T15:00:00.000Z");
const datos = () => armarCuentasSimuladas(AHORA);

function montar(colportorId: string | null) {
  const d = datos();
  return render(
    <ProveedorModoDev activo={false}>
      <CuentasVista datos={d} acciones={crearAccionesSimuladas()} preseleccion={preseleccionDe(d, colportorId)} />
    </ProveedorModoDev>,
  );
}

describe("preseleccionDe", () => {
  it("un colportor de Cuentas: su ciudad y su fila", () => {
    const d = datos();
    const c = d.colportores.find((x) => x.ciudadId === "artigas")!;
    expect(preseleccionDe(d, c.id)).toEqual({ seleccion: { tipo: "ciudad", ciudadId: "artigas" }, colportorId: c.id, aviso: null });
  });

  it("sin pedido, nada: abre como siempre y sin aviso", () => {
    for (const nada of [null, ""]) expect(preseleccionDe(datos(), nada)).toEqual({ seleccion: { tipo: "todas" }, colportorId: null, aviso: null });
  });

  it("alguien que Cuentas no tiene: abre en todas y dice qué pasó y qué hacer", () => {
    expect(preseleccionDe(datos(), "no-existe")).toEqual({ seleccion: { tipo: "todas" }, colportorId: null, aviso: TEXTO_COLPORTOR_NO_ENCONTRADO });
    expect(TEXTO_COLPORTOR_NO_ENCONTRADO).toMatch(/Elegí su ciudad/);
  });

  it("el enlace escapa el id", () => {
    expect(hrefCuentasDe("a b/ñ")).toBe("/cuentas?colportor=a%20b%2F%C3%B1");
  });
});

describe("Cuentas abierta desde Stock", () => {
  it("abre en la ciudad del colportor, con su fila resaltada y a la vista", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const d = datos();
    const c = d.colportores.find((x) => x.ciudadId === "artigas")!;
    montar(c.id);
    expect(screen.getByRole("heading", { level: 2, name: "Artigas" })).toBeInTheDocument();
    const fila = within(screen.getByRole("table", { name: "Casa editora" })).getByRole("row", { name: new RegExp(`^${c.nombre}`) });
    expect(fila.className).toContain("shadow-[inset_3px_0_0_var(--marca-media)]");
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
    // Las otras filas de la ciudad no se resaltan.
    const resaltadas = screen.getAllByRole("row").filter((f) => f.className.includes("shadow-[inset_3px_0_0_var(--marca-media)]"));
    expect(resaltadas).toHaveLength(1);
  });

  it("si no lo encuentra, abre en todas con el aviso que guía y se puede cerrar", () => {
    montar("no-existe");
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(TEXTO_COLPORTOR_NO_ENCONTRADO);
  });

  it("sin pedido abre como siempre", () => {
    montar(null);
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
