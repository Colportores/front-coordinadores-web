import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResultadoQuitarDeCampania } from "@/datos/equipo/contrato";
import { hayTrabajoPendiente, reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import type { AccionesEquipo } from "./acciones";
import { colportor, datosDePrueba } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";

/**
 * #184 (HU-CAM-005, «Remover» sin reasignar): «Quitar de la campaña» desde la fila de Equipo, con doble confirmación. Sin
 * artboard propio: sigue el «Quitar» de la zona (vista 24) y la doble confirmación de la vista 39.
 */

type Quitar = (colportorId: string) => Promise<ResultadoQuitarDeCampania>;

function crearAcciones(quitar?: Quitar) {
  const quitarDeCampania = vi.fn<Quitar>(quitar ?? (async () => ({ ok: true })));
  const acciones: AccionesEquipo = {
    jornadasParaAcompanar: vi.fn(async () => ({ ok: true as const, jornadas: [] })),
    registrarAcompanamiento: vi.fn(async () => ({ ok: false as const, mensaje: "no" })),
    elegirCarrera: vi.fn(async () => ({ ok: false as const, mensaje: "no" })),
    asignarTipoDeBeca: vi.fn(async () => ({ ok: false as const, mensaje: "no" })),
    quitarDeCampania,
  };
  return { acciones, quitarDeCampania };
}

function mostrar({ acciones = crearAcciones().acciones, datos = datosDePrueba({ sePuedeQuitar: true }) } = {}) {
  const vista = render(<EquipoVista datos={datos} acciones={acciones} />);
  return { usuario: userEvent.setup(), ...vista };
}

/** Una promesa que el test resuelve cuando quiere: el envío queda «en camino». */
function enCamino() {
  let resolver!: (r: ResultadoQuitarDeCampania) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<ResultadoQuitarDeCampania>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

const botonDeFila = (nombre: string) => screen.getByRole("button", { name: `Quitar de la campaña a ${nombre}` });
const dialogo = () => screen.getByRole("alertdialog");
const fila = (nombre: string) => screen.queryByRole("rowheader", { name: nombre });

async function hastaConfirmar(usuario: ReturnType<typeof userEvent.setup>, nombre = "Florencia Pintos") {
  await usuario.click(botonDeFila(nombre));
  await usuario.click(within(dialogo()).getByRole("button", { name: "Seguir" }));
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

describe("#184 · cuándo aparece «Quitar de la campaña»", () => {
  it("cada fila de la pestaña Zonas lo ofrece, con zona o sin ella, junto a «Cambiar zona» o «Asignar zona»", () => {
    mostrar();

    for (const nombre of ["Emiliano Sosa", "Florencia Pintos", "Sofía Cabral", "Federico Da Rosa", "Rocío Benítez"]) {
      expect(botonDeFila(nombre)).toHaveTextContent("Quitar de la campaña");
    }
    const filaDeRocio = screen.getByRole("row", { name: /^Rocío Benítez/ });
    expect(within(filaDeRocio).getByRole("link", { name: "Asignar zona a Rocío Benítez" })).toBeInTheDocument();
  });

  it("si la fuente no sabe quitar (sin `sePuedeQuitar`, como la de las RPC hasta backend-supabase#273), no hay botón", () => {
    mostrar({ datos: datosDePrueba() });

    expect(screen.queryByRole("button", { name: /Quitar de la campaña/ })).not.toBeInTheDocument();
  });

  it("si las acciones no traen `quitarDeCampania`, tampoco", () => {
    const { acciones } = crearAcciones();
    delete acciones.quitarDeCampania;
    mostrar({ acciones });

    expect(screen.queryByRole("button", { name: /Quitar de la campaña/ })).not.toBeInTheDocument();
  });
});

describe("#184 · doble confirmación", () => {
  it("primero dice qué pasa (queda sin zona, se lo puede volver a añadir) y el foco arranca en «Cancelar»", async () => {
    const { usuario } = mostrar();

    await usuario.click(botonDeFila("Florencia Pintos"));

    expect(dialogo()).toHaveAccessibleName("Quitar a Florencia Pintos de la campaña");
    expect(dialogo()).toHaveAccessibleDescription(
      "Florencia Pintos deja de estar en el equipo de Primavera 2026 y queda sin zona. No se borra nada de lo que registró (casas, ventas y jornadas). Si fue un error, lo podés volver a añadir desde «+ Añadir colportor»: vuelve sin zona.",
    );
    expect(within(dialogo()).getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });

  it("«Seguir» pasa a la confirmación final, con el botón rojo que dice la acción entera y el foco en «Volver»", async () => {
    const { usuario } = mostrar();

    await hastaConfirmar(usuario);

    expect(dialogo()).toHaveAccessibleName("¿Quitar a Florencia Pintos de la campaña?");
    expect(dialogo()).toHaveAccessibleDescription(/no hay «Deshacer»: para que vuelva, añadilo de nuevo desde «\+ Añadir colportor» y asignale una zona/);
    expect(within(dialogo()).getByRole("button", { name: "Volver" })).toHaveFocus();
    expect(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" })).toHaveClass("bg-peligro");
  });

  it("al confirmar llama una vez a la acción, la fila se va y el aviso (con el foco) dice cómo quedó y qué hacer", async () => {
    const { acciones, quitarDeCampania } = crearAcciones();
    const { usuario } = mostrar({ acciones });

    await hastaConfirmar(usuario);
    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" }));

    expect(quitarDeCampania).toHaveBeenCalledExactlyOnceWith("florencia");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(fila("Florencia Pintos")).not.toBeInTheDocument();
    const aviso = screen.getByText(
      "Florencia Pintos ya no está en la campaña y quedó sin zona. Si fue un error, añadilo de nuevo desde «+ Añadir colportor».",
    );
    expect(aviso).toHaveFocus();
    expect(aviso.parentElement).toHaveAttribute("aria-live", "polite");
    // El resto del equipo sigue.
    expect(fila("Emiliano Sosa")).toBeInTheDocument();
  });

  it("«Cancelar», Esc o «Volver» no mandan nada; al cerrar, el foco vuelve al botón de la fila", async () => {
    const { acciones, quitarDeCampania } = crearAcciones();
    const { usuario } = mostrar({ acciones });

    await usuario.click(botonDeFila("Florencia Pintos"));
    await usuario.click(within(dialogo()).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(botonDeFila("Florencia Pintos")).toHaveFocus();

    await hastaConfirmar(usuario);
    await usuario.click(within(dialogo()).getByRole("button", { name: "Volver" }));
    expect(dialogo()).toHaveAccessibleName("Quitar a Florencia Pintos de la campaña");
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(botonDeFila("Florencia Pintos")).toHaveFocus();

    expect(quitarDeCampania).not.toHaveBeenCalled();
    expect(fila("Florencia Pintos")).toBeInTheDocument();
  });

  it("Tab no sale del diálogo", async () => {
    const { usuario } = mostrar();
    await hastaConfirmar(usuario);

    await usuario.tab();
    expect(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" })).toHaveFocus();
    await usuario.tab();
    expect(within(dialogo()).getByRole("button", { name: "Volver" })).toHaveFocus();
  });
});

describe("#184 · casos límite", () => {
  it("doble toque en el botón rojo: un solo envío; mientras sale dice «Quitando…» y no se cierra con Esc", async () => {
    const pedido = enCamino();
    const { acciones, quitarDeCampania } = crearAcciones(() => pedido.promesa);
    const { usuario } = mostrar({ acciones });
    await hastaConfirmar(usuario);

    const rojo = within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" });
    await usuario.dblClick(rojo);
    await usuario.click(within(dialogo()).getByRole("button", { name: "Quitando…" }));
    await usuario.keyboard("{Escape}");

    expect(quitarDeCampania).toHaveBeenCalledTimes(1);
    expect(dialogo()).toHaveAttribute("aria-busy", "true");
    expect(within(dialogo()).getByRole("button", { name: "Quitando…" })).toHaveAttribute("aria-disabled", "true");
    expect(within(dialogo()).queryByRole("button", { name: "Volver" })).not.toBeInTheDocument();
    expect(hayTrabajoPendiente()).toBe(true);

    await act(async () => pedido.resolver({ ok: true }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(hayTrabajoPendiente()).toBe(false);
  });

  it("falla de red a mitad: no cambió nada, el aviso dice qué hacer y «Reintentar» queda libre (no se traba en «Quitando…»)", async () => {
    let vez = 0;
    const { acciones, quitarDeCampania } = crearAcciones(async () => {
      vez += 1;
      if (vez === 1) throw new Error("Failed to fetch");
      return { ok: true };
    });
    const { usuario } = mostrar({ acciones });
    await hastaConfirmar(usuario);

    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" }));

    expect(within(dialogo()).getByRole("alert")).toHaveTextContent(
      "Necesitás conexión para quitar a Florencia Pintos de la campaña. Revisá la conexión y probá de nuevo.",
    );
    expect(fila("Florencia Pintos")).toBeInTheDocument();
    const reintentar = within(dialogo()).getByRole("button", { name: "Reintentar" });
    expect(reintentar).toHaveAttribute("aria-disabled", "false");
    expect(within(dialogo()).getByRole("button", { name: "Volver" })).toBeInTheDocument();

    await usuario.click(reintentar);

    expect(quitarDeCampania).toHaveBeenCalledTimes(2);
    expect(fila("Florencia Pintos")).not.toBeInTheDocument();
  });

  it("un rechazo de la base se muestra tal cual, la fila queda y solo se puede cerrar", async () => {
    const mensaje = "Solo el coordinador de esta campaña puede quitar a alguien. Pedíselo a quien la coordina.";
    const { acciones } = crearAcciones(async () => ({ ok: false, mensaje }));
    const { usuario } = mostrar({ acciones });
    await hastaConfirmar(usuario);

    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" }));

    expect(within(dialogo()).getByRole("alert")).toHaveTextContent(mensaje);
    expect(within(dialogo()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Cerrar"]);
    expect(within(dialogo()).getByRole("button", { name: "Cerrar" })).toHaveFocus();

    await usuario.click(within(dialogo()).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(fila("Florencia Pintos")).toBeInTheDocument();
    expect(botonDeFila("Florencia Pintos")).toHaveFocus();
  });

  it("sin conexión el botón rojo no manda nada y el aviso dice qué hacer; al volver la conexión se puede", async () => {
    const { acciones, quitarDeCampania } = crearAcciones();
    const { usuario } = mostrar({ acciones });
    await hastaConfirmar(usuario);

    enLinea = false;
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    const rojo = within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" });
    expect(rojo).toHaveAttribute("aria-disabled", "true");
    expect(within(dialogo()).getByRole("alert")).toHaveTextContent("Necesitás conexión para quitar a Florencia Pintos de la campaña.");
    await usuario.click(rojo);
    expect(quitarDeCampania).not.toHaveBeenCalled();

    enLinea = true;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(within(dialogo()).queryByRole("alert")).not.toBeInTheDocument();
    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" }));
    expect(quitarDeCampania).toHaveBeenCalledTimes(1);
  });

  it("dos seguidas: quitar a una y enseguida a otro deja fuera a los dos, y el aviso es el del último", async () => {
    const { acciones, quitarDeCampania } = crearAcciones();
    const { usuario } = mostrar({ acciones });

    await hastaConfirmar(usuario, "Florencia Pintos");
    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" }));
    await hastaConfirmar(usuario, "Emiliano Sosa");
    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" }));

    expect(quitarDeCampania.mock.calls).toEqual([["florencia"], ["emiliano"]]);
    expect(fila("Florencia Pintos")).not.toBeInTheDocument();
    expect(fila("Emiliano Sosa")).not.toBeInTheDocument();
    expect(screen.getByText(/^Emiliano Sosa ya no está en la campaña/)).toHaveFocus();
  });

  it("«ya no estaba» (otra pestaña lo quitó antes) se trata como quitado", async () => {
    const { acciones } = crearAcciones(async () => ({ ok: true, yaEstaba: true }));
    const { usuario } = mostrar({ acciones });
    await hastaConfirmar(usuario);

    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" }));

    expect(fila("Florencia Pintos")).not.toBeInTheDocument();
    expect(screen.getByText(/^Florencia Pintos ya no está en la campaña/)).toBeInTheDocument();
  });

  it("irse de la vista con el envío en camino: no rompe, y cuenta como trabajo sin contestar hasta que contesta", async () => {
    const pedido = enCamino();
    const { acciones } = crearAcciones(() => pedido.promesa);
    const { usuario, unmount } = mostrar({ acciones });
    await hastaConfirmar(usuario);
    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" }));

    unmount();
    expect(hayTrabajoPendiente()).toBe(true);
    await act(async () => pedido.rechazar(new Error("Failed to fetch")));
    expect(hayTrabajoPendiente()).toBe(false);
  });

  it("volver a entrar a la vista muestra lo que dice el servidor (la fila quitada no vuelve si ya no la trae)", async () => {
    const { acciones } = crearAcciones();
    const { usuario, unmount } = mostrar({ acciones });
    await hastaConfirmar(usuario);
    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" }));
    unmount();

    const base = datosDePrueba({ sePuedeQuitar: true });
    mostrar({ acciones, datos: { ...base, colportores: base.colportores.filter((c) => c.id !== "florencia") } });

    expect(fila("Florencia Pintos")).not.toBeInTheDocument();
    expect(botonDeFila("Emiliano Sosa")).toBeInTheDocument();
  });

  it("al quitar al último del equipo, la tabla dice que no hay colportores y cómo añadirlos", async () => {
    const { usuario } = mostrar({
      datos: datosDePrueba({ sePuedeQuitar: true, colportores: [colportor({ id: "solo", nombre: "Único Sosa", ciudadId: null, zonaActual: null })] }),
    });

    await hastaConfirmar(usuario, "Único Sosa");
    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" }));

    expect(screen.getByRole("status")).toHaveTextContent("Todavía no hay colportores en esta campaña. Añadilos con «+ Añadir colportor».");
    expect(screen.getByText(/^Único Sosa ya no está en la campaña/)).toBeInTheDocument();
  });

  it("un nombre larguísimo sin espacios se corta dentro del diálogo y del aviso, no los desborda", async () => {
    const largo = "Maximiliano".repeat(12);
    const { usuario } = mostrar({
      datos: datosDePrueba({ sePuedeQuitar: true, colportores: [colportor({ id: "largo", nombre: largo, casasRegistradas: 3 })] }),
    });

    await usuario.click(botonDeFila(largo));
    expect(within(dialogo()).getByRole("heading")).toHaveClass("[overflow-wrap:anywhere]");
    expect(within(dialogo()).getByText(/deja de estar en el equipo/)).toHaveClass("[overflow-wrap:anywhere]");
    await usuario.click(within(dialogo()).getByRole("button", { name: "Seguir" }));
    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" }));

    expect(screen.getByText(new RegExp(`^${largo} ya no está`))).toHaveClass("wrap-anywhere");
  });

  it("Enter sostenido en «Seguir» no salta la confirmación final", async () => {
    const { acciones, quitarDeCampania } = crearAcciones();
    mostrar({ acciones });
    fireEvent.click(botonDeFila("Florencia Pintos"));

    const seguir = within(dialogo()).getByRole("button", { name: "Seguir" });
    const repetido = fireEvent.keyDown(seguir, { key: "Enter", repeat: true });

    expect(repetido).toBe(false);
    expect(quitarDeCampania).not.toHaveBeenCalled();
  });
});

describe("#184 · accesibilidad", () => {
  it("axe A/AA sin violaciones con la fila, el diálogo en la confirmación final y el aviso de falla", async () => {
    vi.setConfig({ testTimeout: 60_000 });
    const { acciones } = crearAcciones(async () => {
      throw new Error("Failed to fetch");
    });
    const { usuario, container } = mostrar({ acciones });
    await hastaConfirmar(usuario);
    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, quitar de la campaña" }));
    await screen.findByRole("alert");

    const r = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
    });

    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
