import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { marcaDeRechazo } from "@/auth/sesion-vencida";
import type { AccionesValidarTickets, DatosDeValidacion, ItemPorValidar, Resolucion, ResultadoDeAccion } from "@/datos/cuentas/validar";
import { armarValidacionSimulada } from "@/datos/cuentas/validar/simulado";
import { hayTrabajoPendiente, reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { MS_DESHACER } from "./modelo";
import { ValidarTicketsVista } from "./ValidarTicketsVista";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const AHORA = new Date("2026-11-10T14:00:00.000Z"); // 11:00 en Montevideo
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

/** Una respuesta que se resuelve a mano: sirve para probar lo que pasa mientras la acción está en camino. */
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

const fila = (nombre: RegExp) => screen.getByRole("button", { name: nombre });
const panel = () => screen.getByRole("region");
const filaDe = (nombre: string) => fila(new RegExp(`^[^,]+, ${nombre}`));
const abrir = (nombre: string) => act(async () => fireEvent.click(filaDe(nombre)));
const boton = (nombre: string | RegExp) => within(panel()).getByRole("button", { name: nombre });
const motivo = () => within(panel()).getByLabelText("MOTIVO DEL RECHAZO · OBLIGATORIO");
const tocar = (el: HTMLElement) => act(async () => fireEvent.click(el));
const escribir = (el: HTMLElement, texto: string) => act(async () => fireEvent.change(el, { target: { value: texto } }));

function enLinea(valor: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(valor);
  act(() => {
    window.dispatchEvent(new Event(valor ? "online" : "offline"));
  });
}

beforeEach(() => {
  window.history.replaceState(null, "", "/cuentas/validar-tickets");
});

afterEach(() => {
  push.mockReset();
  vi.useRealTimers();
  vi.restoreAllMocks();
  reiniciarTrabajoPendiente();
});

describe("29A·01 · la cola con el ticket abierto al costado", () => {
  it("cuenta lo que se puede validar, dice el más antiguo y abre el primero", () => {
    montar();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tickets por validar · 5");
    expect(screen.getByText("el más antiguo: hace 1 día")).toBeInTheDocument();
    expect(within(panel()).getByRole("heading", { name: "Retiro por el coordinador" })).toBeInTheDocument();
    expect(within(panel()).getByText("Retiro 2 de 3")).toBeInTheDocument();
    expect(filaDe("Gonzalo Méndez")).toHaveAttribute("aria-current", "true");
  });

  it("cada fila dice fecha, colportor, medio, monto y estado; el rechazado, su motivo", () => {
    montar();
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName("ayer 18:30, Lucía Fernández, Depósito en banco · BROU, $U 9.000, Por validar");
    expect(filaDe("Bruno Techera")).toHaveAccessibleName(/Rechazado, Motivo: Foto ilegible$/);
    expect(filaDe("Agustina Rey")).toHaveAccessibleName(/Retiro por el coordinador, \$U 4\.500, Confirmado$/);
    expect(filaDe(String.raw`Marta Pérez \(vos\)`)).toHaveAccessibleName(/Por confirmar$/);
  });

  it("el depósito muestra los campos nuevos del ticket, lo que la app sabe y «Al validar pasa al siguiente»", async () => {
    montar();
    await abrir("Lucía Fernández");
    const p = within(panel());
    expect(p.getByRole("heading", { name: "Ticket de depósito" })).toBeInTheDocument();
    expect(p.getByText("Ticket 1 de 3")).toBeInTheDocument();
    for (const [rotulo, valor] of [
      ["MONTO", "$U 9.000"],
      ["PARA QUÉ ES", "Casa editora"],
      ["DÓNDE", "Depósito en banco · BROU"],
      ["N.º DE AUTORIZACIÓN", "0482"],
      ["TARJETA", "No"],
      ["CIUDAD", "Rivera"],
      ["FECHA DEL DEPÓSITO", "09/11/2026"],
      ["ENVIADO", "hace 15 h"],
      ["EN MANO SEGÚN LA APP", "$U 12.600"],
      ["DEUDA CON LA CASA EDITORA", "$U 18.400"],
      ["SI VALIDÁS, QUEDA EN", "$U 9.400"],
    ]) {
      expect(p.getByText(rotulo, { selector: "dt" }).nextElementSibling).toHaveTextContent(valor);
    }
    expect(p.getByText("Al validar pasa al siguiente")).toBeInTheDocument();
    expect(boton(/^Validar/)).toHaveFocus();
  });

  it("‹ › recorren los tickets del mismo tipo", async () => {
    montar();
    await abrir("Lucía Fernández");
    expect(boton("Ticket anterior")).toHaveAttribute("aria-disabled", "true");
    await tocar(boton("Ticket siguiente"));
    expect(within(panel()).getByText("Ticket 2 de 3")).toBeInTheDocument();
    expect(filaDe("Valentina Silva")).toHaveAttribute("aria-current", "true");
  });

  it("la foto se pide recién al querer verla, con el enlace firmado", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    expect(a.enlaceDeFoto).not.toHaveBeenCalled();
    await tocar(boton("Ver foto"));
    expect(a.enlaceDeFoto).toHaveBeenCalledWith("lucia-fernandez-por-validar");
    expect(within(panel()).getByRole("img", { name: "Foto del ticket de Lucía Fernández" })).toHaveAttribute("src", "data:image/svg+xml,foto");
    expect(within(panel()).getByRole("link", { name: "Agrandar" })).toHaveAttribute("target", "_blank");
  });

  it("si la foto no llega, lo dice; si venció, lo dice sin pedirla", async () => {
    const datos = simulados();
    datos.items = datos.items.map((x) => (x.id === "valentina-silva-alquiler" ? { ...x, tieneFoto: false } : x));
    montar(datos, acciones({ enlaceDeFoto: async () => ({ ok: false, causa: "rechazado", mensaje: "La foto de este ticket ya venció." }) }));
    await abrir("Lucía Fernández");
    await tocar(boton("Ver foto"));
    expect(within(panel()).getByRole("alert")).toHaveTextContent("La foto de este ticket ya venció.");
    await abrir("Valentina Silva");
    expect(within(panel()).getByText(/se guarda 4 meses/)).toBeInTheDocument();
    expect(within(panel()).queryByRole("button", { name: "Ver foto" })).not.toBeInTheDocument();
  });
});

