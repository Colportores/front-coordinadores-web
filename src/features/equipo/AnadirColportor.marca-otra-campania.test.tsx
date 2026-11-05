import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CandidatoColportor,
  DatosAnadirColportor,
  ResultadoBusqueda,
  ResultadoInscripcion,
} from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO } from "@/datos/equipo/simulado";
import { AnadirColportor, MS_DESHACER } from "@/features/equipo/AnadirColportor";
import { MS_ESPERA_BUSQUEDA } from "@/features/equipo/useBusquedaCandidatos";

/**
 * La marca de «otra campaña» (`CI007`) de la vista 23 (seguimiento #54 de #51): una cuenta rechazada porque está en otra
 * campaña queda bloqueada en la fila, pero esa marca vale solo hasta que el servidor contesta una búsqueda nueva. Si ese dato
 * más nuevo la trae libre (alguien la liberó), la fila vuelve a poder añadirse; si la trae todavía en otra campaña, se
 * muestra la que dice el servidor.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

type Buscar = (texto: string, despuesDe: string | null) => Promise<ResultadoBusqueda>;

const ana: CandidatoColportor = {
  id: "usr-ana-martinez",
  nombre: "Ana Martínez",
  email: "ana.martinez@example.com",
  estadoCuenta: "pendiente_asignacion",
  campaniaActual: null,
  enOtraCampania: false,
  cuentaCreada: "2026-09-22",
};
const gonzalo: CandidatoColportor = {
  id: "usr-gonzalo-sosa",
  nombre: "Gonzalo Sosa",
  email: "gonzalo.sosa@example.com",
  estadoCuenta: "pendiente_asignacion",
  campaniaActual: null,
  enOtraCampania: false,
  cuentaCreada: "2026-09-21",
};
const pedro: CandidatoColportor = {
  id: "usr-pedro-lopez",
  nombre: "Pedro López",
  email: "pedro.lopez@example.com",
  estadoCuenta: "pendiente_asignacion",
  campaniaActual: null,
  enOtraCampania: false,
  cuentaCreada: "2026-09-20",
};

const DATOS: DatosAnadirColportor = { ...DATOS_ANADIR_COLPORTOR_SIMULADO, sugeridos: [ana, gonzalo] };

const rechazoPorOtraCampania: ResultadoInscripcion = {
  ok: false,
  mensaje: "Está en campaña Otoño Norte. Reasignar primero.",
  campaniaEnConflicto: { id: "camp-otonio", nombre: "Otoño Norte" },
};

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
    await act(async () => {});
    await act(async () => {
      for (const o of ObservadorFalso.todos.filter((x) => !x.desconectado)) {
        o.alCruzar([{ isIntersecting: true } as IntersectionObserverEntry], o as unknown as IntersectionObserver);
      }
    });
  }
}

function montar(buscar: Buscar, inscribir: (id: string) => Promise<ResultadoInscripcion> = async () => rechazoPorOtraCampania) {
  const buscarMock = vi.fn(buscar);
  const inscribirMock = vi.fn(inscribir);
  const vista = render(<AnadirColportor datos={DATOS} inscribir={inscribirMock} buscar={buscarMock} />);
  return { buscar: buscarMock, inscribir: inscribirMock, ...vista };
}

const caja = () => screen.getByRole("textbox", { name: "Buscar por email o nombre" });
const anadirEnFila = (nombre: string) => screen.getByRole("button", { name: `Añadir a ${nombre}` });
const fila = (nombre: string) => screen.getByRole("button", { name: `Elegir a ${nombre}` }).closest("li");

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

async function escribir(texto: string) {
  await act(async () => {
    fireEvent.change(caja(), { target: { value: texto } });
  });
  await pasar(MS_ESPERA_BUSQUEDA);
}

/** Añade a la cuenta y deja pasar el plazo del «Deshacer»: la base la rechaza por estar en otra campaña. */
async function anadirYQuedarRechazada(nombre: string) {
  await tocar(anadirEnFila(nombre));
  await pasar(MS_DESHACER);
}

