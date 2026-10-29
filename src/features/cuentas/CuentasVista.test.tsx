import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
import type { AccionesCuentas, DatosDeCuentas, ResultadoDeAccion, TicketDeCuentas } from "@/datos/cuentas";
import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { CuentasVista } from "@/features/cuentas/CuentasVista";
import { formatMonto } from "@/features/cuentas/formato";
import { hayTrabajoPendiente } from "@/shell/trabajo-pendiente";

const AHORA = new Date("2026-10-22T15:00:00.000Z");
const datosBase = () => armarCuentasSimuladas(AHORA);

function diferida<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (motivo: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

function montar(opciones: { datos?: DatosDeCuentas; acciones?: Partial<AccionesCuentas> } = {}) {
  const base = crearAccionesSimuladas(() => AHORA);
  const acciones = {
    registrarRetiro: vi.fn(base.registrarRetiro),
    editarAlquiler: vi.fn(base.editarAlquiler),
    ...opciones.acciones,
  } as AccionesCuentas & { registrarRetiro: ReturnType<typeof vi.fn>; editarAlquiler: ReturnType<typeof vi.fn> };
  const usuario = userEvent.setup();
  const datos = opciones.datos ?? datosBase();
  const vista = (
    <ProveedorModoDev activo={false}>
      <CuentasVista datos={datos} acciones={acciones} />
    </ProveedorModoDev>
  );
  const resultado = render(vista);
  return { acciones, usuario, datos, ...resultado };
}

const ciudad = (nombre: RegExp) => screen.getByRole("button", { name: nombre });
const pestana = (nombre: RegExp) => screen.getByRole("tab", { name: nombre });
const cifra = (rotulo: string) => screen.getByText(rotulo, { selector: "dt" });

async function irATickets(usuario: ReturnType<typeof userEvent.setup>, ciudadNombre: RegExp) {
  await usuario.click(ciudad(ciudadNombre));
  await usuario.click(pestana(/Tickets/));
}

function formularioDeRetiro() {
  return within(screen.getByRole("form", { name: "Registrar retiro" }));
}

async function llenarRetiro(
  usuario: ReturnType<typeof userEvent.setup>,
  { colportor = "sofia-cabral", monto = "5000", destino = "Casa editora", dia }: { colportor?: string; monto?: string; destino?: string; dia?: string } = {},
) {
  const f = formularioDeRetiro();
  await usuario.selectOptions(f.getByLabelText("Colportor"), colportor);
  await usuario.type(f.getByLabelText(/Monto retirado/), monto);
  if (dia) fireEvent.change(f.getByLabelText("Día del retiro"), { target: { value: dia } });
  await usuario.click(f.getByRole("radio", { name: destino }));
}

function filaDe(nombre: RegExp) {
  return screen.getByRole("row", { name: nombre });
}

describe("A01 · Casa editora · todas las ciudades", () => {
  it("abre en Casa editora con el título, el subtítulo y las cuatro cifras", () => {
    montar();
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByText(/^25 colportores · en Artigas y Bella Unión no hay banco: el coordinador retira el efectivo$/)).toBeInTheDocument();
    expect(pestana(/Casa editora/)).toHaveAttribute("aria-selected", "true");
    for (const rotulo of ["DEUDA TOTAL", "DEPOSITADO", "EN MANO", "POR COBRAR"]) expect(cifra(rotulo)).toBeInTheDocument();
    expect(screen.getByText("con la casa editora")).toBeInTheDocument();
  });

  it("la tabla agrupa por ciudad con su cantidad y tiene todas las columnas", () => {
    montar();
    const tabla = screen.getByRole("table", { name: "Casa editora" });
    for (const columna of ["COLPORTOR", "DEUDA", "DEPOSITADO", "EN MANO", "POR COBRAR", "COBRADO", "ÚLT. DEPÓSITO"]) {
      expect(within(tabla).getByRole("columnheader", { name: new RegExp(columna) })).toBeInTheDocument();
    }
    expect(within(tabla).getByText("Rivera")).toBeInTheDocument();
    expect(within(tabla).getByText("10 colportores")).toBeInTheDocument();
    expect(within(tabla).getByText("8 colportores")).toBeInTheDocument();
    expect(within(tabla).getByText("7 colportores")).toBeInTheDocument();
    expect(within(tabla).getByText("Gonzalo Méndez")).toBeInTheDocument();
  });

  it("la franja de arriba avisa de los tickets por validar y manda a validarlos", () => {
    montar();
    expect(screen.getByText("2 tickets por validar", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText(/Sofía Cabral \$U 18\.500 \(hoy 09:15\)/)).toBeInTheDocument();
    expect(screen.getByText(/Lucía Fernández \$U 9\.000 \(ayer 18:30\)/)).toBeInTheDocument();
    const validar = screen.getByRole("button", { name: "Validar tickets" });
    expect(validar).toHaveAttribute("aria-disabled", "true");
    expect(validar).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
  });

  it("el encabezado muestra el alquiler de la campaña con Editar y el paso a validar tickets", () => {
    montar();
    expect(screen.getByText(/Alquiler de la campaña:/)).toHaveTextContent("Alquiler de la campaña: $U 18.500 por colportor");
    expect(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Validar tickets →" })).toHaveAttribute("aria-disabled", "true");
  });

  it("la lista de ciudades es el filtro y cuenta los tickets por validar de cada una", () => {
    montar();
    expect(ciudad(/^Todas las ciudades/)).toHaveAttribute("aria-pressed", "true");
    expect(ciudad(/^Rivera/)).toHaveTextContent("1 ticket por validar");
    expect(ciudad(/^Todo el departamento/)).toHaveTextContent("1 ticket por validar");
    expect(ciudad(/^Bella Unión/)).not.toHaveTextContent("por validar");
    expect(screen.getByText("DEPTO. RIVERA")).toBeInTheDocument();
    expect(screen.getByText("DEPTO. ARTIGAS")).toBeInTheDocument();
  });
});

describe("A02 · Alquiler · Rivera", () => {
  it("muestra el alquiler de los 10 colportores de Rivera, sin la nota de banco", async () => {
    const { usuario } = montar();
    await usuario.click(ciudad(/^Rivera/));
    await usuario.click(pestana(/Alquiler/));

    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
    expect(screen.getByText("10 colportores · Departamento Rivera")).toBeInTheDocument();
    expect(cifra("ALQUILER DE LA CAMPAÑA")).toBeInTheDocument();
    expect(screen.getByText("10 × $U 18.500")).toBeInTheDocument();
    expect(cifra("PAGADO")).toBeInTheDocument();
    expect(cifra("DEBEN")).toBeInTheDocument();
    expect(cifra("PAGARON TODO")).toBeInTheDocument();
    expect(screen.getByText("no bloquea nada")).toBeInTheDocument();
    const tabla = screen.getByRole("table", { name: "Alquiler" });
    for (const columna of ["COLPORTOR", "ALQUILER", "PAGADO", "DEBE", "ÚLTIMO PAGO", "ESTADO"]) {
      expect(within(tabla).getByRole("columnheader", { name: new RegExp(`^${columna}`) })).toBeInTheDocument();
    }
    expect(within(tabla).queryByText("10 colportores")).not.toBeInTheDocument();
  });

  it("cada colportor tiene su estado: pagado, pagó una parte o debe todo", async () => {
    const { usuario } = montar();
    await usuario.click(pestana(/Alquiler/));
    const tabla = screen.getByRole("table", { name: "Alquiler" });
    expect(within(tabla).getAllByText("✓ Pagado").length).toBeGreaterThan(0);
    expect(within(tabla).getAllByText("Pagó una parte").length).toBeGreaterThan(0);
    expect(within(tabla).getAllByText("Debe todo").length).toBeGreaterThan(0);
  });

  it("la franja de pendientes sigue en Alquiler, con los tickets de la selección", async () => {
    const { usuario } = montar();
    await usuario.click(ciudad(/^Rivera/));
    await usuario.click(pestana(/Alquiler/));
    expect(screen.getByText("1 ticket por validar", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText(/Lucía Fernández .U 9/)).toBeInTheDocument();
  });

  it("DEBE ordena de mayor a menor y de nuevo la invierte", async () => {
    const { usuario } = montar();
    await usuario.click(ciudad(/^Rivera/));
    await usuario.click(pestana(/Alquiler/));
    const tabla = screen.getByRole("table", { name: "Alquiler" });
    const debe = () =>
      within(tabla)
        .getAllByRole("row")
        .slice(1)
        .map((fila) => within(fila).getAllByRole("cell")[3]?.textContent ?? "");
    const valor = (texto: string) => Number(texto.replace(/[^\d]/g, ""));

    await usuario.click(within(tabla).getByRole("button", { name: "Ordenar Alquiler por debe" }));
    expect(within(tabla).getByRole("columnheader", { name: /DEBE/ })).toHaveAttribute("aria-sort", "descending");
    const desc = debe().map(valor);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));

    await usuario.click(within(tabla).getByRole("button", { name: "Ordenar Alquiler por debe" }));
    expect(within(tabla).getByRole("columnheader", { name: /DEBE/ })).toHaveAttribute("aria-sort", "ascending");
    const asc = debe().map(valor);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));

    await usuario.click(within(tabla).getByRole("button", { name: "Ordenar Alquiler por debe" }));
    expect(within(tabla).getByRole("columnheader", { name: /DEBE/ })).toHaveAttribute("aria-sort", "none");
  });
});

