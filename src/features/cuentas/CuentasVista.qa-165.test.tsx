import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccionesCuentas, DatosDeCuentas, ResultadoDeAccion, ResultadoDeDecision } from "@/datos/cuentas";
import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { CuentasVista } from "@/features/cuentas/CuentasVista";

/**
 * QA de la vista 41 «Alquiler por decidir» (front-coordinadores-web#132, PR 165). Lo que no cubren los tests del
 * implementador: textos literales del canvas, teclado, acciones superpuestas, falla a mitad y reentrada, datos límite y los
 * menores de la revisión que conviene arreglar (van con `skip` y la razón).
 */

const AHORA = new Date("2026-10-22T15:00:00.000Z");

function diferida<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

function montar(opciones: { datos?: DatosDeCuentas; decidirAlquiler?: AccionesCuentas["decidirAlquiler"] } = {}) {
  const datos = opciones.datos ?? armarCuentasSimuladas(AHORA);
  const base = crearAccionesSimuladas(datos);
  const decidirAlquiler = vi.fn(opciones.decidirAlquiler ?? base.decidirAlquiler);
  const acciones: AccionesCuentas = { editarAlquiler: vi.fn(base.editarAlquiler), decidirAlquiler };
  const usuario = userEvent.setup();
  render(
    <ProveedorModoDev activo={false}>
      <CuentasVista datos={datos} acciones={acciones} />
    </ProveedorModoDev>,
  );
  return { usuario, decidirAlquiler, datos, base };
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function irAAlquilerDeRivera(usuario: Usuario) {
  await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
  await usuario.click(screen.getByRole("tab", { name: /Alquiler/ }));
}

const fila = (nombre: string) => screen.getByRole("row", { name: new RegExp(`^${nombre}`) });
const botonDecidir = (nombre: string) => screen.getByRole("button", { name: `Decidir qué se hace con lo pagado de alquiler de ${nombre}` });
const dialogo = () => screen.getByRole("dialog");

async function abrir(usuario: Usuario, nombre = "Santiago Pereira") {
  await usuario.click(botonDecidir(nombre));
  return within(dialogo());
}

async function elegirYSeguir(usuario: Usuario, destino: RegExp, nombre = "Santiago Pereira") {
  const d = await abrir(usuario, nombre);
  await usuario.click(d.getByRole("radio", { name: destino }));
  await usuario.click(d.getByRole("button", { name: "Seguir" }));
  return d;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("QA 165 · textos literales del canvas 41", () => {
  it("la tabla de Alquiler lleva los encabezados del canvas y la fila por decidir los valores de 41A·01", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    const tabla = screen.getByRole("table", { name: "Alquiler" });
    const encabezados = within(tabla)
      .getAllByRole("columnheader")
      .map((c) => c.textContent?.trim());
    expect(encabezados).toEqual(expect.arrayContaining(["COLPORTOR", "ALQUILER", "PAGADO", "DEBE", "ÚLTIMO PAGO", "ESTADO"]));
    const santiago = fila("Santiago Pereira");
    expect(within(santiago).getByText("◔ Por decidir")).toBeInTheDocument();
    expect(santiago).toHaveTextContent("Baja de la campaña el 20/10");
    // En la fila por decidir, «Alquiler» y «Debe» van con raya (no debe alquiler quien se dio de baja).
    expect(within(santiago).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    // Quien paga alquiler normal sigue con «✓ Pagado» o «Debe todo» (no se mezclan los estados).
    expect(within(tabla).queryAllByText("✓ Pagado").length + within(tabla).queryAllByText(/^Debe|Pagó una parte/).length).toBeGreaterThan(0);
  });

  it("41A·02 a 41A·04: título, texto, destinos, detalles y botones literales", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    const d = await abrir(usuario);
    expect(dialogo()).toHaveAccessibleName("¿Qué hacés con los $U 9.250 que pagó Santiago?");
    expect(dialogo()).toHaveAccessibleDescription(/Santiago Pereira se dio de baja de la campaña el 20\/10\. Elegí un solo destino para todo el monto\./);
    expect(d.getByRole("radio", { name: /Devolverlo al colportor/ })).toHaveAccessibleName(/Se anulan sus 2 pagos de alquiler\./);
    expect(d.getByRole("radio", { name: /Dejarlo a cuenta/ })).toHaveAccessibleName(/Queda para su próximo depósito\./);
    expect(d.getByRole("radio", { name: /Quedárselo/ })).toHaveAccessibleName(/Lo conserva el coordinador\./);
    // 41A·02: «Seguir» no se puede usar hasta elegir.
    expect(d.getByRole("button", { name: "Seguir" })).toHaveAttribute("aria-disabled", "true");
    expect(d.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    await usuario.click(d.getByRole("radio", { name: /Devolverlo al colportor/ }));
    expect(d.getByRole("button", { name: "Seguir" })).not.toHaveAttribute("aria-disabled", "true");
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    expect(dialogo()).toHaveAccessibleName("¿Devolverle $U 9.250 a Santiago?");
    expect(dialogo()).toHaveAccessibleDescription(
      /Se anulan sus 2 pagos de alquiler \(\d{2}\/\d{2} y \d{2}\/\d{2}\)\. Queda registrado que lo decidiste vos, hoy\./,
    );
    expect(d.getByRole("button", { name: "Sí, devolver" })).toBeInTheDocument();
    expect(d.getByRole("button", { name: "Volver" })).toBeInTheDocument();
  });

  it("41A·06: el aviso de abajo, la fila y el aviso de arriba (desaparece) quedan como el canvas", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Devolverlo al colportor/);
    await usuario.click(d.getByRole("button", { name: "Sí, devolver" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Listo. Se devolvieron $U 9.250 a Santiago Pereira.");
    const santiago = fila("Santiago Pereira");
    expect(santiago).toHaveTextContent(/Baja 20\/10 · decidió Marta Pérez · \d{2}\/\d{2} \d{2}:\d{2}/);
    expect(within(santiago).getByText("↩ Devuelto al colportor")).toBeInTheDocument();
    // El importe devuelto se lee «devuelto» además de tacharse (nada solo por estilo).
    expect(santiago).toHaveTextContent("devuelto $U 9.250");
    expect(screen.queryByText(/dados de baja tienen/)).not.toBeInTheDocument();
  });

  it("41B·03: el aviso sin conexión dice lo mismo que el canvas y cada estado lleva texto, no solo color", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    expect(screen.getByText("Sin conexión. Podés ver el alquiler, pero no decidir hasta que vuelva.")).toBeInTheDocument();
    expect(within(fila("Santiago Pereira")).getByText("◔ Por decidir")).toBeInTheDocument();
    // «Decidir» sigue siendo un botón con nombre y avisa que está apagado, para el teclado y el lector.
    expect(botonDecidir("Santiago Pereira")).toHaveAttribute("aria-disabled", "true");
    expect(botonDecidir("Santiago Pereira")).toHaveTextContent("Decidir");
  });
});

describe("QA 165 · teclado y foco", () => {
  it("todo el camino sin mouse: Enter abre, flechas eligen, «Seguir» apagado no avanza, Enter confirma y el foco va al próximo «Decidir»", async () => {
    const { usuario, decidirAlquiler } = montar();
    await irAAlquilerDeRivera(usuario);
    act(() => botonDecidir("Santiago Pereira").focus());
    await usuario.keyboard("{Enter}");
    expect(dialogo()).toBeInTheDocument();
    const d = within(dialogo());
    // El foco entra al primer destino y «Seguir» sin elegir no hace nada con Enter ni con Espacio.
    expect(d.getAllByRole("radio")[0]).toHaveFocus();
    act(() => d.getByRole("button", { name: "Seguir" }).focus());
    await usuario.keyboard("{Enter}");
    await usuario.keyboard(" ");
    expect(d.getByRole("heading", { level: 2 })).toHaveTextContent("¿Qué hacés con los");
    act(() => d.getAllByRole("radio")[0].focus());
    await usuario.keyboard("{ArrowDown}{ArrowDown}");
    expect(d.getByRole("radio", { name: /Quedárselo/ })).toBeChecked();
    await usuario.tab();
    expect(d.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await usuario.tab();
    expect(d.getByRole("button", { name: "Seguir" })).toHaveFocus();
    await usuario.keyboard("{Enter}");
    // En la confirmación el foco cae en «Volver» (lo seguro) y «Sí, quedármelo» queda a un Tab.
    expect(d.getByRole("button", { name: "Volver" })).toHaveFocus();
    await usuario.tab();
    expect(d.getByRole("button", { name: "Sí, quedármelo" })).toHaveFocus();
    await usuario.keyboard("{Enter}");
    expect(await screen.findByRole("status")).toHaveTextContent("Listo. Los $U 9.250 de Santiago Pereira quedan con el coordinador.");
    expect(decidirAlquiler).toHaveBeenCalledTimes(1);
    // Queda Martín por decidir: el foco va a su «Decidir», no se pierde en <body>.
    expect(botonDecidir("Martín Olivera")).toHaveFocus();
  });

  it("Shift+Tab desde el primer control da la vuelta al último, en los dos pasos", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    const d = await abrir(usuario);
    expect(d.getAllByRole("radio")[0]).toHaveFocus();
    await usuario.tab({ shift: true });
    expect(d.getByRole("button", { name: "Seguir" })).toHaveFocus();
    await usuario.click(d.getByRole("radio", { name: /Dejarlo a cuenta/ }));
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    expect(d.getByRole("button", { name: "Volver" })).toHaveFocus();
    await usuario.tab({ shift: true });
    expect(d.getByRole("button", { name: "Sí, dejar a cuenta" })).toHaveFocus();
  });

  it.skip("QA #165: un clic en el texto del diálogo (o en el fondo) deja el foco en <body> y Esc ya no cierra (confirmado en Chromium)", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    const d = await abrir(usuario);
    await usuario.click(d.getByRole("heading", { level: 2 }));
    expect(dialogo()).toContainElement(document.activeElement as HTMLElement);
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al decidir la última, el foco va a la pestaña Alquiler y no se pierde", async () => {
    const base = armarCuentasSimuladas(AHORA);
    // Solo Santiago queda por decidir: se dan por decididos los otros dos (la fila propia no cuenta).
    const decisiones = [
      ...(base.decisionesDeAlquiler ?? []),
      { id: "d-m", colportorId: "martin-olivera", destino: "a-cuenta" as const, monto: 3000, decididoPor: "Marta Pérez", decididoEn: "2026-10-21T10:00:00.000Z" },
    ];
    const { usuario } = montar({ datos: { ...base, decisionesDeAlquiler: decisiones } });
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Devolverlo al colportor/);
    await usuario.click(d.getByRole("button", { name: "Sí, devolver" }));
    await screen.findByRole("status");
    expect(screen.getByRole("tab", { name: /Alquiler/ })).toHaveFocus();
  });
});

