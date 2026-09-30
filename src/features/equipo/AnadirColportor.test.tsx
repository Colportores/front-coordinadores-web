import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DATOS_ANADIR_COLPORTOR_SIMULADO } from "@/datos/equipo/simulado";
import type { ResultadoInscripcion } from "@/datos/equipo/contrato";
import { AnadirColportor, MS_DESHACER } from "@/features/equipo/AnadirColportor";

const navegacion = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navegacion.push }) }));

function montar(inscribir: (id: string) => Promise<ResultadoInscripcion> = async () => ({ ok: true })) {
  const espia = vi.fn(inscribir);
  render(<AnadirColportor datos={DATOS_ANADIR_COLPORTOR_SIMULADO} inscribir={espia} />);
  return espia;
}

describe("AnadirColportor", () => {
  afterEach(() => {
    vi.useRealTimers();
    navegacion.push.mockClear();
  });

  describe("al abrir", () => {
    it("muestra el buscador, los pendientes sugeridos y el equipo actual", () => {
      montar();

      expect(screen.getByRole("heading", { name: "Añadir colportor a Verano 2026" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Buscar por email o nombre" })).toBeInTheDocument();
      expect(screen.getByText("Solo aparecen cuentas pendientes de asignación o activas sin campaña.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "PENDIENTES DE ASIGNACIÓN · 4" })).toBeInTheDocument();
      expect(screen.getByText("Elegí una cuenta para ver el detalle y añadirla.")).toBeInTheDocument();
      const equipo = screen.getByRole("region", { name: "Ya en tu equipo" });
      expect(within(equipo).getAllByRole("listitem")).toHaveLength(6);
      expect(within(equipo).getByText("Diego Rocha")).toBeInTheDocument();
    });

    it("enlaza de vuelta a Equipo", () => {
      montar();
      expect(screen.getByRole("link", { name: "‹ Equipo" })).toHaveAttribute("href", "/equipo");
    });
  });

  describe("al buscar", () => {
    it("muestra los resultados con su estado y el motivo si no se pueden añadir", async () => {
      montar();
      await userEvent.type(screen.getByRole("textbox", { name: "Buscar por email o nombre" }), "ana");

      expect(screen.getByRole("heading", { name: "3 RESULTADOS PARA “ANA”" })).toBeInTheDocument();
      expect(screen.getByText("● Activa")).toBeInTheDocument();
      expect(screen.getByRole("note")).toHaveTextContent(
        "Cuenta suspendida. Pedí a un administrador que la reactive para añadirla.",
      );
      expect(screen.getByRole("button", { name: "Añadir a Mariana Olivera" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Añadir a Ana Martínez" })).toBeEnabled();
    });

    it("bloquea a quien ya está en otra campaña y lo explica en el detalle", async () => {
      montar();
      await userEvent.type(screen.getByRole("textbox", { name: "Buscar por email o nombre" }), "rodrigo silva");
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Rodrigo Silva" }));

      const detalle = screen.getByRole("region", { name: "Detalle de Rodrigo Silva" });
      expect(within(detalle).getByText("Otoño Norte")).toBeInTheDocument();
      expect(within(detalle).getByRole("note")).toHaveTextContent("Está en campaña Otoño Norte. Reasignar primero.");
      expect(within(detalle).getByRole("button", { name: "Añadir a Verano 2026" })).toBeDisabled();
      expect(within(detalle).getByText("Pedile al coordinador de Otoño Norte que lo libere.")).toBeInTheDocument();
    });

    it("avisa cuando no hay coincidencias y borra la búsqueda con la X", async () => {
      montar();
      const caja = screen.getByRole("textbox", { name: "Buscar por email o nombre" });
      await userEvent.type(caja, "zzz");
      expect(screen.getByText("No hay cuentas que coincidan con tu búsqueda.")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));
      expect(caja).toHaveValue("");
      expect(screen.getByRole("heading", { name: "PENDIENTES DE ASIGNACIÓN · 4" })).toBeInTheDocument();
    });
  });

  describe("al elegir una cuenta", () => {
    it("muestra su detalle con la zona y la fecha de creación", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Ana Martínez" }));

      const detalle = screen.getByRole("region", { name: "Detalle de Ana Martínez" });
      expect(within(detalle).getByText("Sin campaña")).toBeInTheDocument();
      expect(within(detalle).getByText("Sin zona")).toBeInTheDocument();
      expect(within(detalle).getByText("22/09/2026")).toBeInTheDocument();
      expect(within(detalle).getByText("Le llega un aviso por email y en la app.")).toBeInTheDocument();
    });
  });

  describe("al añadir", () => {
    it("inscribe, marca la fila, suma al equipo con «Sin zona» y ofrece deshacer", async () => {
      const inscribir = montar();
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Ana Martínez" }));
      const detalle = screen.getByRole("region", { name: "Detalle de Ana Martínez" });
      await userEvent.click(within(detalle).getByRole("button", { name: "Añadir a Verano 2026" }));

      expect(inscribir).toHaveBeenCalledWith("usr-ana-martinez");
      expect(await screen.findByRole("status")).toHaveTextContent("Añadiste a Ana Martínez a Verano 2026.");
      expect(screen.getByRole("button", { name: "Añadir a Ana Martínez" })).toHaveTextContent("Añadido ✓");
      expect(screen.getByRole("button", { name: "Añadir a Ana Martínez" })).toBeDisabled();
      const equipo = screen.getByRole("region", { name: "Ya en tu equipo" });
      expect(within(equipo).getAllByRole("listitem")).toHaveLength(7);
      expect(within(equipo).getByText("Sin zona")).toBeInTheDocument();
    });

    it("«Deshacer» revierte lo que muestra la vista", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" }));
      await userEvent.click(await screen.findByRole("button", { name: "Deshacer" }));

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" })).toBeEnabled();
      const equipo = screen.getByRole("region", { name: "Ya en tu equipo" });
      expect(within(equipo).getAllByRole("listitem")).toHaveLength(6);
    });

    it("el aviso se apaga solo a los 8 segundos y la página queda abierta", async () => {
      vi.useFakeTimers();
      montar();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" }));
      });
      expect(screen.getByRole("status")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(MS_DESHACER + 100);
      });

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" })).toHaveTextContent("Añadido ✓");
      expect(screen.getByRole("button", { name: "Añadir a Valentina Bentancor" })).toBeEnabled();
    });

    it("si el BFF rechaza, muestra el mensaje y no marca nada", async () => {
      montar(async () => ({ ok: false, mensaje: "La cuenta ya está en otra campaña." }));
      await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("La cuenta ya está en otra campaña.");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Añadir a Ana Martínez" })).toHaveTextContent("Añadir");
    });
  });

  describe("atajos de teclado", () => {
    it("«/» enfoca el buscador", async () => {
      montar();
      await userEvent.keyboard("/");
      expect(screen.getByRole("textbox", { name: "Buscar por email o nombre" })).toHaveFocus();
    });

    it("↓ y Enter recorren y eligen resultados", async () => {
      montar();
      await userEvent.click(screen.getByRole("textbox", { name: "Buscar por email o nombre" }));
      await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

      expect(screen.getByRole("region", { name: "Detalle de Gonzalo Sosa" })).toBeInTheDocument();
      await userEvent.keyboard("{ArrowUp}{Enter}");
      expect(screen.getByRole("region", { name: "Detalle de Ana Martínez" })).toBeInTheDocument();
    });

    it("Esc vuelve a Equipo", async () => {
      montar();
      await userEvent.keyboard("{Escape}");
      expect(navegacion.push).toHaveBeenCalledWith("/equipo");
    });
  });
});