describe("A03 · Tickets · Artigas · ticket abierto", () => {
  it("lista los tickets de Artigas, los más nuevos primero, con sus cifras y el aviso de banco", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Artigas/);

    expect(screen.getByRole("heading", { level: 2, name: "Artigas" })).toBeInTheDocument();
    expect(screen.getByText(/en Artigas no hay banco: el coordinador retira el efectivo/)).toBeInTheDocument();
    for (const rotulo of ["POR VALIDAR", "VALIDADOS", "RETIROS DEL COORDINADOR", "RECHAZADOS"]) expect(cifra(rotulo)).toBeInTheDocument();
    expect(screen.getByLabelText("Colportor", { selector: "select" })).toHaveValue("");
    const tabla = screen.getByRole("table", { name: "Tickets" });
    for (const columna of ["FECHA", "COLPORTOR", "MEDIO", "PARA QUÉ", "MONTO", "ESTADO"]) {
      expect(within(tabla).getByRole("columnheader", { name: columna })).toBeInTheDocument();
    }
    const primera = within(tabla).getAllByRole("row")[1];
    expect(primera).toHaveTextContent("hoy 09:15");
    expect(primera).toHaveTextContent("Sofía Cabral");
    expect(primera).toHaveTextContent("Tarjeta de débito · Visa");
    expect(primera).toHaveTextContent("aut. 483920");
    expect(primera).toHaveTextContent("$U 18.500");
    expect(primera).toHaveTextContent("◔ Por validar");
    expect(within(primera).getByRole("button", { name: "Validar el ticket de Sofía Cabral" })).toHaveAttribute("aria-disabled", "true");
  });

  it("la pestaña Tickets cuenta los tickets de la selección y no muestra la franja de pendientes", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Artigas/);
    const cantidad = within(screen.getByRole("table", { name: "Tickets" })).getAllByRole("button", { name: /^[▸▾]?\s?\S/ }).length;
    expect(cantidad).toBeGreaterThan(0);
    expect(pestana(/Tickets/)).toHaveTextContent(/Tickets\d+/);
    expect(screen.queryByRole("button", { name: "Validar tickets" })).not.toBeInTheDocument();
  });

  it("abre un ticket y muestra foto, fecha, número, medio y para qué; lo cierra con otro toque", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Artigas/);
    const abrir = screen.getAllByRole("button", { name: /Sofía Cabral/ })[0];
    expect(abrir).toHaveAttribute("aria-expanded", "false");
    await usuario.click(abrir);

    expect(abrir).toHaveAttribute("aria-expanded", "true");
    const detalle = screen.getByRole("row", { name: "Detalle del ticket de Sofía Cabral" });
    for (const rotulo of ["FOTO", "FECHA", "N° DE AUTORIZACIÓN", "MEDIO", "PARA QUÉ"]) expect(within(detalle).getByText(rotulo)).toBeInTheDocument();
    expect(within(detalle).getByText("[ foto del ticket ]")).toBeInTheDocument();
    expect(within(detalle).getByRole("button", { name: "Ver la foto del ticket de Sofía Cabral" })).toHaveAttribute("aria-disabled", "true");
    expect(within(detalle).getByText("aut. 483920")).toBeInTheDocument();
    expect(within(detalle).getByText("Casa editora")).toBeInTheDocument();

    await usuario.click(abrir);
    expect(abrir).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("row", { name: "Detalle del ticket de Sofía Cabral" })).not.toBeInTheDocument();
  });

  it("dos tickets pueden estar abiertos a la vez y no se pisan", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Todas las ciudades/);
    await usuario.click(screen.getAllByRole("button", { name: /Sofía Cabral/ })[0]);
    await usuario.click(screen.getAllByRole("button", { name: /Lucía Fernández/ })[0]);
    expect(screen.getByRole("row", { name: "Detalle del ticket de Sofía Cabral" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: "Detalle del ticket de Lucía Fernández" })).toBeInTheDocument();
  });

  it("un retiro del coordinador no tiene foto ni número", async () => {
    const { usuario, datos } = montar();
    await irATickets(usuario, /^Artigas/);
    const retiro = datos.tickets.find((t) => t.colportorId.length > 0 && t.medio === "retiro-coordinador" && datos.colportores.find((c) => c.id === t.colportorId)?.ciudadId === "artigas");
    const nombre = datos.colportores.find((c) => c.id === retiro?.colportorId)?.nombre ?? "";
    const botones = screen.getAllByRole("button", { name: new RegExp(nombre) });
    // Abre todos los tickets de esa persona: al menos uno es el retiro.
    for (const boton of botones) await usuario.click(boton);
    expect(screen.getAllByText("sin foto (retiro)").length).toBeGreaterThan(0);
  });
});

