import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CandidatoColportor,
  DatosAnadirColportor,
  ResultadoBusqueda,
  ResultadoInscripcion,
} from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import {
  AnadirColportor,
  mensajeAnadirRechazado,
  mensajeAnadirSinConexion,
  MS_DESHACER,
} from "@/features/equipo/AnadirColportor";
import { MS_ESPERA_BUSQUEDA } from "@/features/equipo/useBusquedaCandidatos";
import { mensajeSinConexion } from "@/lib/mensajes";

const navegacion = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navegacion.push }) }));

type Inscribir = (id: string) => Promise<ResultadoInscripcion>;
type Buscar = (texto: string, despuesDe: string | null) => Promise<ResultadoBusqueda>;

/** Lo que el servidor haría con la lista de ejemplo: la misma que usa el sitio de prueba. */
const buscarEnLaSimulada: Buscar = (texto, despuesDe) => fuenteEquipoSimulada.buscarCandidatos("c", texto, despuesDe);

function montar(
  opciones: { inscribir?: Inscribir; buscar?: Buscar; datos?: DatosAnadirColportor } = {},
) {
  const inscribir = vi.fn(opciones.inscribir ?? (async () => ({ ok: true as const })));
  const buscar = vi.fn(opciones.buscar ?? buscarEnLaSimulada);
  const vista = render(
    <AnadirColportor datos={opciones.datos ?? DATOS_ANADIR_COLPORTOR_SIMULADO} inscribir={inscribir} buscar={buscar} />,
  );
  return { inscribir, buscar, ...vista };
}

const caja = () => screen.getByRole("textbox", { name: "Buscar por email o nombre" });
const anadirEnFila = (nombre: string) => screen.getByRole("button", { name: `Añadir a ${nombre}` });

/** Escribe en el buscador y espera a que lleguen los resultados del servidor (tiempo real). */
async function buscarTexto(texto: string) {
  await userEvent.type(caja(), texto);
  await esperarResultados();
}

async function esperarResultados() {
  await waitFor(() => expect(screen.queryByText("Buscando cuentas…")).not.toBeInTheDocument());
}

/** Con tiempo falso: avanza el reloj y deja correr lo que quedó pendiente. */
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

async function escribirConTiempoFalso(texto: string) {
  await act(async () => {
    fireEvent.change(caja(), { target: { value: texto } });
  });
  await pasar(MS_ESPERA_BUSQUEDA);
}

/** Un `IntersectionObserver` que el test dispara a mano: el final de la lista «entra en pantalla» cuando él quiere. */
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
    // Antes de avisar, que terminen de correr los efectos del último render (el observador y el ref de la lista se rearman ahí).
    await act(async () => {});
    await act(async () => {
      for (const o of ObservadorFalso.todos.filter((x) => !x.desconectado)) {
        o.alCruzar([{ isIntersecting: true } as IntersectionObserverEntry], o as unknown as IntersectionObserver);
      }
    });
  }
}

function cuenta(i: number, parcial: Partial<CandidatoColportor> = {}): CandidatoColportor {
  return {
    id: `usr-${String(i).padStart(3, "0")}`,
    nombre: `Persona ${String(i).padStart(3, "0")}`,
    email: `persona${i}@example.com`,
    estadoCuenta: "pendiente_asignacion",
    campaniaActual: null,
    cuentaCreada: "2026-09-01",
    ...parcial,
  };
}

/** Un servidor con `total` cuentas que contesta de a 10 con el cursor, como `buscar_candidatos()`. */
function servidorConPaginas(total: number): Buscar {
  const todas = Array.from({ length: total }, (_, i) => cuenta(i));
  return async (_texto, despuesDe) => {
    const desde = despuesDe === null ? 0 : todas.findIndex((c) => c.id === despuesDe) + 1;
    const candidatos = todas.slice(desde, desde + 10);
    return { ok: true, candidatos, hayMas: candidatos.length === 10 };
  };
}

const filas = () => within(screen.getByRole("list", { name: "Cuentas" })).getAllByRole("listitem");

