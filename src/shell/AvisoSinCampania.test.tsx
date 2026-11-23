import { act, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import type { ResultadoCampanias, ResumenCoordinador } from "@/datos/shell";
import { RESUMEN_COORDINADOR_SIMULADO } from "@/datos/shell/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { AvisoSinCampania, TEXTO_SIN_CAMPANIA } from "@/shell/AvisoSinCampania";
import { MarcoDelPanel } from "@/shell/MarcoDelPanel";
import { pestanasVisibles } from "@/shell/pestanas";
import { fijarFlags } from "@/test/flags";

vi.mock("next/navigation", () => ({ usePathname: () => "/inicio", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const SIN_CAMPANIA: ResumenCoordinador = { ...RESUMEN_COORDINADOR_SIMULADO, region: "", campania: "Sin campaña", campaniaId: null };

function montarMarco(resumen: ResumenCoordinador = SIN_CAMPANIA, pedirCampanias?: () => Promise<ResultadoCampanias>) {
  fijarFlags({ modoDev: false });
  return render(
    <ProveedorModoDev activo={false}>
      <MarcoDelPanel resumen={resumen} pestanas={pestanasVisibles()} pedirCampanias={pedirCampanias}>
        <p>Contenido de la pestaña</p>
      </MarcoDelPanel>
    </ProveedorModoDev>,
  );
}

describe("AvisoSinCampania · el aviso único de las pestañas (decisión de Cristian, 23/10, «Sin campaña»)", () => {
  it("dice qué pasa y a quién pedir una campaña, con un solo role=status, y es accesible (axe A/AA)", async () => {
    const { container } = render(<AvisoSinCampania />);

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(TEXTO_SIN_CAMPANIA);
    expect(screen.getByText(/Las campañas terminadas no se eligen desde acá\./)).toBeInTheDocument();
    expect(screen.getByText(/pedísela a la administración/)).toBeInTheDocument();
    expect(await violaciones(container)).toEqual([]);
  });

  it("la pestaña le puede dar su margen", () => {
    const { container } = render(<AvisoSinCampania className="m-[22px]" />);
    expect(container.firstElementChild).toHaveClass("m-[22px]");
  });
});

describe("MarcoDelPanel · sin ninguna campaña en curso ni por empezar", () => {
  it("las cinco pestañas muestran el mismo aviso en lugar de su contenido, y el topbar y las pestañas quedan", () => {
    montarMarco();

    expect(within(screen.getByRole("main")).getByRole("status")).toHaveTextContent(TEXTO_SIN_CAMPANIA);
    expect(screen.queryByText("Contenido de la pestaña")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Sin campaña" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Secciones del panel" });
    expect(within(nav).getByRole("link", { name: "Inicio" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Equipo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sin campaña/ })).toBeInTheDocument();
  });

  it("con campaña, la pestaña se ve y no hay aviso", () => {
    montarMarco(RESUMEN_COORDINADOR_SIMULADO);

    expect(screen.getByText("Contenido de la pestaña")).toBeInTheDocument();
    expect(screen.queryByText(TEXTO_SIN_CAMPANIA)).not.toBeInTheDocument();
  });

  it("la lista vacía del topbar dice lo mismo que el aviso, y cerrarla con Esc deja el aviso", async () => {
    montarMarco(SIN_CAMPANIA, async () => ({ ok: true as const, campanias: [] }));
    const boton = screen.getByRole("button", { name: /Sin campaña/ });

    await act(async () => {
      fireEvent.click(boton);
    });
    expect(screen.getAllByText(TEXTO_SIN_CAMPANIA)).toHaveLength(2);

    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? boton, { key: "Escape" });
    });
    expect(screen.getAllByText(TEXTO_SIN_CAMPANIA)).toHaveLength(1);
    expect(screen.queryByText("Contenido de la pestaña")).not.toBeInTheDocument();
  });

  it("es accesible (axe A/AA)", async () => {
    const { container } = montarMarco();
    expect(await violaciones(container)).toEqual([]);
  });
});