describe("A04 · Tickets · filtrado por Sofía Cabral", () => {
  it("filtra por colportor y dice cuántos tickets son", async () => {
    const { usuario, datos } = montar();
    await irATickets(usuario, /^Artigas/);
    const selector = screen.getByLabelText("Colportor", { selector: "select" });
    expect(screen.getByText(/tickets en Artigas$/)).toBeInTheDocument();
    await usuario.selectOptions(selector, "sofia-cabral");

    const de = datos.tickets.filter((t) => t.colportorId === "sofia-cabral").length;
    expect(screen.getByText(`${de} tickets de Sofía Cabral`)).toBeInTheDocument();
    const filas = within(screen.getByRole("table", { name: "Tickets" })).getAllByRole("row").slice(1);
    expect(filas).toHaveLength(de);
    expect(filas.every((f) => f.textContent?.includes("Sofía Cabral"))).toBe(true);
  });

  it("«Todos los colportores» vuelve a la lista completa", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Artigas/);
    const selector = screen.getByLabelText("Colportor", { selector: "select" });
    await usuario.selectOptions(selector, "sofia-cabral");
    await usuario.selectOptions(selector, "");
    expect(screen.getByText(/tickets en Artigas$/)).toBeInTheDocument();
  });

  it("al cambiar de ciudad el filtro de un colportor que no está se limpia", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Artigas/);
    await usuario.selectOptions(screen.getByLabelText("Colportor", { selector: "select" }), "sofia-cabral");
    await usuario.click(ciudad(/^Rivera/));
    expect(screen.getByLabelText("Colportor", { selector: "select" })).toHaveValue("");
    expect(screen.getByText(/tickets en Rivera$/)).toBeInTheDocument();
  });

  it("con varias ciudades el selector y las filas dicen de qué ciudad es cada uno", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Todo el departamento/);
    expect(screen.getByRole("option", { name: "Sofía Cabral · Artigas" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Gonzalo Méndez · Bella Unión" })).toBeInTheDocument();
  });

  it("un colportor sin tickets dice que todavía no tiene, con qué hacer", async () => {
    const datos = datosBase();
    const sinTickets = { ...datos, tickets: datos.tickets.filter((t) => t.colportorId !== "sofia-cabral") };
    const { usuario } = montar({ datos: sinTickets });
    await irATickets(usuario, /^Artigas/);
    await usuario.selectOptions(screen.getByLabelText("Colportor", { selector: "select" }), "sofia-cabral");
    expect(screen.getByText("0 tickets de Sofía Cabral")).toBeInTheDocument();
    expect(screen.getByText(/Sofía Cabral todavía no tiene tickets\. Aparecen cuando sube uno o cuando registrás un retiro\./)).toBeInTheDocument();
  });

  it("un solo ticket dice «1 ticket», no «1 tickets»", async () => {
    const datos = datosBase();
    const uno = { ...datos, tickets: datos.tickets.filter((t) => t.colportorId !== "sofia-cabral" || t.id === "sofia-cabral-por-validar") };
    const { usuario } = montar({ datos: uno });
    await irATickets(usuario, /^Artigas/);
    await usuario.selectOptions(screen.getByLabelText("Colportor", { selector: "select" }), "sofia-cabral");
    expect(screen.getByText("1 ticket de Sofía Cabral")).toBeInTheDocument();
  });
});