beforeEach(() => {
  vi.useFakeTimers();
  ObservadorFalso.todos = [];
  vi.stubGlobal("IntersectionObserver", ObservadorFalso);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("la marca de «otra campaña» (CI007) y las búsquedas nuevas", () => {
  it("rechazo CI007 → la fila se bloquea → una búsqueda nueva que la trae libre → la fila vuelve a poder añadirse", async () => {
    montar(async () => ({ ok: true, candidatos: [{ ...ana }], hayMas: false }));
    await anadirYQuedarRechazada("Ana Martínez");
    expect(anadirEnFila("Ana Martínez")).toBeDisabled();
    expect(fila("Ana Martínez")).toHaveTextContent("Campaña actual: Otoño Norte");

    await escribir("ana");

    expect(anadirEnFila("Ana Martínez")).toBeEnabled();
    expect(fila("Ana Martínez")).toHaveTextContent("Campaña actual: sin campaña");
  });

  it("quien sigue en una campaña en curso pero la base lo deja añadir a esta (por empezar) no sale bloqueado y se añade", async () => {
    const { inscribir } = montar(async () => ({
      ok: true,
      candidatos: [{ ...ana, campaniaActual: "Otoño Norte", enOtraCampania: false }],
      hayMas: false,
    }));
    await escribir("ana");

    expect(anadirEnFila("Ana Martínez")).toBeEnabled();
    expect(fila("Ana Martínez")).toHaveTextContent("Campaña actual: Otoño Norte");
    expect(fila("Ana Martínez")).not.toHaveTextContent("Reasignar primero");

    await act(async () => {
      fireEvent.click(anadirEnFila("Ana Martínez"));
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(inscribir).toHaveBeenCalledExactlyOnceWith(ana.id);
  });

  it("una búsqueda nueva que todavía la trae en otra campaña la mantiene bloqueada, con la campaña que dice el servidor", async () => {
    montar(async () => ({ ok: true, candidatos: [{ ...ana, campaniaActual: "Invierno Sur", enOtraCampania: true }], hayMas: false }));
    await anadirYQuedarRechazada("Ana Martínez");

    await escribir("ana");

    expect(anadirEnFila("Ana Martínez")).toBeDisabled();
    expect(fila("Ana Martínez")).toHaveTextContent("Campaña actual: Invierno Sur");
    expect(fila("Ana Martínez")).not.toHaveTextContent("Otoño Norte");
  });

  it("el rechazo de una búsqueda ya hecha (la cuenta llegó por la búsqueda) también bloquea y sigue bloqueada hasta la próxima", async () => {
    const { buscar } = montar(async () => ({ ok: true, candidatos: [{ ...ana }], hayMas: false }));
    await escribir("ana");
    expect(buscar).toHaveBeenCalledTimes(1);

    await anadirYQuedarRechazada("Ana Martínez");
    expect(anadirEnFila("Ana Martínez")).toBeDisabled();
    // Pasa el tiempo sin una búsqueda nueva: la marca no se cae sola.
    await pasar(60_000);
    expect(anadirEnFila("Ana Martínez")).toBeDisabled();

    await escribir("ana m");

    expect(buscar).toHaveBeenCalledTimes(2);
    expect(anadirEnFila("Ana Martínez")).toBeEnabled();
  });

  it("la marca de una cuenta no afecta a otras, antes ni después de la búsqueda nueva", async () => {
    montar(async () => ({ ok: true, candidatos: [{ ...ana }, { ...gonzalo }], hayMas: false }));
    await anadirYQuedarRechazada("Ana Martínez");
    expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();

    await escribir("o");

    expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();
    expect(anadirEnFila("Ana Martínez")).toBeEnabled();
  });

  it("si la búsqueda nueva ya no trae a la cuenta, y después otra sí, la fila viene con lo que dice el servidor (no con una marca vieja)", async () => {
    const respuestas: CandidatoColportor[][] = [[{ ...gonzalo }], [{ ...ana }]];
    montar(async () => ({ ok: true, candidatos: respuestas.shift() ?? [], hayMas: false }));
    await anadirYQuedarRechazada("Ana Martínez");

    await escribir("gonzalo");
    await escribir("ana");

    expect(anadirEnFila("Ana Martínez")).toBeEnabled();
  });

  it("pedir la página siguiente de una búsqueda no suelta la marca de las cuentas que ya estaban en la lista", async () => {
    const buscar: Buscar = async (_texto, despuesDe) =>
      despuesDe === null
        ? { ok: true, candidatos: [{ ...ana }, { ...gonzalo }], hayMas: true }
        : { ok: true, candidatos: [{ ...pedro }], hayMas: false };
    const { buscar: buscarMock } = montar(buscar);
    await escribir("a");
    await anadirYQuedarRechazada("Ana Martínez");
    expect(anadirEnFila("Ana Martínez")).toBeDisabled();

    await ObservadorFalso.llegarAlFinal();

    expect(buscarMock).toHaveBeenLastCalledWith("a", gonzalo.id);
    expect(anadirEnFila("Pedro López")).toBeEnabled();
    expect(anadirEnFila("Ana Martínez")).toBeDisabled();
  });

  it("una sugerida rechazada sigue bloqueada si se busca otra cosa y se borra el texto: los sugeridos no se refrescan", async () => {
    const { buscar } = montar(async () => ({ ok: true, candidatos: [{ ...gonzalo }], hayMas: false }));
    await anadirYQuedarRechazada("Ana Martínez");
    expect(anadirEnFila("Ana Martínez")).toBeDisabled();

    await escribir("gonzalo");
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Añadir a Ana Martínez" })).not.toBeInTheDocument();
    await escribir("");

    expect(fila("Ana Martínez")).toHaveTextContent("Campaña actual: Otoño Norte");
    expect(anadirEnFila("Ana Martínez")).toBeDisabled();
    expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();
  });

  it("una respuesta tardía que se descarta (se siguió escribiendo) no cuenta como dato nuevo: la fila que se ve sigue bloqueada", async () => {
    const colgadas = new Map<string, (r: ResultadoBusqueda) => void>();
    const buscar: Buscar = (texto) =>
      texto === "ana m"
        ? new Promise<ResultadoBusqueda>((resolver) => colgadas.set(texto, resolver))
        : Promise.resolve({ ok: true, candidatos: [{ ...ana }], hayMas: false });
    montar(buscar);
    await escribir("ana");
    await anadirYQuedarRechazada("Ana Martínez");
    expect(anadirEnFila("Ana Martínez")).toBeDisabled();

    // «ana m» sale al servidor y queda colgada; se vuelve a «ana» antes de que conteste, así que esa respuesta ya no vale.
    await escribir("ana m");
    expect(colgadas.has("ana m")).toBe(true);
    await act(async () => {
      fireEvent.change(caja(), { target: { value: "ana" } });
    });
    await act(async () => {
      colgadas.get("ana m")?.({ ok: true, candidatos: [], hayMas: false });
    });
    await pasar(0);

    expect(anadirEnFila("Ana Martínez")).toBeDisabled();
    expect(fila("Ana Martínez")).toHaveTextContent("Campaña actual: Otoño Norte");
  });

  it("volver atrás y reentrar arranca sin marcas: la cuenta del servidor se ve como viene", async () => {
    const primera = montar(async () => ({ ok: true, candidatos: [{ ...ana }], hayMas: false }));
    await anadirYQuedarRechazada("Ana Martínez");
    expect(anadirEnFila("Ana Martínez")).toBeDisabled();
    primera.unmount();

    montar(async () => ({ ok: true, candidatos: [{ ...ana }], hayMas: false }));

    expect(anadirEnFila("Ana Martínez")).toBeEnabled();
    expect(fila("Ana Martínez")).toHaveTextContent("Campaña actual: sin campaña");
  });

  it("un rechazo por otro motivo no deja ninguna marca", async () => {
    montar(
      async () => ({ ok: true, candidatos: [{ ...ana }], hayMas: false }),
      async () => ({ ok: false, mensaje: "La campaña no está activa: solo se inscribe en una campaña vigente." }),
    );

    await anadirYQuedarRechazada("Ana Martínez");

    expect(anadirEnFila("Ana Martínez")).toBeEnabled();
    expect(fila("Ana Martínez")).toHaveTextContent("Campaña actual: sin campaña");
  });
});