describe("29A·02 · rechazar con el motivo vacío", () => {
  it("«Rechazar» abre el motivo en el mismo lugar y no rechaza; vacío o con espacios, pide el motivo", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Rechazar/));
    expect(motivo()).toHaveFocus();
    expect(motivo()).toHaveAttribute("placeholder", "Contale al colportor qué tiene que corregir");
    expect(within(panel()).getByRole("group", { name: "Motivos rápidos" })).toHaveTextContent("Foto ilegibleEl monto no coincideTalonario ya usado");
    await escribir(motivo(), "   ");
    await tocar(boton("Confirmar rechazo"));
    expect(within(panel()).getByRole("alert")).toHaveTextContent("Escribí el motivo para rechazar el ticket.");
    expect(motivo()).toHaveFocus();
    expect(motivo()).toHaveAttribute("aria-invalid", "true");
    expect(a.rechazar).not.toHaveBeenCalled();
  });

  it("un motivo rápido completa el campo, se edita y el rechazo pasa al siguiente con el aviso", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Rechazar/));
    await tocar(boton("El monto no coincide"));
    expect(motivo()).toHaveValue("El monto no coincide");
    expect(boton("El monto no coincide")).toHaveAttribute("aria-pressed", "true");
    await escribir(motivo(), "  El monto no coincide: son $U 9.500  ");
    await tocar(boton("Confirmar rechazo"));
    expect(a.rechazar).toHaveBeenCalledWith(expect.objectContaining({ id: "lucia-fernandez-por-validar", tipo: "deposito" }), "El monto no coincide: son $U 9.500");
    expect(screen.getByText("✕ Ticket 0482 de Lucía Fernández rechazado. Le avisamos.")).toBeInTheDocument();
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Rechazado, Motivo: El monto no coincide: son \$U 9\.500$/);
    expect(filaDe("Valentina Silva")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tickets por validar · 4");
  });

  it("«Cancelar» y Esc cierran el motivo sin rechazar", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Rechazar/));
    await tocar(boton("Cancelar"));
    expect(within(panel()).queryByLabelText("MOTIVO DEL RECHAZO · OBLIGATORIO")).not.toBeInTheDocument();
    expect(boton(/^Rechazar/)).toHaveFocus();
    await tocar(boton(/^Rechazar/));
    await act(async () => fireEvent.keyDown(motivo(), { key: "Escape" }));
    expect(within(panel()).queryByLabelText("MOTIVO DEL RECHAZO · OBLIGATORIO")).not.toBeInTheDocument();
    expect(a.rechazar).not.toHaveBeenCalled();
  });
});

