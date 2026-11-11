import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CandidatoColportor,
  DatosAnadirColportor,
  ResultadoBusqueda,
  ResultadoInscripcion,
} from "@/datos/equipo/contrato";
import { crearFuenteAnadirRpc } from "@/datos/equipo/rpc";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { AnadirColportor, MS_DESHACER } from "@/features/equipo/AnadirColportor";
import { iniciales } from "@/features/equipo/candidatos";
import { SinCampaniaParaAnadir } from "@/features/equipo/SinCampaniaParaAnadir";
import { MS_ESPERA_BUSQUEDA } from "@/features/equipo/useBusquedaCandidatos";

/**
 * QA de la vista 23 conectada a las RPC (PR #51, issue #41), 16/10: los estados y casos límite que se agregaron con la
 * búsqueda en el servidor y el «Deshacer» de 8 s. Lo que ya cubren `AnadirColportor.test.tsx` y `.qa.test.tsx` no se repite.
 * Los de «hallazgos» fueron `it.skip` hasta que se arreglaron.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

type Buscar = (texto: string, despuesDe: string | null) => Promise<ResultadoBusqueda>;

function cuenta(i: number, parcial: Partial<CandidatoColportor> = {}): CandidatoColportor {
  return {
    id: `usr-${String(i).padStart(3, "0")}`,
    nombre: `Persona ${String(i).padStart(3, "0")}`,
    email: `persona${i}@example.com`,
    estadoCuenta: "pendiente_asignacion",
    campaniaActual: null,
    enOtraCampania: false,
    cuentaCreada: "2026-09-01",
    ...parcial,
  };
}

function montar(
  opciones: {
    inscribir?: (id: string) => Promise<ResultadoInscripcion>;
    buscar?: Buscar;
    datos?: DatosAnadirColportor;
  } = {},
) {
  const inscribir = vi.fn(opciones.inscribir ?? (async () => ({ ok: true as const })));
  const buscar = vi.fn(opciones.buscar ?? ((texto, despuesDe) => fuenteEquipoSimulada.buscarCandidatos("c", texto, despuesDe)));
  const vista = render(
    <AnadirColportor datos={opciones.datos ?? DATOS_ANADIR_COLPORTOR_SIMULADO} inscribir={inscribir} buscar={buscar} />,
  );
  return { inscribir, buscar, ...vista };
}

const caja = () => screen.getByRole("textbox", { name: "Buscar por email o nombre" });
const anadirEnFila = (nombre: string) => screen.getByRole("button", { name: `Añadir a ${nombre}` });

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

/** axe en jsdom no mide contraste: el contraste se midió en Chromium (ver el comentario del PR). */
async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

/** Una unidad suelta de un par sustituto (la mitad de un emoji) no es texto válido: el navegador la pinta «�». */
const TIENE_MITAD_DE_EMOJI = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

afterEach(() => {
  vi.useRealTimers();
});

describe("QA #41 · los plazos de la decisión de Cristian, literales", () => {
  it("«Deshacer» dura 8 s exactos: a los 7999 ms no se mandó nada y a los 8000 sí", async () => {
    vi.useFakeTimers();
    const { inscribir } = montar();
    await tocar(anadirEnFila("Ana Martínez"));

    await pasar(7999);
    expect(inscribir).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Añadiste a Ana Martínez a Verano 2026.");

    await pasar(1);
    expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-ana-martinez");
    expect(MS_DESHACER).toBe(8000);
  });

  it("la búsqueda espera 250 ms después de la última tecla: a los 249 ms no pidió nada y a los 250 sí", async () => {
    vi.useFakeTimers();
    const { buscar } = montar();
    await act(async () => {
      fireEvent.change(caja(), { target: { value: "ana" } });
    });

    await pasar(249);
    expect(buscar).not.toHaveBeenCalled();
    await pasar(1);
    expect(buscar).toHaveBeenCalledExactlyOnceWith("ana", null);
    expect(MS_ESPERA_BUSQUEDA).toBe(250);
  });
});

