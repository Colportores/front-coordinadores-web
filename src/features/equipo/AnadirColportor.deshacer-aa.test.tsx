import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResultadoInscripcion } from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { AnadirColportor, MS_DESHACER } from "@/features/equipo/AnadirColportor";
import { tieneFocoVisible } from "@/features/equipo/foco-visible";

const navegacion = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navegacion.push }) }));

/**
 * «Deshacer AA» (decisión de Cristian, 21/10, WCAG 2.2.1): mientras el «Deshacer» tiene el foco de teclado o de lector, los
 * 8 s no corren; al soltarlo siguen con lo que faltaba. Sin foco visible (un clic del mouse) el plazo corre como siempre.
 */

function montar() {
  const inscribir = vi.fn<(id: string) => Promise<ResultadoInscripcion>>(async () => ({ ok: true }));
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

describe("AnadirColportor · «Deshacer» con el foco (AA)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(tieneFocoVisible).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(tieneFocoVisible).mockReturnValue(false);
  });

  it("al aparecer el aviso el foco va a «Deshacer» y los 8 s no corren mientras lo tenga", async () => {
    const { inscribir } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));

    expect(deshacer("Gonzalo Sosa")).toHaveFocus();
    await pasar(MS_DESHACER * 5);

    expect(inscribir).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Añadiste a Gonzalo Sosa");
  });

  it("al soltar el foco sigue con lo que faltaba, no con 8 s nuevos", async () => {
    const { inscribir } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));
    const buscador = screen.getByRole("textbox", { name: "Buscar por email o nombre" });
    // Suelta el foco, corren 3 s y lo vuelve a poner en «Deshacer»: le quedan 5 s.
    await act(async () => buscador.focus());
    await pasar(3000);
    await act(async () => deshacer("Gonzalo Sosa").focus());
    // Pasa un buen rato con el foco ahí: el plazo no avanza.
    await pasar(60_000);
    expect(inscribir).not.toHaveBeenCalled();

    await act(async () => buscador.focus());
    await pasar(MS_DESHACER - 3000 - 1);
    expect(inscribir).not.toHaveBeenCalled();

    await pasar(1);

    expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-gonzalo-sosa");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("«Deshacer» con el plazo en pausa cancela: nunca se manda", async () => {
    const { inscribir } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));

    await tocar(deshacer("Gonzalo Sosa"));
    await pasar(MS_DESHACER * 3);

    expect(inscribir).not.toHaveBeenCalled();
    expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();
  });

  it("Esc sobre el aviso devuelve el foco a la fila y el plazo vuelve a correr", async () => {
    const { inscribir } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await pasar(2000);
    expect(inscribir).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(deshacer("Gonzalo Sosa"), { key: "Escape" });
    });
    expect(deshacer("Gonzalo Sosa")).not.toHaveFocus();
    await pasar(MS_DESHACER - 1);
    expect(inscribir).not.toHaveBeenCalled();
    await pasar(1);

    expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-gonzalo-sosa");
  });

  it("con el plazo en pausa, Esc desde otro lado manda ya (nada queda sin mandar)", async () => {
    const { inscribir } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));
    expect(deshacer("Gonzalo Sosa")).toHaveFocus();

    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Escape" });
    });

    expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-gonzalo-sosa");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("si la persona se va de la vista con el plazo en pausa, la inscripción se manda", async () => {
    const { inscribir, unmount } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));
    expect(deshacer("Gonzalo Sosa")).toHaveFocus();
    await pasar(MS_DESHACER * 2);
    expect(inscribir).not.toHaveBeenCalled();

    unmount();

    expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-gonzalo-sosa");
  });

  it("dos añadidos seguidos: el aviso nuevo toma el foco y el anterior vuelve a correr con lo que le quedaba", async () => {
    const { inscribir } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await pasar(1000);
    // La persona va a la fila de la segunda (el foco sale del primer «Deshacer») y la añade.
    await act(async () => anadirEnFila("Valentina Bentancor").focus());
    await tocar(anadirEnFila("Valentina Bentancor"));
    expect(deshacer("Valentina Bentancor")).toHaveFocus();

    // El primero vuelve a correr con lo que le quedaba (8 s: estaba en pausa desde que apareció); el segundo sigue en pausa.
    await pasar(MS_DESHACER - 1);
    expect(inscribir).not.toHaveBeenCalled();
    await pasar(1);
    expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-gonzalo-sosa");
    expect(screen.getByRole("status")).toHaveTextContent("Añadiste a Valentina Bentancor");

    await pasar(MS_DESHACER * 3);
    expect(inscribir).toHaveBeenCalledTimes(1);
  });

  it("si el envío de una cuenta con el plazo en pausa falla, el botón vuelve a habilitarse y avisa", async () => {
    const inscribir = vi.fn(async (): Promise<ResultadoInscripcion> => ({ ok: false, mensaje: "La cuenta está suspendida." }));
    render(
      <AnadirColportor
        datos={DATOS_ANADIR_COLPORTOR_SIMULADO}
        inscribir={inscribir}
        buscar={(texto, despuesDe) => fuenteEquipoSimulada.buscarCandidatos("c", texto, despuesDe)}
      />,
    );
    await tocar(anadirEnFila("Gonzalo Sosa"));

    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Escape" });
    });

    expect(inscribir).toHaveBeenCalledOnce();
    expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("La cuenta está suspendida.");
  });
});

describe("AnadirColportor · «Deshacer» sin foco de teclado", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("con un clic del mouse (el foco no es visible) el plazo corre y se manda a los 8 s", async () => {
    const { inscribir } = montar();
    await tocar(anadirEnFila("Gonzalo Sosa"));
    expect(deshacer("Gonzalo Sosa")).toHaveFocus();

    await pasar(MS_DESHACER - 1);
    expect(inscribir).not.toHaveBeenCalled();
    await pasar(1);

    expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-gonzalo-sosa");
  });
});
