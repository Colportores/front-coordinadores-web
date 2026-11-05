import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CampaniaElegible, ResultadoCampanias, ResumenCoordinador } from "@/datos/shell/contrato";
import { COOKIE_CAMPANIA_ELEGIDA } from "@/shell/campania-elegida";
import { SelectorDeCampania, TEXTO_ERROR_CAMPANIAS } from "@/shell/SelectorDeCampania";
import { registrarEnvio, registrarFuente } from "@/shell/trabajo-pendiente";

/**
 * QA de la vista 37 (#70): casos límite que el PR no cubre. Los que llevan `skip` documentan un hallazgo; el implementador
 * saca el `skip` cuando lo arregla.
 */

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const PRIMAVERA: CampaniaElegible = {
  id: "c-primavera",
  nombre: "Primavera 2026",
  ciudades: ["Montevideo", "Las Piedras"],
  fechaInicio: "2026-09-15",
  fechaFin: "2026-12-15",
  estado: "en-curso",
};
const VERANO: CampaniaElegible = {
  id: "c-verano",
  nombre: "Verano 2027",
  ciudades: ["Maldonado"],
  fechaInicio: "2027-01-04",
  fechaFin: null,
  estado: "por-empezar",
};
const RESUMEN: ResumenCoordinador = {
  nombre: "Marta",
  iniciales: "MP",
  region: "Montevideo · Las Piedras",
  campania: "Primavera 2026",
  campaniaId: PRIMAVERA.id,
};
const lista = (...campanias: CampaniaElegible[]): ResultadoCampanias => ({ ok: true, campanias });

function selector(): HTMLButtonElement {
  const boton = document.querySelector<HTMLButtonElement>("button[aria-haspopup='listbox']");
  if (!boton) throw new Error("no está el botón del selector de campaña");
  return boton;
}
async function abrir() {
  await act(async () => {
    fireEvent.click(selector());
  });
}
async function pulsar(elemento: Element, tecla: string) {
  await act(async () => {
    fireEvent.keyDown(elemento, { key: tecla });
  });
}

beforeEach(() => {
  router.refresh.mockClear();
  document.cookie = `${COOKIE_CAMPANIA_ELEGIDA}=; Max-Age=0; Path=/`;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("QA · foco", () => {
  it(
    "QA #70: si una inscripción falla al elegir con el teclado, el foco queda en el botón (no se pierde en <body>)",
    async () => {
      const baja = registrarFuente({ hayPorMandar: () => true, confirmar: async () => false });
      render(<SelectorDeCampania resumen={RESUMEN} pedirCampanias={async () => lista(PRIMAVERA, VERANO)} />);
      await abrir();
      const listbox = screen.getByRole("listbox");
      expect(document.activeElement).toBe(listbox);
      await pulsar(listbox, "ArrowDown");
      await pulsar(listbox, "Enter");

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(selector());
      baja();
    },
  );

  it.skip("QA #70: si la persona ya movió el foco a otro lado mientras se esperaba, aplicar la elección no se lo roba", async () => {
    let contestar!: () => void;
    registrarEnvio(
      new Promise<void>((resolver) => {
        contestar = resolver;
      }),
    );
    render(
      <>
        <SelectorDeCampania resumen={RESUMEN} pedirCampanias={async () => lista(PRIMAVERA, VERANO)} />
        <input aria-label="Campo de la pestaña" />
      </>,
    );
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: /Verano 2027/ }));
    });
    // Esperando las inscripciones: la persona sigue con lo suyo.
    const campo = screen.getByLabelText("Campo de la pestaña");
    await act(async () => {
      fireEvent.pointerDown(campo);
      campo.focus();
    });
    expect(document.activeElement).toBe(campo);

    await act(async () => {
      contestar();
    });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(campo);
  });
});

