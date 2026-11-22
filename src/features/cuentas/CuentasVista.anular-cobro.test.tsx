import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccionesCuentas, DatosDeCuentas, ResultadoDeAccion, ResultadoDeAnulacion } from "@/datos/cuentas";
import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { CuentasVista } from "@/features/cuentas/CuentasVista";
import { hayTrabajoPendiente } from "@/shell/trabajo-pendiente";

/**
 * Vista 39 (front-coordinadores-web#81, HU-COB-006): «Anular cobro» en el detalle de un ticket de tarjeta de Cuentas, con los
 * artboards 39A·01-07 y 39B·01-04 (el 39B·05 es el esqueleto de la ruta: `carga-y-error.test.tsx`) y los casos límite.
 */

// 22/10 12:00 en Montevideo. Florencia: cobro del 21/10 10:20 (se puede anular hasta el 24/10 10:20). Valentina: del 16/10
// (pasó el plazo). Joaquín: ya lo anuló desde el teléfono. Lucía: un depósito en banco, sin cobro.
const AHORA = new Date("2026-10-22T15:00:00.000Z");
const EJEMPLOS = ["florencia-pintos-cobro-vigente", "valentina-silva-cobro-pasado", "joaquin-duarte-cobro-anulado", "lucia-fernandez-por-validar"];

function datosDeLaVista39(): DatosDeCuentas {
  const base = armarCuentasSimuladas(AHORA);
  return { ...base, tickets: base.tickets.filter((t) => EJEMPLOS.includes(t.id)) };
}

function diferida<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

type Anular = AccionesCuentas["anularCobro"];