describe("29A·03 · validado, paso al siguiente, con «Deshacer» 8 s", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  it("marca el ticket validado, pasa al siguiente y manda la validación recién a los 8 s", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Validado$/);
    expect(filaDe("Valentina Silva")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("✓ Ticket 0482 de Lucía Fernández validado.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tickets por validar · 4");
    expect(within(panel()).getByText("Ticket 2 de 3")).toBeInTheDocument();
    expect(a.validar).not.toHaveBeenCalled();
    expect(hayTrabajoPendiente()).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER);
    });
    expect(a.validar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Deshacer/ })).not.toBeInTheDocument();
  });

  it("«Deshacer» devuelve el ticket a la cola en su lugar y no manda nada", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    await tocar(screen.getByRole("button", { name: "Deshacer la validación del ticket de Lucía Fernández" }));
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Por validar$/);
    expect(filaDe("Lucía Fernández")).toHaveAttribute("aria-current", "true");
    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER * 2);
    });
    expect(a.validar).not.toHaveBeenCalled();
  });

  it("dos validaciones seguidas tienen cada una su plazo: deshacer una no pierde la otra", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await tocar(boton(/^Validar/)); // Valentina, que quedó abierta
    await tocar(screen.getByRole("button", { name: "Deshacer la validación del ticket de Lucía Fernández" }));
    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER);
    });
    expect(a.validar).toHaveBeenCalledTimes(1);
    expect(a.validar).toHaveBeenCalledWith(expect.objectContaining({ id: "valentina-silva-alquiler" }));
  });

  it("el doble toque no valida dos veces", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    const validar = boton(/^Validar/);
    await act(async () => {
      fireEvent.click(validar);
      fireEvent.click(validar);
    });
    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER);
    });
    expect(a.validar).toHaveBeenCalledTimes(1);
  });

  it("si el envío falla, el ticket vuelve a estar por validar y el aviso dice qué pasó", async () => {
    montar(simulados(), acciones({ validar: async () => ({ ok: false, causa: "sin-conexion" }) }));
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER);
    });
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Por validar$/);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se validó el ticket de Lucía Fernández: sigue por validar. Necesitás conexión para validar el ticket. Revisá la conexión y probá de nuevo.",
    );
  });

  it("si se va de la vista dentro del plazo, la validación se manda en ese momento", async () => {
    const { acciones: a, unmount } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    unmount();
    expect(a.validar).toHaveBeenCalledTimes(1);
  });

  it("el foco en «Deshacer» congela el plazo", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    const deshacer = screen.getByRole("button", { name: "Deshacer la validación del ticket de Lucía Fernández" });
    act(() => deshacer.focus());
    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER * 2);
    });
    expect(a.validar).not.toHaveBeenCalled();
    act(() => deshacer.blur());
    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER);
    });
    expect(a.validar).toHaveBeenCalledTimes(1);
  });

  it("validar el último deja «No quedan tickets por validar» y el camino de vuelta a Cuentas", async () => {
    const datos = simulados();
    datos.items = datos.items.filter((x) => x.id === "lucia-fernandez-por-validar" || x.id === "bruno-techera-rechazado");
    montar(datos);
    await tocar(boton(/^Validar/));
    expect(screen.getByRole("status")).toHaveTextContent("No quedan tickets por validar");
    expect(screen.getByRole("link", { name: "Volver a Cuentas" })).toHaveAttribute("href", "/cuentas");
    expect(screen.getByRole("link", { name: "Volver a Cuentas" })).toHaveFocus();
  });
});