describe("QA · casos límite", () => {
  it("«Reintentar» tocado dos veces seguidas no deja nada trabado: termina en la lista", async () => {
    let n = 0;
    const pedir = vi.fn(async (): Promise<ResultadoCampanias> => {
      n++;
      return n === 1 ? { ok: false, causa: "error" } : lista(PRIMAVERA, VERANO);
    });
    render(<SelectorDeCampania resumen={RESUMEN} pedirCampanias={pedir} />);
    await abrir();
    expect(screen.getByText(TEXTO_ERROR_CAMPANIAS)).toBeInTheDocument();
    const reintentar = screen.getByRole("button", { name: "Reintentar" });
    await act(async () => {
      fireEvent.click(reintentar);
      fireEvent.click(reintentar);
    });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.queryByText(TEXTO_ERROR_CAMPANIAS)).not.toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("falla de la lista y la persona cierra con Esc: el botón queda usable y reabre pidiendo de nuevo", async () => {
    const pedir = vi
      .fn<() => Promise<ResultadoCampanias>>()
      .mockResolvedValueOnce({ ok: false, causa: "sin-conexion" })
      .mockResolvedValueOnce(lista(PRIMAVERA));
    render(<SelectorDeCampania resumen={RESUMEN} pedirCampanias={pedir} />);
    await abrir();
    await pulsar(screen.getByRole("button", { name: "Reintentar" }), "Escape");
    expect(selector()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(selector());
    await abrir();
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("option", { name: /Primavera 2026/ })).toBeInTheDocument();
  });

  it("nombres con HTML, emoji y sin espacios se muestran como texto y el aviso los dice tal cual", async () => {
    const raro: CampaniaElegible = {
      ...VERANO,
      id: "c-raro",
      nombre: `<img src=x onerror=alert(1)> 🌞 ${"a".repeat(120)}`,
      ciudades: ["Pan de Azúcar 🏖️"],
    };
    render(<SelectorDeCampania resumen={RESUMEN} pedirCampanias={async () => lista(PRIMAVERA, raro)} />);
    await abrir();
    expect(document.querySelector("img")).toBeNull();
    const opcion = screen.getByRole("option", { name: /onerror/ });
    expect(opcion).toHaveTextContent("🌞");
    // El texto largo sin espacios se parte en vez de ensanchar la caja.
    expect(opcion.querySelector(".wrap-anywhere")).not.toBeNull();
    await act(async () => {
      fireEvent.click(opcion);
    });
    expect(document.querySelector("[aria-live='polite']")?.textContent).toBe(`Ahora ves ${raro.nombre}.`);
    expect(document.querySelector("img")).toBeNull();
  });

  it("una sola campaña elegible y la que se ve no está en la lista (terminó): se puede elegir la que hay", async () => {
    render(<SelectorDeCampania resumen={RESUMEN} pedirCampanias={async () => lista(VERANO)} />);
    await abrir();
    expect(screen.getByRole("option", { name: /Verano 2027/ })).toHaveAttribute("aria-selected", "false");
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: /Verano 2027/ }));
    });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(selector()).toHaveTextContent("Verano 2027");
  });

  it("50 campañas: Fin llega a la última y Enter la elige", async () => {
    const muchas = Array.from({ length: 50 }, (_, i): CampaniaElegible => ({ ...PRIMAVERA, id: `c-${i}`, nombre: `Campaña ${i}` }));
    render(<SelectorDeCampania resumen={{ ...RESUMEN, campaniaId: "c-0" }} pedirCampanias={async () => lista(...muchas)} />);
    await abrir();
    const listbox = screen.getByRole("listbox");
    await pulsar(listbox, "End");
    await pulsar(listbox, "Enter");
    expect(selector()).toHaveTextContent("Campaña 49");
  });

  it("el botón y el aviso no llevan datos personales: el id de campaña es lo único que va a la cookie", async () => {
    render(<SelectorDeCampania resumen={RESUMEN} pedirCampanias={async () => lista(PRIMAVERA, VERANO)} />);
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: /Verano 2027/ }));
    });
    const cookie = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_CAMPANIA_ELEGIDA}=`));
    expect(cookie).toBe(`${COOKIE_CAMPANIA_ELEGIDA}=c-verano`);
    expect(document.cookie).not.toMatch(/Marta|Verano 2027/);
  });
});