describe("estados del ticket", () => {
  it("un rechazo muestra el estado y el motivo en la fila y en el detalle", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Rivera/);
    const fila = screen.getByText("✕ Rechazado").closest("[role=row]") as HTMLElement;
    expect(fila).toHaveTextContent("Bruno Techera");
    expect(fila).toHaveTextContent("✕ Rechazado");
    expect(fila).toHaveTextContent("Foto ilegible");
    expect(within(fila).queryByRole("button", { name: /Validar/ })).not.toBeInTheDocument();
    await usuario.click(within(fila).getByRole("button", { name: /Bruno Techera/ }));
    expect(screen.getByText("Rechazado · Foto ilegible")).toBeInTheDocument();
  });

  it("un ticket validado no tiene botón de validar", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Rivera/);
    const validados = screen.getAllByText("✓ Validado");
    expect(validados.length).toBeGreaterThan(0);
    expect(within(validados[0].closest("[role=row]") as HTMLElement).queryByRole("button", { name: /Validar/ })).not.toBeInTheDocument();
  });

  it("el recuento de rechazados de Rivera es 1", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Rivera/);
    const tarjeta = cifra("RECHAZADOS").closest("div") as HTMLElement;
    expect(tarjeta).toHaveTextContent("1");
  });
});

describe("lista de ciudades contraída", () => {
  it("se contrae a una barra con siglas que sigue siendo el filtro, y se expande de nuevo", async () => {
    const { usuario } = montar();
    await usuario.click(screen.getByRole("button", { name: "Contraer ciudades" }));

    expect(screen.queryByRole("heading", { name: "Ciudades" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expandir ciudades" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Expandir ciudades" })).toHaveFocus();
    expect(screen.getByText("B. Un.")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Artigas: 1 ticket por validar" }));
    expect(screen.getByRole("heading", { level: 2, name: "Artigas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Artigas: 1 ticket por validar" })).toHaveAttribute("aria-pressed", "true");

    await usuario.click(screen.getByRole("button", { name: "Expandir ciudades" }));
    expect(screen.getByRole("heading", { level: 2, name: "Ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contraer ciudades" })).toHaveFocus();
    expect(ciudad(/^Artigas/)).toHaveAttribute("aria-pressed", "true");
  });
});

describe("pestañas", () => {
  it("se mueven con las flechas, Inicio y Fin, y el foco las sigue", async () => {
    const { usuario } = montar();
    pestana(/Casa editora/).focus();
    await usuario.keyboard("{ArrowRight}");
    expect(pestana(/Alquiler/)).toHaveAttribute("aria-selected", "true");
    expect(pestana(/Alquiler/)).toHaveFocus();
    await usuario.keyboard("{End}");
    expect(pestana(/Tickets/)).toHaveAttribute("aria-selected", "true");
    await usuario.keyboard("{ArrowRight}");
    expect(pestana(/Casa editora/)).toHaveAttribute("aria-selected", "true");
    await usuario.keyboard("{ArrowLeft}");
    expect(pestana(/Tickets/)).toHaveAttribute("aria-selected", "true");
    await usuario.keyboard("{Home}");
    expect(pestana(/Casa editora/)).toHaveFocus();
  });

  it("solo la pestaña activa está en el orden del tabulador y el panel está nombrado por ella", async () => {
    const { usuario } = montar();
    expect(pestana(/Casa editora/)).toHaveAttribute("tabindex", "0");
    expect(pestana(/Alquiler/)).toHaveAttribute("tabindex", "-1");
    await usuario.click(pestana(/Alquiler/));
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Alquiler");
  });
});

describe("Registrar retiro", () => {
  it("solo aparece en Tickets y solo donde no hay banco", async () => {
    const { usuario } = montar();
    expect(screen.queryByRole("button", { name: "Registrar retiro" })).not.toBeInTheDocument();
    await usuario.click(ciudad(/^Rivera/));
    await usuario.click(pestana(/Tickets/));
    expect(screen.queryByRole("button", { name: "Registrar retiro" })).not.toBeInTheDocument();
    await usuario.click(ciudad(/^Bella Unión/));
    expect(screen.getByRole("button", { name: "Registrar retiro" })).toBeInTheDocument();
    await usuario.click(ciudad(/^Todas las ciudades/));
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    const opciones = formularioDeRetiro().getAllByRole("option").map((o) => o.textContent);
    expect(opciones).toContain("Sofía Cabral · Artigas");
    expect(opciones).toContain("Gonzalo Méndez · Bella Unión");
    expect(opciones.some((o) => o?.includes("Lucía Fernández"))).toBe(false);
  });

  it("registra el retiro: acredita, baja la deuda, suma al historial y avisa", async () => {
    const { usuario, acciones, datos } = montar();
    const sofia = datos.colportores.find((c) => c.id === "sofia-cabral")!;
    await irATickets(usuario, /^Artigas/);
    const antes = Number(/(\d+)$/.exec(pestana(/Tickets/).textContent ?? "")?.[1]);

    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    expect(formularioDeRetiro().getByLabelText("Día del retiro")).toHaveValue("2026-10-22");
    await llenarRetiro(usuario, { monto: "5.000", destino: "Casa editora" });
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));

    expect(acciones.registrarRetiro).toHaveBeenCalledTimes(1);
    expect(acciones.registrarRetiro).toHaveBeenCalledWith({ colportorId: "sofia-cabral", monto: 5000, dia: "2026-10-22", destino: "casa-editora" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Retiro de $U 5.000 de Sofía Cabral guardado y validado: bajó lo que debe a la casa editora.",
    );
    expect(screen.queryByRole("form", { name: "Registrar retiro" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar retiro" })).toHaveFocus();
    expect(pestana(/Tickets/)).toHaveTextContent(String(antes + 1));
    const nuevo = screen.getAllByRole("row").find((f) => f.textContent?.includes("Retiro por el coordinador") && f.textContent.includes("$U 5.000") && f.textContent.includes("hoy"));
    expect(nuevo).toBeDefined();
    expect(nuevo).toHaveTextContent("✓ Validado");

    await usuario.click(pestana(/Casa editora/));
    const fila = filaDe(/Sofía Cabral/);
    expect(fila).toHaveTextContent(formatMonto(sofia.deuda - 5000));
    expect(fila).toHaveTextContent(formatMonto(sofia.depositado + 5000));
  });

  it("un retiro de alquiler baja el alquiler y no la deuda de la casa editora", async () => {
    const { usuario, datos } = montar();
    const sofia = datos.colportores.find((c) => c.id === "sofia-cabral")!;
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario, { monto: "1000", destino: "Alquiler" });
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    expect(await screen.findByRole("status")).toHaveTextContent("bajó lo que debe al alquiler.");

    await usuario.click(pestana(/Casa editora/));
    expect(filaDe(/Sofía Cabral/)).toHaveTextContent(formatMonto(sofia.deuda));
  });

  it("un retiro de un día anterior queda con esa fecha", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario, { monto: "700", destino: "Casa editora", dia: "2026-10-20" });
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    await screen.findByRole("status");
    expect(screen.getAllByRole("row").some((f) => f.textContent?.includes("20/10") && f.textContent.includes("$U 700"))).toBe(true);
  });

  it("sin llenar nada dice qué falta en cada campo, lleva el foco al primero y no manda nada", async () => {
    const { usuario, acciones } = montar();
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));

    const f = formularioDeRetiro();
    expect(f.getByText("Elegí el colportor al que le retiraste el efectivo.")).toBeInTheDocument();
    expect(f.getByText("Escribí el monto retirado.")).toBeInTheDocument();
    expect(f.getByText("Elegí si el dinero es de la casa editora o del alquiler.")).toBeInTheDocument();
    expect(f.getByLabelText("Colportor")).toHaveFocus();
    expect(f.getByLabelText("Colportor")).toHaveAttribute("aria-invalid", "true");
    expect(f.getByLabelText(/Monto retirado/)).toHaveAccessibleDescription("Escribí el monto retirado.");
    expect(acciones.registrarRetiro).not.toHaveBeenCalled();
  });

  it("corregir un campo le saca su error; un monto con decimales o en cero se rechaza", async () => {
    const { usuario, acciones } = montar();
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario, { monto: "12,5", destino: "Alquiler" });
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    expect(formularioDeRetiro().getByText(/número entero de pesos/)).toBeInTheDocument();
    expect(formularioDeRetiro().getByLabelText(/Monto retirado/)).toHaveFocus();

    await usuario.clear(formularioDeRetiro().getByLabelText(/Monto retirado/));
    expect(formularioDeRetiro().queryByText(/número entero de pesos/)).not.toBeInTheDocument();
    await usuario.type(formularioDeRetiro().getByLabelText(/Monto retirado/), "0");
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    expect(formularioDeRetiro().getByText("El monto tiene que ser mayor que cero.")).toBeInTheDocument();
    expect(acciones.registrarRetiro).not.toHaveBeenCalled();
  });

  it("un día futuro se rechaza y el calendario no deja elegirlo", async () => {
    const { usuario, acciones } = montar();
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    expect(formularioDeRetiro().getByLabelText("Día del retiro")).toHaveAttribute("max", "2026-10-22");
    await llenarRetiro(usuario, { monto: "100", destino: "Alquiler", dia: "2026-10-30" });
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    expect(formularioDeRetiro().getByText(/no puede ser futuro/)).toBeInTheDocument();
    expect(acciones.registrarRetiro).not.toHaveBeenCalled();
  });

  it("el doble toque en Guardar manda un solo retiro", async () => {
    const respuesta = diferida<ResultadoDeAccion<TicketDeCuentas>>();
    const registrarRetiro = vi.fn(() => respuesta.promesa);
    const { usuario, datos } = montar({ acciones: { registrarRetiro } });
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario, { monto: "5000" });
    const guardar = formularioDeRetiro().getByRole("button", { name: "Guardar retiro" });
    await usuario.dblClick(guardar);

    expect(registrarRetiro).toHaveBeenCalledTimes(1);
    expect(formularioDeRetiro().getByRole("button", { name: "Guardando…" })).toHaveAttribute("aria-disabled", "true");
    expect(hayTrabajoPendiente()).toBe(true);

    const ticket = await crearAccionesSimuladas(() => AHORA).registrarRetiro({ colportorId: "sofia-cabral", monto: 5000, dia: "2026-10-22", destino: "casa-editora" });
    await act(async () => respuesta.resolver(ticket));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(hayTrabajoPendiente()).toBe(false);
    const sofia = datos.colportores.find((c) => c.id === "sofia-cabral")!;
    await usuario.click(pestana(/Casa editora/));
    expect(filaDe(/Sofía Cabral/)).toHaveTextContent(formatMonto(sofia.deuda - 5000));
  });

  it("si falla a mitad, avisa qué pasó, conserva lo cargado y el botón vuelve a habilitarse; reintentar sale", async () => {
    const real = crearAccionesSimuladas(() => AHORA);
    const registrarRetiro = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, causa: "sin-conexion" })
      .mockImplementation(real.registrarRetiro);
    const { usuario } = montar({ acciones: { registrarRetiro } });
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario, { monto: "5000", destino: "Alquiler" });
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));

    expect(await formularioDeRetiro().findByRole("alert")).toHaveTextContent("Necesitás conexión para guardar el retiro. Revisá la conexión y probá de nuevo.");
    const guardar = formularioDeRetiro().getByRole("button", { name: "Guardar retiro" });
    expect(guardar).not.toHaveAttribute("aria-disabled", "true");
    expect(formularioDeRetiro().getByLabelText(/Monto retirado/)).toHaveValue("5000");
    expect(formularioDeRetiro().getByRole("radio", { name: "Alquiler" })).toBeChecked();
    expect(hayTrabajoPendiente()).toBe(false);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await usuario.click(guardar);
    expect(await screen.findByRole("status")).toHaveTextContent("Retiro de $U 5.000 de Sofía Cabral guardado y validado");
    expect(registrarRetiro).toHaveBeenCalledTimes(2);
  });

  it("si la acción revienta (excepción) se trata como sin conexión y no queda trabada", async () => {
    const registrarRetiro = vi.fn().mockRejectedValueOnce(new Error("TypeError: Failed to fetch"));
    const { usuario } = montar({ acciones: { registrarRetiro } });
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario);
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    expect(await formularioDeRetiro().findByRole("alert")).toHaveTextContent("Necesitás conexión");
    expect(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" })).not.toHaveAttribute("aria-disabled", "true");
    expect(hayTrabajoPendiente()).toBe(false);
  });

  it("si el servidor lo rechaza muestra su mensaje", async () => {
    const registrarRetiro = vi.fn().mockResolvedValue({ ok: false, causa: "rechazado", mensaje: "El colportor no pertenece a tu campaña." });
    const { usuario } = montar({ acciones: { registrarRetiro } });
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario);
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    expect(await formularioDeRetiro().findByRole("alert")).toHaveTextContent("El colportor no pertenece a tu campaña.");
  });

  it("un rechazo sin mensaje dice qué hacer", async () => {
    const registrarRetiro = vi.fn().mockResolvedValue({ ok: false, causa: "rechazado" });
    const { usuario } = montar({ acciones: { registrarRetiro } });
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario);
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    expect(await formularioDeRetiro().findByRole("alert")).toHaveTextContent("No se pudo guardar el retiro. Probá de nuevo; si sigue igual, avisá al equipo.");
  });

  it("mientras se guarda el retiro, Editar el alquiler y Cancelar no hacen nada", async () => {
    const respuesta = diferida<ResultadoDeAccion<TicketDeCuentas>>();
    const { usuario, acciones } = montar({ acciones: { registrarRetiro: vi.fn(() => respuesta.promesa) } });
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario);
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));

    await usuario.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.queryByRole("form", { name: "Editar el alquiler de la campaña" })).not.toBeInTheDocument();
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("form", { name: "Registrar retiro" })).toBeInTheDocument();
    expect(acciones.editarAlquiler).not.toHaveBeenCalled();

    await act(async () => respuesta.resolver({ ok: false, causa: "sin-conexion" }));
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("form", { name: "Registrar retiro" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar retiro" })).toHaveFocus();
  });

  it("Cancelar cierra el formulario sin mandar nada y vuelve el foco al botón", async () => {
    const { usuario, acciones } = montar();
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("form", { name: "Registrar retiro" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar retiro" })).toHaveFocus();
    expect(acciones.registrarRetiro).not.toHaveBeenCalled();
  });

  it("si se filtró un colportor, el formulario lo trae elegido", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Artigas/);
    await usuario.selectOptions(screen.getByLabelText("Colportor", { selector: "select" }), "agustina-rey");
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    expect(formularioDeRetiro().getByLabelText("Colportor")).toHaveValue("agustina-rey");
  });

  it("si se elige otra ciudad, el formulario se cierra (era de la selección anterior)", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await usuario.click(ciudad(/^Bella Unión/));
    expect(screen.queryByRole("form", { name: "Registrar retiro" })).not.toBeInTheDocument();
    await usuario.click(ciudad(/^Rivera/));
    expect(screen.queryByRole("button", { name: "Registrar retiro" })).not.toBeInTheDocument();
  });

  it("dos retiros seguidos se acumulan sin pisarse", async () => {
    const { usuario, datos } = montar();
    const sofia = datos.colportores.find((c) => c.id === "sofia-cabral")!;
    await irATickets(usuario, /^Artigas/);
    for (const monto of ["1000", "2000"]) {
      await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
      await llenarRetiro(usuario, { monto });
      await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
      await screen.findByRole("status");
    }
    await usuario.click(pestana(/Casa editora/));
    expect(filaDe(/Sofía Cabral/)).toHaveTextContent(formatMonto(sofia.deuda - 3000));
    expect(filaDe(/Sofía Cabral/)).toHaveTextContent(formatMonto(sofia.depositado + 3000));
  });

  it("el aviso de éxito se cierra con su botón", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario);
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    await screen.findByRole("status");
    await usuario.click(screen.getByRole("button", { name: "Cerrar el aviso" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("Editar el alquiler", () => {
  async function abrirEditor(usuario: ReturnType<typeof userEvent.setup>) {
    await usuario.click(screen.getByRole("button", { name: "Editar" }));
    return within(screen.getByRole("form", { name: "Editar el alquiler de la campaña" }));
  }

  it("abre con el monto actual elegido y avisa que cambia para todos", async () => {
    const { usuario } = montar();
    const editor = await abrirEditor(usuario);
    const campo = editor.getByLabelText(/Alquiler por colportor/);
    expect(campo).toHaveValue("18500");
    expect(campo).toHaveFocus();
    expect(editor.getByText("Cambia para todos los colportores de la campaña.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("guarda el monto nuevo: cambia el encabezado, las cifras y lo que debe cada uno", async () => {
    const { usuario, acciones } = montar();
    await usuario.click(pestana(/Alquiler/));
    const editor = await abrirEditor(usuario);
    await usuario.clear(editor.getByLabelText(/Alquiler por colportor/));
    await usuario.type(editor.getByLabelText(/Alquiler por colportor/), "20.000");
    await usuario.click(editor.getByRole("button", { name: "Guardar" }));

    expect(acciones.editarAlquiler).toHaveBeenCalledWith(20000);
    expect(await screen.findByRole("status")).toHaveTextContent("Alquiler de la campaña: $U 20.000 por colportor, para todos los inscriptos.");
    expect(screen.getByText("$U 20.000", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText("25 × $U 20.000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus();
    expect(screen.queryByRole("form", { name: "Editar el alquiler de la campaña" })).not.toBeInTheDocument();
  });

  it("sin cambios cierra sin mandar nada", async () => {
    const { usuario, acciones } = montar();
    const editor = await abrirEditor(usuario);
    await usuario.click(editor.getByRole("button", { name: "Guardar" }));
    expect(acciones.editarAlquiler).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus();
  });

  it("acepta 0 (la campaña no cobra alquiler) y entonces nadie debe", async () => {
    const { usuario } = montar();
    await usuario.click(pestana(/Alquiler/));
    const editor = await abrirEditor(usuario);
    await usuario.clear(editor.getByLabelText(/Alquiler por colportor/));
    await usuario.type(editor.getByLabelText(/Alquiler por colportor/), "0");
    await usuario.click(editor.getByRole("button", { name: "Guardar" }));
    await screen.findByRole("status");
    expect(cifra("PAGARON TODO").closest("div")).toHaveTextContent("25de 25");
  });

  it.each([
    ["", /0 si la campaña no cobra/],
    ["abc", /número entero de pesos/],
    ["-5", /número entero de pesos/],
    ["1,5", /número entero de pesos/],
  ])("rechaza «%s» sin mandar nada y deja el foco en el campo", async (texto, mensaje) => {
    const { usuario, acciones } = montar();
    const editor = await abrirEditor(usuario);
    await usuario.clear(editor.getByLabelText(/Alquiler por colportor/));
    if (texto) await usuario.type(editor.getByLabelText(/Alquiler por colportor/), texto);
    await usuario.click(editor.getByRole("button", { name: "Guardar" }));
    expect(editor.getByRole("alert")).toHaveTextContent(mensaje);
    expect(editor.getByLabelText(/Alquiler por colportor/)).toHaveFocus();
    expect(editor.getByLabelText(/Alquiler por colportor/)).toHaveAttribute("aria-invalid", "true");
    expect(acciones.editarAlquiler).not.toHaveBeenCalled();
  });

  it("el doble toque en Guardar manda una sola vez; si falla, queda abierto y se puede reintentar", async () => {
    const respuesta = diferida<ResultadoDeAccion<number>>();
    const editarAlquiler = vi
      .fn()
      .mockImplementationOnce(() => respuesta.promesa)
      .mockResolvedValue({ ok: true, valor: 21000 });
    const { usuario } = montar({ acciones: { editarAlquiler } });
    const editor = await abrirEditor(usuario);
    await usuario.clear(editor.getByLabelText(/Alquiler por colportor/));
    await usuario.type(editor.getByLabelText(/Alquiler por colportor/), "21000");
    await usuario.dblClick(editor.getByRole("button", { name: "Guardar" }));
    expect(editarAlquiler).toHaveBeenCalledTimes(1);
    expect(editor.getByRole("button", { name: "Guardando…" })).toHaveAttribute("aria-disabled", "true");

    await act(async () => respuesta.resolver({ ok: false, causa: "sin-conexion" }));
    expect(await editor.findByRole("alert")).toHaveTextContent("Necesitás conexión para guardar el alquiler.");
    expect(editor.getByLabelText(/Alquiler por colportor/)).toHaveValue("21000");
    expect(editor.getByRole("button", { name: "Guardar" })).not.toHaveAttribute("aria-disabled", "true");

    await usuario.click(editor.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("$U 21.000");
    expect(editarAlquiler).toHaveBeenCalledTimes(2);
  });

  it("Cancelar descarta lo escrito y vuelve el foco a Editar; al reabrir trae el monto vigente", async () => {
    const { usuario, acciones } = montar();
    const editor = await abrirEditor(usuario);
    await usuario.clear(editor.getByLabelText(/Alquiler por colportor/));
    await usuario.type(editor.getByLabelText(/Alquiler por colportor/), "99");
    await usuario.click(editor.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus();
    expect(acciones.editarAlquiler).not.toHaveBeenCalled();
    const otra = await abrirEditor(usuario);
    expect(otra.getByLabelText(/Alquiler por colportor/)).toHaveValue("18500");
  });

  it("editar el alquiler y registrar un retiro, uno tras otro, se aplican los dos", async () => {
    const { usuario } = montar();
    const editor = await abrirEditor(usuario);
    await usuario.clear(editor.getByLabelText(/Alquiler por colportor/));
    await usuario.type(editor.getByLabelText(/Alquiler por colportor/), "10000");
    await usuario.click(editor.getByRole("button", { name: "Guardar" }));
    await screen.findByText(/para todos los inscriptos/);

    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario, { monto: "10000", destino: "Alquiler" });
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    await screen.findByText(/Retiro de \$U 10\.000/);

    await usuario.click(pestana(/Alquiler/));
    const fila = filaDe(/Sofía Cabral/);
    expect(fila).toHaveTextContent("✓ Pagado");
  });

  it("el último aviso reemplaza al anterior", async () => {
    const { usuario } = montar();
    const editor = await abrirEditor(usuario);
    await usuario.clear(editor.getByLabelText(/Alquiler por colportor/));
    await usuario.type(editor.getByLabelText(/Alquiler por colportor/), "10000");
    await usuario.click(editor.getByRole("button", { name: "Guardar" }));
    await screen.findByText(/para todos los inscriptos/);
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario);
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    await screen.findByText(/Retiro de/);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("volver atrás y reentrar", () => {
  it("al reentrar la vista arranca limpia: Casa editora, todas las ciudades y sin nada trabado", async () => {
    const respuesta = diferida<ResultadoDeAccion<TicketDeCuentas>>();
    const primera = montar({ acciones: { registrarRetiro: vi.fn(() => respuesta.promesa) } });
    await irATickets(primera.usuario, /^Artigas/);
    await primera.usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(primera.usuario);
    await primera.usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    primera.unmount();
    expect(hayTrabajoPendiente()).toBe(true);

    await act(async () => respuesta.resolver({ ok: false, causa: "sin-conexion" }));
    expect(hayTrabajoPendiente()).toBe(false);

    montar();
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(pestana(/Casa editora/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("un retiro en camino cuenta como trabajo sin contestar aunque la vista se vaya", async () => {
    const respuesta = diferida<ResultadoDeAccion<TicketDeCuentas>>();
    const { usuario, unmount } = montar({ acciones: { registrarRetiro: vi.fn(() => respuesta.promesa) } });
    await irATickets(usuario, /^Artigas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await llenarRetiro(usuario);
    await usuario.click(formularioDeRetiro().getByRole("button", { name: "Guardar retiro" }));
    expect(hayTrabajoPendiente()).toBe(true);
    unmount();
    expect(hayTrabajoPendiente()).toBe(true);
    await act(async () => respuesta.resolver({ ok: false, causa: "sin-conexion" }));
    expect(hayTrabajoPendiente()).toBe(false);
  });
});

describe("datos límite", () => {
  it("sin colportores en la campaña dice por qué y qué hacer, en cada tabla", async () => {
    const vacios: DatosDeCuentas = { ...datosBase(), colportores: [], tickets: [] };
    const { usuario } = montar({ datos: vacios });
    expect(screen.getByText("Todavía no hay colportores inscriptos en Todas las ciudades. Se suman desde Equipo.")).toBeInTheDocument();
    expect(screen.getByText("0 colportores · en Artigas y Bella Unión no hay banco: el coordinador retira el efectivo")).toBeInTheDocument();
    expect(screen.queryByText("2 tickets por validar")).not.toBeInTheDocument();

    await usuario.click(pestana(/Alquiler/));
    expect(screen.getByText("Todavía no hay colportores inscriptos en Todas las ciudades. Se suman desde Equipo.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("NaN");

    await usuario.click(pestana(/Tickets/));
    expect(screen.getByText(/Todavía no hay tickets en Todas las ciudades\. Aparecen cuando/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar retiro" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("NaN");
  });

  it("una ciudad sin tickets dice que no hay y las cifras quedan en cero", async () => {
    const datos = datosBase();
    const { usuario } = montar({ datos: { ...datos, tickets: datos.tickets.filter((t) => datos.colportores.find((c) => c.id === t.colportorId)?.ciudadId !== "bella-union") } });
    await irATickets(usuario, /^Bella Unión/);
    expect(screen.getByText(/Todavía no hay tickets en Bella Unión/)).toBeInTheDocument();
    expect(screen.getByText("0 tickets en Bella Unión")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar retiro" })).toBeInTheDocument();
  });

  it("una lista larga de colportores y tickets se arma sin problemas", async () => {
    const base = datosBase();
    const muchos = Array.from({ length: 300 }, (_, i) => ({ ...base.colportores[i % 25], id: `extra-${i}`, nombre: `Colportor ${i}`, ciudadId: "artigas" }));
    const ticketsExtra: TicketDeCuentas[] = muchos.map((c, i) => ({
      id: `tx-${i}`,
      colportorId: c.id,
      fecha: base.ahora,
      monto: 1000 + i,
      medio: "retiro-coordinador",
      destino: "casa-editora",
      estado: "VALIDADO",
      tieneFoto: false,
    }));
    const { usuario } = montar({ datos: { ...base, colportores: [...base.colportores, ...muchos], tickets: [...base.tickets, ...ticketsExtra] } });
    await usuario.click(ciudad(/^Artigas/));
    expect(screen.getByText(/308 colportores/)).toBeInTheDocument();
    await usuario.click(pestana(/Tickets/));
    expect(within(screen.getByRole("table", { name: "Tickets" })).getAllByRole("row").length).toBeGreaterThan(300);
  });

  it("nombres muy largos, sin espacios, no rompen la fila ni se pierden", async () => {
    const largo = "Maximiliano".repeat(12);
    const base = datosBase();
    const datos = { ...base, colportores: base.colportores.map((c, i) => (i === 0 ? { ...c, nombre: largo } : c)) };
    const { usuario } = montar({ datos });
    expect(screen.getByText(largo)).toBeInTheDocument();
    await usuario.click(pestana(/Tickets/));
    expect(screen.getByRole("option", { name: new RegExp(`${largo} · Rivera`) })).toBeInTheDocument();
  });

  it("montos enormes y deuda en cero se muestran sin romperse", () => {
    const base = datosBase();
    const datos = {
      ...base,
      colportores: base.colportores.map((c, i) => (i === 0 ? { ...c, deuda: 0, depositado: 123456789, enMano: 0, porCobrar: 0 } : c)),
    };
    montar({ datos });
    const fila = filaDe(/Lucía Fernández/);
    expect(fila).toHaveTextContent("$U 123.456.789");
    expect(fila).toHaveTextContent("100%");
  });

  it("COBRADO sin nada cobrado ni por cobrar muestra un guion, no NaN", () => {
    const base = datosBase();
    const datos = {
      ...base,
      colportores: base.colportores.map((c, i) => (i === 0 ? { ...c, depositado: 0, enMano: 0, porCobrar: 0 } : c)),
    };
    montar({ datos });
    const celdas = within(filaDe(/Lucía Fernández/)).getAllByRole("cell");
    expect(celdas[5]).toHaveTextContent("—");
  });

  it("un colportor que nunca depositó muestra un guion en el último depósito y en el último pago", async () => {
    const base = datosBase();
    const datos = { ...base, tickets: base.tickets.filter((t) => t.colportorId !== "lucia-fernandez") };
    const { usuario } = montar({ datos });
    expect(within(filaDe(/Lucía Fernández/)).getAllByRole("cell")[6]).toHaveTextContent("—");
    await usuario.click(pestana(/Alquiler/));
    const celdas = within(filaDe(/Lucía Fernández/)).getAllByRole("cell");
    expect(celdas[4]).toHaveTextContent("—");
    expect(celdas[5]).toHaveTextContent("Debe todo");
  });

  it("el colportor de una ciudad que ya no existe en los datos no rompe la vista", () => {
    const base = datosBase();
    const datos = { ...base, ciudades: base.ciudades.filter((c) => c.id !== "bella-union") };
    montar({ datos });
    expect(screen.queryByText("Gonzalo Méndez")).not.toBeInTheDocument();
    expect(screen.getByText("Lucía Fernández")).toBeInTheDocument();
  });
});