describe("QA #41 · búsqueda lenta y reintentos", () => {
  it("una respuesta lenta de una búsqueda que ya se borró no pisa los sugeridos", async () => {
    let contestar: (r: ResultadoBusqueda) => void = () => undefined;
    const buscar = vi.fn(() => new Promise<ResultadoBusqueda>((resolver) => (contestar = resolver)));
    montar({ buscar });
    await userEvent.type(caja(), "ana");
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1));
    await userEvent.clear(caja());

    await act(async () => contestar({ ok: true, candidatos: [cuenta(1, { nombre: "Cuenta tardía" })], hayMas: false }));

    expect(screen.queryByText("Cuenta tardía")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^PENDIENTES DE ASIGNACIÓN · \d+$/ })).toBeInTheDocument();
    expect(screen.queryByText("Buscando cuentas…")).not.toBeInTheDocument();
  });

  it("un doble clic en «Reintentar» tras un error de búsqueda pide una sola vez más", async () => {
    const buscar = vi
      .fn<Buscar>()
      .mockResolvedValueOnce({ ok: false, mensaje: "No se pudo buscar cuentas. Probá de nuevo más tarde." })
      .mockResolvedValue({ ok: true, candidatos: [cuenta(1)], hayMas: false });
    montar({ buscar });
    await userEvent.type(caja(), "pers");
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    // El segundo clic del doble cae donde ya no hay botón: la vista dice «Buscando…» y no pide dos veces.
    await userEvent.dblClick(screen.queryByRole("button", { name: "Reintentar" }) ?? caja());

    expect(await screen.findByRole("button", { name: "Elegir a Persona 001" })).toBeInTheDocument();
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("un doble clic en «Reintentar» de la página siguiente pide esa página una sola vez", async () => {
    const primera = Array.from({ length: 10 }, (_, i) => cuenta(i));
    let llamadas = 0;
    const buscar = vi.fn<Buscar>(async (_texto, despuesDe) => {
      if (despuesDe === null) return { ok: true, candidatos: primera, hayMas: true };
      llamadas += 1;
      if (llamadas === 1) return { ok: false, mensaje: "No se pudo buscar cuentas. Probá de nuevo más tarde." };
      return { ok: true, candidatos: [cuenta(10)], hayMas: false };
    });
    montar({ buscar });
    await userEvent.type(caja(), "pers");
    await screen.findByRole("button", { name: "Elegir a Persona 009" });
    // Sin `IntersectionObserver` (jsdom) la página siguiente se pide con ↓ en la última cuenta.
    await userEvent.click(caja());
    await userEvent.keyboard("{ArrowDown>11/}");
    const reintentar = await screen.findByRole("button", { name: "Reintentar" });

    await userEvent.dblClick(reintentar);

    expect(await screen.findByRole("button", { name: "Elegir a Persona 010" })).toBeInTheDocument();
    // primera página + la que falló + un solo reintento
    expect(buscar).toHaveBeenCalledTimes(3);
  });

  it("«Cargando más cuentas…» y el error de la página siguiente son accesibles (axe A/AA) y no tapan la lista", async () => {
    const primera = Array.from({ length: 10 }, (_, i) => cuenta(i));
    let contestar: (r: ResultadoBusqueda) => void = () => undefined;
    const buscar = vi.fn<Buscar>((_texto, despuesDe) =>
      despuesDe === null
        ? Promise.resolve({ ok: true, candidatos: primera, hayMas: true })
        : new Promise<ResultadoBusqueda>((resolver) => (contestar = resolver)),
    );
    const { container } = montar({ buscar });
    await userEvent.type(caja(), "pers");
    await screen.findByRole("button", { name: "Elegir a Persona 009" });
    await userEvent.click(caja());
    await userEvent.keyboard("{ArrowDown>11/}");

    expect(await screen.findByText("Cargando más cuentas…")).toBeInTheDocument();
    expect(await violaciones(container)).toEqual([]);

    await act(async () => contestar({ ok: false, mensaje: "No se pudo buscar cuentas. Probá de nuevo más tarde." }));
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo buscar cuentas. Probá de nuevo más tarde.");
    expect(within(screen.getByRole("list", { name: "Cuentas" })).getAllByRole("listitem")).toHaveLength(10);
    expect(await violaciones(container)).toEqual([]);
  });
});

