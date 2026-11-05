import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
import type { AccionesCuentas, DatosDeCuentas, ResultadoDeAccion, TicketDeCuentas } from "@/datos/cuentas";
import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { CuentasVista } from "@/features/cuentas/CuentasVista";
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
  const base = crearAccionesSimuladas();
  const acciones = {
    editarAlquiler: vi.fn(base.editarAlquiler),
    ...opciones.acciones,
  } as AccionesCuentas & { editarAlquiler: ReturnType<typeof vi.fn> };
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
    expect(screen.getByText(/Sofía Cabral todavía no tiene tickets\. Aparecen cuando sube uno\./)).toBeInTheDocument();
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

describe("Tickets sin «Registrar retiro»", () => {
  it("el retiro lo carga el colportor: ni en Artigas ni en Bella Unión hay botón ni formulario para registrarlo", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Artigas/);
    expect(screen.queryByRole("button", { name: "Registrar retiro" })).not.toBeInTheDocument();
    await usuario.click(ciudad(/^Bella Unión/));
    expect(screen.queryByRole("button", { name: "Registrar retiro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Registrar retiro" })).not.toBeInTheDocument();
  });

  it("los retiros que cargó el colportor siguen en el historial y en el resumen", async () => {
    const { usuario } = montar();
    await irATickets(usuario, /^Artigas/);
    expect(screen.getByText("RETIROS DEL COORDINADOR", { selector: "dt" })).toBeInTheDocument();
    expect(screen.getAllByText("Retiro por el coordinador").length).toBeGreaterThan(0);
  });
});