describe("volver a Cuentas con algo a medio mandar (revisión, PR #168)", () => {
  const ultimo = () => {
    const datos = simulados();
    datos.items = datos.items.filter((x) => x.id === "lucia-fernandez-por-validar");
    return datos;
  };

  it("«Volver a Cuentas» manda la validación y espera: si falla, se queda con el aviso y no navega", async () => {
    const espera = diferida();
    const a = acciones({ validar: () => espera.promesa });
    montar(ultimo(), a);
    await tocar(boton(/^Validar/));
    const volver = screen.getByRole("link", { name: "Volver a Cuentas" });
    await act(async () => fireEvent.click(volver));
    expect(a.validar).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    await act(async () => espera.resolver({ ok: false, causa: "sin-conexion" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/^No se validó el ticket de Lucía Fernández: sigue por validar./);
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Por validar$/);
  });

  it("si el envío sale bien, después de esperar va a Cuentas", async () => {
    const espera = diferida();
    montar(ultimo(), acciones({ validar: () => espera.promesa }));
    await tocar(boton(/^Validar/));
    await act(async () => fireEvent.click(screen.getByRole("link", { name: "‹ Estado de cuenta del equipo" })));
    expect(push).not.toHaveBeenCalled();
    await act(async () => espera.resolver(ok));
    expect(push).toHaveBeenCalledWith("/cuentas");
  });

  it("sin nada a medio mandar el enlace navega solo, sin esperar", async () => {
    montar(ultimo());
    const volver = screen.getByRole("link", { name: "‹ Estado de cuenta del equipo" });
    const evento = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    evento.preventDefault = vi.fn(evento.preventDefault.bind(evento));
    act(() => {
      volver.dispatchEvent(evento);
    });
    expect(push).not.toHaveBeenCalled();
    expect(volver).toHaveAttribute("href", "/cuentas");
  });
});

describe("pago de más («Pago de más», 25/10)", () => {
  it("avisa lo que queda a favor y deja validar igual", async () => {
    montar();
    await abrir("Joaquín Duarte");
    expect(within(panel()).getAllByRole("note")[0]).toHaveTextContent("Supera la deuda de $U 5.000: quedan $U 3.000 a favor");
    expect(within(panel()).getByText("SI VALIDÁS, QUEDA EN", { selector: "dt" }).nextElementSibling).toHaveTextContent("a favor $U 3.000");
    expect(boton(/^Validar/)).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("36R · el retiro por el coordinador", () => {
  it("36R·01: sin foto, con lo que la app sabe para comparar y el foco en «Confirmar»", async () => {
    montar();
    await abrir("Lucía Benítez");
    const p = within(panel());
    expect(p.getByText("El efectivo se entrega en mano: este retiro no trae comprobante.")).toBeInTheDocument();
    expect(p.getByText("SIN FOTO")).toBeInTheDocument();
    expect(p.getByText("EN MANO SEGÚN LA APP", { selector: "dt" }).nextElementSibling).toHaveTextContent("$U 9.400");
    expect(p.getByText("SI CONFIRMÁS, QUEDA EN", { selector: "dt" }).nextElementSibling).toHaveTextContent("$U 15.300");
    expect(p.getByText("Confirmar acredita $U 6.000 igual que un depósito validado. Rechazar no cambia la deuda.")).toBeInTheDocument();
    expect(p.getByRole("note")).toHaveTextContent("Según la app tenía en mano $U 9.400 y el retiro dice $U 6.000 (diferencia $U 3.400)");
    expect(boton(/^Confirmar/)).toHaveFocus();
    expect(p.getByText("Retiro 3 de 3")).toBeInTheDocument();
  });

  it("36R·02 y 03: el rechazo con los motivos del retiro y lo que va a pasar", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Benítez");
    await tocar(boton(/^Rechazar/));
    expect(within(panel()).getByRole("group", { name: "Motivos rápidos" })).toHaveTextContent("El monto no coincideNo recibí el efectivoEstá cargado dos veces");
    await tocar(boton("Confirmar rechazo"));
    expect(within(panel()).getByRole("alert")).toHaveTextContent("Escribí el motivo para rechazar el retiro.");
    expect(within(panel()).getByText(/^Lucía va a ver este motivo en su teléfono\./)).toBeInTheDocument();
    expect(a.rechazar).not.toHaveBeenCalled();
  });

  it("36R·04: rechazado queda abierto, de solo lectura, con su motivo y el aviso", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Benítez");
    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), "Me entregaste $U 5.000, no $U 6.000. Cargá de nuevo el retiro con ese monto.");
    await tocar(boton("Confirmar rechazo"));
    expect(a.rechazar).toHaveBeenCalledTimes(1);
    const p = within(panel());
    expect(p.getByText(/^Rechazado por vos · hoy /)).toBeInTheDocument();
    expect(p.getByText("Me entregaste $U 5.000, no $U 6.000. Cargá de nuevo el retiro con ese monto.")).toBeInTheDocument();
    expect(p.getByText(/^No bajó la deuda ni cuenta como depositado\. Lucía recibió el aviso/)).toBeInTheDocument();
    expect(p.getByText("Queda en el historial. No se edita ni se borra.")).toBeInTheDocument();
    expect(p.queryByRole("button", { name: /^Confirmar/ })).not.toBeInTheDocument();
    expect(screen.getByText("✕ Retiro de Lucía Benítez rechazado. Le avisamos.")).toBeInTheDocument();
    expect(filaDe("Lucía Benítez")).toHaveAttribute("aria-current", "true");
  });

  it("36R·05: confirmado queda abierto con su franja", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Benítez");
    await tocar(boton(/^Confirmar/));
    expect(a.validar).toHaveBeenCalledWith(expect.objectContaining({ id: "lucia-benitez-retiro", tipo: "retiro" }));
    expect(within(panel()).getByText(/^Confirmado por vos · hoy /)).toBeInTheDocument();
    expect(within(panel()).getByText("Acreditó igual que un depósito validado: bajó la deuda y cuenta como depositado.")).toBeInTheDocument();
    expect(screen.getByText("✓ Retiro de Lucía Benítez confirmado.")).toBeInTheDocument();
    expect(filaDe("Lucía Benítez")).toHaveAccessibleName(/Confirmado$/);
  });

  it("36R·06: el retiro propio se ve sin «Confirmar» ni «Rechazar»", async () => {
    montar();
    await abrir(String.raw`Marta Pérez \(vos\)`);
    const p = within(panel());
    expect(p.getByText("Este retiro es tuyo. Nadie confirma ni rechaza lo suyo: lo resuelve otro coordinador o el administrador.")).toBeInTheDocument();
    expect(p.getByText("Sin acciones para vos.")).toBeInTheDocument();
    expect(p.queryByRole("button", { name: /^Rechazar/ })).not.toBeInTheDocument();
    expect(p.queryByRole("button", { name: /^Confirmar/ })).not.toBeInTheDocument();
  });

  it("36R·07A: guardando, todo trabado; el doble toque no rechaza dos veces", async () => {
    const espera = diferida();
    const a = acciones({ rechazar: () => espera.promesa });
    montar(simulados(), a);
    await abrir("Lucía Benítez");
    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), "No recibí el efectivo");
    await act(async () => {
      fireEvent.click(boton("Confirmar rechazo"));
      fireEvent.click(boton("Confirmar rechazo"));
    });
    expect(boton("Rechazando…")).toHaveAttribute("aria-disabled", "true");
    expect(boton("Cancelar")).toHaveAttribute("aria-disabled", "true");
    expect(motivo()).toHaveAttribute("readonly");
    await act(async () => fireEvent.click(boton("Rechazando…")));
    await act(async () => espera.resolver(ok));
    expect(a.rechazar).toHaveBeenCalledTimes(1);
  });

  it("36R·07B sin conexión (decisión del 10/11, P1 del QA de #168): dice que falta la conexión y el motivo sigue escrito", async () => {
    montar(simulados(), acciones({ rechazar: async () => ({ ok: false, causa: "sin-conexion" }) }));
    await abrir("Lucía Benítez");
    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), "No recibí el efectivo");
    await tocar(boton("Confirmar rechazo"));
    expect(within(panel()).getByRole("alert")).toHaveTextContent(
      "Necesitás conexión para rechazar el retiro de Lucía Benítez. El motivo sigue escrito: revisá la conexión y probá de nuevo.",
    );
    expect(motivo()).toHaveValue("No recibí el efectivo");
  });

  it("36R·07B: si no se guarda, el motivo sigue escrito y «Reintentar» vuelve a probar", async () => {
    let veces = 0;
    const a = acciones({ rechazar: async () => (++veces === 1 ? { ok: false, causa: "rechazado" } : ok) });
    montar(simulados(), a);
    await abrir("Lucía Benítez");
    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), "No recibí el efectivo");
    await tocar(boton("Confirmar rechazo"));
    expect(within(panel()).getByRole("alert")).toHaveTextContent("No pudimos guardar el rechazo. El motivo sigue escrito: probá de nuevo.");
    expect(motivo()).toHaveValue("No recibí el efectivo");
    expect(boton("Reintentar")).toHaveFocus();
    await tocar(boton("Reintentar"));
    expect(a.rechazar).toHaveBeenCalledTimes(2);
    expect(within(panel()).getByText(/^Rechazado por vos/)).toBeInTheDocument();
  });

  it("si otra persona ya lo resolvió, muestra el texto del servidor", async () => {
    const a = acciones({ validar: async () => ({ ok: false, causa: "rechazado", mensaje: "Este retiro ya lo confirmó otra persona. Recargá la lista para ver cómo quedó." }) });
    montar(simulados(), a);
    await abrir("Lucía Benítez");
    await tocar(boton(/^Confirmar/));
    expect(within(panel()).getByRole("alert")).toHaveTextContent("Este retiro ya lo confirmó otra persona. Recargá la lista para ver cómo quedó.");
    expect(boton(/^Confirmar/)).not.toHaveAttribute("aria-disabled", "true");
  });

  it("36R·07C: sin conexión los botones se apagan y dicen por qué; el motivo escrito no se pierde", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Benítez");
    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), "El monto no coincide");
    enLinea(false);
    expect(within(panel()).getByText("Sin conexión. Para confirmar o rechazar un retiro hace falta conexión. Lo que ves puede estar desactualizado.")).toBeInTheDocument();
    expect(within(panel()).getByText("Se habilitan cuando vuelva la conexión.")).toBeInTheDocument();
    expect(boton("Confirmar rechazo")).toHaveAttribute("aria-disabled", "true");
    await tocar(boton("Confirmar rechazo"));
    expect(a.rechazar).not.toHaveBeenCalled();
    expect(motivo()).toHaveValue("El monto no coincide");
    enLinea(true);
    expect(boton("Confirmar rechazo")).not.toHaveAttribute("aria-disabled", "true");
  });

  it("sin conexión, el depósito tampoco se valida", async () => {
    enLinea(false);
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    expect(within(panel()).getByText(/^Sin conexión\. Para validar o rechazar un ticket hace falta conexión\./)).toBeInTheDocument();
    expect(boton(/^Validar/)).toHaveAttribute("aria-disabled", "true");
    await tocar(boton(/^Validar/));
    expect(a.validar).not.toHaveBeenCalled();
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Por validar$/);
  });

  it("36R·08: con más de 500 caracteres no se corta: avisa y apaga «Confirmar rechazo»", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Benítez");
    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), "x".repeat(612));
    expect(motivo()).toHaveValue("x".repeat(612));
    expect(within(panel()).getByText("612 / 500")).toBeInTheDocument();
    expect(within(panel()).getByRole("alert")).toHaveTextContent("El motivo tiene 612 caracteres y el máximo es 500. Acortalo para rechazar.");
    expect(boton("Confirmar rechazo")).toHaveAttribute("aria-disabled", "true");
    await tocar(boton("Confirmar rechazo"));
    expect(a.rechazar).not.toHaveBeenCalled();
  });
});