describe("QA #41 · sin campaña en curso", () => {
  it("dice qué pasa, deja volver a Equipo y es accesible (axe A/AA)", async () => {
    const { container } = render(<SinCampaniaParaAnadir />);
    expect(screen.getByRole("status")).toHaveTextContent("No tenés una campaña en curso ni por empezar a la que añadir colportores.");
    expect(screen.getByRole("link", { name: "‹ Equipo" })).toHaveAttribute("href", "/equipo");
    expect(await violaciones(container)).toEqual([]);
  });
});

describe("QA #41 · hallazgos de la corrida del 16/10 (arreglados)", () => {
  it("QA #41 · un texto pegado muy largo no se repite entero en el título de la lista: se corta o se parte (si no, pisa la columna del detalle)", async () => {
    montar();
    await userEvent.click(caja());
    await userEvent.paste("x".repeat(5000));
    await waitFor(() => expect(screen.queryByText("Buscando cuentas…")).not.toBeInTheDocument());

    const titulo = screen.getByRole("heading", { level: 3, name: /^0 RESULTADOS PARA/ });
    const sePartePorSiSolo = /wrap-anywhere|break-all|break-words|truncate/.test(titulo.className);
    expect(sePartePorSiSolo || (titulo.textContent ?? "").length <= 140).toBe(true);
  });

  it("QA #41 · el avatar de una cuenta con emoji en el nombre no muestra media letra («�»)", async () => {
    expect(iniciales("Ana 🌳 Núñez")).not.toMatch(TIENE_MITAD_DE_EMOJI);
    expect(iniciales("🌳 Ana")).not.toMatch(TIENE_MITAD_DE_EMOJI);

    montar({
      datos: {
        ...DATOS_ANADIR_COLPORTOR_SIMULADO,
        sugeridos: [cuenta(1, { nombre: "Ana 🌳 Núñez" })],
      },
    });
    expect(document.body.textContent).not.toMatch(TIENE_MITAD_DE_EMOJI);
  });

  it("QA #41 · un nombre largo sin espacios en «Ya en tu equipo» se parte (o se acorta) y deja ver la zona", () => {
    const largo = "N".repeat(90);
    montar({
      datos: {
        ...DATOS_ANADIR_COLPORTOR_SIMULADO,
        equipoActual: [{ id: "usr-largo", nombre: largo, zonaNombre: "Cerro Norte" }],
      },
    });
    const nombre = screen.getByText(largo);
    // Un ítem flex no baja de la palabra más larga si no lleva `min-w-0` (o `wrap-anywhere`): la zona queda fuera de la tarjeta.
    expect(nombre.className).toMatch(/wrap-anywhere|break-all|min-w-0|truncate/);
  });

  it("QA #41 · tras un rechazo por estar en otra campaña (CI007) la fila lo refleja: no sigue «sin campaña» con «Añadir» habilitado para repetir el mismo rechazo", async () => {
    vi.useFakeTimers();
    montar({
      inscribir: async () => ({
        ok: false,
        mensaje: "Está en campaña Otoño Norte. Reasignar primero.",
        campaniaEnConflicto: { id: "camp-otonio", nombre: "Otoño Norte" },
      }),
    });
    await tocar(anadirEnFila("Ana Martínez"));
    await pasar(MS_DESHACER);

    expect(screen.getByRole("alert")).toHaveTextContent("Está en campaña Otoño Norte. Reasignar primero.");
    expect(anadirEnFila("Ana Martínez")).toBeDisabled();
  });

  it("QA #41 · un texto de 100+ caracteres con un emoji en el límite manda al servidor un texto bien formado (sin media letra)", async () => {
    const llamarRpc = vi.fn(async (): Promise<unknown> => []);
    const fuente = crearFuenteAnadirRpc({ llamarRpc: llamarRpc as never });
    await fuente.buscarCandidatos("00000000-0000-4000-8000-000000000001", `${"a".repeat(99)}🌳🌳`, null);

    const enviado = (llamarRpc.mock.calls[0] as unknown as [string, { p_texto: string }])[1].p_texto;
    expect(enviado).not.toMatch(TIENE_MITAD_DE_EMOJI);
  });

  it("el texto buscado se manda de a lo sumo 100 caracteres (no unidades) y un emoji en el límite entra entero", async () => {
    const llamarRpc = vi.fn(async (): Promise<unknown> => []);
    const fuente = crearFuenteAnadirRpc({ llamarRpc: llamarRpc as never });
    await fuente.buscarCandidatos("00000000-0000-4000-8000-000000000001", `${"a".repeat(99)}🌳🌳`, null);
    await fuente.buscarCandidatos("00000000-0000-4000-8000-000000000001", `${"b".repeat(98)}🌳🌳`, null);

    const enviados = llamarRpc.mock.calls.map((llamada) => (llamada as unknown as [string, { p_texto: string }])[1].p_texto);
    expect(enviados[0]).toBe(`${"a".repeat(99)}🌳`);
    expect(enviados[1]).toBe(`${"b".repeat(98)}🌳🌳`);
    expect(enviados.map((t) => Array.from(t).length)).toEqual([100, 100]);
  });

  it("el título de la lista corta el texto buscado en 60 caracteres con «…» y el buscador conserva todo lo pegado", async () => {
    montar();
    await userEvent.click(caja());
    await userEvent.paste("x".repeat(70));
    await waitFor(() => expect(screen.queryByText("Buscando cuentas…")).not.toBeInTheDocument());

    expect(screen.getByRole("heading", { level: 3, name: `0 RESULTADOS PARA “${"X".repeat(60)}…”` })).toBeInTheDocument();
    expect(caja()).toHaveValue("x".repeat(70));
  });

  it("el título no corta un emoji en el límite de 60 caracteres", async () => {
    montar();
    await userEvent.click(caja());
    await userEvent.paste(`${"y".repeat(59)}🌳🌳🌳`);
    await waitFor(() => expect(screen.queryByText("Buscando cuentas…")).not.toBeInTheDocument());

    const titulo = screen.getByRole("heading", { level: 3, name: /^0 RESULTADOS PARA/ });
    expect(titulo.textContent).toBe(`0 RESULTADOS PARA “${"Y".repeat(59)}🌳…”`);
    expect(titulo.textContent).not.toMatch(TIENE_MITAD_DE_EMOJI);
  });

  it("un texto de hasta 60 caracteres se muestra entero, sin «…»", async () => {
    montar();
    await userEvent.type(caja(), "z".repeat(60));
    await waitFor(() => expect(screen.queryByText("Buscando cuentas…")).not.toBeInTheDocument());

    expect(screen.getByRole("heading", { level: 3, name: `0 RESULTADOS PARA “${"Z".repeat(60)}”` })).toBeInTheDocument();
  });

  it("tras el rechazo por otra campaña (CI007) la fila y el detalle muestran la campaña y el motivo, y «Añadir» queda apagado en los dos", async () => {
    vi.useFakeTimers();
    montar({
      inscribir: async () => ({
        ok: false,
        mensaje: "Está en campaña Otoño Norte. Reasignar primero.",
        campaniaEnConflicto: { id: "camp-otonio", nombre: "Otoño Norte" },
      }),
    });
    await tocar(anadirEnFila("Ana Martínez"));
    await pasar(MS_DESHACER);

    const detalle = screen.getByRole("region", { name: "Detalle de Ana Martínez" });
    expect(within(detalle).getByRole("button", { name: /^Añadir a Verano 2026$/ })).toBeDisabled();
    expect(within(detalle).getByText("Pedile al coordinador de Otoño Norte que lo libere.")).toBeInTheDocument();
    const fila = screen.getByRole("button", { name: "Elegir a Ana Martínez" }).closest("li");
    expect(fila).toHaveTextContent("Campaña actual: Otoño Norte");
    expect(fila).toHaveTextContent("Está en campaña Otoño Norte. Reasignar primero.");
  });

  it("el rechazo por otra campaña de una cuenta no bloquea a las demás", async () => {
    vi.useFakeTimers();
    montar({
      inscribir: async () => ({
        ok: false,
        mensaje: "Está en campaña Otoño Norte. Reasignar primero.",
        campaniaEnConflicto: { id: "camp-otonio", nombre: "Otoño Norte" },
      }),
    });
    await tocar(anadirEnFila("Ana Martínez"));
    await pasar(MS_DESHACER);

    expect(anadirEnFila("Ana Martínez")).toBeDisabled();
    expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();
  });

  it("un rechazo por otro motivo (sin campaña en conflicto) deja la fila como estaba, con «Añadir» habilitado", async () => {
    vi.useFakeTimers();
    montar({ inscribir: async () => ({ ok: false, mensaje: "La campaña no está activa: solo se inscribe en una campaña vigente." }) });
    await tocar(anadirEnFila("Ana Martínez"));
    await pasar(MS_DESHACER);

    expect(screen.getByRole("alert")).toHaveTextContent("La campaña no está activa");
    expect(anadirEnFila("Ana Martínez")).toBeEnabled();
  });

  it("«‹ Equipo» con un envío en camino no deja el tope de 10 s corriendo cuando contestan antes", async () => {
    vi.useFakeTimers();
    montar();
    await tocar(anadirEnFila("Ana Martínez"));
    await pasar(0);
    const conElPlazo = vi.getTimerCount();

    await tocar(screen.getByRole("link", { name: "‹ Equipo" }));
    await pasar(0);

    // Se fue el plazo de «Deshacer» (se mandó la inscripción) y el tope de salida se pidió y se canceló: queda uno menos.
    expect(vi.getTimerCount()).toBe(conElPlazo - 1);
  });
});

