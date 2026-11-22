import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ResultadoCampanias, ResumenCoordinador } from "@/datos/shell";
import { RESUMEN_COORDINADOR_SIMULADO } from "@/datos/shell/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { TEXTO_SIN_CAMPANIA } from "@/shell/AvisoSinCampania";
import { MarcoDelPanel } from "@/shell/MarcoDelPanel";
import { pestanasVisibles } from "@/shell/pestanas";
import { fijarFlags } from "@/test/flags";

/**
 * QA #77 · el aviso único «Sin campaña» (decisión de Cristian, 23/10; canvas 37-06) puesto por el marco del panel: en toda
 * pestaña y subruta, el camino de vuelta cuando llega una campaña, el teclado y el selector del topbar.
 */

let ruta = "/inicio";
vi.mock("next/navigation", () => ({ usePathname: () => ruta, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const SIN_CAMPANIA: ResumenCoordinador = { ...RESUMEN_COORDINADOR_SIMULADO, region: "", campania: "Sin campaña", campaniaId: null };

function Marco({ resumen, pedirCampanias }: { resumen: ResumenCoordinador; pedirCampanias?: () => Promise<ResultadoCampanias> }) {
  return (
    <ProveedorModoDev activo={false}>
      <MarcoDelPanel resumen={resumen} pestanas={pestanasVisibles()} pedirCampanias={pedirCampanias}>
        <p>Contenido de la pestaña</p>
      </MarcoDelPanel>
    </ProveedorModoDev>
  );
}

function montar(resumen: ResumenCoordinador = SIN_CAMPANIA, pedirCampanias?: () => Promise<ResultadoCampanias>) {
  fijarFlags({ modoDev: true, stock: true, cuentas: true });
  return render(<Marco resumen={resumen} pedirCampanias={pedirCampanias} />);
}

const FOCALIZABLES = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

describe("QA #77 · el aviso «Sin campaña» en cada pestaña y subruta", () => {
  it.each(["/inicio", "/equipo", "/equipo/anadir", "/ciudades", "/stock", "/stock/pedidos", "/stock/precios", "/cuentas", "/reportes", "/reportes/horas"])(
    "%s: muestra el mismo aviso y nunca el contenido de la página",
    (r) => {
      ruta = r;
      montar();

      const main = screen.getByRole("main");
      expect(within(main).getByRole("status")).toHaveTextContent(TEXTO_SIN_CAMPANIA);
      expect(within(main).getByText(/pedísela a la administración/)).toBeInTheDocument();
      expect(within(main).queryByText("Contenido de la pestaña")).not.toBeInTheDocument();
    },
  );

  it("el aviso no mete nada tabulable en el contenido: el teclado sigue por el topbar y no hay trampas", () => {
    montar();

    expect(screen.getByRole("main").querySelectorAll(FOCALIZABLES)).toHaveLength(0);
    const nav = screen.getByRole("navigation", { name: "Secciones del panel" });
    expect(within(nav).getAllByRole("link").length).toBeGreaterThanOrEqual(5);
  });

  it("llega una campaña (el resumen cambia): el aviso se va y la página vuelve, sin recargar el marco", () => {
    const { rerender } = montar();
    expect(screen.queryByText("Contenido de la pestaña")).not.toBeInTheDocument();

    rerender(<Marco resumen={RESUMEN_COORDINADOR_SIMULADO} />);

    expect(screen.getByText("Contenido de la pestaña")).toBeInTheDocument();
    expect(screen.queryByText(TEXTO_SIN_CAMPANIA)).not.toBeInTheDocument();
  });

  it("la campaña termina con el panel abierto (el resumen pasa a null): el aviso reemplaza a la página", () => {
    const { rerender } = montar(RESUMEN_COORDINADOR_SIMULADO);
    expect(screen.getByText("Contenido de la pestaña")).toBeInTheDocument();

    rerender(<Marco resumen={SIN_CAMPANIA} />);

    expect(within(screen.getByRole("main")).getByRole("status")).toHaveTextContent(TEXTO_SIN_CAMPANIA);
    expect(screen.queryByText("Contenido de la pestaña")).not.toBeInTheDocument();
  });

  it("sin campaña, la lista del topbar con la lista caída ofrece «Reintentar» y el aviso del contenido queda", async () => {
    const pedir = vi.fn<() => Promise<ResultadoCampanias>>().mockResolvedValueOnce({ ok: false, causa: "sin-conexion" } as ResultadoCampanias);
    montar(SIN_CAMPANIA, pedir);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Sin campaña/ }));
    });

    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(within(screen.getByRole("main")).getByRole("status")).toHaveTextContent(TEXTO_SIN_CAMPANIA);
  });

  it("el aviso no repite la palabra «Crear una campaña» (esa pantalla todavía no está diseñada)", () => {
    montar();
    expect(screen.queryByText(/crear una campaña/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /crear/i })).not.toBeInTheDocument();
  });
});