describe("saldo a favor", () => {
  it("Casa editora: lo pagado de más se ve «a favor» en lugar de $U 0", () => {
    const datos = datosBase();
    const colportores = datos.colportores.map((c) => (c.id === "sofia-cabral" ? { ...c, deuda: 0, aFavor: 3000 } : c));
    montar({ datos: { ...datos, colportores } });
    expect(filaDe(/Sofía Cabral/)).toHaveTextContent("a favor $U 3.000");
  });

  it("Casa editora: con deuda no se muestra «a favor»", () => {
    montar();
    expect(filaDe(/Sofía Cabral/)).not.toHaveTextContent("a favor");
  });

  it("Alquiler: lo pagado de más no queda «a favor» del alquiler: el pagado se topa y no debe nada", async () => {
    const { usuario } = montar({ datos: sobrepagoDeLucia() });
    await usuario.click(pestana(/Alquiler/));
    const fila = within(screen.getByRole("table", { name: "Alquiler" })).getByRole("row", { name: /Lucía Fernández/ });
    const celdas = within(fila).getAllByRole("cell");
    expect(celdas[1]).toHaveTextContent("$U 2.500");
    expect(celdas[2]).toHaveTextContent("$U 2.500");
    expect(celdas[3]).toHaveTextContent("$U 0");
    expect(within(fila).getByText("✓ Pagado")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Alquiler" })).queryByText(/a favor/)).not.toBeInTheDocument();
  });
});

function sobrepagoDeLucia(): DatosDeCuentas {
  const datos = datosBase();
  const ticket: TicketDeCuentas = {
    id: "lucia-alquiler-de-mas",
    colportorId: "lucia-fernandez",
    fecha: datos.ahora,
    monto: 3000,
    medio: "deposito-banco",
    entidad: "BROU",
    numero: "0001",
    destino: "alquiler",
    estado: "VALIDADO",
    tieneFoto: true,
  };
  return {
    ...datos,
    alquilerPorColportor: 2500,
    tickets: [...datos.tickets.filter((t) => t.destino !== "alquiler"), ticket],
  };
}

describe("alquiler pagado de más en la casa editora", () => {
  const TEXTO = "Descuento por alquiler pagado de más: $U 500";

  it("la fila de la casa editora dice cuánto le bajó la deuda; las demás filas no dicen nada", () => {
    montar({ datos: sobrepagoDeLucia() });
    expect(filaDe(/Lucía Fernández/)).toHaveTextContent(TEXTO);
    expect(screen.getAllByText(/Descuento por alquiler pagado de más/)).toHaveLength(1);
    expect(filaDe(/Sofía Cabral/)).not.toHaveTextContent("Descuento");
  });

  it("sin nada pagado de más no aparece la línea", () => {
    montar();
    expect(screen.queryByText(/Descuento por alquiler pagado de más/)).not.toBeInTheDocument();
  });

  it("con una campaña sin alquiler no aparece ningún descuento", () => {
    montar({ datos: { ...sobrepagoDeLucia(), alquilerPorColportor: 0 } });
    expect(screen.queryByText(/Descuento por alquiler pagado de más/)).not.toBeInTheDocument();
  });

  it("el texto se parte en renglones en vez de cortarse con puntos suspensivos (textos largos, escala grande)", () => {
    montar({ datos: sobrepagoDeLucia() });
    const linea = screen.getByText(TEXTO);
    expect(linea.className).toContain("whitespace-normal");
    expect(linea.className).toContain("overflow-wrap:anywhere");
  });

  it("editar el alquiler a la baja suma el descuento y subirlo otra vez lo saca (dos cambios seguidos)", async () => {
    const { usuario } = montar();
    const guardar = async (monto: string) => {
      await usuario.click(screen.getByRole("button", { name: "Editar" }));
      const editor = within(screen.getByRole("form", { name: "Editar el alquiler de la campaña" }));
      await usuario.clear(editor.getByLabelText(/Alquiler por colportor/));
      await usuario.type(editor.getByLabelText(/Alquiler por colportor/), monto);
      await usuario.click(editor.getByRole("button", { name: "Guardar" }));
      await screen.findByText(new RegExp(`Alquiler de la campaña: \\$U ${monto.replace(".", "\\.")} por colportor`));
    };
    await guardar("10.000");
    // Quien tenía pagados 18.500 ahora pagó 8.500 de más.
    expect(screen.getAllByText("Descuento por alquiler pagado de más: $U 8.500").length).toBeGreaterThan(0);
    await usuario.click(pestana(/Alquiler/));
    expect(within(screen.getByRole("table", { name: "Alquiler" })).queryByText(/a favor/)).not.toBeInTheDocument();
    await guardar("30.000");
    await usuario.click(pestana(/Casa editora/));
    expect(screen.queryByText(/Descuento por alquiler pagado de más/)).not.toBeInTheDocument();
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

  it("dos ediciones del alquiler, una tras otra, se aplican las dos", async () => {
    const { usuario } = montar();
    for (const monto of ["10000", "12000"]) {
      const editor = await abrirEditor(usuario);
      await usuario.clear(editor.getByLabelText(/Alquiler por colportor/));
      await usuario.type(editor.getByLabelText(/Alquiler por colportor/), monto);
      await usuario.click(editor.getByRole("button", { name: "Guardar" }));
      await screen.findByText(/para todos los inscriptos/);
    }
    expect(screen.getByRole("status")).toHaveTextContent("$U 12.000");
    await usuario.click(pestana(/Alquiler/));
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
  });

  it("el último aviso reemplaza al anterior", async () => {
    const { usuario } = montar();
    for (const monto of ["10000", "11000"]) {
      const editor = await abrirEditor(usuario);
      await usuario.clear(editor.getByLabelText(/Alquiler por colportor/));
      await usuario.type(editor.getByLabelText(/Alquiler por colportor/), monto);
      await usuario.click(editor.getByRole("button", { name: "Guardar" }));
      await screen.findByText(/para todos los inscriptos/);
    }
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("$U 11.000");
  });
});

describe("volver atrás y reentrar", () => {
  async function guardarAlquilerSinContestar(usuario: ReturnType<typeof userEvent.setup>) {
    await usuario.click(screen.getByRole("button", { name: "Editar" }));
    const editor = within(screen.getByRole("form", { name: "Editar el alquiler de la campaña" }));
    await usuario.clear(editor.getByLabelText(/Alquiler por colportor/));
    await usuario.type(editor.getByLabelText(/Alquiler por colportor/), "21000");
    await usuario.click(editor.getByRole("button", { name: "Guardar" }));
  }

  it("al reentrar la vista arranca limpia: Casa editora, todas las ciudades y sin nada trabado", async () => {
    const respuesta = diferida<ResultadoDeAccion<number>>();
    const primera = montar({ acciones: { editarAlquiler: vi.fn(() => respuesta.promesa) } });
    await primera.usuario.click(ciudad(/^Artigas/));
    await guardarAlquilerSinContestar(primera.usuario);
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

  it("un guardado en camino cuenta como trabajo sin contestar aunque la vista se vaya", async () => {
    const respuesta = diferida<ResultadoDeAccion<number>>();
    const { usuario, unmount } = montar({ acciones: { editarAlquiler: vi.fn(() => respuesta.promesa) } });
    await guardarAlquilerSinContestar(usuario);
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
    expect(screen.queryByRole("button", { name: "Registrar retiro" })).not.toBeInTheDocument();
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