describe("QA #41 · «Deshacer» con el teclado (decisión del 16/10, WCAG 2.1.1)", () => {
  const filaDe = (nombre: string) => screen.getByRole("button", { name: `Elegir a ${nombre}` }).closest("li");
  const deshacerDe = (nombre: string) => screen.getByRole("button", { name: `Deshacer: ${nombre}` });
  /** Esc con el foco donde esté (con tiempo falso no se puede usar `userEvent`: se cuelga esperando el reloj). */
  const escape = () =>
    act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    });

  it("un solo Enter desde «Añadir» deshace: el foco pasa a «Deshacer», el otro Enter lo aprieta y el foco vuelve a la fila", async () => {
    const { inscribir } = montar();
    await act(async () => anadirEnFila("Ana Martínez").focus());

    await userEvent.keyboard("{Enter}");
    expect(deshacerDe("Ana Martínez")).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(anadirEnFila("Ana Martínez")).toBeEnabled();
    expect(anadirEnFila("Ana Martínez")).toHaveTextContent("Añadir");
    expect(filaDe("Ana Martínez")).toHaveFocus();
    expect(inscribir).not.toHaveBeenCalled();
  });

  it("«Deshacer» describe el aviso: el lector lee «Añadiste a <nombre> a <campaña>.» y después «Deshacer»", async () => {
    montar();
    await userEvent.click(anadirEnFila("Ana Martínez"));

    expect(deshacerDe("Ana Martínez")).toHaveAccessibleDescription("Añadiste a Ana Martínez a Verano 2026.");
  });

  it("Esc sobre el aviso devuelve el foco a la fila sin cerrarlo ni mandar nada; el aviso sigue con su plazo", async () => {
    vi.useFakeTimers();
    const { inscribir } = montar();
    await tocar(anadirEnFila("Ana Martínez"));
    expect(deshacerDe("Ana Martínez")).toHaveFocus();

    await escape();

    expect(filaDe("Ana Martínez")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Añadiste a Ana Martínez a Verano 2026.");
    expect(inscribir).not.toHaveBeenCalled();
    expect(anadirEnFila("Ana Martínez")).toHaveTextContent("Añadido ✓");

    await pasar(MS_DESHACER);
    expect(inscribir).toHaveBeenCalledExactlyOnceWith("usr-ana-martinez");
  });

  it("Esc con el buscador escrito y el foco en el aviso no limpia la búsqueda: solo devuelve el foco", async () => {
    vi.useFakeTimers();
    montar();
    await tocar(anadirEnFila("Ana Martínez"));
    await act(async () => {
      fireEvent.change(caja(), { target: { value: "ana" } });
    });
    await pasar(MS_ESPERA_BUSQUEDA);
    expect(deshacerDe("Ana Martínez")).toHaveFocus();

    await escape();

    expect(caja()).toHaveValue("ana");
    expect(filaDe("Ana Martínez")).toHaveFocus();
  });

  it("con varios avisos, el foco va al «Deshacer» del más nuevo", async () => {
    montar();
    await userEvent.click(anadirEnFila("Ana Martínez"));
    expect(deshacerDe("Ana Martínez")).toHaveFocus();

    await userEvent.click(anadirEnFila("Gonzalo Sosa"));

    expect(deshacerDe("Gonzalo Sosa")).toHaveFocus();
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("un doble toque en «Añadir» no suma un segundo aviso", async () => {
    montar();
    await userEvent.dblClick(anadirEnFila("Ana Martínez"));

    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("si el plazo vence con el foco en «Deshacer», el foco vuelve a la fila de la cuenta", async () => {
    vi.useFakeTimers();
    montar();
    await tocar(anadirEnFila("Ana Martínez"));
    expect(deshacerDe("Ana Martínez")).toHaveFocus();

    await pasar(MS_DESHACER);

    expect(filaDe("Ana Martínez")).toHaveFocus();
  });

  it("si al vencer el plazo la cuenta ya no está en los resultados, el foco va al buscador", async () => {
    vi.useFakeTimers();
    montar();
    await tocar(anadirEnFila("Ana Martínez"));
    await act(async () => {
      fireEvent.change(caja(), { target: { value: "zzzzqq" } }); // sin foco en el buscador: el foco sigue en «Deshacer»
    });
    await pasar(MS_ESPERA_BUSQUEDA);
    expect(deshacerDe("Ana Martínez")).toHaveFocus();

    await pasar(MS_DESHACER);

    expect(caja()).toHaveFocus();
  });

  it("si el foco ya está escribiendo en el buscador cuando se añade, no se le roba", async () => {
    vi.useFakeTimers();
    montar();
    await act(async () => {
      caja().focus();
      anadirEnFila("Ana Martínez").click(); // un clic programático (un lector de pantalla, una extensión) no mueve el foco
    });

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(caja()).toHaveFocus();
  });

  it("el Enter sostenido en «Añadir» no aprieta «Deshacer» cuando el foco ya pasó al aviso (las repeticiones se ignoran)", async () => {
    montar();
    await userEvent.click(anadirEnFila("Ana Martínez"));
    const deshacer = deshacerDe("Ana Martínez");

    const siguioElPorDefecto = fireEvent.keyDown(deshacer, { key: "Enter", repeat: true });
    expect(siguioElPorDefecto).toBe(false); // preventDefault: el navegador no dispara el clic
    expect(fireEvent.keyDown(deshacer, { key: "Enter" })).toBe(true); // la primera pulsación sigue andando
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