describe("QA 165 · acciones superpuestas, falla a mitad y reentrada", () => {
  it("doble clic en «Sí, devolver»: una sola decisión; mientras guarda no hay «Volver», Esc no cierra y el botón dice «Guardando…»", async () => {
    const espera = diferida<ResultadoDeAccion<ResultadoDeDecision>>();
    const { usuario, decidirAlquiler, base } = montar({ decidirAlquiler: () => espera.promesa });
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Devolverlo al colportor/);
    const confirmar = d.getByRole("button", { name: "Sí, devolver" });
    await usuario.dblClick(confirmar);
    expect(decidirAlquiler).toHaveBeenCalledTimes(1);
    const guardando = d.getByRole("button", { name: "Guardando…" });
    expect(guardando).toHaveAttribute("aria-disabled", "true");
    expect(d.queryByRole("button", { name: "Volver" })).not.toBeInTheDocument();
    await usuario.keyboard("{Escape}");
    expect(dialogo()).toBeInTheDocument();
    await usuario.click(guardando);
    expect(decidirAlquiler).toHaveBeenCalledTimes(1);

    espera.resolver(await base.decidirAlquiler("santiago-pereira", "devolver"));
    expect(await screen.findByRole("status")).toHaveTextContent("Se devolvieron $U 9.250");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(decidirAlquiler).toHaveBeenCalledTimes(1);
  });

  it("un segundo «Decidir» mientras la primera decisión guarda se ignora y no pisa el diálogo ni el aviso", async () => {
    const espera = diferida<ResultadoDeAccion<ResultadoDeDecision>>();
    const { usuario, decidirAlquiler, base } = montar({ decidirAlquiler: () => espera.promesa });
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Quedárselo/);
    await usuario.click(d.getByRole("button", { name: "Sí, quedármelo" }));
    fireEvent.click(botonDecidir("Martín Olivera"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(dialogo()).toHaveAccessibleName(/Santiago/);

    espera.resolver(await base.decidirAlquiler("santiago-pereira", "se-lo-queda"));
    expect(await screen.findByRole("status")).toHaveTextContent("Santiago Pereira");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(decidirAlquiler).toHaveBeenCalledTimes(1);
  });

  it("falla con excepción: el botón vuelve a quedar usable, el foco no se pierde, Esc cierra y al reabrir no queda ni la elección ni el error", async () => {
    const decidirAlquiler = vi.fn<AccionesCuentas["decidirAlquiler"]>().mockRejectedValueOnce(new Error("se cortó la red"));
    const { usuario } = montar({ decidirAlquiler });
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Dejarlo a cuenta/);
    await usuario.click(d.getByRole("button", { name: "Sí, dejar a cuenta" }));
    const alerta = await d.findByRole("alert");
    expect(alerta).toHaveTextContent(/Sin conexión: no pudimos guardar la decisión\. No cambió nada: probá de nuevo cuando vuelva\./);
    const reintentar = d.getByRole("button", { name: "Reintentar" });
    expect(reintentar).not.toHaveAttribute("aria-disabled", "true");
    expect(reintentar).toHaveFocus();
    expect(d.getByRole("button", { name: "Volver" })).toBeInTheDocument();

    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(botonDecidir("Santiago Pereira")).toHaveFocus();
    const otra = await abrir(usuario);
    expect(otra.queryByRole("alert")).not.toBeInTheDocument();
    for (const radio of otra.getAllByRole("radio")) expect(radio).not.toBeChecked();
  });

  it("después de una falla se puede decidir otra fila: nada queda «ocupado»", async () => {
    const decidirAlquiler = vi.fn<AccionesCuentas["decidirAlquiler"]>().mockResolvedValueOnce({ ok: false, causa: "rechazado" });
    const { usuario, base } = montar({ decidirAlquiler });
    decidirAlquiler.mockImplementation(base.decidirAlquiler);
    await irAAlquilerDeRivera(usuario);
    let d = await elegirYSeguir(usuario, /Quedárselo/);
    await usuario.click(d.getByRole("button", { name: "Sí, quedármelo" }));
    await d.findByRole("alert");
    await usuario.click(d.getByRole("button", { name: "Volver" }));
    expect(d.queryByRole("alert")).not.toBeInTheDocument();
    await usuario.click(d.getByRole("button", { name: "Cancelar" }));
    d = await elegirYSeguir(usuario, /Devolverlo al colportor/, "Martín Olivera");
    await usuario.click(d.getByRole("button", { name: "Sí, devolver" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Se devolvieron $U 3.000 a Martín Olivera");
  });

  it("un rechazo del servidor largo no desborda el diálogo ni deja al usuario sin salida", async () => {
    const mensaje = `No podés decidir ${"esto ".repeat(80)}con tanta información.`;
    const { usuario } = montar({ decidirAlquiler: async () => ({ ok: false, causa: "rechazado", mensaje }) });
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Quedárselo/);
    await usuario.click(d.getByRole("button", { name: "Sí, quedármelo" }));
    expect(await d.findByRole("alert")).toHaveTextContent("No podés decidir esto");
    expect(d.getByRole("button", { name: "Volver" })).toBeInTheDocument();
    expect(d.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("si se corta la conexión con el diálogo abierto, confirmar no pierde nada: falla con aviso y se puede reintentar al volver", async () => {
    const decidirAlquiler = vi.fn<AccionesCuentas["decidirAlquiler"]>().mockResolvedValueOnce({ ok: false, causa: "sin-conexion" });
    const { usuario, base } = montar({ decidirAlquiler });
    decidirAlquiler.mockImplementation(base.decidirAlquiler);
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Devolverlo al colportor/);
    const enLinea = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event("offline")));
    await usuario.click(d.getByRole("button", { name: "Sí, devolver" }));
    expect(await d.findByRole("alert")).toHaveTextContent(/Sin conexión/);
    enLinea.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event("online")));
    await usuario.click(d.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Se devolvieron $U 9.250");
  });
});

