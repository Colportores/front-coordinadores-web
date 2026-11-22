import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResultadoQuitarDeCampania } from "@/datos/equipo/contrato";
import {
  hayTrabajoPendiente,
  reiniciarTrabajoPendiente,
} from "@/shell/trabajo-pendiente";

import type { AccionesEquipo } from "./acciones";
import { datosDePrueba } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";

/**
 * QA de #184 (PR #185, HU-CAM-005 «Remover» sin reasignar). Complementa `EquipoVista.quitar-de-campania.test.tsx`: lo que
 * deja la vista cuando quitan a alguien sin zona (aparece en todas las ciudades), las otras pestañas, los reintentos que
 * cambian de falla, la reentrada al diálogo y el teclado. Sin artboard propio: sigue vista 24 («Quitar») y vista 39.
 */

type Quitar = (colportorId: string) => Promise<ResultadoQuitarDeCampania>;

function crearAcciones(quitar?: Quitar) {
  const quitarDeCampania = vi.fn<Quitar>(
    quitar ?? (async () => ({ ok: true })),
  );
  const acciones: AccionesEquipo = {
    jornadasParaAcompanar: vi.fn(async () => ({
      ok: true as const,
      jornadas: [],
    })),
    registrarAcompanamiento: vi.fn(async () => ({
      ok: false as const,
      mensaje: "no",
    })),
    elegirCarrera: vi.fn(async () => ({ ok: false as const, mensaje: "no" })),
    asignarTipoDeBeca: vi.fn(async () => ({
      ok: false as const,
      mensaje: "no",
    })),
    quitarDeCampania,
  };
  return { acciones, quitarDeCampania };
}

function mostrar(acciones: AccionesEquipo = crearAcciones().acciones) {
  const vista = render(
    <EquipoVista
      datos={datosDePrueba({ sePuedeQuitar: true })}
      acciones={acciones}
    />,
  );
  return { usuario: userEvent.setup(), ...vista };
}

const dialogo = () => screen.getByRole("alertdialog");
const botonDeFila = (nombre: string) =>
  screen.getByRole("button", { name: `Quitar de la campaña a ${nombre}` });
const filaDe = (nombre: string) =>
  screen.queryByRole("rowheader", { name: nombre });
const ROJO = "Sí, quitar de la campaña";

async function hastaConfirmar(
  usuario: ReturnType<typeof userEvent.setup>,
  nombre: string,
) {
  await usuario.click(botonDeFila(nombre));
  await usuario.click(
    within(dialogo()).getByRole("button", { name: "Seguir" }),
  );
}

let enLinea = true;
beforeEach(() => {
  enLinea = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => enLinea);
  reiniciarTrabajoPendiente();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("QA #184 · quitar a alguien sin zona (figura en «Sin zona» de todas las ciudades)", () => {
  it("quitar a Rocío desde Rivera la saca también de Artigas, de Bella Unión y de «Todas», y apaga el aviso de «sin zona»", async () => {
    const { acciones } = crearAcciones();
    const { usuario } = mostrar(acciones);
    expect(filaDe("Rocío Benítez")).toBeInTheDocument();

    await hastaConfirmar(usuario, "Rocío Benítez");
    await usuario.click(within(dialogo()).getByRole("button", { name: ROJO }));

    expect(filaDe("Rocío Benítez")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Rocío Benítez no tiene zona asignada/),
    ).not.toBeInTheDocument();
    for (const ciudad of ["Artigas", "Bella Unión", "Rivera"]) {
      await usuario.click(
        screen.getAllByRole("button", { name: new RegExp(`^${ciudad}`) })[0]!,
      );
      expect(filaDe("Rocío Benítez")).not.toBeInTheDocument();
    }
  });

  it("el aviso de «ya no está» no promete nada sobre otra persona y nombra a quien se quitó, también sin zona", async () => {
    const { usuario } = mostrar();

    await hastaConfirmar(usuario, "Rocío Benítez");
    await usuario.click(within(dialogo()).getByRole("button", { name: ROJO }));

    expect(
      screen.getByText(
        /^Rocío Benítez ya no está en la campaña y quedó sin zona\./,
      ),
    ).toHaveFocus();
  });
});

describe("QA #184 · la baja se mantiene en las otras pestañas", () => {
  it("quitada en Zonas, no figura en Becas ni en Acompañamientos", async () => {
    const { usuario } = mostrar();
    await hastaConfirmar(usuario, "Florencia Pintos");
    await usuario.click(within(dialogo()).getByRole("button", { name: ROJO }));

    for (const pestana of ["Becas", "Acompañamientos"]) {
      await usuario.click(screen.getByRole("button", { name: pestana }));
      expect(filaDe("Florencia Pintos")).not.toBeInTheDocument();
      expect(filaDe("Emiliano Sosa")).toBeInTheDocument();
      // La pestaña no ofrece quitar: solo Zonas (la HU lo pide «en Equipo», el PR lo deja en Zonas).
      expect(
        screen.queryByRole("button", { name: /Quitar de la campaña/ }),
      ).not.toBeInTheDocument();
    }
  });
});

