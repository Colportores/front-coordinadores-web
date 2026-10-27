import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { marcaDeRechazo } from "@/auth/sesion-vencida";
import type { ResultadoBusqueda, ResultadoInscripcion } from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { AnadirColportor, MS_DESHACER } from "@/features/equipo/AnadirColportor";
import { MENSAJE_SESION_VENCIDA } from "@/lib/mensajes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/**
 * QA de la sesión vencida con la vista 23 abierta (PR #106, issue #41, P3), 27/10: casos límite que
 * `AnadirColportor.sesion-vencida.test.tsx` no cubre (otra cuenta dentro del plazo de «Deshacer», el mismo fallo dos veces, el aviso
 * de cerrar la pestaña después del fallo, volver a las sugeridas, el foco, la ruta de vuelta con consulta y axe en cada aviso).
 */

type Inscribir = (id: string) => Promise<ResultadoInscripcion>;
type Buscar = (texto: string, despuesDe: string | null) => Promise<ResultadoBusqueda>;

const buscarEnLaSimulada: Buscar = (texto, despuesDe) => fuenteEquipoSimulada.buscarCandidatos("c", texto, despuesDe);
const sesionVencida = () => new Error(marcaDeRechazo("vencida"));

function montar(opciones: { inscribir?: Inscribir; buscar?: Buscar } = {}) {
  const inscribir = vi.fn(opciones.inscribir ?? (async () => ({ ok: true as const })));
  const buscar = vi.fn(opciones.buscar ?? buscarEnLaSimulada);
  const vista = render(<AnadirColportor datos={DATOS_ANADIR_COLPORTOR_SIMULADO} inscribir={inscribir} buscar={buscar} />);
  return { inscribir, buscar, ...vista };
}

const caja = () => screen.getByRole("textbox", { name: "Buscar por email o nombre" });
const anadirEnFila = (nombre: string) => screen.getByRole("button", { name: `Añadir a ${nombre}` });
const esperarResultados = () => waitFor(() => expect(screen.queryByText("Buscando cuentas…")).not.toBeInTheDocument());

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

async function sinReglasDeContraste(contenedor: HTMLElement) {
  // jsdom no mide contraste (se mide en Chromium); el resto de A/AA sí.
  const resultado = await axe.run(contenedor, { rules: { "color-contrast": { enabled: false } } });
  return resultado.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

describe("QA #41 · sesión vencida en la vista 23", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/equipo/anadir");
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.pushState({}, "", "/");
  });

  describe("acciones superpuestas", () => {
    it("si una cuenta vence mientras otra sigue dentro del plazo, la otra conserva su «Deshacer» y deshacerla no la manda", async () => {
      vi.useFakeTimers();
      const { inscribir } = montar({
        inscribir: async (id) => (id === "usr-ana-martinez" ? Promise.reject(sesionVencida()) : { ok: true }),
      });
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(5000);
      await tocar(anadirEnFila("Gonzalo Sosa"));
      await pasar(3000); // vence el plazo de Ana: se manda y falla; el de Gonzalo lleva 3 s

      expect(screen.getByRole("alert")).toHaveTextContent("No se pudo añadir a Ana Martínez.");
      const deshacerGonzalo = screen.getByRole("button", { name: "Deshacer: Gonzalo Sosa" });
      await tocar(deshacerGonzalo);
      await pasar(MS_DESHACER);

      expect(inscribir).toHaveBeenCalledTimes(1);
      expect(inscribir).toHaveBeenCalledWith("usr-ana-martinez");
      // El aviso de Ana sigue ahí con su enlace: deshacer a otra cuenta no lo borra.
      expect(within(screen.getByRole("alert")).getByRole("link", { name: "Entrar de nuevo" })).toBeInTheDocument();
    });

    it("la misma cuenta que vence dos veces seguidas deja un solo aviso (no se apilan)", async () => {
      vi.useFakeTimers();
      montar({ inscribir: async () => Promise.reject(sesionVencida()) });
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(MS_DESHACER);
      expect(screen.getAllByRole("alert")).toHaveLength(1);

      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(MS_DESHACER);

      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.getAllByRole("link", { name: "Entrar de nuevo" })).toHaveLength(1);
    });

    it("después de vencer y volver a añadir con la sesión ya renovada, la cuenta queda añadida y sin avisos", async () => {
      vi.useFakeTimers();
      const { inscribir } = montar({
        inscribir: vi.fn<Inscribir>().mockRejectedValueOnce(sesionVencida()).mockResolvedValue({ ok: true }),
      });
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(MS_DESHACER);
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(MS_DESHACER);

      expect(inscribir).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("el aviso de cerrar la pestaña", () => {
    it("después del fallo por sesión vencida no queda nada por mandar: ir a «Entrar de nuevo» no pregunta «¿salir?»", async () => {
      vi.useFakeTimers();
      montar({ inscribir: async () => Promise.reject(sesionVencida()) });
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(MS_DESHACER);
      expect(screen.getByRole("alert")).toBeInTheDocument();

      const evento = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(evento);

      expect(evento.defaultPrevented).toBe(false);
    });
  });

  describe("buscar", () => {
    it("tras la sesión vencida, «Borrar búsqueda» vuelve a las sugeridas y el aviso desaparece", async () => {
      montar({ buscar: async () => Promise.reject(sesionVencida()) });
      await userEvent.type(caja(), "ana");
      await esperarResultados();
      expect(screen.getByRole("alert")).toHaveTextContent(MENSAJE_SESION_VENCIDA);

      await userEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));

      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
      expect(screen.queryByRole("link", { name: "Entrar de nuevo" })).not.toBeInTheDocument();
      expect(anadirEnFila("Ana Martínez")).toBeInTheDocument();
    });

    it("el foco queda en el buscador (no en el <body>) cuando la búsqueda vence", async () => {
      montar({ buscar: async () => Promise.reject(sesionVencida()) });
      await userEvent.type(caja(), "ana");
      await esperarResultados();

      expect(caja()).toHaveFocus();
    });

    it("texto pegado muy largo con la sesión vencida: un solo aviso y el buscador sigue habilitado", async () => {
      const buscar = vi.fn<Buscar>(async () => Promise.reject(sesionVencida()));
      montar({ buscar });
      fireEvent.change(caja(), { target: { value: "x".repeat(5000) } });
      await esperarResultados();

      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.getByRole("link", { name: "Entrar de nuevo" })).toBeInTheDocument();
      expect(caja()).toBeEnabled();
    });
  });

  describe("la ruta de vuelta", () => {
    it("conserva la consulta de la pantalla en «siguiente» (codificada) para volver a donde estaba", async () => {
      window.history.pushState({}, "", "/equipo/anadir?q=a%20b&x=1");
      montar({ buscar: async () => Promise.reject(sesionVencida()) });
      await userEvent.type(caja(), "ana");
      await esperarResultados();

      const href = screen.getByRole("link", { name: "Entrar de nuevo" }).getAttribute("href") ?? "";
      const url = new URL(href, "http://panel.test");
      expect(url.pathname).toBe("/acceso");
      expect(url.searchParams.get("motivo")).toBe("vencida");
      expect(url.searchParams.get("siguiente")).toBe("/equipo/anadir?q=a%20b&x=1");
    });
  });

  describe("accesibilidad en jsdom (el contraste y el foco se midieron en Chromium)", () => {
    it("el aviso de la búsqueda no tiene violaciones A/AA de axe y no manda ninguna inscripción", async () => {
      const { container, inscribir } = montar({ buscar: async () => Promise.reject(sesionVencida()) });
      await userEvent.type(caja(), "ana");
      await esperarResultados();
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(inscribir).not.toHaveBeenCalled();

      expect(await sinReglasDeContraste(container)).toEqual([]);
    });

    it("el aviso de una cuenta que no se añadió no tiene violaciones A/AA de axe y el enlace tiene nombre", async () => {
      vi.useFakeTimers();
      const { container } = montar({ inscribir: async () => Promise.reject(sesionVencida()) });
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(MS_DESHACER);
      vi.useRealTimers();

      expect(screen.getByRole("link", { name: "Entrar de nuevo" })).toBeVisible();
      expect(await sinReglasDeContraste(container)).toEqual([]);
    });
  });

  describe("con motivo (PR #112): vencida, sin acceso, suspendida", () => {
    it("dos cuentas con motivos distintos: cada aviso lleva su texto y su enlace, sin «Reintentar»", async () => {
      vi.useFakeTimers();
      montar({
        inscribir: async (id) =>
          Promise.reject(new Error(marcaDeRechazo(id === "usr-ana-martinez" ? "vencida" : "suspendida"))),
      });
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(2000);
      await tocar(anadirEnFila("Gonzalo Sosa"));
      await pasar(MS_DESHACER);

      const [ana, gonzalo] = screen.getAllByRole("alert");
      expect(ana).toHaveTextContent("No se pudo añadir a Ana Martínez. Tu sesión venció. Volvé a entrar para seguir.");
      expect(within(ana).getByRole("link", { name: "Entrar de nuevo" }).getAttribute("href")).toMatch(/^\/acceso\?motivo=vencida&siguiente=/);
      expect(gonzalo).toHaveTextContent("No se pudo añadir a Gonzalo Sosa. Volvé a entrar para seguir.");
      expect(gonzalo).not.toHaveTextContent("venció");
      expect(within(gonzalo).getByRole("link", { name: "Entrar de nuevo" })).toHaveAttribute("href", "/acceso?motivo=suspendida");
      expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    });

    it.each(["panel-sesion-vencida", "panel-acceso:", "panel-acceso:no-disponible", "Panel-Acceso:vencida", " panel-acceso:vencida"])(
      "un error con el texto «%s» no es un rechazo del proxy: sigue «sin conexión» con «Reintentar»",
      async (texto) => {
        montar({ buscar: async () => Promise.reject(new Error(texto)) });
        await userEvent.type(caja(), "ana");
        await esperarResultados();

        expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión para buscar cuentas");
        expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Entrar de nuevo" })).not.toBeInTheDocument();
      },
    );

    it("«sin acceso» al buscar: el enlace no lleva «siguiente» y la búsqueda sigue habilitada", async () => {
      montar({ buscar: async () => Promise.reject(new Error(marcaDeRechazo("sin-acceso"))) });
      await userEvent.type(caja(), "ana");
      await esperarResultados();

      expect(screen.getByRole("alert")).toHaveTextContent(/^Volvé a entrar para seguir\./);
      expect(screen.getByRole("link", { name: "Entrar de nuevo" })).toHaveAttribute("href", "/acceso?motivo=sin-acceso");
      expect(caja()).toBeEnabled();
      expect(caja()).toHaveFocus();
    });
  });
});
