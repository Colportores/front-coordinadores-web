import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { marcaDeRechazo, type MotivoDeRechazo } from "@/auth/sesion-vencida";
import type { CandidatoColportor, ResultadoBusqueda, ResultadoInscripcion } from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { AnadirColportor, mensajeAnadirRechazado, MS_DESHACER } from "@/features/equipo/AnadirColportor";
import { MENSAJE_SESION_VENCIDA } from "@/lib/mensajes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

type Inscribir = (id: string) => Promise<ResultadoInscripcion>;
type Buscar = (texto: string, despuesDe: string | null) => Promise<ResultadoBusqueda>;

const buscarEnLaSimulada: Buscar = (texto, despuesDe) => fuenteEquipoSimulada.buscarCandidatos("c", texto, despuesDe);
const sesionVencida = () => new Error(marcaDeRechazo("vencida"));
const rechazo = (motivo: MotivoDeRechazo) => new Error(marcaDeRechazo(motivo));
const resultadoVencido = { ok: false, mensaje: MENSAJE_SESION_VENCIDA, sesionVencida: true } as const;
const HREF = "/acceso?motivo=vencida&siguiente=%2Fequipo%2Fanadir";

function montar(opciones: { inscribir?: Inscribir; buscar?: Buscar } = {}) {
  const inscribir = vi.fn(opciones.inscribir ?? (async () => ({ ok: true as const })));
  const buscar = vi.fn(opciones.buscar ?? buscarEnLaSimulada);
  render(<AnadirColportor datos={DATOS_ANADIR_COLPORTOR_SIMULADO} inscribir={inscribir} buscar={buscar} />);
  return { inscribir, buscar };
}

const caja = () => screen.getByRole("textbox", { name: "Buscar por email o nombre" });
const anadirEnFila = (nombre: string) => screen.getByRole("button", { name: `Añadir a ${nombre}` });
const esperarResultados = () => waitFor(() => expect(screen.queryByText("Buscando cuentas…")).not.toBeInTheDocument());
const enlace = (alerta: HTMLElement) => within(alerta).getByRole("link", { name: "Entrar de nuevo" });

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

class ObservadorFalso {
  static todos: ObservadorFalso[] = [];
  desconectado = false;
  constructor(private readonly alCruzar: IntersectionObserverCallback) {
    ObservadorFalso.todos.push(this);
  }
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
  disconnect() {
    this.desconectado = true;
  }
  static async llegarAlFinal() {
    await act(async () => {});
    await act(async () => {
      for (const o of ObservadorFalso.todos.filter((x) => !x.desconectado)) {
        o.alCruzar([{ isIntersecting: true } as IntersectionObserverEntry], o as unknown as IntersectionObserver);
      }
    });
  }
}

function cuenta(i: number): CandidatoColportor {
  return {
    id: `usr-${String(i).padStart(3, "0")}`,
    nombre: `Persona ${String(i).padStart(3, "0")}`,
    email: `persona${i}@example.com`,
    estadoCuenta: "pendiente_asignacion",
    campaniaActual: null,
    enOtraCampania: false,
    cuentaCreada: "2026-09-01",
  };
}

const paginaLlena = (): ResultadoBusqueda => ({
  ok: true,
  candidatos: Array.from({ length: 10 }, (_, i) => cuenta(i)),
  hayMas: true,
});