describe("dos decisiones seguidas", () => {
  it("rechazar un retiro y confirmar otro antes de que conteste el primero: van en orden y no se pierde ninguna", async () => {
    const espera = diferida();
    const a = acciones({ rechazar: () => espera.promesa });
    montar(simulados(), a);
    await abrir("Lucía Benítez");
    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), "No recibí el efectivo");
    await tocar(boton("Confirmar rechazo"));
    await abrir("Gonzalo Méndez");
    await tocar(boton(/^Confirmar/));
    expect(a.validar).not.toHaveBeenCalled();
    await act(async () => espera.resolver(ok));
    expect(a.validar).toHaveBeenCalledTimes(1);
    expect(filaDe("Lucía Benítez")).toHaveAccessibleName(/Rechazado, Motivo: No recibí el efectivo$/);
    expect(filaDe("Gonzalo Méndez")).toHaveAccessibleName(/Confirmado$/);
    // El rechazo llegó con otra fila abierta: no la cambia.
    expect(filaDe("Gonzalo Méndez")).toHaveAttribute("aria-current", "true");
  });
});

describe("teclado", () => {
  it("R abre el rechazo, Esc lo cancela, ↓ ↑ cambian de fila, C confirma un retiro y V valida un depósito", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { acciones: a } = montar();
    const raiz = () => panel().closest("[class*='bg-fondo']") as HTMLElement;
    await abrir("Lucía Benítez");
    await act(async () => fireEvent.keyDown(boton(/^Confirmar/), { key: "r" }));
    expect(motivo()).toHaveFocus();
    await act(async () => fireEvent.keyDown(motivo(), { key: "Escape" }));
    expect(within(panel()).queryByLabelText("MOTIVO DEL RECHAZO · OBLIGATORIO")).not.toBeInTheDocument();
    await act(async () => fireEvent.keyDown(raiz(), { key: "c" }));
    expect(a.validar).toHaveBeenCalledWith(expect.objectContaining({ id: "lucia-benitez-retiro" }));
    await act(async () => fireEvent.keyDown(filaDe("Lucía Benítez"), { key: "ArrowUp" }));
    expect(filaDe("Joaquín Duarte")).toHaveAttribute("aria-current", "true");
    expect(filaDe("Joaquín Duarte")).toHaveFocus();
    await act(async () => fireEvent.keyDown(filaDe("Joaquín Duarte"), { key: "v" }));
    expect(filaDe("Joaquín Duarte")).toHaveAccessibleName(/Validado$/);
  });

  it("las teclas no actúan mientras se escribe el motivo", async () => {
    const { acciones: a } = montar();
    await abrir("Lucía Fernández");
    await tocar(boton(/^Rechazar/));
    await act(async () => fireEvent.keyDown(motivo(), { key: "v" }));
    expect(a.validar).not.toHaveBeenCalled();
    expect(motivo()).toBeInTheDocument();
  });
});