describe("AnadirColportor", () => {
  beforeEach(() => {
    ObservadorFalso.todos = [];
    vi.stubGlobal("IntersectionObserver", ObservadorFalso);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    navegacion.push.mockClear();
  });

  describe("al abrir", () => {
    it("muestra el buscador, los pendientes sugeridos y el equipo actual, sin pedirle nada al servidor", () => {
      const { buscar, inscribir } = montar();

      expect(screen.getByRole("heading", { name: "Añadir colportor a Verano 2026" })).toBeInTheDocument();
      expect(caja()).toBeInTheDocument();
      expect(screen.getByText("Solo aparecen cuentas pendientes de asignación o activas sin campaña.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "PENDIENTES DE ASIGNACIÓN · 4" })).toBeInTheDocument();
      expect(screen.getByText("Elegí una cuenta para ver el detalle y añadirla.")).toBeInTheDocument();
      const equipo = screen.getByRole("region", { name: "Ya en tu equipo" });
      expect(within(equipo).getAllByRole("listitem")).toHaveLength(6);
      expect(within(equipo).getByText("Diego Rocha")).toBeInTheDocument();
      expect(buscar).not.toHaveBeenCalled();
      expect(inscribir).not.toHaveBeenCalled();
    });

    it("enlaza de vuelta a Equipo", () => {
      montar();
      expect(screen.getByRole("link", { name: "‹ Equipo" })).toHaveAttribute("href", "/equipo");
    });

    it("los sugeridos van en el orden en que los manda el servidor (la cuenta más nueva primero)", () => {
      montar();
      const nombres = filas().map((li) => within(li).getByText(/^(Rodrigo Barrios|Valentina Bentancor|Gonzalo Sosa|Ana Martínez)$/).textContent);
      expect(nombres).toEqual(["Rodrigo Barrios", "Valentina Bentancor", "Gonzalo Sosa", "Ana Martínez"]);
    });

    it("sin cuentas pendientes lo dice", () => {
      montar({ datos: { ...DATOS_ANADIR_COLPORTOR_SIMULADO, sugeridos: [] } });
      expect(screen.getByRole("heading", { name: "PENDIENTES DE ASIGNACIÓN · 0" })).toBeInTheDocument();
      expect(screen.getByText("No hay cuentas pendientes de asignación.")).toBeInTheDocument();
    });
  });

  describe("al buscar (en el servidor)", () => {
    it("muestra los resultados con su estado y el motivo si no se pueden añadir", async () => {
      montar();
      await buscarTexto("ana");

      expect(screen.getByRole("heading", { name: "3 RESULTADOS PARA “ANA”" })).toBeInTheDocument();
      expect(screen.getByText("● Activa")).toBeInTheDocument();
      expect(screen.getByRole("note")).toHaveTextContent(
        "Cuenta suspendida. Pedí a un administrador que la reactive para añadirla.",
      );
      expect(anadirEnFila("Mariana Olivera")).toBeDisabled();
      expect(anadirEnFila("Ana Martínez")).toBeEnabled();
    });

    it("espera a que termine de teclear: una sola búsqueda, con el texto sin espacios a los costados", async () => {
      const { buscar } = montar();
      await userEvent.type(caja(), "  ana ");
      await esperarResultados();

      expect(buscar).toHaveBeenCalledExactlyOnceWith("ana", null);
    });

    it("mientras espera la respuesta lo dice, y no deja ver la lista anterior", async () => {
      let contestar: (r: ResultadoBusqueda) => void = () => undefined;
      const { buscar } = montar({ buscar: () => new Promise((resolver) => (contestar = resolver)) });
      await userEvent.type(caja(), "ana");

      expect(await screen.findByText("Buscando cuentas…")).toBeInTheDocument();
      await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("heading", { name: "BUSCANDO “ANA”…" })).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Cuentas" })).not.toBeInTheDocument();

      await act(async () => contestar({ ok: true, candidatos: [cuenta(1)], hayMas: false }));
      expect(screen.getByRole("heading", { name: "1 RESULTADO PARA “ANA”" })).toBeInTheDocument();
    });

    it("sin texto (o solo espacios) no le pregunta nada al servidor", async () => {
      const { buscar } = montar();
      await userEvent.type(caja(), "   ");
      await new Promise((r) => setTimeout(r, MS_ESPERA_BUSQUEDA + 50));

      expect(buscar).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "PENDIENTES DE ASIGNACIÓN · 4" })).toBeInTheDocument();
    });

    it("bloquea a quien ya está en otra campaña y lo explica en el detalle", async () => {
      montar();
      await buscarTexto("rodrigo silva");
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Rodrigo Silva" }));

      const detalle = screen.getByRole("region", { name: "Detalle de Rodrigo Silva" });
      expect(within(detalle).getByText("Otoño Norte")).toBeInTheDocument();
      expect(within(detalle).getByRole("note")).toHaveTextContent("Está en campaña Otoño Norte. Reasignar primero.");
      expect(within(detalle).getByRole("button", { name: "Añadir a Verano 2026" })).toBeDisabled();
      expect(within(detalle).getByText("Pedile al coordinador de Otoño Norte que lo libere.")).toBeInTheDocument();
    });

    it("«rodrigo» muestra las dos cuentas en el orden del servidor (alfabético), con el bloqueo de Silva", async () => {
      montar();
      await buscarTexto("rodrigo");

      expect(filas()).toHaveLength(2);
      expect(within(filas()[0]).getByText("Rodrigo Barrios")).toBeInTheDocument();
      expect(within(filas()[0]).getByRole("button", { name: "Añadir a Rodrigo Barrios" })).toBeEnabled();
      expect(within(filas()[1]).getByText("Rodrigo Silva")).toBeInTheDocument();
      expect(within(filas()[1]).getByRole("note")).toHaveTextContent("Está en campaña Otoño Norte. Reasignar primero.");
      expect(within(filas()[1]).getByRole("button", { name: "Añadir a Rodrigo Silva" })).toBeDisabled();
    });

    it("avisa cuando no hay coincidencias y borra la búsqueda con la X", async () => {
      montar();
      await buscarTexto("zzz");
      expect(screen.getByText("No hay cuentas que coincidan con tu búsqueda.")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));
      expect(caja()).toHaveValue("");
      expect(screen.getByRole("heading", { name: "PENDIENTES DE ASIGNACIÓN · 4" })).toBeInTheDocument();
    });

    it("con un solo resultado habla en singular", async () => {
      montar();
      await buscarTexto("martinez");
      expect(screen.getByRole("heading", { name: "1 RESULTADO PARA “MARTINEZ”" })).toBeInTheDocument();
    });

    it("una respuesta que llega tarde, de un texto que ya no es el que está escrito, se descarta", async () => {
      const pendientes = new Map<string, (r: ResultadoBusqueda) => void>();
      montar({ buscar: (texto) => new Promise((resolver) => pendientes.set(texto, resolver)) });

      await userEvent.type(caja(), "ana");
      await waitFor(() => expect(pendientes.has("ana")).toBe(true));
      await userEvent.type(caja(), "b");
      await waitFor(() => expect(pendientes.has("anab")).toBe(true));

      await act(async () => pendientes.get("anab")?.({ ok: true, candidatos: [cuenta(2, { nombre: "Anabel Nueva" })], hayMas: false }));
      await act(async () => pendientes.get("ana")?.({ ok: true, candidatos: [cuenta(1, { nombre: "Ana Vieja" })], hayMas: false }));

      expect(screen.getByText("Anabel Nueva")).toBeInTheDocument();
      expect(screen.queryByText("Ana Vieja")).not.toBeInTheDocument();
    });

    it("si el servidor rechaza la búsqueda, muestra su mensaje y «Reintentar» pide de nuevo", async () => {
      const buscar = vi.fn<Buscar>().mockResolvedValueOnce({ ok: false, mensaje: "Solo el coordinador de la campaña puede buscar cuentas." });
      buscar.mockImplementation(buscarEnLaSimulada);
      montar({ buscar });
      await buscarTexto("ana");

      expect(screen.getByRole("alert")).toHaveTextContent("Solo el coordinador de la campaña puede buscar cuentas.");
      expect(screen.queryByRole("list", { name: "Cuentas" })).not.toBeInTheDocument();
      expect(screen.queryByText("No hay cuentas que coincidan con tu búsqueda.")).not.toBeInTheDocument();
      // El buscador sigue vivo: nada queda trabado.
      expect(caja()).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
      await esperarResultados();

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "3 RESULTADOS PARA “ANA”" })).toBeInTheDocument();
      expect(buscar).toHaveBeenCalledTimes(2);
    });

    it("sin conexión lo dice con la acción y se puede reintentar", async () => {
      const buscar = vi.fn<Buscar>().mockRejectedValueOnce(new Error("sin red"));
      buscar.mockImplementation(buscarEnLaSimulada);
      montar({ buscar });
      await buscarTexto("ana");

      expect(screen.getByRole("alert")).toHaveTextContent(mensajeSinConexion("buscar cuentas"));

      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
      await esperarResultados();
      expect(screen.getByRole("heading", { name: "3 RESULTADOS PARA “ANA”" })).toBeInTheDocument();
    });

    it("escribir otra cosa después de un error de búsqueda lo deja atrás", async () => {
      const buscar = vi.fn<Buscar>().mockRejectedValueOnce(new Error("sin red"));
      buscar.mockImplementation(buscarEnLaSimulada);
      montar({ buscar });
      await buscarTexto("ana");
      expect(screen.getByRole("alert")).toBeInTheDocument();

      await userEvent.type(caja(), "b");
      await esperarResultados();

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "1 RESULTADO PARA “ANAB”" })).toBeInTheDocument();
    });

    it("borrar la búsqueda suelta la cuenta elegida", async () => {
      montar();
      await buscarTexto("ana");
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Ana Martínez" }));

      await userEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));

      expect(screen.queryByRole("region", { name: "Detalle de Ana Martínez" })).not.toBeInTheDocument();
      expect(screen.getByText("Elegí una cuenta para ver el detalle y añadirla.")).toBeInTheDocument();
    });
  });

  describe("paginación al llegar al final de la lista (de a 10)", () => {
    it("pide la primera página y, al llegar al final, la siguiente a partir de la última cuenta", async () => {
      const { buscar } = montar({ buscar: servidorConPaginas(25) });
      await buscarTexto("persona");

      expect(filas()).toHaveLength(10);
      expect(screen.getByRole("heading", { name: "10+ RESULTADOS PARA “PERSONA”" })).toBeInTheDocument();

      await ObservadorFalso.llegarAlFinal();

      await waitFor(() => expect(filas()).toHaveLength(20));
      expect(buscar).toHaveBeenLastCalledWith("persona", "usr-009");
      expect(screen.getByRole("heading", { name: "20+ RESULTADOS PARA “PERSONA”" })).toBeInTheDocument();
    });

    it("si una cuenta vuelve a venir en la página siguiente (el orden se movió entre pedidos), no se repite en la lista", async () => {
      const primera = Array.from({ length: 10 }, (_, i) => cuenta(i));
      const buscar: Buscar = async (_texto, despuesDe) =>
        despuesDe === null
          ? { ok: true, candidatos: primera, hayMas: true }
          : { ok: true, candidatos: [cuenta(9), cuenta(10), cuenta(11)], hayMas: false };
      montar({ buscar });
      await buscarTexto("persona");

      await ObservadorFalso.llegarAlFinal();

      await waitFor(() => expect(filas()).toHaveLength(12));
      expect(screen.getAllByRole("button", { name: "Elegir a Persona 009" })).toHaveLength(1);
    });

    it("una página corta cierra la lista: el título pasa a la cantidad exacta y no se pide más", async () => {
      const { buscar } = montar({ buscar: servidorConPaginas(25) });
      await buscarTexto("persona");
      await ObservadorFalso.llegarAlFinal();
      await waitFor(() => expect(filas()).toHaveLength(20));
      await ObservadorFalso.llegarAlFinal();
      await waitFor(() => expect(filas()).toHaveLength(25));

      expect(screen.getByRole("heading", { name: "25 RESULTADOS PARA “PERSONA”" })).toBeInTheDocument();
      const llamadas = buscar.mock.calls.length;
      await ObservadorFalso.llegarAlFinal();
      expect(buscar).toHaveBeenCalledTimes(llamadas);
    });

    it("con exactamente 10 resultados pide una página más, viene vacía y deja la lista como estaba", async () => {
      const { buscar } = montar({ buscar: servidorConPaginas(10) });
      await buscarTexto("persona");
      expect(screen.getByRole("heading", { name: "10+ RESULTADOS PARA “PERSONA”" })).toBeInTheDocument();

      await ObservadorFalso.llegarAlFinal();

      await waitFor(() => expect(screen.getByRole("heading", { name: "10 RESULTADOS PARA “PERSONA”" })).toBeInTheDocument());
      expect(buscar).toHaveBeenCalledTimes(2);
      expect(filas()).toHaveLength(10);
    });

    it("dos avisos seguidos de «llegó al final» antes de que conteste el servidor piden una sola página", async () => {
      let contestar: (r: ResultadoBusqueda) => void = () => undefined;
      const primera = servidorConPaginas(25);
      const { buscar } = montar({
        buscar: (texto, despuesDe) =>
          despuesDe === null ? primera(texto, null) : new Promise((resolver) => (contestar = resolver)),
      });
      await buscarTexto("persona");

      await ObservadorFalso.llegarAlFinal();
      await ObservadorFalso.llegarAlFinal();

      expect(buscar).toHaveBeenCalledTimes(2);
      expect(await screen.findByText("Cargando más cuentas…")).toBeInTheDocument();
      await act(async () => contestar({ ok: true, candidatos: [cuenta(10)], hayMas: false }));
      expect(screen.queryByText("Cargando más cuentas…")).not.toBeInTheDocument();
    });

    it("si la página siguiente falla, la lista que ya se ve queda, avisa y «Reintentar» pide esa misma página", async () => {
      const servidor = servidorConPaginas(25);
      const buscar = vi.fn<Buscar>((texto, despuesDe) => servidor(texto, despuesDe));
      montar({ buscar });
      await buscarTexto("persona");
      buscar.mockRejectedValueOnce(new Error("sin red"));

      await ObservadorFalso.llegarAlFinal();

      expect(await screen.findByRole("alert")).toHaveTextContent(mensajeSinConexion("cargar más cuentas"));
      expect(filas()).toHaveLength(10);
      // El aviso de «llegó al final» no reintenta solo en loop.
      const llamadas = buscar.mock.calls.length;
      await ObservadorFalso.llegarAlFinal();
      expect(buscar).toHaveBeenCalledTimes(llamadas);

      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

      await waitFor(() => expect(filas()).toHaveLength(20));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(buscar).toHaveBeenLastCalledWith("persona", "usr-009");
    });

    it("si el cursor se perdió, «Reintentar» busca de nuevo desde el principio", async () => {
      const servidor = servidorConPaginas(25);
      const buscar = vi.fn<Buscar>((texto, despuesDe) => servidor(texto, despuesDe));
      montar({ buscar });
      await buscarTexto("persona");
      buscar.mockResolvedValueOnce({ ok: false, mensaje: "Volvé a buscar desde el principio.", reiniciar: true });
      await ObservadorFalso.llegarAlFinal();
      expect(await screen.findByRole("alert")).toHaveTextContent("Volvé a buscar desde el principio.");

      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
      await esperarResultados();

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(filas()).toHaveLength(10);
      expect(buscar).toHaveBeenLastCalledWith("persona", null);
    });

    it("la página que llega cuando ya cambió la búsqueda no se mezcla con la nueva", async () => {
      const servidor = servidorConPaginas(25);
      let contestarSegunda: (r: ResultadoBusqueda) => void = () => undefined;
      montar({
        buscar: (texto, despuesDe) =>
          texto === "persona" && despuesDe !== null
            ? new Promise((resolver) => (contestarSegunda = resolver))
            : texto === "otra"
              ? Promise.resolve({ ok: true, candidatos: [cuenta(99, { nombre: "Otra Cuenta" })], hayMas: false })
              : servidor(texto, despuesDe),
      });
      await buscarTexto("persona");
      await ObservadorFalso.llegarAlFinal();

      await userEvent.clear(caja());
      await buscarTexto("otra");
      await act(async () => contestarSegunda({ ok: true, candidatos: [cuenta(10)], hayMas: false }));

      expect(filas()).toHaveLength(1);
      expect(screen.getByText("Otra Cuenta")).toBeInTheDocument();
      expect(screen.queryByText("Persona 010")).not.toBeInTheDocument();
    });

    it("con ↓ en la última cuenta pide la página siguiente aunque el final de la lista no se haya cruzado", async () => {
      const { buscar } = montar({ buscar: servidorConPaginas(25) });
      await buscarTexto("persona");

      await userEvent.keyboard("{ArrowDown>11/}");

      await waitFor(() => expect(filas()).toHaveLength(20));
      expect(buscar).toHaveBeenLastCalledWith("persona", "usr-009");
    });

    it("sin `IntersectionObserver` (navegador viejo) la vista no se rompe", async () => {
      vi.stubGlobal("IntersectionObserver", undefined);
      montar({ buscar: servidorConPaginas(25) });
      await buscarTexto("persona");

      expect(filas()).toHaveLength(10);
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

    it("una cuenta suspendida repite la ayuda bajo «Añadir», que queda apagado", async () => {
      montar();
      await buscarTexto("mariana");
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Mariana Olivera" }));

      const detalle = screen.getByRole("region", { name: "Detalle de Mariana Olivera" });
      expect(within(detalle).getByRole("note")).toHaveTextContent(
        "Cuenta suspendida. Pedí a un administrador que la reactive para añadirla.",
      );
      expect(within(detalle).getByText("Pedile a un administrador que la reactive.")).toBeInTheDocument();
      expect(within(detalle).queryByText("Le llega un aviso por email y en la app.")).not.toBeInTheDocument();
      expect(within(detalle).getByRole("button", { name: "Añadir a Verano 2026" })).toBeDisabled();
    });
  });

  describe("al añadir (la inscripción se manda a los 8 s, decisión del 30/09)", () => {
    it("marca la fila, suma al equipo con «Sin zona» y ofrece deshacer, sin llamar todavía al servidor", async () => {
      const { inscribir } = montar();
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Ana Martínez" }));
      const detalle = screen.getByRole("region", { name: "Detalle de Ana Martínez" });
      await userEvent.click(within(detalle).getByRole("button", { name: "Añadir a Verano 2026" }));

      expect(inscribir).not.toHaveBeenCalled();
      expect(await screen.findByRole("status")).toHaveTextContent("Añadiste a Ana Martínez a Verano 2026.");
      expect(anadirEnFila("Ana Martínez")).toHaveTextContent("Añadido ✓");
      expect(anadirEnFila("Ana Martínez")).toBeDisabled();
      const equipo = screen.getByRole("region", { name: "Ya en tu equipo" });
      expect(within(equipo).getAllByRole("listitem")).toHaveLength(7);
      expect(within(equipo).getByText("Sin zona")).toBeInTheDocument();
    });

    it("manda la inscripción justo a los 8 s y saca el aviso; la fila sigue «Añadido ✓»", async () => {
      vi.useFakeTimers();
      const { inscribir } = montar();
      await tocar(anadirEnFila("Gonzalo Sosa"));

      await pasar(MS_DESHACER - 1);
      expect(inscribir).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toBeInTheDocument();

      await pasar(1);

      expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-gonzalo-sosa");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(anadirEnFila("Gonzalo Sosa")).toHaveTextContent("Añadido ✓");
      expect(anadirEnFila("Valentina Bentancor")).toBeEnabled();
    });

    it("«Deshacer» antes de los 8 s cancela: nunca se manda y la cuenta puede volver a añadirse", async () => {
      vi.useFakeTimers();
      const { inscribir } = montar();
      await tocar(anadirEnFila("Gonzalo Sosa"));
      await pasar(5000);

      await tocar(screen.getByRole("button", { name: "Deshacer: Gonzalo Sosa" }));
      await pasar(MS_DESHACER * 2);

      expect(inscribir).not.toHaveBeenCalled();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();
      expect(within(screen.getByRole("region", { name: "Ya en tu equipo" })).getAllByRole("listitem")).toHaveLength(6);
    });

    it("«Deshacer» y volver a añadir a la misma cuenta arranca un aviso y un plazo nuevos", async () => {
      vi.useFakeTimers();
      const { inscribir } = montar();
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(6000);
      await tocar(screen.getByRole("button", { name: "Deshacer: Ana Martínez" }));
      await tocar(anadirEnFila("Ana Martínez"));

      // Los 6 s que ya corrieron del primer plazo no cuentan: faltan 8 s completos desde el segundo toque.
      await pasar(MS_DESHACER - 1);
      expect(inscribir).not.toHaveBeenCalled();
      expect(screen.getAllByRole("status")).toHaveLength(1);

      await pasar(1);
      expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-ana-martinez");
    });

    it("un rechazo del servidor de la cuenta que se está viendo dice el texto de la HU, saca la cuenta del equipo y habilita el botón", async () => {
      vi.useFakeTimers();
      const { inscribir } = montar({
        inscribir: async () => ({ ok: false, mensaje: "Está en campaña Otoño Norte. Reasignar primero." }),
      });
      await tocar(anadirEnFila("Ana Martínez"));

      await pasar(MS_DESHACER);

      expect(inscribir).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("alert").textContent).toBe("Está en campaña Otoño Norte. Reasignar primero.");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(anadirEnFila("Ana Martínez")).toHaveTextContent("Añadir");
      expect(anadirEnFila("Ana Martínez")).toBeEnabled();
      expect(within(screen.getByRole("region", { name: "Ya en tu equipo" })).getAllByRole("listitem")).toHaveLength(6);
    });

    it("un rechazo de una cuenta que ya no es la que se ve nombra a quien falló, para no leerse como un reproche a la otra", async () => {
      vi.useFakeTimers();
      montar({ inscribir: async () => ({ ok: false, mensaje: "Está en campaña Otoño Norte. Reasignar primero." }) });
      await tocar(anadirEnFila("Ana Martínez"));
      await tocar(screen.getByRole("button", { name: "Elegir a Gonzalo Sosa" }));

      await pasar(MS_DESHACER);

      expect(screen.getByRole("alert").textContent).toBe(
        mensajeAnadirRechazado("Ana Martínez", "Está en campaña Otoño Norte. Reasignar primero."),
      );
      expect(screen.getByRole("alert").textContent).toBe(
        "No se pudo añadir a Ana Martínez. Está en campaña Otoño Norte. Reasignar primero.",
      );
    });

    it("lo mismo si la cuenta salió de los resultados: el detalle ya no está a la vista", async () => {
      vi.useFakeTimers();
      montar({ inscribir: async () => ({ ok: false, mensaje: "La cuenta está suspendida." }) });
      await tocar(anadirEnFila("Ana Martínez"));
      await escribirConTiempoFalso("zzzz");

      await pasar(MS_DESHACER);

      expect(screen.getByRole("alert").textContent).toBe("No se pudo añadir a Ana Martínez. La cuenta está suspendida.");
    });
  });

  describe("atajos de teclado", () => {
    it("«/» enfoca el buscador", async () => {
      montar();
      await userEvent.keyboard("/");
      expect(caja()).toHaveFocus();
    });

    it("↓ y Enter recorren y eligen resultados", async () => {
      montar();
      await userEvent.click(caja());
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

    it("«/» con Ctrl, Meta o Alt no le roba el atajo al navegador", async () => {
      montar();
      await userEvent.keyboard("{Control>}/{/Control}");
      expect(caja()).not.toHaveFocus();
      await userEvent.keyboard("{Alt>}/{/Alt}");
      expect(caja()).not.toHaveFocus();
    });

    it("«/» escrito dentro del buscador se escribe y no salta", async () => {
      montar();
      await userEvent.click(caja());
      await userEvent.keyboard("a/b");
      expect(caja()).toHaveValue("a/b");
    });

    it("Esc con texto en el buscador solo lo limpia; recién el siguiente Esc sale a Equipo", async () => {
      montar();
      await userEvent.type(caja(), "ana");

      await userEvent.keyboard("{Escape}");

      expect(navegacion.push).not.toHaveBeenCalled();
      expect(caja()).toHaveValue("");
      await userEvent.keyboard("{Escape}");
      expect(navegacion.push).toHaveBeenCalledWith("/equipo");
    });
  });

  describe("Esc y salir con inscripciones por mandar", () => {
    it("Esc con avisos de «Deshacer» los cierra y manda lo añadido ya; el siguiente Esc, con todo contestado, sale", async () => {
      const { inscribir } = montar();
      await userEvent.click(anadirEnFila("Ana Martínez"));
      await userEvent.click(await screen.findByRole("button", { name: "Añadir a Gonzalo Sosa" }));
      expect(screen.getAllByRole("status")).toHaveLength(2);

      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(inscribir.mock.calls.map(([id]) => id).sort()).toEqual(["usr-ana-martinez", "usr-gonzalo-sosa"]);
      expect(anadirEnFila("Ana Martínez")).toHaveTextContent("Añadido ✓");
      await waitFor(() => expect(navegacion.push).not.toHaveBeenCalled());

      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(navegacion.push).toHaveBeenCalledWith("/equipo"));
    });

    it("Esc con una inscripción en camino espera a que conteste y recién entonces sale", async () => {
      let contestar: (r: ResultadoInscripcion) => void = () => undefined;
      const { inscribir } = montar({ inscribir: () => new Promise((resolver) => (contestar = resolver)) });
      await userEvent.click(anadirEnFila("Ana Martínez"));
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(inscribir).toHaveBeenCalledTimes(1));

      await userEvent.keyboard("{Escape}");
      expect(navegacion.push).not.toHaveBeenCalled();

      await act(async () => contestar({ ok: true }));
      await waitFor(() => expect(navegacion.push).toHaveBeenCalledWith("/equipo"));
    });

    it("dos Esc seguidos mientras espera no mandan a Equipo dos veces", async () => {
      let contestar: (r: ResultadoInscripcion) => void = () => undefined;
      const { inscribir } = montar({ inscribir: () => new Promise((resolver) => (contestar = resolver)) });
      await userEvent.click(anadirEnFila("Ana Martínez"));
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(inscribir).toHaveBeenCalledTimes(1));

      await userEvent.keyboard("{Escape}");
      await userEvent.keyboard("{Escape}");
      await act(async () => contestar({ ok: true }));

      await waitFor(() => expect(navegacion.push).toHaveBeenCalledWith("/equipo"));
      expect(navegacion.push).toHaveBeenCalledTimes(1);
    });

    it("si esa inscripción falla mientras espera para salir, no sale: el aviso se queda a la vista", async () => {
      let contestar: (r: ResultadoInscripcion) => void = () => undefined;
      const { inscribir } = montar({ inscribir: () => new Promise((resolver) => (contestar = resolver)) });
      await userEvent.click(anadirEnFila("Ana Martínez"));
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(inscribir).toHaveBeenCalledTimes(1));
      await userEvent.keyboard("{Escape}");

      await act(async () => contestar({ ok: false, mensaje: "La cuenta ya está en otra campaña." }));

      expect(await screen.findByRole("alert")).toHaveTextContent("La cuenta ya está en otra campaña.");
      expect(navegacion.push).not.toHaveBeenCalled();
      expect(anadirEnFila("Ana Martínez")).toBeEnabled();
    });

    it("si el servidor no contesta nunca, tras 10 s se va igual", async () => {
      vi.useFakeTimers();
      montar({ inscribir: () => new Promise(() => undefined) });
      await tocar(anadirEnFila("Ana Martínez"));
      await act(async () => {
        fireEvent.keyDown(document, { key: "Escape" });
      });
      await act(async () => {
        fireEvent.keyDown(document, { key: "Escape" });
      });
      expect(navegacion.push).not.toHaveBeenCalled();

      await pasar(10_000);

      expect(navegacion.push).toHaveBeenCalledWith("/equipo");
    });

    it("«‹ Equipo» con inscripciones por mandar las manda antes de irse", async () => {
      const { inscribir } = montar();
      await userEvent.click(anadirEnFila("Ana Martínez"));

      await userEvent.click(screen.getByRole("link", { name: "‹ Equipo" }));

      expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-ana-martinez");
      await waitFor(() => expect(navegacion.push).toHaveBeenCalledWith("/equipo"));
    });

    it("«‹ Equipo» sin nada por mandar es el enlace de siempre, sin interceptar", async () => {
      montar();
      const enlace = screen.getByRole("link", { name: "‹ Equipo" });
      const evento = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });

      enlace.dispatchEvent(evento);

      expect(evento.defaultPrevented).toBe(false);
      expect(navegacion.push).not.toHaveBeenCalled();
    });

    it("un clic con Ctrl en «‹ Equipo» abre otra pestaña y esta no manda nada", async () => {
      const { inscribir } = montar();
      await userEvent.click(anadirEnFila("Ana Martínez"));
      const evento = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true });

      screen.getByRole("link", { name: "‹ Equipo" }).dispatchEvent(evento);

      expect(evento.defaultPrevented).toBe(false);
      expect(inscribir).not.toHaveBeenCalled();
    });
  });

  describe("irse de la vista con una inscripción dentro del plazo (nunca se pierde sin aviso)", () => {
    it("al cambiar de ruta (se desmonta la vista) la pendiente se manda en ese momento", async () => {
      vi.useFakeTimers();
      const { inscribir, unmount } = montar();
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(2000);
      expect(inscribir).not.toHaveBeenCalled();

      unmount();

      expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-ana-martinez");
      // El plazo original no manda una segunda vez.
      await pasar(MS_DESHACER * 2);
      expect(inscribir).toHaveBeenCalledTimes(1);
    });

    it("al cerrar o recargar la pestaña (`pagehide`) también se manda, una sola vez", async () => {
      vi.useFakeTimers();
      const { inscribir, unmount } = montar();
      await tocar(anadirEnFila("Ana Martínez"));
      await tocar(anadirEnFila("Gonzalo Sosa"));

      window.dispatchEvent(new Event("pagehide"));
      expect(inscribir.mock.calls.map(([id]) => id).sort()).toEqual(["usr-ana-martinez", "usr-gonzalo-sosa"]);

      unmount();
      expect(inscribir).toHaveBeenCalledTimes(2);
    });

    it("lo que se deshizo no se manda al irse", async () => {
      vi.useFakeTimers();
      const { inscribir, unmount } = montar();
      await tocar(anadirEnFila("Ana Martínez"));
      await tocar(screen.getByRole("button", { name: "Deshacer: Ana Martínez" }));

      unmount();

      expect(inscribir).not.toHaveBeenCalled();
    });

    it("mientras hay algo por mandar, cerrar o recargar la pestaña pide confirmación; sin nada, no", async () => {
      vi.useFakeTimers();
      montar();
      const sinNada = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(sinNada);
      expect(sinNada.defaultPrevented).toBe(false);

      await tocar(anadirEnFila("Ana Martínez"));
      const conAlgo = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(conAlgo);
      expect(conAlgo.defaultPrevented).toBe(true);

      await tocar(screen.getByRole("button", { name: "Deshacer: Ana Martínez" }));
      const deshecho = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(deshecho);
      expect(deshecho.defaultPrevented).toBe(false);
    });

    it("con la inscripción ya en camino la confirmación sigue hasta que contesta", async () => {
      vi.useFakeTimers();
      let contestar: (r: ResultadoInscripcion) => void = () => undefined;
      montar({ inscribir: () => new Promise((resolver) => (contestar = resolver)) });
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(MS_DESHACER);

      const enCamino = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(enCamino);
      expect(enCamino.defaultPrevented).toBe(true);

      await act(async () => contestar({ ok: true }));
      const contestada = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(contestada);
      expect(contestada.defaultPrevented).toBe(false);
    });

    it("volver atrás y reentrar arranca limpio: sin búsqueda, sin elegido y sin avisos", async () => {
      const primera = montar();
      await buscarTexto("ana");
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Ana Martínez" }));
      primera.unmount();

      montar();

      expect(caja()).toHaveValue("");
      expect(screen.getByText("Elegí una cuenta para ver el detalle y añadirla.")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("casos límite al añadir", () => {
    it("un doble clic en «Añadir» inscribe una sola vez", async () => {
      vi.useFakeTimers();
      const { inscribir } = montar();

      await act(async () => {
        const boton = anadirEnFila("Ana Martínez");
        fireEvent.click(boton);
        fireEvent.click(boton);
      });
      // Los dos toques llegan antes de que la vista se repinte: un solo aviso y una sola suma al equipo.
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(within(screen.getByRole("region", { name: "Ya en tu equipo" })).getAllByRole("listitem")).toHaveLength(7);
      await pasar(MS_DESHACER);

      expect(inscribir).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("un doble clic con el aviso a la vista deja un solo aviso", async () => {
      montar();
      await userEvent.dblClick(anadirEnFila("Ana Martínez"));

      expect(await screen.findByRole("status")).toBeInTheDocument();
      expect(screen.getAllByRole("status")).toHaveLength(1);
    });

    it("dos añadidos seguidos: cada uno conserva su «Deshacer» y su propio plazo, y se mandan por separado", async () => {
      vi.useFakeTimers();
      const { inscribir } = montar();
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(3000);
      await tocar(anadirEnFila("Gonzalo Sosa"));
      expect(screen.getAllByRole("status")).toHaveLength(2);

      await pasar(MS_DESHACER - 3000);
      expect(inscribir.mock.calls.map(([id]) => id)).toEqual(["usr-ana-martinez"]);
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(screen.getByRole("status")).toHaveTextContent("Gonzalo Sosa");

      await pasar(3000);
      expect(inscribir.mock.calls.map(([id]) => id)).toEqual(["usr-ana-martinez", "usr-gonzalo-sosa"]);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("dos añadidos y «Deshacer» del primero: se manda solo el segundo", async () => {
      vi.useFakeTimers();
      const { inscribir } = montar();
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(3000);
      await tocar(anadirEnFila("Gonzalo Sosa"));

      await tocar(screen.getByRole("button", { name: "Deshacer: Ana Martínez" }));
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(anadirEnFila("Ana Martínez")).toBeEnabled();
      expect(anadirEnFila("Gonzalo Sosa")).toHaveTextContent("Añadido ✓");

      await pasar(MS_DESHACER * 2);
      expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-gonzalo-sosa");
    });

    it("si la llamada se cae a los 8 s, avisa, la cuenta vuelve a poder añadirse y se puede reintentar", async () => {
      vi.useFakeTimers();
      const inscribir = vi.fn<Inscribir>().mockRejectedValueOnce(new Error("sin red")).mockResolvedValue({ ok: true });
      montar({ inscribir });
      await tocar(anadirEnFila("Ana Martínez"));

      await pasar(MS_DESHACER);

      expect(screen.getByRole("alert")).toHaveTextContent(mensajeAnadirSinConexion("Ana Martínez"));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(anadirEnFila("Ana Martínez")).toBeEnabled();
      expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();

      await tocar(anadirEnFila("Ana Martínez"));
      expect(screen.getByRole("status")).toHaveTextContent("Añadiste a Ana Martínez a Verano 2026.");
      // Al volver a intentar, el aviso viejo de esa cuenta se va.
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      await pasar(MS_DESHACER);
      expect(inscribir).toHaveBeenCalledTimes(2);
      expect(anadirEnFila("Ana Martínez")).toHaveTextContent("Añadido ✓");
    });

    it("un fallo de una cuenta no frena ni pisa a la otra: cada una con su aviso", async () => {
      vi.useFakeTimers();
      const { inscribir } = montar({
        inscribir: async (id) =>
          id === "usr-ana-martinez"
            ? { ok: false, mensaje: "La cuenta ya está en otra campaña." }
            : id === "usr-gonzalo-sosa"
              ? { ok: false, mensaje: "La cuenta está suspendida." }
              : { ok: true },
      });
      await tocar(anadirEnFila("Ana Martínez"));
      await tocar(anadirEnFila("Gonzalo Sosa"));
      await tocar(anadirEnFila("Valentina Bentancor"));

      await pasar(MS_DESHACER);

      expect(inscribir).toHaveBeenCalledTimes(3);
      const avisos = screen.getAllByRole("alert").map((a) => a.textContent);
      expect(avisos).toEqual([
        mensajeAnadirRechazado("Ana Martínez", "La cuenta ya está en otra campaña."),
        mensajeAnadirRechazado("Gonzalo Sosa", "La cuenta está suspendida."),
      ]);
      expect(anadirEnFila("Valentina Bentancor")).toHaveTextContent("Añadido ✓");
      const equipo = within(screen.getByRole("region", { name: "Ya en tu equipo" }));
      expect(equipo.getAllByRole("listitem")).toHaveLength(7);
      expect(equipo.getByText("Valentina Bentancor")).toBeInTheDocument();
    });

    it("el aviso de un fallo no se va al escribir ni al elegir otra cuenta: se va al volver a intentar esa", async () => {
      vi.useFakeTimers();
      const inscribir = vi
        .fn<Inscribir>()
        .mockResolvedValueOnce({ ok: false, mensaje: "La cuenta ya está en otra campaña." })
        .mockResolvedValue({ ok: true });
      montar({ inscribir });
      await tocar(anadirEnFila("Ana Martínez"));
      await pasar(MS_DESHACER);
      expect(screen.getByRole("alert")).toBeInTheDocument();

      await escribirConTiempoFalso("g");
      await tocar(screen.getByRole("button", { name: "Elegir a Gonzalo Sosa" }));
      expect(screen.getByRole("alert")).toBeInTheDocument();

      await escribirConTiempoFalso("");
      await tocar(anadirEnFila("Ana Martínez"));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("una cuenta que ya salió de los resultados igual se manda a su hora", async () => {
      vi.useFakeTimers();
      const { inscribir } = montar();
      await tocar(anadirEnFila("Ana Martínez"));

      await escribirConTiempoFalso("zzzz");
      expect(screen.queryByRole("button", { name: "Añadir a Ana Martínez" })).not.toBeInTheDocument();
      await pasar(MS_DESHACER);

      expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-ana-martinez");
    });

    it("una cuenta añadida y buscada de nuevo antes de que se mande sigue marcada «Añadido ✓»", async () => {
      vi.useFakeTimers();
      montar();
      await tocar(anadirEnFila("Ana Martínez"));

      await escribirConTiempoFalso("ana");

      expect(anadirEnFila("Ana Martínez")).toHaveTextContent("Añadido ✓");
      expect(anadirEnFila("Ana Martínez")).toBeDisabled();
    });
  });

  describe("foco", () => {
    it("tras «Añadir» el foco queda en la fila de la cuenta y no en el body", async () => {
      montar();
      await userEvent.click(anadirEnFila("Ana Martínez"));

      expect(screen.getByRole("button", { name: "Elegir a Ana Martínez" }).closest("li")).toHaveFocus();
    });

    it("desde el detalle: el foco va a la fila de la cuenta", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Ana Martínez" }));
      const detalle = screen.getByRole("region", { name: "Detalle de Ana Martínez" });
      await userEvent.click(within(detalle).getByRole("button", { name: "Añadir a Verano 2026" }));

      expect(screen.getByRole("button", { name: "Elegir a Ana Martínez" }).closest("li")).toHaveFocus();
    });

    it("si ya está escribiendo en el buscador cuando falla el envío, no se le roba el foco", async () => {
      vi.useFakeTimers();
      montar({ inscribir: async () => ({ ok: false, mensaje: "La cuenta ya está en otra campaña." }) });
      await tocar(anadirEnFila("Ana Martínez"));
      await act(async () => {
        caja().focus();
        fireEvent.change(caja(), { target: { value: "ana" } });
      });

      await pasar(MS_DESHACER);

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(caja()).toHaveFocus();
      expect(caja()).toHaveValue("ana");
    });

    it("si el plazo vence con el foco en «Deshacer», ese botón desaparece y el foco vuelve a la fila", async () => {
      vi.useFakeTimers();
      montar();
      await tocar(anadirEnFila("Ana Martínez"));
      await act(async () => {
        screen.getByRole("button", { name: "Deshacer: Ana Martínez" }).focus();
      });

      await pasar(MS_DESHACER);

      expect(screen.getByRole("button", { name: "Elegir a Ana Martínez" }).closest("li")).toHaveFocus();
    });

    it("si el plazo vence con el foco en otro lado, no se mueve", async () => {
      vi.useFakeTimers();
      montar();
      await tocar(anadirEnFila("Ana Martínez"));
      await act(async () => {
        caja().focus();
      });

      await pasar(MS_DESHACER);

      expect(caja()).toHaveFocus();
    });

    it("tras «Deshacer» el foco vuelve a la fila, y si la cuenta ya no está en los resultados, al buscador", async () => {
      montar();
      await userEvent.click(anadirEnFila("Ana Martínez"));
      await userEvent.click(await screen.findByRole("button", { name: "Deshacer: Ana Martínez" }));
      expect(screen.getByRole("button", { name: "Elegir a Ana Martínez" }).closest("li")).toHaveFocus();

      await userEvent.click(anadirEnFila("Ana Martínez"));
      const deshacer = await screen.findByRole("button", { name: "Deshacer: Ana Martínez" });
      await buscarTexto("zzzz");
      await userEvent.click(deshacer);
      expect(caja()).toHaveFocus();
    });
  });

  describe("datos límite", () => {
    it("nombres, emails y campaña larguísimos: la fila, el detalle y el botón cortan línea en vez de desbordar", async () => {
      const largo = "de apellido larguísimo ".repeat(8).trim();
      const campania = "Campaña de verano de la región metropolitana oeste y el litoral, segunda etapa 2026-2027";
      const larga = cuenta(1, { nombre: `Persona ${largo}`, email: `persona.${"x".repeat(80)}@example.com` });
      montar({ datos: { ...DATOS_ANADIR_COLPORTOR_SIMULADO, campania, sugeridos: [larga] } });
      await userEvent.click(screen.getByRole("button", { name: `Elegir a ${larga.nombre}` }));

      const titulo = screen.getByRole("heading", { name: `Añadir colportor a ${campania}` });
      expect(titulo).toHaveClass("break-words");
      expect(titulo).not.toHaveClass("whitespace-nowrap");
      expect(screen.getAllByText(larga.email)[0]).toHaveClass("break-all");
      const boton = within(screen.getByRole("region", { name: `Detalle de ${larga.nombre}` })).getByRole("button", {
        name: `Añadir a ${campania}`,
      });
      expect(boton).toHaveClass("whitespace-normal", "wrap-anywhere", "h-auto", "max-w-full");
    });

    it("un nombre de campaña larguísimo y sin espacios también se parte: el botón del detalle lleva `wrap-anywhere`", async () => {
      // Sin espacios `whitespace-normal` no tiene dónde cortar, y `break-words` no alcanza en un botón `inline-flex`: su texto es un
      // ítem flex que no baja de la palabra más larga. En Chromium a 1280 px, con `break-words` el texto medía 553 px dentro de un
      // botón de 474 (desbordaba) y con `wrap-anywhere` mide 474. jsdom no mide el diseño, así que acá se comprueba la clase.
      const campania = "CampañaDeVeranoDeLaRegionMetropolitanaOesteYElLitoralSegundaEtapaDosMilVeintiseisVeintisiete";
      montar({ datos: { ...DATOS_ANADIR_COLPORTOR_SIMULADO, campania } });
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Ana Martínez" }));

      const boton = within(screen.getByRole("region", { name: "Detalle de Ana Martínez" })).getByRole("button", {
        name: `Añadir a ${campania}`,
      });
      expect(boton).toHaveClass("wrap-anywhere", "whitespace-normal", "max-w-full");
      expect(screen.getByRole("heading", { name: `Añadir colportor a ${campania}` })).toHaveClass("break-words");
    });

    it("un equipo de 200 personas y 300 resultados en 30 páginas se listan sin romperse", async () => {
      const equipoActual = Array.from({ length: 200 }, (_, i) => ({ id: `col-${i}`, nombre: `Colportor ${i}`, zonaNombre: null }));
      montar({ buscar: servidorConPaginas(300), datos: { ...DATOS_ANADIR_COLPORTOR_SIMULADO, equipoActual } });
      await buscarTexto("persona");
      for (let pagina = 2; pagina <= 30; pagina++) {
        await ObservadorFalso.llegarAlFinal();
        await waitFor(() => expect(filas()).toHaveLength(pagina * 10));
      }

      // La página 30 vino llena: puede haber más. La que sigue viene vacía y recién ahí se sabe que son 300.
      expect(screen.getByRole("heading", { name: "300+ RESULTADOS PARA “PERSONA”" })).toBeInTheDocument();
      await ObservadorFalso.llegarAlFinal();
      expect(await screen.findByRole("heading", { name: "300 RESULTADOS PARA “PERSONA”" })).toBeInTheDocument();
      expect(filas()).toHaveLength(300);
      expect(within(screen.getByRole("region", { name: "Ya en tu equipo" })).getAllByRole("listitem")).toHaveLength(200);
      // 30 páginas de a 10 filas más las 200 del equipo en jsdom tardan: el tope de 5 s del resto no alcanza.
    }, 30_000);
  });

  describe("reactivar una inscripción borrada (decisión del 02/10)", () => {
    const quitado = cuenta(7, {
      id: "usr-tomas-rivero",
      nombre: "Tomás Rivero",
      email: "tomas.rivero@example.com",
      cuentaCreada: "2026-08-18",
    });
    const buscarAQuitado: Buscar = async () => ({ ok: true, candidatos: [quitado], hayMas: false });

    it("quien el coordinador quitó (HU-CAM-005) aparece como cualquier cuenta pendiente, sin bloqueo ni aviso aparte", async () => {
      montar({ buscar: buscarAQuitado });

      await buscarTexto("rivero");

      expect(screen.getByRole("heading", { name: "1 RESULTADO PARA “RIVERO”" })).toBeInTheDocument();
      expect(screen.getByText("◔ Pendiente de asignación")).toBeInTheDocument();
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
      expect(anadirEnFila("Tomás Rivero")).toBeEnabled();
    });

    it("al volver a sumarlo, la vista llama a la misma inscripción y lo muestra en «Ya en tu equipo» sin zona", async () => {
      vi.useFakeTimers();
      const { inscribir } = montar({ buscar: buscarAQuitado });
      await escribirConTiempoFalso("tomas.rivero");

      await tocar(anadirEnFila("Tomás Rivero"));
      await pasar(MS_DESHACER);

      expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-tomas-rivero");
      const fila = within(screen.getByRole("region", { name: "Ya en tu equipo" })).getByText("Tomás Rivero").closest("li");
      expect(fila).toHaveTextContent("Sin zona");
    });
  });
});