function montar(opciones: { datos?: DatosDeCuentas; anularCobro?: Anular } = {}) {
  const datos = opciones.datos ?? datosDeLaVista39();
  const base = crearAccionesSimuladas(datos, () => AHORA.getTime());
  const anularCobro = vi.fn<Anular>(opciones.anularCobro ?? base.anularCobro);
  const acciones: AccionesCuentas = { ...base, anularCobro };
  const usuario = userEvent.setup();
  render(
    <ProveedorModoDev activo={false}>
      <CuentasVista datos={datos} acciones={acciones} />
    </ProveedorModoDev>,
  );
  return { usuario, anularCobro, base, datos };
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function irATickets(usuario: Usuario) {
  await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
  await usuario.click(screen.getByRole("tab", { name: /Tickets/ }));
}

async function abrirDetalle(usuario: Usuario, nombre: string) {
  await usuario.click(screen.getByRole("button", { name: nombre }));
  return screen.getByRole("row", { name: `Detalle del ticket de ${nombre}` });
}

/** La fila del ticket (no su detalle): la que contiene el botón con el nombre del colportor. */
const filaDe = (nombre: string) => screen.getByRole("button", { name: nombre }).closest<HTMLElement>('[role="row"]') as HTMLElement;
const botonAnular = (nombre: string) => screen.getByRole("button", { name: `Anular cobro de ${nombre}` });
const dialogo = () => screen.getByRole("dialog");

async function abrirDialogo(usuario: Usuario, nombre = "Florencia Pintos") {
  await irATickets(usuario);
  await abrirDetalle(usuario, nombre);
  await usuario.click(botonAnular(nombre));
  return within(dialogo());
}

async function elegirYSeguir(usuario: Usuario, motivo: string, nombre = "Florencia Pintos") {
  const d = await abrirDialogo(usuario, nombre);
  await usuario.click(d.getByRole("radio", { name: motivo }));
  await usuario.click(d.getByRole("button", { name: "Seguir" }));
  return d;
}

function conConexion(hay: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(hay);
  act(() => {
    window.dispatchEvent(new Event(hay ? "online" : "offline"));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("39A·01 · el cobro abierto, con «Anular cobro»", () => {
  it("el detalle ofrece «Anular cobro», separado de «Validar», y dice hasta cuándo se puede", async () => {
    const { usuario } = montar();
    await irATickets(usuario);
    const detalle = await abrirDetalle(usuario, "Florencia Pintos");
    const boton = within(detalle).getByRole("button", { name: "Anular cobro de Florencia Pintos" });
    expect(boton).toHaveTextContent("Anular cobro");
    expect(boton).not.toHaveAttribute("aria-disabled", "true");
    expect(boton).toHaveAccessibleDescription(
      "Se puede anular hasta el 24/10 · 10:20 (72 h después del cobro). Anular deja el cobro sin efecto y le avisa a la colportora.",
    );
    // Ya hay un solo `role=status` y no se agrega otro.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("un depósito (sin cobro detrás) no ofrece «Anular cobro»", async () => {
    const { usuario } = montar();
    await irATickets(usuario);
    const detalle = await abrirDetalle(usuario, "Lucía Fernández");
    expect(within(detalle).queryByRole("button", { name: /Anular cobro/ })).not.toBeInTheDocument();
  });

  it("la fila del cobro sigue diciendo «✓ Validado» con el monto sin tachar", async () => {
    const { usuario } = montar();
    await irATickets(usuario);
    const fila = filaDe("Florencia Pintos");
    expect(within(fila).getByText("✓ Validado")).toBeInTheDocument();
    expect(within(fila).getByText("$U 4.800")).not.toHaveClass("line-through");
  });
});

describe("39A·02 · elegir el motivo", () => {
  it("abre con los cuatro motivos del teléfono, el foco en el primero y «Seguir» apagado hasta elegir uno", async () => {
    const { usuario } = montar();
    const d = await abrirDialogo(usuario);
    expect(d.getByRole("heading", { name: "Anular el cobro de $U 4.800" })).toBeInTheDocument();
    expect(d.getByText("$U 4.800", { selector: "h2 span" })).toHaveClass("whitespace-nowrap");
    expect(dialogo()).toHaveAccessibleDescription("Florencia Pintos · tarjeta de débito Visa · 21/10 10:20. Elegí el motivo.");
    expect(d.getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual([
      "Monto equivocado",
      "Cliente equivocado",
      "Lo registré dos veces",
      "Otro",
    ]);
    expect(d.getByRole("radio", { name: "Monto equivocado" })).toHaveFocus();
    expect(d.getByRole("button", { name: "Seguir" })).toHaveAttribute("aria-disabled", "true");
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    expect(d.queryByRole("heading", { name: "¿Anular este cobro?" })).not.toBeInTheDocument();
    await usuario.click(d.getByRole("radio", { name: "Cliente equivocado" }));
    expect(d.getByRole("button", { name: "Seguir" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("el diálogo no deja salir el Tab y Esc lo cierra devolviendo el foco al botón", async () => {
    const { usuario } = montar();
    const d = await abrirDialogo(usuario);
    await usuario.click(d.getByRole("radio", { name: "Cliente equivocado" }));
    const seguir = d.getByRole("button", { name: "Seguir" });
    seguir.focus();
    await usuario.tab();
    // El Tab da la vuelta: del último control al primero.
    expect(d.getByRole("radio", { name: "Monto equivocado" })).toHaveFocus();
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(botonAnular("Florencia Pintos")).toHaveFocus();
  });

  it("volver a abrir después de cancelar empieza de cero (sin motivo elegido ni texto)", async () => {
    const { usuario } = montar();
    const d = await abrirDialogo(usuario);
    await usuario.click(d.getByRole("radio", { name: "Otro" }));
    await usuario.type(d.getByRole("textbox", { name: "¿POR QUÉ?" }), "algo");
    await usuario.click(d.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await usuario.click(botonAnular("Florencia Pintos"));
    const otra = within(dialogo());
    expect(otra.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(otra.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("39A·03 · el motivo «Otro»", () => {
  it("pide el texto: sin él, «Seguir» sigue apagado y el campo dice qué falta; con él, sigue", async () => {
    const { usuario } = montar();
    const d = await abrirDialogo(usuario);
    await usuario.click(d.getByRole("radio", { name: "Otro" }));
    const campo = d.getByRole("textbox", { name: "¿POR QUÉ?" });
    expect(campo).toHaveAttribute("placeholder", "Escribí el motivo");
    expect(campo).toBeInvalid();
    expect(d.getByRole("alert")).toHaveTextContent("Escribí el motivo para seguir.");
    expect(campo).toHaveAccessibleDescription("Escribí el motivo para seguir.");
    expect(d.getByRole("button", { name: "Seguir" })).toHaveAttribute("aria-disabled", "true");

    // Solo espacios es lo mismo que nada.
    await usuario.type(campo, "   ");
    expect(d.getByRole("button", { name: "Seguir" })).toHaveAttribute("aria-disabled", "true");
    await usuario.type(campo, "Cobré de más");
    expect(campo).toBeValid();
    expect(d.queryByRole("alert")).not.toBeInTheDocument();
    expect(d.getByRole("button", { name: "Seguir" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("el texto tiene tope y un texto largo sin espacios se parte en la confirmación", async () => {
    const { usuario } = montar();
    const d = await abrirDialogo(usuario);
    await usuario.click(d.getByRole("radio", { name: "Otro" }));
    const campo = d.getByRole("textbox", { name: "¿POR QUÉ?" });
    fireEvent.change(campo, { target: { value: "x".repeat(500) } });
    expect(campo).toHaveValue("x".repeat(200));
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    expect(d.getByText(`Otro: ${"x".repeat(200)}`)).toHaveClass("[overflow-wrap:anywhere]");
  });

  it("elegir otro motivo después de «Otro» no arrastra el texto escrito", async () => {
    const { usuario, anularCobro } = montar();
    const d = await abrirDialogo(usuario);
    await usuario.click(d.getByRole("radio", { name: "Otro" }));
    await usuario.type(d.getByRole("textbox", { name: "¿POR QUÉ?" }), "algo");
    await usuario.click(d.getByRole("radio", { name: "Monto equivocado" }));
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(anularCobro).toHaveBeenCalledTimes(1));
    expect(anularCobro).toHaveBeenCalledWith("cobro-florencia-pintos-vigente", "Monto equivocado", undefined);
  });
});

describe("39A·04 · la segunda confirmación", () => {
  it("dice qué cambia, el motivo elegido y un botón rojo con la acción entera; «Volver» conserva la elección", async () => {
    const { usuario } = montar();
    const d = await elegirYSeguir(usuario, "Monto equivocado");
    expect(d.getByRole("heading", { name: "¿Anular este cobro?" })).toBeInTheDocument();
    expect(dialogo()).toHaveAccessibleDescription(
      "El cobro de $U 4.800 deja de contar: el saldo de la venta vuelve a subir y el ticket queda anulado. Florencia Pintos lo ve en su teléfono con el motivo. No se puede deshacer.",
    );
    expect(d.getByText("Motivo")).toBeInTheDocument();
    expect(d.getByText("Monto equivocado", { selector: "dd" })).toBeInTheDocument();
    expect(d.getByRole("button", { name: "Volver" })).toHaveFocus();
    expect(d.getByRole("button", { name: "Sí, anular el cobro" }).className).toMatch(/bg-peligro/);

    await usuario.click(d.getByRole("button", { name: "Volver" }));
    expect(d.getByRole("radio", { name: "Monto equivocado" })).toBeChecked();
  });

  it("con «Otro» la confirmación muestra lo escrito", async () => {
    const { usuario } = montar();
    const d = await abrirDialogo(usuario);
    await usuario.click(d.getByRole("radio", { name: "Otro" }));
    await usuario.type(d.getByRole("textbox", { name: "¿POR QUÉ?" }), "Cobré de más");
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    expect(d.getByText("Otro: Cobré de más", { selector: "dd" })).toBeInTheDocument();
  });
});

describe("39A·05 · anulando", () => {
  it("mientras anula dice «Anulando…», no deja volver ni cerrar y el doble toque manda un solo pedido", async () => {
    const espera = diferida<ResultadoDeAccion<ResultadoDeAnulacion>>();
    const { usuario, anularCobro, base } = montar({ anularCobro: () => espera.promesa });
    const d = await elegirYSeguir(usuario, "Monto equivocado");
    expect(hayTrabajoPendiente()).toBe(false);
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    const anulando = d.getByRole("button", { name: "Anulando…" });
    expect(anulando).toHaveAttribute("aria-disabled", "true");
    expect(hayTrabajoPendiente()).toBe(true);
    expect(d.queryByRole("button", { name: "Volver" })).not.toBeInTheDocument();

    await usuario.click(anulando);
    await usuario.click(anulando);
    await usuario.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(anularCobro).toHaveBeenCalledTimes(1);

    await act(async () => {
      espera.resolver(await base.anularCobro("cobro-florencia-pintos-vigente", "Monto equivocado"));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(hayTrabajoPendiente()).toBe(false);
  });
});

describe("39A·06 · anulado: cómo queda", () => {
  it("el diálogo se cierra, avisa «Cobro anulado.», la fila queda «⊘ Anulado» con el monto tachado y el detalle guarda motivo, quién y cuándo", async () => {
    const { usuario, anularCobro } = montar();
    const d = await elegirYSeguir(usuario, "Lo registré dos veces");
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(anularCobro).toHaveBeenCalledWith("cobro-florencia-pintos-vigente", "Lo registré dos veces", undefined);

    expect(screen.getByRole("status")).toHaveTextContent("Cobro anulado.");
    const fila = filaDe("Florencia Pintos");
    expect(within(fila).getByText("⊘ Anulado")).toBeInTheDocument();
    expect(within(fila).queryByText("✓ Validado")).not.toBeInTheDocument();
    expect(within(fila).getByText("$U 4.800")).toHaveClass("line-through");

    const detalle = screen.getByRole("row", { name: "Detalle del ticket de Florencia Pintos" });
    expect(within(detalle).getByText("Lo registré dos veces")).toBeInTheDocument();
    expect(within(detalle).getByText("Marta Pérez")).toBeInTheDocument();
    expect(within(detalle).getByText("21/10 · 10:20")).toBeInTheDocument();
    expect(within(detalle).getByText("22/10 · 12:00")).toBeInTheDocument();
    expect(detalle).toHaveTextContent("Cobro anulado. No cuenta en la cuenta de Florencia Pintos ni en el saldo de la venta.");
    // No hay «Deshacer» ni otra acción sobre un cobro anulado.
    expect(within(detalle).queryByRole("button", { name: /Anular/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Deshacer/ })).not.toBeInTheDocument();
    // El foco vuelve a la fila del ticket, no se pierde en el <body>.
    expect(screen.getByRole("button", { name: "Florencia Pintos" })).toHaveFocus();
  });

  it("deja de contarse: «Depositado» baja y la deuda sube en Casa editora, y los validados de Tickets bajan", async () => {
    const { usuario, datos } = montar();
    const antes = datos.colportores.find((c) => c.id === "florencia-pintos");
    await irATickets(usuario);
    expect(screen.getByText("VALIDADOS", { selector: "dt" }).parentElement).toHaveTextContent(/^VALIDADOS2\$U/);
    const d = await abrirDialogo(usuario);
    await usuario.click(d.getByRole("radio", { name: "Monto equivocado" }));
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(screen.getByText("VALIDADOS", { selector: "dt" }).parentElement).toHaveTextContent(/^VALIDADOS1\$U/);
    await usuario.click(screen.getByRole("tab", { name: "Casa editora" }));
    const fila = screen.getByRole("row", { name: /^Florencia Pintos/ });
    const cifra = (n: number | undefined) => `$U ${((n ?? 0) / 1000).toFixed(3).replace(",", ".")}`;
    expect(antes).toBeDefined();
    expect(fila).toHaveTextContent(cifra((antes?.depositado ?? 0) - 4800));
  });

  it("dos cobros seguidos: el segundo se anula igual que el primero y ninguno pisa al otro", async () => {
    const base = armarCuentasSimuladas(AHORA);
    // Dos cobros dentro del plazo: se suma otro ticket de tarjeta de Valentina, de hace 1 día.
    const vigente = base.tickets.filter((t) => t.id === "florencia-pintos-cobro-vigente");
    const otro = vigente.map((t) => ({ ...t, id: "valentina-segundo", colportorId: "valentina-silva", cobro: { id: "cobro-valentina-segundo", fecha: "2026-10-21T10:20:00-03:00" } }));
    const datos = { ...base, tickets: [...base.tickets.filter((t) => EJEMPLOS.includes(t.id) && t.id !== "valentina-silva-cobro-pasado"), ...otro] };
    const { usuario, anularCobro } = montar({ datos });
    await irATickets(usuario);
    for (const nombre of ["Florencia Pintos", "Valentina Silva"]) {
      await abrirDetalle(usuario, nombre);
      await usuario.click(botonAnular(nombre));
      const d = within(dialogo());
      await usuario.click(d.getByRole("radio", { name: "Monto equivocado" }));
      await usuario.click(d.getByRole("button", { name: "Seguir" }));
      await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }
    expect(anularCobro).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("⊘ Anulado")).toHaveLength(3);
  });

  it("si la fuente contesta que ya estaba anulado, lo dice y no cambia nada (doble toque o anuló otra persona)", async () => {
    const { usuario } = montar({ anularCobro: async () => ({ ok: true, valor: { yaEstaba: true } }) });
    const d = await elegirYSeguir(usuario, "Monto equivocado");
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Ese cobro ya estaba anulado y no cambió nada. Recargá la página para ver cómo quedó.");
    expect(screen.queryByText("⊘ Anulado", { selector: "span" })).toBeInTheDocument(); // el de Joaquín, que no se tocó
    expect(screen.getAllByText("⊘ Anulado")).toHaveLength(1);
  });
});

describe("39A·07 · ya lo anuló la colportora", () => {
  it("el mismo detalle dice que fue desde el teléfono y no ofrece ninguna acción", async () => {
    const { usuario } = montar();
    await irATickets(usuario);
    const detalle = await abrirDetalle(usuario, "Joaquín Duarte");
    expect(within(detalle).getByText("Lo registré dos veces")).toBeInTheDocument();
    expect(within(detalle).getByText("Joaquín Duarte (desde el teléfono)")).toBeInTheDocument();
    expect(within(detalle).getByText("21/10 · 18:12")).toBeInTheDocument();
    expect(within(detalle).getByText("20/10 · 15:40")).toBeInTheDocument();
    expect(within(detalle).queryByRole("button", { name: /Anular/ })).not.toBeInTheDocument();
    const fila = filaDe("Joaquín Duarte");
    expect(within(fila).getByText("⊘ Anulado")).toBeInTheDocument();
  });
});

describe("39B·01 · pasaron 72 h", () => {
  it("el botón queda apagado, dice cuándo fue el cobro y hasta cuándo se podía, y no abre nada", async () => {
    const { usuario, anularCobro } = montar();
    await irATickets(usuario);
    const detalle = await abrirDetalle(usuario, "Valentina Silva");
    const boton = within(detalle).getByRole("button", { name: "Anular cobro de Valentina Silva" });
    expect(boton).toHaveAttribute("aria-disabled", "true");
    expect(boton).toHaveAccessibleDescription("Pasaron más de 72 h desde el cobro (16/10 · 10:20). Se podía anular hasta el 19/10 a las 10:20.");
    await usuario.click(boton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(anularCobro).not.toHaveBeenCalled();
  });
});

describe("39B·02 · el plazo venció mientras confirmaba", () => {
  it("dice «No se anuló», no deja reintentar, y al cerrar el botón queda apagado con el aviso de plazo", async () => {
    const { usuario, anularCobro } = montar({
      anularCobro: async () => ({ ok: false, causa: "rechazado", codigo: "fuera-de-plazo", mensaje: "Pasaron más de 72 h desde el cobro: ya no se puede anular." }),
    });
    const d = await elegirYSeguir(usuario, "Monto equivocado");
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(d.getByRole("heading", { name: "No se anuló" })).toBeInTheDocument());
    expect(d.getByRole("alert")).toHaveTextContent("Pasaron las 72 h mientras confirmabas. El cobro sigue como estaba.");
    expect(d.queryByRole("button", { name: /Reintentar|Sí, anular/ })).not.toBeInTheDocument();
    expect(d.getByRole("button", { name: "Cerrar" })).toHaveFocus();

    await usuario.click(d.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const boton = botonAnular("Florencia Pintos");
    expect(boton).toHaveAttribute("aria-disabled", "true");
    expect(boton).toHaveAccessibleDescription(/^Pasaron más de 72 h desde el cobro \(21\/10 · 10:20\)\. Se podía anular hasta el 24\/10 a las 10:20\.$/);
    expect(boton).toHaveFocus();
    await usuario.click(boton);
    expect(anularCobro).toHaveBeenCalledTimes(1);
    // Nada se anuló: la fila sigue «Validado».
    expect(within(filaDe("Florencia Pintos")).getByText("✓ Validado")).toBeInTheDocument();
  });
});

describe("39B·03 · error al anular", () => {
  it("dice que no cambió nada, ofrece «Reintentar», el botón vuelve a poder usarse y al reintentar anula", async () => {
    const respuestas: Array<ResultadoDeAccion<ResultadoDeAnulacion>> = [{ ok: false, causa: "sin-conexion" }];
    const { usuario, anularCobro, base } = montar({
      anularCobro: async (...args) => respuestas.shift() ?? base.anularCobro(...args),
    });
    const d = await elegirYSeguir(usuario, "Monto equivocado");
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(d.getByRole("alert")).toHaveTextContent("No pudimos anular el cobro. No cambió nada: probá de nuevo."));
    expect(hayTrabajoPendiente()).toBe(false);
    const reintentar = d.getByRole("button", { name: "Reintentar" });
    expect(reintentar).not.toHaveAttribute("aria-disabled", "true");
    // Se puede volver y cambiar el motivo.
    expect(d.getByRole("button", { name: "Volver" })).toBeInTheDocument();

    await usuario.click(reintentar);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(anularCobro).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("Cobro anulado.");
  });

  it("si el pedido se cae (throw), es lo mismo: no queda nada trabado", async () => {
    const { usuario } = montar({
      anularCobro: () => Promise.reject(new Error("red caída")),
    });
    const d = await elegirYSeguir(usuario, "Monto equivocado");
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(d.getByRole("alert")).toHaveTextContent("No pudimos anular el cobro. No cambió nada: probá de nuevo."));
    expect(hayTrabajoPendiente()).toBe(false);
    expect(d.getByRole("button", { name: "Reintentar" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("un rechazo de la base con su texto lo muestra tal cual (sin códigos)", async () => {
    const { usuario } = montar({
      anularCobro: async () => ({ ok: false, causa: "rechazado", mensaje: "No encontramos ese cobro entre los de tu equipo." }),
    });
    const d = await elegirYSeguir(usuario, "Monto equivocado");
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(d.getByRole("alert")).toHaveTextContent("No encontramos ese cobro entre los de tu equipo."));
  });

  it("volver después de un error limpia el aviso y otro intento empieza sin él", async () => {
    const { usuario } = montar({ anularCobro: async () => ({ ok: false, causa: "sin-conexion" }) });
    const d = await elegirYSeguir(usuario, "Monto equivocado");
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(d.getByRole("alert")).toBeInTheDocument());
    await usuario.click(d.getByRole("button", { name: "Volver" }));
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    expect(d.queryByRole("alert")).not.toBeInTheDocument();
    expect(d.getByRole("button", { name: "Sí, anular el cobro" })).toBeInTheDocument();
  });
});

describe("39B·04 · sin conexión", () => {
  it("se ven los cobros pero no se anulan: franja arriba, botón apagado con su razón y vuelve al volver la señal", async () => {
    const { usuario, anularCobro } = montar();
    await irATickets(usuario);
    expect(screen.queryByText("Sin conexión. Podés ver los cobros, pero no anularlos hasta que vuelva.")).not.toBeInTheDocument();
    const detalle = await abrirDetalle(usuario, "Florencia Pintos");
    conConexion(false);

    expect(screen.getByText("Sin conexión. Podés ver los cobros, pero no anularlos hasta que vuelva.")).toBeInTheDocument();
    const boton = within(detalle).getByRole("button", { name: "Anular cobro de Florencia Pintos" });
    expect(boton).toHaveAttribute("aria-disabled", "true");
    expect(boton).toHaveAccessibleDescription("Necesitás conexión para anular un cobro.");
    await usuario.click(boton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(anularCobro).not.toHaveBeenCalled();

    conConexion(true);
    expect(screen.queryByText("Sin conexión. Podés ver los cobros, pero no anularlos hasta que vuelva.")).not.toBeInTheDocument();
    expect(botonAnular("Florencia Pintos")).not.toHaveAttribute("aria-disabled", "true");
  });

  it("pasado el plazo manda el plazo: sin señal sigue diciendo que pasaron las 72 h", async () => {
    const { usuario } = montar();
    await irATickets(usuario);
    await abrirDetalle(usuario, "Valentina Silva");
    conConexion(false);
    expect(botonAnular("Valentina Silva")).toHaveAccessibleDescription(/^Pasaron más de 72 h/);
  });

  it("si se pierde la señal con el diálogo abierto, confirmar falla con el aviso y no queda trabado", async () => {
    const { usuario } = montar({ anularCobro: async () => ({ ok: false, causa: "sin-conexion" }) });
    const d = await elegirYSeguir(usuario, "Monto equivocado");
    conConexion(false);
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(d.getByRole("alert")).toHaveTextContent("No pudimos anular el cobro"));
    expect(d.getByRole("button", { name: "Reintentar" })).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("datos límite", () => {
  it("sin ningún cobro por anular no aparece la franja de sin conexión", async () => {
    const base = armarCuentasSimuladas(AHORA);
    const { usuario } = montar({ datos: { ...base, tickets: base.tickets.filter((t) => t.id === "lucia-fernandez-por-validar") } });
    await irATickets(usuario);
    conConexion(false);
    expect(screen.queryByText(/no anularlos hasta que vuelva/)).not.toBeInTheDocument();
  });

  it("un nombre larguísimo no rompe el diálogo: se parte en vez de salirse", async () => {
    const base = armarCuentasSimuladas(AHORA);
    const largo = "Florencia".repeat(12);
    const datos = { ...base, tickets: base.tickets.filter((t) => EJEMPLOS.includes(t.id)), colportores: base.colportores.map((c) => (c.id === "florencia-pintos" ? { ...c, nombre: largo } : c)) };
    const { usuario } = montar({ datos });
    await irATickets(usuario);
    await usuario.click(screen.getByRole("button", { name: largo }));
    await usuario.click(botonAnular(largo));
    expect(dialogo().querySelector("#texto-anular-cobro")).toHaveClass("[overflow-wrap:anywhere]");
  });

  it("un cobro con el monto en cero o enorme se muestra entero en el título", async () => {
    const base = armarCuentasSimuladas(AHORA);
    const datos = { ...base, tickets: base.tickets.filter((t) => EJEMPLOS.includes(t.id)).map((t) => (t.id === "florencia-pintos-cobro-vigente" ? { ...t, monto: 123456789 } : t)) };
    const { usuario } = montar({ datos });
    const d = await abrirDialogo(usuario);
    expect(d.getByRole("heading", { name: "Anular el cobro de $U 123.456.789" })).toBeInTheDocument();
  });
});