describe("cómo se llega y casos límite", () => {
  it("desde «Validar» de una fila de Cuentas abre ese ticket (?ticket=)", () => {
    window.history.replaceState(null, "", "/cuentas/validar-tickets?ticket=joaquin-duarte-de-mas");
    montar();
    expect(filaDe("Joaquín Duarte")).toHaveAttribute("aria-current", "true");
  });

  it("un ?ticket= que no existe abre el primero", () => {
    window.history.replaceState(null, "", "/cuentas/validar-tickets?ticket=no-existe");
    montar();
    expect(filaDe("Gonzalo Méndez")).toHaveAttribute("aria-current", "true");
  });

  it("sin nada en la campaña dice que no quedan tickets y ofrece volver", () => {
    montar({ campaniaId: "c", ahora: AHORA.toISOString(), items: [] });
    expect(screen.getByRole("status")).toHaveTextContent("No quedan tickets por validar");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tickets por validar · 0");
    expect(screen.queryByText(/el más antiguo/)).not.toBeInTheDocument();
  });

  it("muchos ítems, un nombre largo y un motivo largo se ven enteros", () => {
    const base = simulados().items[1];
    const largo = "Florencia Guadalupe de los Santos Etcheverry Rodríguez Pintos";
    const muchos: ItemPorValidar[] = Array.from({ length: 60 }, (_, i) => ({ ...base, id: `t-${i}`, colportorNombre: i === 0 ? largo : `Colportor ${i}` }));
    muchos.push({ ...base, id: "r", estado: "RECHAZADO", motivoRechazo: "m".repeat(500), resueltoEn: AHORA.toISOString(), resueltoPorVos: true });
    montar({ campaniaId: "c", ahora: AHORA.toISOString(), items: muchos });
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tickets por validar · 60");
    expect(within(panel()).getByText(largo)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(61);
  });
});

describe("la sesión que el proxy cerró con la vista abierta (#41, #170)", () => {
  /** Lo que llega de una server action cuando `src/proxy.ts` contesta 401 con su marca. */
  const cerrada = (motivo: "vencida" | "sin-acceso") => async () => {
    throw new Error(marcaDeRechazo(motivo));
  };

  it("validar un depósito: dice que la sesión venció, no «sin conexión», y el ticket sigue por validar", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    montar(simulados(), acciones({ validar: cerrada("vencida") }));
    await abrir("Lucía Fernández");
    await tocar(boton(/^Validar/));
    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER);
    });
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Por validar$/);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se validó el ticket de Lucía Fernández: sigue por validar. Tu sesión venció. Volvé a entrar para seguir.",
    );
  });

  it("confirmar un retiro sin acceso: pide volver a entrar y el botón vuelve a poder usarse", async () => {
    montar(simulados(), acciones({ validar: cerrada("sin-acceso") }));
    await abrir("Lucía Benítez");
    await tocar(boton(/^Confirmar/));
    expect(within(panel()).getByText("No se pudo confirmar. Volvé a entrar para seguir.")).toBeInTheDocument();
    expect(boton(/^Confirmar/)).not.toHaveAttribute("aria-disabled", "true");
    expect(filaDe("Lucía Benítez")).toHaveAccessibleName(/Por confirmar$/);
  });

  it("rechazar: el motivo sigue escrito y el aviso dice que la sesión venció", async () => {
    montar(simulados(), acciones({ rechazar: cerrada("vencida") }));
    await abrir("Lucía Benítez");
    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), "Me entregaste otro monto");
    await tocar(boton("Confirmar rechazo"));
    expect(within(panel()).getByText("Tu sesión venció. Volvé a entrar para seguir.")).toBeInTheDocument();
    expect(motivo()).toHaveValue("Me entregaste otro monto");
  });

  it("la foto: dice que la sesión venció", async () => {
    montar(simulados(), acciones({ enlaceDeFoto: cerrada("vencida") }));
    await abrir("Lucía Fernández");
    await tocar(boton("Ver foto"));
    expect(within(panel()).getByRole("alert")).toHaveTextContent("Tu sesión venció. Volvé a entrar para seguir.");
  });

  it("un error cualquiera (sin la marca del proxy) sigue siendo «sin conexión»", async () => {
    montar(simulados(), acciones({ enlaceDeFoto: async () => Promise.reject(new TypeError("fetch failed")) }));
    await abrir("Lucía Fernández");
    await tocar(boton("Ver foto"));
    expect(within(panel()).getByRole("alert")).toHaveTextContent("Necesitás conexión para ver la foto.");
  });

  it("un ?ticket= de Cuentas que la cola real no tiene (Cuentas sigue simulada) abre la cola sin error", () => {
    window.history.replaceState(null, "", "/cuentas/validar-tickets?ticket=00000000-0000-4000-8000-000000000000");
    montar();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tickets por validar · 5");
  });
});