describe("QA 165 · datos límite", () => {
  function conBajas(cantidad: number, sinAlquiler = false): DatosDeCuentas {
    const base = armarCuentasSimuladas(AHORA);
    const nuevos = Array.from({ length: cantidad }, (_, i) => ({
      id: `baja-qa-${i}`,
      nombre: `Baja de prueba ${String(i).padStart(2, "0")}`,
      ciudadId: "rivera",
      deuda: 0,
      depositado: 0,
      enMano: 0,
      porCobrar: 0,
      baja: { fecha: "2026-10-20T12:00:00.000Z" },
    }));
    const tickets = nuevos.map((c, i) => ({
      id: `t-qa-${i}`,
      colportorId: c.id,
      fecha: "2026-10-10T12:00:00.000Z",
      monto: 1000,
      medio: "deposito-banco" as const,
      destino: "alquiler" as const,
      estado: "VALIDADO" as const,
      tieneFoto: false,
    }));
    return {
      ...base,
      alquilerPorColportor: sinAlquiler ? 0 : base.alquilerPorColportor,
      colportores: [...base.colportores, ...nuevos],
      tickets: [...base.tickets, ...tickets],
    };
  }

  it("muchas bajas: el aviso cuenta bien y la ciudad lo marca; decidir una baja el contador", async () => {
    const datos = conBajas(30);
    const ciudadId = datos.colportores.find((c) => c.id === "baja-qa-0")?.ciudadId;
    expect(ciudadId).toBeDefined();
    const { usuario } = montar({ datos });
    await usuario.click(screen.getByRole("button", { name: new RegExp(`^${datos.ciudades.find((c) => c.id === ciudadId)?.nombre}`) }));
    await usuario.click(screen.getByRole("tab", { name: /Alquiler/ }));
    // 30 nuevas + Santiago + Martín (la coordinadora no cuenta) = 32; 30 × 1.000 + 9.250 + 3.000.
    expect(screen.getByText("32 colportores dados de baja tienen $U 42.250 de alquiler por decidir.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(`^${datos.ciudades.find((c) => c.id === ciudadId)?.nombre}`) })).toHaveTextContent(
      "32 por decidir",
    );
    const d = await elegirYSeguir(usuario, /Quedárselo/, "Baja de prueba 00");
    expect(dialogo()).toHaveAccessibleName("¿Quedarte con los $U 1.000 de Baja?");
    await usuario.click(d.getByRole("button", { name: "Sí, quedármelo" }));
    expect(await screen.findByText("31 colportores dados de baja tienen $U 41.250 de alquiler por decidir.")).toBeInTheDocument();
  });

  it("una sola persona por decidir en una campaña sin alquiler usa el singular del aviso", async () => {
    const base = armarCuentasSimuladas(AHORA);
    const datos: DatosDeCuentas = {
      ...base,
      alquilerPorColportor: 0,
      colportores: base.colportores.filter((c) => !c.baja || c.id === "santiago-pereira" || c.esVos),
      tickets: base.tickets.filter((t) => t.destino !== "alquiler" || t.colportorId === "santiago-pereira"),
      decisionesDeAlquiler: [],
    };
    const { usuario } = montar({ datos });
    await irAAlquilerDeRivera(usuario);
    expect(screen.getByText(/^Esta campaña no cobra alquiler y .+ había pagado: \$U [\d.]+ por decidir\.$/)).toBeInTheDocument();
  });
});

describe("QA 165 · accesibilidad: tamaño de los controles y anuncios", () => {
  it("«Decidir» (32 px), los botones del diálogo (40 px), los destinos (44 px) y el cierre del aviso de abajo (32 px)", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    expect(botonDecidir("Santiago Pereira").className).toMatch(/min-h-8/);
    const d = await abrir(usuario);
    for (const nombre of ["Cancelar", "Seguir"]) expect(d.getByRole("button", { name: nombre }).className).toMatch(/min-h-10/);
    for (const radio of d.getAllByRole("radio")) expect(radio.closest("label")?.className).toMatch(/min-h-11/);
    await usuario.click(d.getByRole("radio", { name: /Quedárselo/ }));
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    await usuario.click(d.getByRole("button", { name: "Sí, quedármelo" }));
    const estado = await screen.findByRole("status");
    expect(within(estado).getByRole("button", { name: "Cerrar el aviso" }).className).toMatch(/size-8/);
  });

  it("el diálogo es modal, tiene nombre y descripción, el error se anuncia como alerta y el resultado como estado (uno solo)", async () => {
    const decidirAlquiler = vi.fn<AccionesCuentas["decidirAlquiler"]>().mockResolvedValueOnce({ ok: false, causa: "rechazado" });
    const { usuario, base } = montar({ decidirAlquiler });
    decidirAlquiler.mockImplementation(base.decidirAlquiler);
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Quedárselo/);
    expect(dialogo()).toHaveAttribute("aria-modal", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await usuario.click(d.getByRole("button", { name: "Sí, quedármelo" }));
    expect(await d.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await usuario.click(d.getByRole("button", { name: "Reintentar" }));
    await screen.findByRole("status");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("el estado de cada fila se dice con texto y símbolo, no solo con color", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    for (const texto of [
      "◔ Por decidir",
      "↩ Devuelto al colportor",
      "→ A cuenta del próximo depósito",
      "■ Se lo quedó el coordinador",
    ]) {
      expect(screen.getAllByText(texto).length).toBeGreaterThan(0);
    }
  });
});

describe("QA 165 · menores de la revisión que conviene arreglar ya", () => {
  it.skip("QA #165: el aviso «Sin conexión… no decidir» no sale si lo único por decidir es la fila propia (nada que decidir)", async () => {
    const base = armarCuentasSimuladas(AHORA);
    // Solo queda por decidir la fila de la coordinadora (esVos): Santiago y Martín pasan a ser inscriptos sin baja.
    const datos: DatosDeCuentas = {
      ...base,
      colportores: base.colportores.map((c) => (c.baja && !c.esVos ? { ...c, baja: undefined } : c)),
    };
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const { usuario } = montar({ datos });
    await irAAlquilerDeRivera(usuario);
    expect(screen.queryByText(/Sin conexión\. Podés ver el alquiler, pero no decidir/)).not.toBeInTheDocument();
  });

  it.skip("QA #165: «VALIDADOS» de Tickets no cuenta los pagos devueltos (la tabla los marca «↩ Devuelto» y Depositado ya no los suma)", async () => {
    const { usuario } = montar();
    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    await usuario.click(screen.getByRole("tab", { name: /Tickets/ }));
    const leer = () => screen.getByText("VALIDADOS").parentElement?.textContent ?? "";
    const antes = Number(/^VALIDADOS(\d+)/.exec(leer())?.[1]);
    await usuario.click(screen.getByRole("tab", { name: /Alquiler/ }));
    const d = await elegirYSeguir(usuario, /Devolverlo al colportor/);
    await usuario.click(d.getByRole("button", { name: "Sí, devolver" }));
    await screen.findByRole("status");
    await usuario.click(screen.getByRole("tab", { name: /Tickets/ }));
    // Santiago tenía 2 pagos; quedan devueltos, así que dejan de ser «validados».
    expect(Number(/^VALIDADOS(\d+)/.exec(leer())?.[1])).toBe(antes - 2);
  });

  it.skip("QA #165: 41A·07, la pastilla «→ A cuenta del próximo depósito» puede partirse en lugar de cortarse en la columna Estado (captura A07)", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    const pastilla = screen.getAllByText("→ A cuenta del próximo depósito")[0];
    // Con `w-max` y sin salto de línea la pastilla pasa del ancho de la columna a 1280 px y la celda la recorta.
    expect(pastilla.className).toMatch(/max-w-full|whitespace-normal|break-words/);
  });

  it.skip("QA #165: 41B·01, con la campaña sin alquiler el encabezado dice «no se cobra» como el canvas, no «$U 0 por colportor»", async () => {
    const base = armarCuentasSimuladas(AHORA);
    const { usuario } = montar({ datos: { ...base, alquilerPorColportor: 0 } });
    await irAAlquilerDeRivera(usuario);
    expect(screen.getByText(/no se cobra/)).toBeInTheDocument();
    expect(screen.queryByText(/\$U 0 por colportor/)).not.toBeInTheDocument();
  });
});