describe("QA #184 · reintentos y reentrada al diálogo", () => {
  it("falla de red, luego el reintento es rechazado por la base: el aviso cambia al de la base y solo queda «Cerrar»", async () => {
    let vez = 0;
    const { acciones, quitarDeCampania } = crearAcciones(async () => {
      vez += 1;
      if (vez === 1) throw new Error("Failed to fetch");
      return {
        ok: false,
        mensaje: "La campaña ya terminó: lo cerrado no se toca.",
      };
    });
    const { usuario } = mostrar(acciones);
    await hastaConfirmar(usuario, "Florencia Pintos");

    await usuario.click(within(dialogo()).getByRole("button", { name: ROJO }));
    await usuario.click(
      within(dialogo()).getByRole("button", { name: "Reintentar" }),
    );

    expect(quitarDeCampania).toHaveBeenCalledTimes(2);
    expect(within(dialogo()).getByRole("alert")).toHaveTextContent(
      "La campaña ya terminó: lo cerrado no se toca.",
    );
    expect(
      within(dialogo()).queryByText(/Necesitás conexión/),
    ).not.toBeInTheDocument();
    expect(
      within(dialogo())
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Cerrar"]);
    expect(filaDe("Florencia Pintos")).toBeInTheDocument();
  });

  it("falla de red, «Volver» y «Seguir» de nuevo: el aviso viejo no queda pegado y el botón rojo vuelve a decir la acción entera", async () => {
    const { acciones } = crearAcciones(async () => {
      throw new Error("Failed to fetch");
    });
    const { usuario } = mostrar(acciones);
    await hastaConfirmar(usuario, "Florencia Pintos");
    await usuario.click(within(dialogo()).getByRole("button", { name: ROJO }));
    expect(within(dialogo()).getByRole("alert")).toBeInTheDocument();

    await usuario.click(
      within(dialogo()).getByRole("button", { name: "Volver" }),
    );
    expect(within(dialogo()).queryByRole("alert")).not.toBeInTheDocument();
    await usuario.click(
      within(dialogo()).getByRole("button", { name: "Seguir" }),
    );

    expect(within(dialogo()).queryByRole("alert")).not.toBeInTheDocument();
    expect(
      within(dialogo()).getByRole("button", { name: ROJO }),
    ).toBeInTheDocument();
  });

  it("tras un rechazo y «Cerrar», abrir a otra persona arranca limpio: paso 1, sin aviso y con el foco en «Cancelar»", async () => {
    const { acciones } = crearAcciones(async () => ({
      ok: false,
      mensaje:
        "No se pudo quitar a la persona de la campaña. Probá de nuevo más tarde.",
    }));
    const { usuario } = mostrar(acciones);
    await hastaConfirmar(usuario, "Florencia Pintos");
    await usuario.click(within(dialogo()).getByRole("button", { name: ROJO }));
    await usuario.click(
      within(dialogo()).getByRole("button", { name: "Cerrar" }),
    );

    await usuario.click(botonDeFila("Emiliano Sosa"));

    expect(dialogo()).toHaveAccessibleName(
      "Quitar a Emiliano Sosa de la campaña",
    );
    expect(within(dialogo()).queryByRole("alert")).not.toBeInTheDocument();
    expect(
      within(dialogo()).getByRole("button", { name: "Cancelar" }),
    ).toHaveFocus();
  });

  it("tras quitar a uno, el aviso se reemplaza por el del siguiente que falla: no queda un «ya no está» de otra persona", async () => {
    let vez = 0;
    const { acciones } = crearAcciones(async () => {
      vez += 1;
      if (vez === 2) throw new Error("Failed to fetch");
      return { ok: true };
    });
    const { usuario } = mostrar(acciones);
    await hastaConfirmar(usuario, "Florencia Pintos");
    await usuario.click(within(dialogo()).getByRole("button", { name: ROJO }));
    expect(
      screen.getByText(/^Florencia Pintos ya no está/),
    ).toBeInTheDocument();

    await hastaConfirmar(usuario, "Emiliano Sosa");
    await usuario.click(within(dialogo()).getByRole("button", { name: ROJO }));

    // Mientras el segundo no se quita, el diálogo dice qué pasó; Florencia sigue fuera.
    expect(within(dialogo()).getByRole("alert")).toHaveTextContent(
      /Necesitás conexión para quitar a Emiliano Sosa/,
    );
    expect(filaDe("Florencia Pintos")).not.toBeInTheDocument();
    expect(filaDe("Emiliano Sosa")).toBeInTheDocument();
  });

  it("sin conexión desde que se abre: el botón rojo nace deshabilitado, con el aviso y sin mandar nada", async () => {
    enLinea = false;
    const { acciones, quitarDeCampania } = crearAcciones();
    const { usuario } = mostrar(acciones);

    await hastaConfirmar(usuario, "Florencia Pintos");

    const rojo = within(dialogo()).getByRole("button", { name: ROJO });
    expect(rojo).toHaveAttribute("aria-disabled", "true");
    expect(within(dialogo()).getByRole("alert")).toHaveTextContent(
      "Necesitás conexión para quitar a Florencia Pintos de la campaña.",
    );
    await usuario.click(rojo);
    await usuario.keyboard("{Enter}");
    expect(quitarDeCampania).not.toHaveBeenCalled();
    expect(
      within(dialogo()).getByRole("button", { name: "Volver" }),
    ).toBeInTheDocument();
  });

  it("se corta la conexión con el envío en camino y contesta bien: la fila se va igual y el diálogo no queda abierto", async () => {
    let resolver!: (r: ResultadoQuitarDeCampania) => void;
    const { acciones } = crearAcciones(
      () => new Promise<ResultadoQuitarDeCampania>((res) => (resolver = res)),
    );
    const { usuario } = mostrar(acciones);
    await hastaConfirmar(usuario, "Florencia Pintos");
    await usuario.click(within(dialogo()).getByRole("button", { name: ROJO }));

    enLinea = false;
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    // En camino no se muestra el aviso de sin conexión: el botón sigue diciendo «Quitando…».
    expect(
      within(dialogo()).getByRole("button", { name: "Quitando…" }),
    ).toBeInTheDocument();
    await act(async () => resolver({ ok: true }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(filaDe("Florencia Pintos")).not.toBeInTheDocument();
    expect(hayTrabajoPendiente()).toBe(false);
  });
});

describe("QA #184 · teclado", () => {
  it("Enter sostenido en el botón rojo manda una sola vez (las repeticiones no vuelven a apretar)", async () => {
    let resolver!: (r: ResultadoQuitarDeCampania) => void;
    const { acciones, quitarDeCampania } = crearAcciones(
      () => new Promise<ResultadoQuitarDeCampania>((res) => (resolver = res)),
    );
    const { usuario } = mostrar(acciones);
    await hastaConfirmar(usuario, "Florencia Pintos");
    within(dialogo()).getByRole("button", { name: ROJO }).focus();

    await usuario.keyboard("{Enter>3/}");
    await usuario.keyboard("{Enter}{Enter}");

    expect(quitarDeCampania).toHaveBeenCalledTimes(1);
    await act(async () => resolver({ ok: true }));
  });

  it("Esc en el segundo paso cierra todo (no vuelve al primero) y el foco queda en el botón de la fila", async () => {
    const { acciones, quitarDeCampania } = crearAcciones();
    const { usuario } = mostrar(acciones);
    await hastaConfirmar(usuario, "Sofía Cabral");

    await usuario.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(botonDeFila("Sofía Cabral")).toHaveFocus();
    expect(quitarDeCampania).not.toHaveBeenCalled();
  });

  it("Shift+Tab desde el primer botón da la vuelta al último y no sale al resto de la pantalla", async () => {
    const { usuario } = mostrar();
    await usuario.click(botonDeFila("Sofía Cabral"));

    await usuario.tab({ shift: true });

    expect(
      within(dialogo()).getByRole("button", { name: "Seguir" }),
    ).toHaveFocus();
  });
});

describe("QA #184 · privacidad y ruido", () => {
  it("el flujo completo (falla, reintento, éxito) no escribe nada en la consola", async () => {
    const consola = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "info"),
    ];
    let vez = 0;
    const { acciones } = crearAcciones(async () => {
      vez += 1;
      if (vez === 1) throw new Error("Failed to fetch");
      return { ok: true };
    });
    const { usuario } = mostrar(acciones);
    await hastaConfirmar(usuario, "Florencia Pintos");
    await usuario.click(within(dialogo()).getByRole("button", { name: ROJO }));
    await usuario.click(
      within(dialogo()).getByRole("button", { name: "Reintentar" }),
    );

    for (const espia of consola) expect(espia).not.toHaveBeenCalled();
  });
});

describe("QA #184 · sesión vencida", () => {
  // Convención de #41 (P3): sin sesión «Reintentar» no sirve y el aviso ofrece «Entrar de nuevo» (`EnlaceEntrarDeNuevo`).
  it.skip("QA #185: con la sesión vencida el diálogo dice «Tu sesión venció» pero solo deja «Cerrar»: falta «Entrar de nuevo» (#41 P3)", async () => {
    const { acciones } = crearAcciones(async () => ({
      ok: false,
      mensaje: "Tu sesión venció. Volvé a entrar para seguir.",
      sesionVencida: true,
    }));
    const { usuario } = mostrar(acciones);
    await hastaConfirmar(usuario, "Florencia Pintos");

    await usuario.click(within(dialogo()).getByRole("button", { name: ROJO }));

    expect(within(dialogo()).getByRole("alert")).toHaveTextContent(
      "Tu sesión venció",
    );
    expect(
      within(dialogo()).getByRole("link", { name: "Entrar de nuevo" }),
    ).toHaveAttribute("href", expect.stringContaining("/acceso"));
  });
});