describe("un ticket sin monto (la base lo permite; TV004) (#170, QA)", () => {
  const conSinMonto = () => {
    const datos = simulados();
    datos.items = datos.items.map((x) => (x.id === "lucia-fernandez-por-validar" ? { ...x, monto: null, cifras: null } : x));
    return datos;
  };

  it("la fila y el panel dicen «Monto no informado», «Validar» se apaga con su motivo y se puede rechazar", async () => {
    const { acciones: a } = montar(conSinMonto());
    expect(filaDe("Lucía Fernández")).toHaveAccessibleName(/Monto no informado/);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tickets por validar · 5");
    await abrir("Lucía Fernández");
    expect(within(panel()).getAllByText("Monto no informado").length).toBeGreaterThan(0);
    const validar = boton(/^Validar/);
    expect(validar).toHaveAttribute("aria-disabled", "true");
    expect(validar).toHaveAccessibleDescription(
      "El ticket no tiene monto, no hay nada para acreditar. Rechazalo con un motivo para que el colportor lo cargue de nuevo.",
    );
    await tocar(validar);
    await act(async () => fireEvent.keyDown(panel(), { key: "v" }));
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    expect(a.validar).not.toHaveBeenCalled();

    await tocar(boton(/^Rechazar/));
    await escribir(motivo(), "Falta el monto");
    await tocar(boton("Confirmar rechazo"));
    expect(a.rechazar).toHaveBeenCalledWith(expect.objectContaining({ id: "lucia-fernandez-por-validar" }), "Falta el monto");
  });

  it("los demás tickets se siguen validando", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { acciones: a } = montar(conSinMonto());
    await abrir("Joaquín Duarte");
    await tocar(boton(/^Validar/));
    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER);
    });
    expect(a.validar).toHaveBeenCalledWith(expect.objectContaining({ id: "joaquin-duarte-de-mas" }));
  });
});

