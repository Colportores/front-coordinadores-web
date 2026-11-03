import { act, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResultadoInscripcion } from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { AnadirColportor, MS_DESHACER } from "@/features/equipo/AnadirColportor";
import { tieneFocoVisible } from "@/features/equipo/foco-visible";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/**
 * QA de «Deshacer AA» (PR #102, issue #19), 27/10: casos límite que `AnadirColportor.deshacer-aa.test.tsx` no cubre
 * (pausas repetidas, «Deshacer» a mitad de plazo, varios avisos al salir, falla de red con el plazo en pausa, ventana que
 * pierde y recupera el foco, accesibilidad del aviso con el foco). El foco visible se simula con `tieneFocoVisible`:
 * jsdom no distingue teclado de mouse; el comportamiento real se verificó en Chromium (ver el comentario del PR).
 */

function montar(inscribirImpl?: (id: string) => Promise<ResultadoInscripcion>) {
  const inscribir = vi.fn<(id: string) => Promise<ResultadoInscripcion>>(inscribirImpl ?? (async () => ({ ok: true })));
  const vista = render(
    <AnadirColportor
      datos={DATOS_ANADIR_COLPORTOR_SIMULADO}
      inscribir={inscribir}
      buscar={(texto, despuesDe) => fuenteEquipoSimulada.buscarCandidatos("c", texto, despuesDe)}
    />,
  );
  return { inscribir, ...vista };
}

async function pasar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function tocar(elemento: HTMLElement) {
  await act(async () => {
    fireEvent.click(elemento);
  });
}

const anadirEnFila = (nombre: string) => screen.getByRole("button", { name: `Añadir a ${nombre}` });
const deshacer = (nombre: string) => screen.getByRole("button", { name: `Deshacer: ${nombre}` });
const buscador = () => screen.getByRole("textbox", { name: "Buscar por email o nombre" });

describe("QA #19 · «Deshacer AA»: pausas y plazos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(tieneFocoVisible).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(tieneFocoVisible).mockReturnValue(false);
  });

  it("con varias pausas, solo cuentan los 8 s corridos: 3 s + 2 s + 3 s mandan, ni un ms antes", async () => {
    const { inscribir } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa")); // el foco está en «Deshacer»: en pausa desde el principio
    await act(async () => buscador().focus());
    await pasar(3000);
    await act(async () => deshacer("Gonzalo Sosa").focus());
    await pasar(20_000);
    await act(async () => buscador().focus());
    await pasar(2000);
    await act(async () => deshacer("Gonzalo Sosa").focus());
    await pasar(20_000);
    await act(async () => buscador().focus());
    await pasar(MS_DESHACER - 5000 - 1);
    expect(inscribir).not.toHaveBeenCalled();

    await pasar(1);

    expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-gonzalo-sosa");
  });

  it("«Deshacer» a mitad del plazo reanudado cancela: no se manda nunca y la fila vuelve a «Añadir»", async () => {
    const { inscribir } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await act(async () => buscador().focus());
    await pasar(3000);
    // Lo tocan con el mouse sin foco visible (corre) y lo aprietan antes de que venza.
    vi.mocked(tieneFocoVisible).mockReturnValue(false);
    await act(async () => deshacer("Gonzalo Sosa").focus());
    await pasar(1000);
    await tocar(deshacer("Gonzalo Sosa"));
    await pasar(MS_DESHACER * 3);

    expect(inscribir).not.toHaveBeenCalled();
    expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();
    expect(screen.queryByText(/Añadiste a Gonzalo Sosa/)).not.toBeInTheDocument();
  });

  it("un foco que se va y vuelve a «Deshacer» (la ventana pierde el foco y lo recupera) no manda dos veces ni deja el plazo vivo", async () => {
    const { inscribir } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));
    const boton = deshacer("Gonzalo Sosa");
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        fireEvent.blur(boton);
      });
      await pasar(1000);
      await act(async () => {
        fireEvent.focus(boton);
      });
    }
    await pasar(MS_DESHACER * 3);
    expect(inscribir).not.toHaveBeenCalled();

    await act(async () => buscador().focus());
    await pasar(MS_DESHACER - 3000 - 1);
    expect(inscribir).not.toHaveBeenCalled();
    await pasar(1);
    await pasar(MS_DESHACER * 3);

    expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-gonzalo-sosa");
  });

  it("con dos avisos y el foco en el más nuevo, Esc desde el body manda los dos y ninguno queda sin mandar", async () => {
    const { inscribir } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await act(async () => anadirEnFila("Valentina Bentancor").focus());
    await tocar(anadirEnFila("Valentina Bentancor"));
    expect(deshacer("Valentina Bentancor")).toHaveFocus();

    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Escape" });
    });

    expect(inscribir).toHaveBeenCalledTimes(2);
    expect(inscribir).toHaveBeenCalledWith("usr-gonzalo-sosa");
    expect(inscribir).toHaveBeenCalledWith("usr-valentina-bentancor");
  });

  it("irse de la vista con un aviso en pausa y otro corriendo manda los dos", async () => {
    const { inscribir, unmount } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await act(async () => anadirEnFila("Valentina Bentancor").focus());
    await tocar(anadirEnFila("Valentina Bentancor")); // Gonzalo reanuda y corre; Valentina queda en pausa
    await pasar(2000);
    expect(inscribir).not.toHaveBeenCalled();

    unmount();

    expect(inscribir).toHaveBeenCalledTimes(2);
  });
});

describe("QA #19 · «Deshacer AA»: fallas con el plazo en pausa", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(tieneFocoVisible).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(tieneFocoVisible).mockReturnValue(false);
  });

  it("si la llamada se cae al mandar tras la pausa: «Necesitás conexión para añadir a …», botón habilitado y se puede reintentar", async () => {
    let cae = true;
    const { inscribir } = montar(async () => {
      if (cae) throw new Error("red");
      return { ok: true };
    });
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Escape" });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión para añadir a Gonzalo Sosa");
    expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();

    cae = false;
    // Con teclado o mouse el botón recibe el foco antes del toque (fireEvent.click no lo mueve).
    await act(async () => anadirEnFila("Gonzalo Sosa").focus());
    await tocar(anadirEnFila("Gonzalo Sosa"));
    expect(deshacer("Gonzalo Sosa")).toHaveFocus();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Escape" });
    });

    expect(inscribir).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un rechazo del servidor de una cuenta con el plazo en pausa no frena el aviso de otra que sigue en plazo", async () => {
    const { inscribir } = montar(async (id) =>
      id === "usr-gonzalo-sosa" ? { ok: false, mensaje: "La cuenta está suspendida." } : { ok: true },
    );
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await act(async () => anadirEnFila("Valentina Bentancor").focus());
    await tocar(anadirEnFila("Valentina Bentancor"));
    await pasar(MS_DESHACER);
    expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-gonzalo-sosa");

    expect(screen.getByRole("alert")).toHaveTextContent("La cuenta está suspendida.");
    expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Añadiste a Valentina Bentancor");
  });
});

describe("QA #19 · «Deshacer AA»: accesibilidad del aviso con el foco", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(tieneFocoVisible).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(tieneFocoVisible).mockReturnValue(false);
  });

  it("el aviso en pausa es una región de estado con «Deshacer» enfocable y sin violaciones axe A/AA", async () => {
    const { container } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await pasar(MS_DESHACER * 2);

    expect(screen.getByRole("status")).toHaveTextContent("Añadiste a Gonzalo Sosa a Verano 2026.");
    expect(deshacer("Gonzalo Sosa")).toHaveFocus();
    vi.useRealTimers();
    const resultado = await axe.run(container, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] });
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });
});
