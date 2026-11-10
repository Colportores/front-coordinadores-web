import { act, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { armarCuentasSimuladas } from "@/datos/cuentas/simulado";
import type { AccionesValidarTickets, DatosDeValidacion, Resolucion, ResultadoDeAccion } from "@/datos/cuentas/validar";
import { armarValidacionSimulada } from "@/datos/cuentas/validar/simulado";
import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { MS_DESHACER } from "./modelo";
import { ValidarTicketsVista } from "./ValidarTicketsVista";

/**
 * QA de la vista 29 «Validar tickets» (#69, PR #168): criterios de la HU-COB-008 con su texto literal, validación del motivo,
 * casos límite de las acciones superpuestas, foco, nombres accesibles y privacidad. Lo que documenta un hallazgo va con `skip`.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const AHORA = new Date("2026-11-10T14:00:00.000Z");
const simulados = (): DatosDeValidacion => armarValidacionSimulada(AHORA);

type Resultado = ResultadoDeAccion<Resolucion>;
const ok: Resultado = { ok: true, valor: { resueltoEn: AHORA.toISOString(), yaEstaba: false } };

function acciones(sobre: Partial<Record<keyof AccionesValidarTickets, (...a: never[]) => unknown>> = {}) {
  return {
    validar: vi.fn(async () => ok),
    rechazar: vi.fn(async () => ok),
    enlaceDeFoto: vi.fn(async (): Promise<ResultadoDeAccion<string>> => ({ ok: true, valor: "data:image/svg+xml,foto" })),
    ...Object.fromEntries(Object.entries(sobre).map(([k, f]) => [k, vi.fn(f as (...a: never[]) => unknown)])),
  } as unknown as AccionesValidarTickets & {
    validar: ReturnType<typeof vi.fn>;
    rechazar: ReturnType<typeof vi.fn>;
    enlaceDeFoto: ReturnType<typeof vi.fn>;
  };
}

function diferida() {
  let resolver!: (r: Resultado) => void;
  const promesa = new Promise<Resultado>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

function montar(datos = simulados(), a = acciones()) {
  const vista = render(<ValidarTicketsVista datos={datos} acciones={a} />);
  return { ...vista, acciones: a };
}

const filaDe = (nombre: string) => screen.getByRole("button", { name: new RegExp(`^[^,]+, ${nombre}`) });
const panel = () => screen.getByRole("region");
const abrir = (nombre: string) => act(async () => fireEvent.click(filaDe(nombre)));
const boton = (nombre: string | RegExp) => within(panel()).getByRole("button", { name: nombre });
const motivo = () => within(panel()).getByLabelText("MOTIVO DEL RECHAZO · OBLIGATORIO");
const tocar = (el: HTMLElement) => act(async () => fireEvent.click(el));
const escribir = (el: HTMLElement, texto: string) => act(async () => fireEvent.change(el, { target: { value: texto } }));
const avanzar = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });
const alertas = () => screen.queryAllByRole("alert");

async function rechazarConMotivo(nombre: string, texto: string) {
  await abrir(nombre);
  await tocar(boton(/^Rechazar/));
  await escribir(motivo(), texto);
  await tocar(boton("Confirmar rechazo"));
}

beforeEach(() => {
  window.history.replaceState(null, "", "/cuentas/validar-tickets");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  reiniciarTrabajoPendiente();
});

describe("HU-COB-008 · criterios de aceptación, con el texto literal", () => {
  it("Validar un ticket: pasa a validado y la validación llega al servidor recién a los 8 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Validado$/);
    expect(a.validar).not.toHaveBeenCalled();
    await avanzar(MS_DESHACER);
    expect(a.validar).toHaveBeenCalledTimes(1);
    expect(a.validar).toHaveBeenCalledWith(expect.objectContaining({ id: "lucia-fernandez-por-validar", tipo: "deposito" }));
  });

  it("Validar un depósito mayor que la deuda: «Supera la deuda de $U 5.000: quedan $U 3.000 a favor» y se puede confirmar igual", async () => {
    montar();
    await abrir("Joaquín Duarte");
    expect(within(panel()).getByRole("note")).toHaveTextContent("Supera la deuda de $U 5.000: quedan $U 3.000 a favor");
    expect(boton(/^Validar/)).not.toHaveAttribute("aria-disabled", "true");
    expect(within(panel()).getByText("a favor $U 3.000")).toBeInTheDocument();
  });

  it("la diferencia con lo que tenía en mano es un aviso que no frena: validar sigue habilitado", async () => {
    montar();
    await abrir("Valentina Silva");
    expect(within(panel()).getByRole("note")).toHaveTextContent("Según la app tenía en mano $U 6.200 y el ticket dice $U 5.000 (diferencia $U 1.200)");
    expect(boton(/^Validar/)).not.toHaveAttribute("aria-disabled", "true");
  });

  it("Rechazar con motivo: el servidor recibe el motivo, el colportor recibe el aviso y la deuda no cambia", async () => {
    const { acciones: a } = montar();
    await rechazarConMotivo("Lucía Fernández", "El monto no coincide con el cobro");
    expect(a.rechazar).toHaveBeenCalledWith(expect.objectContaining({ id: "lucia-fernandez-por-validar" }), "El monto no coincide con el cobro");
    expect(screen.getByText("✕ Ticket 0482 de Lucía Fernández rechazado. Le avisamos.")).toBeInTheDocument();
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Rechazado, Motivo: El monto no coincide con el cobro$/);
    await abrir("Lucía Fernández");
    expect(within(panel()).getByText(/No bajó la deuda ni cuenta como depositado/)).toBeInTheDocument();
    expect(within(panel()).queryByRole("button", { name: /^Validar/ })).not.toBeInTheDocument();
  });

  it("Edge, rechazar sin motivo: el panel no deja confirmar y pide el motivo", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Rechazar/));
    await tocar(boton("Confirmar rechazo"));
    expect(a.rechazar).not.toHaveBeenCalled();
    expect(within(panel()).getByRole("alert")).toHaveTextContent("Escribí el motivo para rechazar el ticket.");
    expect(motivo()).toHaveFocus();
    expect(motivo()).toHaveAttribute("aria-invalid", "true");
  });
});

describe("el motivo del rechazo: validación de la entrada", () => {
  it.each([
    ["solo espacios", "     "],
    ["saltos de línea y tabulaciones", "\n\t \n"],
    ["espacios duros", "  "],
  ])("%s: no rechaza y pide el motivo", async (_nombre, texto) => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), texto);
    await tocar(boton("Confirmar rechazo"));
    expect(a.rechazar).not.toHaveBeenCalled();
    expect(within(panel()).getByRole("alert")).toHaveTextContent("Escribí el motivo para rechazar el ticket.");
  });

  it("el motivo se manda recortado: sin los espacios ni los saltos de los costados", async () => {
    const { acciones: a } = montar();
    await rechazarConMotivo("Lucía Fernández", "  \n Foto ilegible \t ");
    expect(a.rechazar).toHaveBeenCalledWith(expect.anything(), "Foto ilegible");
  });

  it("500 caracteres se aceptan; 501 se frenan y el contador lo dice", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), "a".repeat(501));
    expect(within(panel()).getByText("501 / 500")).toBeInTheDocument();
    expect(boton("Confirmar rechazo")).toHaveAttribute("aria-disabled", "true");
    await tocar(boton("Confirmar rechazo"));
    expect(a.rechazar).not.toHaveBeenCalled();
    await escribir(motivo(), "a".repeat(500));
    await tocar(boton("Confirmar rechazo"));
    expect(a.rechazar).toHaveBeenCalledWith(expect.anything(), "a".repeat(500));
  });

  it("un texto pegado de 20.000 caracteres no se corta, no se manda y deja acortarlo", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), "x".repeat(20_000));
    expect(within(panel()).getByText("20.000 / 500")).toBeInTheDocument();
    expect(within(panel()).getByRole("alert")).toHaveTextContent("El motivo tiene 20.000 caracteres y el máximo es 500. Acortalo para rechazar.");
    await tocar(boton("Confirmar rechazo"));
    expect(a.rechazar).not.toHaveBeenCalled();
    expect(motivo()).toHaveValue("x".repeat(20_000));
    await escribir(motivo(), "corto");
    expect(within(panel()).queryByRole("alert")).not.toBeInTheDocument();
    await tocar(boton("Confirmar rechazo"));
    expect(a.rechazar).toHaveBeenCalledWith(expect.anything(), "corto");
  });

  it("caracteres especiales y HTML se mandan tal cual y se muestran como texto, nunca como marcado", async () => {
    const raro = `<img src=x onerror=alert(1)> "comillas" & 'simples' <b>negrita</b> \\ %s {{x}} 😀`;
    const { acciones: a, container } = montar();
    await rechazarConMotivo("Lucía Fernández", raro);
    expect(a.rechazar).toHaveBeenCalledWith(expect.anything(), raro);
    await abrir("Lucía Fernández");
    expect(within(panel()).getByText(raro)).toBeInTheDocument();
    expect(container.querySelector("img[src='x']")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  // QA #69: el tope de 500 cuenta unidades UTF-16 (`String.length`), el servidor cuenta caracteres (`char_length`): 300 emojis son 600 unidades.
  it.skip("QA #69: 300 emojis son 300 caracteres y entran en los 500 de la HU", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), "😀".repeat(300));
    expect(within(panel()).getByText("300 / 500")).toBeInTheDocument();
    await tocar(boton("Confirmar rechazo"));
    expect(a.rechazar).toHaveBeenCalledTimes(1);
  });

  it("lo escrito no se pierde al fallar, al irse a otra fila y volver, ni al perder la conexión", async () => {
    let veces = 0;
    const { acciones: a } = montar(simulados(), acciones({ rechazar: async () => (++veces === 1 ? { ok: false, causa: "sin-conexion" } : ok) }));
    await rechazarConMotivo("Lucía Benítez", "No recibí el efectivo");
    expect(motivo()).toHaveValue("No recibí el efectivo");
    await abrir("Gonzalo Méndez");
    await abrir("Lucía Benítez");
    expect(motivo()).toHaveValue("No recibí el efectivo");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(motivo()).toHaveValue("No recibí el efectivo");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await tocar(boton(/^(Reintentar|Confirmar rechazo)$/));
    expect(a.rechazar).toHaveBeenCalledTimes(2);
  });
});

describe("casos límite de las acciones", () => {
  it("si la acción lanza en vez de responder, el botón vuelve a habilitarse y no queda «Confirmando…»", async () => {
    let veces = 0;
    const a = acciones({
      validar: async () => {
        if (++veces === 1) throw new Error("caída");
        return ok;
      },
    });
    montar(simulados(), a);
    await abrir("Lucía Benítez");
    await tocar(boton(/^Confirmar/));
    expect(within(panel()).getByRole("alert")).toHaveTextContent(/^!Necesitás conexión para confirmar el retiro de Lucía Benítez\./);
    expect(boton(/^Confirmar/)).not.toHaveAttribute("aria-disabled", "true");
    expect(within(panel()).queryByText("Confirmando…")).not.toBeInTheDocument();
    expect(boton(/^Confirmar/)).toHaveFocus();
    await tocar(boton(/^Confirmar/));
    expect(a.validar).toHaveBeenCalledTimes(2);
    expect(filaDe("Lucía Benítez")).toHaveAccessibleName(/Confirmado$/);
  });

  it("si el rechazo lanza, el motivo sigue escrito y «Reintentar» queda habilitado", async () => {
    const a = acciones({
      rechazar: async () => {
        throw new Error("caída");
      },
    });
    montar(simulados(), a);
    await rechazarConMotivo("Lucía Benítez", "Está cargado dos veces");
    expect(within(panel()).getByRole("alert")).toBeInTheDocument();
    expect(motivo()).toHaveValue("Está cargado dos veces");
    expect(motivo()).not.toHaveAttribute("readonly");
    expect(boton("Reintentar")).not.toHaveAttribute("aria-disabled", "true");
    expect(boton("Cancelar")).not.toHaveAttribute("aria-disabled", "true");
  });

  it("confirmar un retiro dos veces seguidas antes de que conteste el servidor lo manda una sola vez", async () => {
    const espera = diferida();
    const a = acciones({ validar: () => espera.promesa });
    montar(simulados(), a);
    await abrir("Lucía Benítez");
    await act(async () => {
      fireEvent.click(boton(/^Confirmar/));
      fireEvent.click(boton(/^Confirmar/));
    });
    expect(boton("Confirmando…")).toHaveAttribute("aria-disabled", "true");
    await act(async () => espera.resolver(ok));
    expect(a.validar).toHaveBeenCalledTimes(1);
  });

  it("validar, deshacer y volver a validar: se manda una sola vez y a los 8 s del segundo toque", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    await avanzar(5000);
    await tocar(screen.getByRole("button", { name: /^Deshacer la validación/ }));
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Por validar$/);
    await tocar(boton(/^Validar/));
    await avanzar(MS_DESHACER - 1);
    expect(a.validar).not.toHaveBeenCalled();
    await avanzar(1);
    expect(a.validar).toHaveBeenCalledTimes(1);
    await avanzar(MS_DESHACER * 3);
    expect(a.validar).toHaveBeenCalledTimes(1);
  });

  it("dos validaciones con seis segundos de diferencia: la primera sale a los 8 s, la segunda se puede deshacer sin perderla ni mandarla", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    await avanzar(6000);
    await tocar(boton(/^Validar/)); // el siguiente: Valentina Silva
    await avanzar(2000);
    expect(a.validar).toHaveBeenCalledTimes(1);
    expect(a.validar).toHaveBeenLastCalledWith(expect.objectContaining({ id: "lucia-fernandez-por-validar" }));
    await tocar(screen.getByRole("button", { name: "Deshacer la validación del ticket de Valentina Silva" }));
    await avanzar(MS_DESHACER * 2);
    expect(a.validar).toHaveBeenCalledTimes(1);
    expect(filaDe("Valentina Silva")).toHaveAccessibleName(/Por validar$/);
  });

  it("rechazar otro ticket con un plazo de «Deshacer» vigente no toca ese plazo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    await rechazarConMotivo("Joaquín Duarte", "Foto ilegible");
    expect(a.rechazar).toHaveBeenCalledTimes(1);
    expect(a.validar).not.toHaveBeenCalled();
    await avanzar(MS_DESHACER);
    expect(a.validar).toHaveBeenCalledTimes(1);
    expect(a.validar).toHaveBeenCalledWith(expect.objectContaining({ id: "lucia-fernandez-por-validar" }));
  });

  it("un rechazo en camino y una validación diferida a la vez: las dos terminan, ninguna pisa a la otra", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const espera = diferida();
    const a = acciones({ rechazar: () => espera.promesa });
    montar(simulados(), a);
    await rechazarConMotivo("Lucía Benítez", "No recibí el efectivo");
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    await avanzar(MS_DESHACER);
    expect(a.validar).toHaveBeenCalledTimes(1);
    await act(async () => espera.resolver(ok));
    expect(filaDe("Lucía Benítez")).toHaveAccessibleName(/Rechazado, Motivo: No recibí el efectivo$/);
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Validado$/);
    expect(alertas()).toHaveLength(0);
  });

  it("si fallan dos validaciones diferidas, las dos vuelven a la cola, cada una con su aviso, y se pueden volver a validar", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    let intento = 0;
    const a = acciones({ validar: async () => (++intento <= 2 ? { ok: false, causa: "sin-conexion" } : ok) });
    montar(simulados(), a);
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    await tocar(boton(/^Validar/));
    await avanzar(MS_DESHACER);
    expect(alertas()).toHaveLength(2);
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Por validar$/);
    expect(filaDe("Valentina Silva")).toHaveAccessibleName(/Por validar$/);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tickets por validar · 5");
    await abrir("Lucía Fernández");
    expect(boton(/^Validar/)).not.toHaveAttribute("aria-disabled", "true");
    await tocar(boton(/^Validar/));
    await avanzar(MS_DESHACER);
    expect(a.validar).toHaveBeenCalledTimes(3);
  });

  it("si la validación lanza una excepción a los 8 s, el ticket vuelve a estar por validar y avisa", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const a = acciones({
      validar: async () => {
        throw new Error("caída");
      },
    });
    montar(simulados(), a);
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    await avanzar(MS_DESHACER);
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Por validar$/);
    expect(screen.getByRole("alert")).toHaveTextContent(/^No se validó el ticket de Lucía Fernández: sigue por validar\./);
  });

  it("validar el último pendiente y deshacer: la cola vuelve y el ticket se abre", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const datos = simulados();
    datos.items = datos.items.filter((x) => x.id === "lucia-fernandez-por-validar");
    const { acciones: a } = montar(datos);
    await tocar(boton(/^Validar/));
    expect(screen.getByRole("status")).toHaveTextContent("No quedan tickets por validar");
    await tocar(screen.getByRole("button", { name: /^Deshacer la validación/ }));
    expect(screen.queryByText("No quedan tickets por validar")).not.toBeInTheDocument();
    expect(boton(/^Validar/)).toHaveFocus();
    await avanzar(MS_DESHACER * 2);
    expect(a.validar).not.toHaveBeenCalled();
  });

  it("reentrada: salir dentro del plazo la manda una vez y una vista nueva arranca de la lista, sin duplicar nada", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { acciones: a, unmount } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    unmount();
    await avanzar(MS_DESHACER * 2);
    expect(a.validar).toHaveBeenCalledTimes(1);
    montar(simulados(), a);
    expect(screen.queryByRole("button", { name: /^Deshacer la validación/ })).not.toBeInTheDocument();
    expect(alertas()).toHaveLength(0);
  });

  it("un solo ítem, y una campaña con todo ya resuelto, tienen contenido y un camino de vuelta", () => {
    const uno = simulados();
    uno.items = uno.items.filter((x) => x.id === "lucia-fernandez-por-validar");
    const { unmount } = montar(uno);
    expect(screen.getByText("Ticket 1 de 1")).toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Ticket anterior" })).toHaveAttribute("aria-disabled", "true");
    expect(within(panel()).getByRole("button", { name: "Ticket siguiente" })).toHaveAttribute("aria-disabled", "true");
    unmount();

    const resueltos = simulados();
    resueltos.items = resueltos.items.filter((x) => x.estado !== "PENDIENTE");
    montar(resueltos);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tickets por validar · 0");
    expect(screen.getByRole("status")).toHaveTextContent("No quedan tickets por validar");
    expect(screen.getByRole("link", { name: "Volver a Cuentas" })).toHaveAttribute("href", "/cuentas");
  });

  it("un ?ticket= ya resuelto se abre de solo lectura, sin «Validar» ni «Rechazar»", () => {
    window.history.replaceState(null, "", "/cuentas/validar-tickets?ticket=bruno-techera-rechazado");
    montar();
    expect(filaDe("Bruno Techera")).toHaveAttribute("aria-current", "true");
    expect(within(panel()).getByText("MOTIVO DEL RECHAZO")).toBeInTheDocument();
    expect(within(panel()).queryByRole("button", { name: /^(Validar|Rechazar|Confirmar)/ })).not.toBeInTheDocument();
  });

  it("la foto: un segundo toque mientras llega no la pide dos veces; si falla, dice qué hacer y se puede reintentar", async () => {
    let intento = 0;
    const espera = diferida() as unknown as { promesa: Promise<ResultadoDeAccion<string>>; resolver: (r: ResultadoDeAccion<string>) => void };
    const a = acciones({ enlaceDeFoto: () => (++intento === 1 ? espera.promesa : Promise.reject(new Error("caída"))) });
    montar(simulados(), a);
    await abrir("Lucía Fernández");
    await act(async () => fireEvent.click(within(panel()).getByRole("button", { name: "Ver foto" })));
    await act(async () => fireEvent.click(within(panel()).getByRole("button", { name: "Trayendo la foto…" })));
    expect(a.enlaceDeFoto).toHaveBeenCalledTimes(1);
    await act(async () => espera.resolver({ ok: false, causa: "sin-conexion" }));
    expect(within(panel()).getByRole("alert")).toHaveTextContent("Necesitás conexión para ver la foto. Revisá la conexión y probá de nuevo.");
    await act(async () => fireEvent.click(within(panel()).getByRole("button", { name: "Ver foto" })));
    expect(a.enlaceDeFoto).toHaveBeenCalledTimes(2);
    expect(within(panel()).getByRole("alert")).toHaveTextContent("Necesitás conexión para ver la foto.");
  });
});

describe("teclado, foco y nombres accesibles", () => {
  it("el orden de foco es la lista, «Rechazar» y «Validar»; todo botón o enlace tiene nombre", async () => {
    const { container } = montar();
    await abrir("Lucía Fernández");
    const orden = Array.from(container.querySelectorAll<HTMLElement>("button, a[href]"));
    const posicion = (el: HTMLElement) => orden.indexOf(el);
    expect(posicion(filaDe("Valentina Silva"))).toBeLessThan(posicion(boton(/^Rechazar/)));
    expect(posicion(boton(/^Rechazar/))).toBeLessThan(posicion(boton(/^Validar/)));
    for (const el of orden) expect(el).toHaveAccessibleName();
    expect(boton("Ticket anterior")).toBeInTheDocument();
    expect(boton("Ticket siguiente")).toBeInTheDocument();
  });

  it("Esc con el foco en un motivo rápido cancela el rechazo y devuelve el foco a «Rechazar»", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Rechazar/));
    const chip = within(panel()).getByRole("button", { name: "Foto ilegible" });
    act(() => chip.focus());
    await act(async () => fireEvent.keyDown(chip, { key: "Escape" }));
    expect(within(panel()).queryByLabelText("MOTIVO DEL RECHAZO · OBLIGATORIO")).not.toBeInTheDocument();
    expect(boton(/^Rechazar/)).toHaveFocus();
    expect(a.rechazar).not.toHaveBeenCalled();
  });

  it("tras rechazar un depósito el foco pasa al «Validar» del siguiente; tras confirmar un retiro, al título del panel", async () => {
    montar();
    await rechazarConMotivo("Lucía Fernández", "Foto ilegible");
    expect(boton(/^Validar/)).toHaveFocus();
    await abrir("Lucía Benítez");
    await tocar(boton(/^Confirmar/));
    expect(within(panel()).getByRole("heading", { name: "Retiro por el coordinador" })).toHaveFocus();
  });

  it("el aviso de lo que salió bien se puede cerrar y no deja un botón sin nombre", async () => {
    montar();
    await rechazarConMotivo("Lucía Fernández", "Foto ilegible");
    expect(screen.getByText("✕ Ticket 0482 de Lucía Fernández rechazado. Le avisamos.")).toBeInTheDocument();
    await tocar(screen.getByRole("button", { name: "Cerrar el aviso" }));
    expect(screen.queryByText("✕ Ticket 0482 de Lucía Fernández rechazado. Le avisamos.")).not.toBeInTheDocument();
  });

  it("axe A/AA con un fallo, un «Deshacer» vigente y un aviso de éxito a la vez, y con lo resuelto abierto", async () => {
    const a = acciones({ rechazar: async () => ({ ok: false, causa: "sin-conexion" }) });
    const { container } = montar(simulados(), a);
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    await abrir("Lucía Benítez");
    await tocar(boton(/^Confirmar/));
    await rechazarConMotivo("Gonzalo Méndez", "No recibí el efectivo");
    const r = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  // QA #69, navegador real a 1280×800 (axe `scrollable-region-focusable`): lo resuelto es solo lectura, sin nada enfocable, y el
  // contenedor del panel desborda en alto: quien usa teclado no puede desplazarlo.
  it.skip("QA #69: el contenedor con scroll del panel se alcanza con el teclado aunque el ticket sea de solo lectura", async () => {
    montar();
    await abrir("Agustina Rey");
    const contenedor = panel().parentElement as HTMLElement;
    const alcanzable = contenedor.tabIndex >= 0 || !!contenedor.querySelector("button, a[href], input, textarea, select, [tabindex='0']");
    expect(alcanzable).toBe(true);
  });
});

describe("textos de error que contradicen lo que pasa", () => {
  // QA #69: «sigue por validar» + «ya no está pendiente: otra persona lo resolvió» en el mismo aviso; el ticket vuelve a «Por validar»
  // y cada reintento falla igual.
  it.skip("QA #69: si otra persona ya resolvió el depósito, el aviso no dice a la vez «sigue por validar»", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const a = acciones({
      validar: async () => ({
        ok: false,
        causa: "rechazado",
        mensaje: "Este ticket ya no está pendiente: otra persona lo resolvió. Recargá la lista para ver cómo quedó.",
      }),
    });
    montar(simulados(), a);
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    await avanzar(MS_DESHACER);
    expect(screen.getByRole("alert").textContent).not.toMatch(/sigue por validar/);
  });

  // QA #69: tras fallar «Confirmar» de un retiro queda el aviso viejo; si se abre «Rechazar», el botón que rechaza se llama «Reintentar».
  it.skip("QA #69: el error de una confirmación fallida no convierte «Confirmar rechazo» en «Reintentar»", async () => {
    const a = acciones({ validar: async () => ({ ok: false, causa: "sin-conexion" }) });
    montar(simulados(), a);
    await abrir("Lucía Benítez");
    await tocar(boton(/^Confirmar/));
    expect(within(panel()).getByRole("alert")).toBeInTheDocument();
    await tocar(boton(/^Rechazar/));
    expect(within(panel()).queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(boton("Confirmar rechazo")).toBeInTheDocument();
  });
});

describe("privacidad y coherencia con Cuentas", () => {
  it("un recorrido completo no escribe nada en la consola (ni avisos de React ni datos de personas)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const espiadas = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    montar();
    await abrir("Lucía Fernández");
    await act(async () => fireEvent.click(within(panel()).getByRole("button", { name: "Ver foto" })));
    await tocar(boton(/^Validar/));
    await rechazarConMotivo("Lucía Benítez", "No recibí el efectivo");
    await abrir("Gonzalo Méndez");
    await tocar(boton(/^Confirmar/));
    await avanzar(MS_DESHACER);
    for (const e of espiadas) expect(e).not.toHaveBeenCalled();
  });

  it("el ticket de la vista no trae datos del cliente: ni nombre, ni dirección, ni teléfono en lo que se muestra", async () => {
    const { container } = montar();
    await abrir("Lucía Fernández");
    expect(container.textContent).not.toMatch(/cliente|teléfono|celular|direcci[oó]n|calle /i);
  });

  it("cada «Validar» de Cuentas (depósito en banco o retiro pendiente) apunta a un id que la vista 29 tiene", () => {
    const cuentas = armarCuentasSimuladas(AHORA);
    const ids = new Set(simulados().items.map((i) => i.id));
    const apuntados = cuentas.tickets.filter((t) => t.estado === "PENDIENTE" && (t.medio === "deposito-banco" || t.medio === "retiro-coordinador"));
    expect(apuntados.length).toBeGreaterThan(0);
    for (const t of apuntados) expect(ids.has(t.id)).toBe(true);
  });
});