describe("una previa que no se pudo calcular (P3 del QA de #173)", () => {
  it("en el lugar de las cifras dice que no se pudo calcular y deja decidir igual", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const datos = simulados();
    datos.items = datos.items.map((x) => (x.id === "lucia-fernandez-por-validar" ? { ...x, cifras: null, previaNoDisponible: true } : x));
    const { acciones: a } = montar(datos);
    await abrir("Lucía Fernández");
    expect(
      within(panel()).getByText("No pudimos calcular lo que tenía en mano y lo que debe. Podés decidir igual: la base controla al guardar."),
    ).toBeInTheDocument();
    expect(within(panel()).queryByText("EN MANO SEGÚN LA APP")).not.toBeInTheDocument();
    await tocar(boton(/^Validar/));
    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER);
    });
    expect(a.validar).toHaveBeenCalledWith(expect.objectContaining({ id: "lucia-fernandez-por-validar" }));
  });

  it("sin la marca (la base no las calcula, p. ej. campaña sin alquiler) no se avisa nada", async () => {
    const datos = simulados();
    datos.items = datos.items.map((x) => (x.id === "lucia-fernandez-por-validar" ? { ...x, cifras: null } : x));
    montar(datos);
    await abrir("Lucía Fernández");
    expect(within(panel()).queryByText(/No pudimos calcular/)).not.toBeInTheDocument();
  });
});
