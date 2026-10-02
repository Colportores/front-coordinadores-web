import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DATOS_ANADIR_COLPORTOR_SIMULADO } from "@/datos/equipo/simulado";
import type { DatosAnadirColportor, ResultadoInscripcion } from "@/datos/equipo/contrato";
import { AnadirColportor, mensajeAnadirSinConexion, MS_DESHACER } from "@/features/equipo/AnadirColportor";

const navegacion = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navegacion.push }) }));

function montar(
  inscribir: (id: string) => Promise<ResultadoInscripcion> = async () => ({ ok: true }),
  datos: DatosAnadirColportor = DATOS_ANADIR_COLPORTOR_SIMULADO,
) {
  const espia = vi.fn(inscribir);
  render(<AnadirColportor datos={datos} inscribir={espia} />);
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

    it("«rodrigo» muestra primero a Rodrigo Silva (bloqueado) y después a Rodrigo Barrios, como el artboard B · 03", async () => {
      montar();
      await userEvent.type(screen.getByRole("textbox", { name: "Buscar por email o nombre" }), "rodrigo");

      const filas = within(screen.getByRole("list", { name: "Cuentas" })).getAllByRole("listitem");
      expect(filas).toHaveLength(2);
      expect(within(filas[0]).getByText("Rodrigo Silva")).toBeInTheDocument();
      expect(within(filas[0]).getByRole("note")).toHaveTextContent("Está en campaña Otoño Norte. Reasignar primero.");
      expect(within(filas[0]).getByRole("button", { name: "Añadir a Rodrigo Silva" })).toBeDisabled();
      expect(within(filas[1]).getByText("Rodrigo Barrios")).toBeInTheDocument();
      expect(within(filas[1]).getByRole("button", { name: "Añadir a Rodrigo Barrios" })).toBeEnabled();
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
      await userEvent.click(await screen.findByRole("button", { name: "Deshacer: Gonzalo Sosa" }));

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

      expect(screen.getByRole("region", { name: "Detalle de Valentina Bentancor" })).toBeInTheDocument();
      await userEvent.keyboard("{ArrowUp}{Enter}");
      expect(screen.getByRole("region", { name: "Detalle de Rodrigo Barrios" })).toBeInTheDocument();
    });

    it("Esc vuelve a Equipo", async () => {
      montar();
      await userEvent.keyboard("{Escape}");
      expect(navegacion.push).toHaveBeenCalledWith("/equipo");
    });
  });

  describe("sugeridos y ayudas (decisiones del 30/09)", () => {
    it("los sugeridos van de la cuenta más nueva a la más antigua", () => {
      montar();
      const cuentas = within(screen.getByRole("list", { name: "Cuentas" })).getAllByRole("listitem");
      expect(cuentas.map((li) => within(li).getByText(/^(Rodrigo Barrios|Valentina Bentancor|Gonzalo Sosa|Ana Martínez)$/).textContent)).toEqual([
        "Rodrigo Barrios",
        "Valentina Bentancor",
        "Gonzalo Sosa",
        "Ana Martínez",
      ]);
    });

    it("una cuenta suspendida repite la ayuda bajo «Añadir», que queda apagado", async () => {
      montar();
      await userEvent.type(screen.getByRole("textbox", { name: "Buscar por email o nombre" }), "mariana");
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Mariana Olivera" }));

      const detalle = screen.getByRole("region", { name: "Detalle de Mariana Olivera" });
      expect(within(detalle).getByRole("note")).toHaveTextContent(
        "Cuenta suspendida. Pedí a un administrador que la reactive para añadirla.",
      );
      expect(within(detalle).getByText("Pedile a un administrador que la reactive.")).toBeInTheDocument();
      expect(within(detalle).queryByText("Le llega un aviso por email y en la app.")).not.toBeInTheDocument();
      expect(within(detalle).getByRole("button", { name: "Añadir a Verano 2026" })).toBeDisabled();
    });

    it("sin cuentas pendientes lo dice", () => {
      montar(undefined, { ...DATOS_ANADIR_COLPORTOR_SIMULADO, candidatos: [] });
      expect(screen.getByRole("heading", { name: "PENDIENTES DE ASIGNACIÓN · 0" })).toBeInTheDocument();
      expect(screen.getByText("No hay cuentas pendientes de asignación.")).toBeInTheDocument();
    });
  });

  describe("casos límite", () => {
    it("un doble clic en «Añadir» inscribe una sola vez", async () => {
      const inscribir = montar(() => new Promise((r) => setTimeout(() => r({ ok: true }), 30)));

      await userEvent.dblClick(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));

      expect(await screen.findByRole("status")).toBeInTheDocument();
      expect(inscribir).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole("status")).toHaveLength(1);
    });

    it("con otra inscripción en curso, un segundo «Añadir» espera: no se pisan", async () => {
      let liberar: () => void = () => undefined;
      const inscribir = montar(() => new Promise((r) => (liberar = () => r({ ok: true }))));
      await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));

      expect(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" })).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" }));
      expect(inscribir).toHaveBeenCalledTimes(1);

      await act(async () => liberar());
      expect(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" })).toBeEnabled();
    });

    it("si la llamada se cae, avisa, nada queda «ocupado» y se puede reintentar", async () => {
      const inscribir = montar();
      inscribir.mockRejectedValueOnce(new Error("sin red"));

      await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(mensajeAnadirSinConexion("Ana Martínez"));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Añadir a Ana Martínez" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
      expect(await screen.findByRole("status")).toHaveTextContent("Añadiste a Ana Martínez a Verano 2026.");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("un rechazo del BFF no traba nada y el error se va al siguiente intento", async () => {
      const inscribir = montar();
      inscribir.mockResolvedValueOnce({ ok: false, mensaje: "La cuenta ya está en otra campaña." });
      await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
      await screen.findByRole("alert");

      await userEvent.click(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" }));

      expect(await screen.findByRole("status")).toHaveTextContent("Gonzalo Sosa");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("dos añadidos antes de que pasen los 8 s: cada uno conserva su «Deshacer» y su propio plazo", async () => {
      vi.useFakeTimers();
      montar();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" }));
      });
      expect(screen.getAllByRole("status")).toHaveLength(2);

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Deshacer: Ana Martínez" }));
      });
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Añadir a Ana Martínez" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" })).toHaveTextContent("Añadido ✓");

      await act(async () => {
        vi.advanceTimersByTime(MS_DESHACER + 100);
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" })).toHaveTextContent("Añadido ✓");
    });

    it("al añadir el primero y el segundo, el primero vence a sus 8 s aunque el segundo siga", async () => {
      vi.useFakeTimers();
      montar();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
      });
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Añadir a Gonzalo Sosa" }));
      });

      await act(async () => {
        vi.advanceTimersByTime(3100);
      });

      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(screen.getByRole("status")).toHaveTextContent("Gonzalo Sosa");
    });

    it("«Deshacer» y volver a añadir a la misma cuenta arranca un aviso nuevo", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
      await userEvent.click(await screen.findByRole("button", { name: "Deshacer: Ana Martínez" }));

      await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));

      expect(await screen.findByRole("status")).toHaveTextContent("Añadiste a Ana Martínez");
      expect(screen.getAllByRole("status")).toHaveLength(1);
    });

    it("«/» con Ctrl, Meta o Alt no le roba el atajo al navegador", async () => {
      montar();
      await userEvent.keyboard("{Control>}/{/Control}");
      expect(screen.getByRole("textbox", { name: "Buscar por email o nombre" })).not.toHaveFocus();
      await userEvent.keyboard("{Alt>}/{/Alt}");
      expect(screen.getByRole("textbox", { name: "Buscar por email o nombre" })).not.toHaveFocus();
    });

    it("«/» escrito dentro del buscador se escribe y no salta", async () => {
      montar();
      await userEvent.click(screen.getByRole("textbox", { name: "Buscar por email o nombre" }));
      await userEvent.keyboard("a/b");
      expect(screen.getByRole("textbox", { name: "Buscar por email o nombre" })).toHaveValue("a/b");
    });

    it("volver atrás y reentrar arranca limpio: sin búsqueda, sin elegido y sin avisos", async () => {
      const { unmount } = render(<AnadirColportor datos={DATOS_ANADIR_COLPORTOR_SIMULADO} inscribir={async () => ({ ok: true })} />);
      await userEvent.type(screen.getAllByRole("textbox", { name: "Buscar por email o nombre" })[0], "ana");
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Ana Martínez" }));
      unmount();

      montar();

      expect(screen.getByRole("textbox", { name: "Buscar por email o nombre" })).toHaveValue("");
      expect(screen.getByText("Elegí una cuenta para ver el detalle y añadirla.")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("borrar la búsqueda suelta la cuenta elegida", async () => {
      montar();
      await userEvent.type(screen.getByRole("textbox", { name: "Buscar por email o nombre" }), "ana");
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Ana Martínez" }));

      await userEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));

      expect(screen.queryByRole("region", { name: "Detalle de Ana Martínez" })).not.toBeInTheDocument();
      expect(screen.getByText("Elegí una cuenta para ver el detalle y añadirla.")).toBeInTheDocument();
    });

    it("con 300 resultados, nombres y emails larguísimos, los lista todos sin romperse", async () => {
      const largo = "de apellido larguísimo ".repeat(8).trim();
      const candidatos = Array.from({ length: 300 }, (_, i) => ({
        id: `usr-${i}`,
        nombre: `Persona ${i} ${largo}`,
        email: `persona${i}.${"x".repeat(80)}@example.com`,
        estadoCuenta: "pendiente_asignacion" as const,
        campaniaActual: null,
        cuentaCreada: "2026-09-01",
      }));
      montar(undefined, { ...DATOS_ANADIR_COLPORTOR_SIMULADO, candidatos });
      await userEvent.type(screen.getByRole("textbox", { name: "Buscar por email o nombre" }), "persona");

      expect(screen.getByRole("heading", { name: "300 RESULTADOS PARA “PERSONA”" })).toBeInTheDocument();
      expect(within(screen.getByRole("list", { name: "Cuentas" })).getAllByRole("listitem")).toHaveLength(300);
    });

    it("con un solo resultado habla en singular", async () => {
      montar();
      await userEvent.type(screen.getByRole("textbox", { name: "Buscar por email o nombre" }), "martinez");
      expect(screen.getByRole("heading", { name: "1 RESULTADO PARA “MARTINEZ”" })).toBeInTheDocument();
    });
  });

  describe("Esc y errores (revisión de #36)", () => {
    it("Esc con texto en el buscador solo lo limpia; recién el siguiente Esc sale a Equipo", async () => {
      montar();
      await userEvent.type(screen.getByRole("textbox", { name: "Buscar por email o nombre" }), "ana");

      await userEvent.keyboard("{Escape}");

      expect(navegacion.push).not.toHaveBeenCalled();
      expect(screen.getByRole("textbox", { name: "Buscar por email o nombre" })).toHaveValue("");
      await userEvent.keyboard("{Escape}");
      expect(navegacion.push).toHaveBeenCalledWith("/equipo");
    });

    it("Esc con un «Añadir» en curso no sale; cuando contesta, vuelve a funcionar", async () => {
      let liberar: () => void = () => undefined;
      montar(() => new Promise((r) => (liberar = () => r({ ok: true }))));
      await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));

      await userEvent.keyboard("{Escape}");
      expect(navegacion.push).not.toHaveBeenCalled();

      await act(async () => liberar());
      await screen.findByRole("status");
      await userEvent.keyboard("{Escape}");
      expect(navegacion.push).not.toHaveBeenCalled();
    });

    it("Esc con avisos de «Deshacer» pendientes primero los cierra y después sale", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
      await userEvent.click(await screen.findByRole("button", { name: "Añadir a Gonzalo Sosa" }));
      expect(screen.getAllByRole("status")).toHaveLength(2);

      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(navegacion.push).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Añadir a Ana Martínez" })).toHaveTextContent("Añadido ✓");

      await userEvent.keyboard("{Escape}");
      expect(navegacion.push).toHaveBeenCalledWith("/equipo");
    });

    it("el aviso de falta de conexión se va al cambiar de búsqueda", async () => {
      const inscribir = montar();
      inscribir.mockRejectedValueOnce(new Error("sin red"));
      await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
      await screen.findByRole("alert");

      await userEvent.type(screen.getByRole("textbox", { name: "Buscar por email o nombre" }), "g");

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("el aviso de error no se queda arriba del detalle de otra cuenta", async () => {
      const inscribir = montar();
      inscribir.mockResolvedValueOnce({ ok: false, mensaje: "La cuenta ya está en otra campaña." });
      await userEvent.click(screen.getByRole("button", { name: "Añadir a Ana Martínez" }));
      await screen.findByRole("alert");

      await userEvent.click(screen.getByRole("button", { name: "Elegir a Gonzalo Sosa" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