describe("AnadirColportor: la sesión vence con la pantalla abierta (#41, P3)", () => {
  beforeEach(() => {
    ObservadorFalso.todos = [];
    vi.stubGlobal("IntersectionObserver", ObservadorFalso);
    window.history.pushState({}, "", "/equipo/anadir");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  describe("al inscribir", () => {
    it.each([
      ["el proxy contesta 401 (la acción tira el error con la marca)", () => Promise.reject(sesionVencida())],
      ["la base rechaza el JWT (la fuente devuelve el resultado con la marca)", () => Promise.resolve(resultadoVencido)],
    ] as const)("si %s, dice que venció, nombra a la cuenta y ofrece entrar de nuevo en vez de «Reintentar»", async (_caso, respuesta) => {
      vi.useFakeTimers();
      const { inscribir } = montar({ inscribir: respuesta });
      await tocar(anadirEnFila("Ana Martínez"));

      await pasar(MS_DESHACER);

      const alerta = screen.getByRole("alert");
      expect(alerta).toHaveTextContent(mensajeAnadirRechazado("Ana Martínez", MENSAJE_SESION_VENCIDA));
      expect(alerta).not.toHaveTextContent("Necesitás conexión");
      expect(enlace(alerta)).toHaveAttribute("href", HREF);
      expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
      // Nada queda trabado: ni «enviándose» ni el botón de la cuenta.
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(anadirEnFila("Ana Martínez")).toBeEnabled();
      expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-ana-martinez");
    });

    it("dos cuentas seguidas con la sesión vencida: cada una con su aviso y su enlace, ninguna se pisa", async () => {
      vi.useFakeTimers();
      montar({ inscribir: async () => Promise.reject(sesionVencida()) });
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(2000);
      await tocar(anadirEnFila("Gonzalo Sosa"));

      await pasar(MS_DESHACER);

      const alertas = screen.getAllByRole("alert");
      expect(alertas).toHaveLength(2);
      expect(alertas[0]).toHaveTextContent("No se pudo añadir a Ana Martínez.");
      expect(alertas[1]).toHaveTextContent("No se pudo añadir a Gonzalo Sosa.");
      for (const alerta of alertas) expect(enlace(alerta)).toBeInTheDocument();
    });

    it("una caída sigue diciendo «sin conexión», sin enlace para entrar", async () => {
      vi.useFakeTimers();
      montar({ inscribir: async () => Promise.reject(new Error("An unexpected response was received from the server.")) });
      await tocar(anadirEnFila("Ana Martínez"));

      await pasar(MS_DESHACER);

      const alerta = screen.getByRole("alert");
      expect(alerta).toHaveTextContent("Necesitás conexión");
      expect(within(alerta).queryByRole("link")).not.toBeInTheDocument();
    });

    it("un rechazo común de la base no lleva el enlace", async () => {
      vi.useFakeTimers();
      montar({ inscribir: async () => ({ ok: false, mensaje: "La cuenta está suspendida." }) });
      await tocar(anadirEnFila("Ana Martínez"));

      await pasar(MS_DESHACER);

      expect(within(screen.getByRole("alert")).queryByRole("link")).not.toBeInTheDocument();
    });

    it("tocar «Añadir» de nuevo borra el aviso viejo de esa cuenta, con su enlace", async () => {
      vi.useFakeTimers();
      montar({ inscribir: vi.fn<Inscribir>().mockRejectedValueOnce(sesionVencida()).mockResolvedValue({ ok: true }) });
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(MS_DESHACER);
      expect(screen.getByRole("alert")).toBeInTheDocument();

      await tocar(anadirEnFila("Ana Martínez"));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Entrar de nuevo" })).not.toBeInTheDocument();
    });
  });

  describe.each([
    ["sin-acceso", "/acceso?motivo=sin-acceso"],
    ["suspendida", "/acceso?motivo=suspendida"],
  ] as const)("el proxy dice «%s» (le sacaron el acceso con la pantalla abierta)", (motivo, href) => {
    it("al inscribir: el aviso nombra a la cuenta, no dice que la sesión venció y lleva a la pantalla de acceso con su motivo", async () => {
      vi.useFakeTimers();
      montar({ inscribir: async () => Promise.reject(rechazo(motivo)) });
      await tocar(anadirEnFila("Ana Martínez"));

      await pasar(MS_DESHACER);

      const alerta = screen.getByRole("alert");
      expect(alerta).toHaveTextContent("No se pudo añadir a Ana Martínez. Volvé a entrar para seguir.");
      expect(alerta).not.toHaveTextContent("venció");
      expect(alerta).not.toHaveTextContent("Necesitás conexión");
      expect(enlace(alerta)).toHaveAttribute("href", href);
      expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
      expect(anadirEnFila("Ana Martínez")).toBeEnabled();
    });

    it("al buscar: el aviso lleva a la pantalla de acceso con su motivo, sin «Reintentar»", async () => {
      montar({ buscar: async () => Promise.reject(rechazo(motivo)) });

      await userEvent.type(caja(), "ana");
      await esperarResultados();

      const alerta = screen.getByRole("alert");
      expect(alerta).toHaveTextContent("No se pudo buscar cuentas. Volvé a entrar para seguir.");
      expect(alerta).not.toHaveTextContent("venció");
      expect(enlace(alerta)).toHaveAttribute("href", href);
      expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    });

    it("en la página siguiente: la lista que ya se ve queda y el aviso lleva a entrar de nuevo", async () => {
      const buscar = vi.fn<Buscar>(async () => paginaLlena());
      montar({ buscar });
      await userEvent.type(caja(), "persona");
      await esperarResultados();
      buscar.mockRejectedValueOnce(rechazo(motivo));

      await ObservadorFalso.llegarAlFinal();

      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent("No se pudo cargar más cuentas. Volvé a entrar para seguir.");
      expect(enlace(alerta)).toHaveAttribute("href", href);
      expect(within(screen.getByRole("list", { name: "Cuentas" })).getAllByRole("listitem")).toHaveLength(10);
    });
  });

  describe("al buscar", () => {
    it.each([
      ["el proxy contesta 401", () => Promise.reject(sesionVencida())],
      ["la base rechaza el JWT", () => Promise.resolve(resultadoVencido)],
    ] as const)("si %s, la búsqueda dice que venció y ofrece entrar de nuevo, sin «Reintentar»", async (_caso, respuesta) => {
      montar({ buscar: respuesta });

      await userEvent.type(caja(), "ana");
      await esperarResultados();

      const alerta = screen.getByRole("alert");
      expect(alerta).toHaveTextContent(MENSAJE_SESION_VENCIDA);
      expect(enlace(alerta)).toHaveAttribute("href", HREF);
      expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
      // El buscador no se traba: se puede seguir escribiendo.
      expect(caja()).toBeEnabled();
    });

    it("una caída de la búsqueda sigue con «Reintentar» y sin enlace", async () => {
      montar({ buscar: async () => Promise.reject(new Error("sin red")) });

      await userEvent.type(caja(), "ana");
      await esperarResultados();

      expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Entrar de nuevo" })).not.toBeInTheDocument();
    });

    it.each([
      ["la excepción del proxy", () => Promise.reject(sesionVencida())],
      ["el resultado de la base", () => Promise.resolve(resultadoVencido)],
    ] as const)("si %s llega en la página siguiente, la lista que ya se ve queda y el aviso lleva a entrar de nuevo", async (_caso, respuesta) => {
      const buscar = vi.fn<Buscar>(async () => paginaLlena());
      montar({ buscar });
      await userEvent.type(caja(), "persona");
      await esperarResultados();
      buscar.mockImplementationOnce(respuesta);

      await ObservadorFalso.llegarAlFinal();

      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent(MENSAJE_SESION_VENCIDA);
      expect(enlace(alerta)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
      expect(within(screen.getByRole("list", { name: "Cuentas" })).getAllByRole("listitem")).toHaveLength(10);
    });

    it("escribir otra cosa después de la sesión vencida deja el aviso atrás", async () => {
      const buscar = vi.fn<Buscar>().mockRejectedValueOnce(sesionVencida());
      buscar.mockImplementation(buscarEnLaSimulada);
      montar({ buscar });
      await userEvent.type(caja(), "ana");
      await esperarResultados();
      expect(screen.getByRole("alert")).toBeInTheDocument();

      await userEvent.type(caja(), "b");
      await esperarResultados();

      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
      expect(screen.queryByRole("link", { name: "Entrar de nuevo" })).not.toBeInTheDocument();
    });
  });
});
