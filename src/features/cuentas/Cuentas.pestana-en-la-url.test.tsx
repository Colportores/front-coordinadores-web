import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CargandoCuentas from "@/app/cuentas/loading";
import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { CuentasVista } from "@/features/cuentas/CuentasVista";
import { escribirPestanaEnUrl, pestanaDeUrl } from "@/features/cuentas/pestana-en-url";
import { hrefCuentasDe, preseleccionDe } from "@/features/cuentas/preseleccion";

/** 39B·05 (Decisión de Cristian, 23/11): la pestaña elegida viaja en la dirección y el esqueleto la muestra activa. */

const buscar = vi.hoisted(() => ({ actual: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/cuentas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(buscar.actual),
}));

const AHORA = new Date("2026-10-22T15:00:00.000Z");

function vista(colportorId: string | null = null) {
  const datos = armarCuentasSimuladas(AHORA);
  const preseleccion = colportorId ? preseleccionDe(datos, colportorId) : undefined;
  return <CuentasVista datos={datos} acciones={crearAccionesSimuladas(datos, () => AHORA.getTime())} preseleccion={preseleccion} />;
}

afterEach(() => {
  buscar.actual = "";
  window.history.replaceState(null, "", "/");
});

describe("pestanaDeUrl", () => {
  it("acepta las tres pestañas y ignora lo demás sin romper", () => {
    expect(pestanaDeUrl("casa-editora")).toBe("casa-editora");
    expect(pestanaDeUrl("alquiler")).toBe("alquiler");
    expect(pestanaDeUrl("tickets")).toBe("tickets");
    for (const raro of [null, undefined, "", "Tickets", "otra", "tickets ", "__proto__"]) expect(pestanaDeUrl(raro)).toBeNull();
  });

  it("escribirPestanaEnUrl respeta los demás parámetros y no suma entradas al historial", () => {
    window.history.replaceState(null, "", "/cuentas?colportor=abc#x");
    const antes = window.history.length;
    escribirPestanaEnUrl("alquiler");
    expect(window.location.search).toBe("?colportor=abc&pestana=alquiler");
    expect(window.location.hash).toBe("#x");
    escribirPestanaEnUrl("tickets");
    expect(window.location.search).toBe("?colportor=abc&pestana=tickets");
    expect(window.history.length).toBe(antes);
  });
});

describe("la vista", () => {
  it("elegir una pestaña la deja en la dirección, con el clic y con las flechas", () => {
    window.history.replaceState(null, "", "/cuentas");
    render(vista());
    fireEvent.click(screen.getByRole("tab", { name: /^Tickets/ }));
    expect(window.location.search).toBe("?pestana=tickets");
    fireEvent.click(screen.getByRole("tab", { name: "Alquiler" }));
    expect(window.location.search).toBe("?pestana=alquiler");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Alquiler" }), { key: "ArrowLeft" });
    expect(window.location.search).toBe("?pestana=casa-editora");
    expect(screen.getByRole("tab", { name: "Casa editora" })).toHaveAttribute("aria-selected", "true");
  });

  it("una pestaña desconocida en la dirección abre la de siempre, sin romper", () => {
    buscar.actual = "pestana=cualquiera";
    render(vista());
    expect(screen.getByRole("tab", { name: "Casa editora" })).toHaveAttribute("aria-selected", "true");
  });

  it("convive con ?colportor=: abre en la pestaña pedida y con ese colportor resaltado en su ciudad", () => {
    const datos = armarCuentasSimuladas(AHORA);
    const id = datos.colportores[0].id;
    const colportor = datos.colportores[0];
    const ciudad = datos.ciudades.find((c) => c.id === colportor.ciudadId)!;
    buscar.actual = `${hrefCuentasDe(id).split("?")[1]}&pestana=alquiler`;
    render(vista(id));
    expect(screen.getByRole("tab", { name: "Alquiler" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText(ciudad.nombre).length).toBeGreaterThan(0);
  });

  it("volver a entrar con la misma dirección reabre en la misma pestaña", () => {
    buscar.actual = "pestana=tickets";
    const { unmount } = render(vista());
    unmount();
    render(vista());
    expect(screen.getByRole("tab", { name: /^Tickets/ })).toHaveAttribute("aria-selected", "true");
  });
});

describe("el esqueleto de carga", () => {
  it.each([
    ["pestana=casa-editora", "Casa editora"],
    ["pestana=alquiler", "Alquiler"],
    ["pestana=tickets&colportor=abc", "Tickets"],
    ["", "Alquiler"],
    ["pestana=cualquiera", "Alquiler"],
  ])("con «%s» marca «%s» activa y solo esa", (direccion, activa) => {
    buscar.actual = direccion;
    render(<CargandoCuentas />);
    for (const rotulo of ["Casa editora", "Alquiler", "Tickets"]) {
      const marcada = /bg-marca/.test(screen.getByText(rotulo).className);
      expect(marcada).toBe(rotulo === activa);
    }
    expect(screen.getByRole("status")).toHaveTextContent("Cargando las cuentas…");
  });
});
