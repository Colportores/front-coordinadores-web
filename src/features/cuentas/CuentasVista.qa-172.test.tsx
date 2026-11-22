import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AccionesCuentas, DatosDeCuentas, ResultadoDeAccion, TicketDeCuentas } from "@/datos/cuentas";
import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { CuentasVista } from "@/features/cuentas/CuentasVista";

/**
 * QA de «Alquiler a 0» (front-coordinadores-web#169, PR 172): con pagos de alquiler vivos, «Editar» no deja el alquiler en 0
 * ni vacío. Lo que no cubren los tests del implementador: entradas límite (espacios, ceros de más, miles, pegado largo),
 * ciudad elegida sin pagos, alquiler que ya está en 0, falla a mitad, reentrada y cómo se anuncia y se asocia el aviso.
 */

const AHORA = new Date("2026-10-22T15:00:00.000Z");
const datosBase = () => armarCuentasSimuladas(AHORA);
const sinPagosDeAlquiler = (d: DatosDeCuentas): DatosDeCuentas => ({ ...d, tickets: d.tickets.filter((t) => t.destino !== "alquiler") });
const AVISO = "Ya hay pagos de alquiler en esta campaña, así que no puede quedar sin alquiler. Podés cambiar el monto.";

function diferida<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

function montar(opciones: { datos?: DatosDeCuentas; editarAlquiler?: AccionesCuentas["editarAlquiler"] } = {}) {
  const datos = opciones.datos ?? datosBase();
  const base = crearAccionesSimuladas(datos);
  const editarAlquiler = vi.fn(opciones.editarAlquiler ?? base.editarAlquiler);
  const acciones: AccionesCuentas = { ...base, editarAlquiler };
  const usuario = userEvent.setup();
  render(
    <ProveedorModoDev activo={false}>
      <CuentasVista datos={datos} acciones={acciones} />
    </ProveedorModoDev>,
  );
  return { usuario, editarAlquiler, datos };
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrirEditor(usuario: Usuario) {
  await usuario.click(screen.getByRole("button", { name: "Editar" }));
  return within(screen.getByRole("form", { name: "Editar el alquiler de la campaña" }));
}

/** Pega `texto` (sin teclear tecla por tecla: así entra un texto muy largo) y toca Guardar. */
async function pegarYGuardar(usuario: Usuario, editor: ReturnType<typeof within>, texto: string) {
  const campo = editor.getByLabelText(/Alquiler por colportor/);
  await usuario.clear(campo);
  if (texto) {
    await usuario.click(campo);
    await usuario.paste(texto);
  }
  await usuario.click(editor.getByRole("button", { name: "Guardar" }));
  return campo;
}

describe("QA 172 · entradas límite con pagos de alquiler", () => {
  it.each([
    ["solo espacios", "   "],
    ["espacios alrededor del 0", "  0  "],
    ["ceros de más", "00"],
    ["0 con separador de miles", "0.000"],
    ["0 partido por un espacio", "0 0"],
    ["cien ceros pegados", "0".repeat(100)],
    ["cinco mil ceros pegados", "0".repeat(5000)],
  ])("«%s» no se guarda y dice lo del alquiler, no otro aviso; lo escrito queda", async (_caso, texto) => {
    const { usuario, editarAlquiler } = montar();
    const editor = await abrirEditor(usuario);
    const campo = await pegarYGuardar(usuario, editor, texto);
    expect(editor.getByRole("alert")).toHaveTextContent(AVISO);
    expect(campo).toHaveValue(texto);
    expect(campo).toHaveFocus();
    expect(editarAlquiler).not.toHaveBeenCalled();
  });

  it.each([
    ["negativo", "-5", /número entero de pesos/],
    ["decimal", "1,5", /número entero de pesos/],
    ["letras", "abc", /número entero de pesos/],
    ["emoji", "0️⃣", /número entero de pesos/],
    ["dígitos de más", "1234567890123", /demasiado grande/],
  ])("con pagos, %s sigue con su aviso de siempre (no el del alquiler en 0)", async (_caso, texto, aviso) => {
    const { usuario, editarAlquiler } = montar();
    const editor = await abrirEditor(usuario);
    await pegarYGuardar(usuario, editor, texto);
    expect(editor.getByRole("alert")).toHaveTextContent(aviso);
    expect(editor.getByRole("alert")).not.toHaveTextContent("Ya hay pagos");
    expect(editarAlquiler).not.toHaveBeenCalled();
  });

  it("con pagos, el monto más chico que vale (1) se guarda", async () => {
    const { usuario, editarAlquiler } = montar();
    const editor = await abrirEditor(usuario);
    await pegarYGuardar(usuario, editor, "1");
    expect(editarAlquiler).toHaveBeenCalledWith(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Alquiler de la campaña: $U 1 por colportor, para todos los inscriptos.");
  });

  it("el botón Guardar no se deshabilita al bloquear: se puede insistir y el aviso se repite una sola vez", async () => {
    const { usuario, editarAlquiler } = montar();
    const editor = await abrirEditor(usuario);
    const campo = await pegarYGuardar(usuario, editor, "0");
    await usuario.click(editor.getByRole("button", { name: "Guardar" }));
    await usuario.type(campo, "{Enter}");
    expect(editor.getAllByRole("alert")).toHaveLength(1);
    expect(editarAlquiler).not.toHaveBeenCalled();
  });
});

describe("QA 172 · alcance de «hay pagos»: toda la campaña, no la ciudad elegida", () => {
  it("con un solo pago de alquiler, en otra ciudad, la ciudad elegida tampoco puede quedar en 0", async () => {
    const base = sinPagosDeAlquiler(datosBase());
    const colportorConPago = base.colportores[0];
    const otra = base.ciudades.find((c) => c.id !== colportorConPago.ciudadId && base.colportores.some((k) => k.ciudadId === c.id));
    expect(otra).toBeDefined();
    const pago: TicketDeCuentas = {
      id: "pago-qa-172",
      colportorId: colportorConPago.id,
      fecha: base.ahora,
      monto: 5000,
      medio: "deposito-banco",
      destino: "alquiler",
      estado: "VALIDADO",
      tieneFoto: true,
    };
    const { usuario, editarAlquiler } = montar({ datos: { ...base, tickets: [...base.tickets, pago] } });
    await usuario.click(screen.getByRole("button", { name: new RegExp(`^${otra!.nombre}`) }));
    const editor = await abrirEditor(usuario);
    await pegarYGuardar(usuario, editor, "0");
    expect(editor.getByRole("alert")).toHaveTextContent(AVISO);
    expect(editarAlquiler).not.toHaveBeenCalled();
  });

  it("un pago de depósito a la casa editora (destino distinto de alquiler) no bloquea", async () => {
    const base = sinPagosDeAlquiler(datosBase());
    const { usuario, editarAlquiler } = montar({ datos: base });
    expect(base.tickets.some((t) => t.destino !== "alquiler" && t.estado !== "RECHAZADO")).toBe(true);
    const editor = await abrirEditor(usuario);
    await pegarYGuardar(usuario, editor, "0");
    expect(editarAlquiler).toHaveBeenCalledWith(0);
  });
});

describe("QA 172 · el alquiler ya está en 0 y hay pagos", () => {
  function datosConAlquilerEn0() {
    return { ...datosBase(), alquilerPorColportor: 0 };
  }

  it("el editor abre con 0; Guardar sin tocar explica el bloqueo y Cancelar vuelve a «Editar» con el foco", async () => {
    const { usuario, editarAlquiler } = montar({ datos: datosConAlquilerEn0() });
    const editor = await abrirEditor(usuario);
    expect(editor.getByLabelText(/Alquiler por colportor/)).toHaveValue("0");
    await usuario.click(editor.getByRole("button", { name: "Guardar" }));
    expect(editor.getByRole("alert")).toHaveTextContent(AVISO);
    expect(editarAlquiler).not.toHaveBeenCalled();
    await usuario.click(editor.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("form", { name: "Editar el alquiler de la campaña" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus();
  });

  it("desde 0 se puede pasar a un monto y se guarda", async () => {
    const { usuario, editarAlquiler } = montar({ datos: datosConAlquilerEn0() });
    const editor = await abrirEditor(usuario);
    await pegarYGuardar(usuario, editor, "15.000");
    expect(editarAlquiler).toHaveBeenCalledWith(15000);
    expect(await screen.findByRole("status")).toHaveTextContent("$U 15.000 por colportor");
  });
});

describe("QA 172 · reentrada y falla a mitad", () => {
  it("cancelar tras el aviso y reabrir: el editor vuelve limpio, con el alquiler vigente y sin el aviso", async () => {
    const { usuario } = montar();
    const editor = await abrirEditor(usuario);
    await pegarYGuardar(usuario, editor, "0");
    expect(editor.getByRole("alert")).toBeInTheDocument();
    await usuario.click(editor.getByRole("button", { name: "Cancelar" }));
    const otra = await abrirEditor(usuario);
    expect(otra.queryByRole("alert")).not.toBeInTheDocument();
    expect(otra.getByLabelText(/Alquiler por colportor/)).toHaveValue("18500");
    expect(otra.getByLabelText(/Alquiler por colportor/)).not.toHaveAttribute("aria-invalid");
  });

  it("si el servidor rechaza el 0 (pago que la vista no veía), queda abierto con lo escrito y se puede corregir y guardar", async () => {
    const editarAlquiler = vi
      .fn<AccionesCuentas["editarAlquiler"]>()
      .mockResolvedValueOnce({ ok: false, causa: "rechazado", mensaje: AVISO })
      .mockResolvedValueOnce({ ok: true, valor: 19000 });
    const { usuario } = montar({ datos: sinPagosDeAlquiler(datosBase()), editarAlquiler });
    const editor = await abrirEditor(usuario);
    const campo = await pegarYGuardar(usuario, editor, "0");
    expect(await editor.findByRole("alert")).toHaveTextContent(AVISO);
    expect(campo).toHaveValue("0");
    expect(editor.getByRole("button", { name: "Guardar" })).toHaveTextContent("Guardar");
    expect(editor.getByRole("button", { name: "Guardar" })).not.toHaveAttribute("aria-disabled", "true");
    await usuario.clear(campo);
    await usuario.type(campo, "19000");
    await usuario.click(editor.getByRole("button", { name: "Guardar" }));
    expect(editarAlquiler).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("status")).toHaveTextContent("$U 19.000 por colportor");
  });

  it("el rechazo del servidor llega mientras se está en camino: el segundo envío (Enter) se ignora", async () => {
    const respuesta = diferida<ResultadoDeAccion<number>>();
    const editarAlquiler = vi.fn<AccionesCuentas["editarAlquiler"]>().mockReturnValue(respuesta.promesa);
    const { usuario } = montar({ datos: sinPagosDeAlquiler(datosBase()), editarAlquiler });
    const editor = await abrirEditor(usuario);
    const campo = editor.getByLabelText(/Alquiler por colportor/);
    await usuario.clear(campo);
    await usuario.type(campo, "0{Enter}");
    await usuario.type(campo, "{Enter}");
    expect(editarAlquiler).toHaveBeenCalledTimes(1);
    expect(editor.getByRole("button", { name: "Guardando…" })).toHaveAttribute("aria-disabled", "true");
    respuesta.resolver({ ok: false, causa: "rechazado", mensaje: AVISO });
    expect(await editor.findByRole("alert")).toHaveTextContent(AVISO);
    expect(editor.getByRole("button", { name: "Guardar" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("sin conexión al guardar: dice «Necesitás conexión para guardar el alquiler» y lo escrito queda", async () => {
    const editarAlquiler = vi.fn<AccionesCuentas["editarAlquiler"]>().mockResolvedValue({ ok: false, causa: "sin-conexion" });
    const { usuario } = montar({ editarAlquiler });
    const editor = await abrirEditor(usuario);
    const campo = await pegarYGuardar(usuario, editor, "20000");
    expect(await editor.findByRole("alert")).toHaveTextContent("Necesitás conexión para guardar el alquiler");
    expect(campo).toHaveValue("20000");
  });
});

describe("QA 172 · el aviso del servidor se comporta como el de la vista", () => {
  async function conRechazoDelServidor() {
    const editarAlquiler = vi.fn<AccionesCuentas["editarAlquiler"]>().mockResolvedValue({ ok: false, causa: "rechazado", mensaje: AVISO });
    const ctx = montar({ datos: sinPagosDeAlquiler(datosBase()), editarAlquiler });
    const editor = await abrirEditor(ctx.usuario);
    const campo = await pegarYGuardar(ctx.usuario, editor, "0");
    await editor.findByRole("alert");
    return { ...ctx, editor, campo };
  }

  it.skip("QA #169: tras el rechazo del servidor el campo queda aria-invalid y con el foco (como cuando bloquea la vista)", async () => {
    const { campo } = await conRechazoDelServidor();
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo).toHaveFocus();
  });

  it.skip("QA #169: al corregir el texto tras el rechazo del servidor, el aviso viejo se va", async () => {
    const { usuario, editor, campo } = await conRechazoDelServidor();
    await usuario.clear(campo);
    await usuario.type(campo, "19000");
    expect(editor.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.skip("QA #169: el aviso (de la vista y del servidor) está asociado al campo por aria-describedby", async () => {
    const { usuario } = montar();
    const editor = await abrirEditor(usuario);
    const campo = await pegarYGuardar(usuario, editor, "0");
    const alerta = editor.getByRole("alert");
    expect(alerta.id).not.toBe("");
    expect(campo.getAttribute("aria-describedby") ?? "").toContain(alerta.id);
  });
});
