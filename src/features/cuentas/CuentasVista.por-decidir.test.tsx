import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccionesCuentas, DatosDeCuentas, ResultadoDeAccion, ResultadoDeDecision } from "@/datos/cuentas";
import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { CuentasVista } from "@/features/cuentas/CuentasVista";
import { hayTrabajoPendiente } from "@/shell/trabajo-pendiente";

/**
 * Vista 41 (front-coordinadores-web#132): lo pagado de alquiler «por decidir» en la pestaña Alquiler de Cuentas, con los
 * artboards 41A·01-07 y 41B·01-03, «Devolver resto» y la fila propia del coordinador.
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
  return { usuario, decidirAlquiler, datos };
}

async function irAAlquilerDeRivera(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
  await usuario.click(screen.getByRole("tab", { name: /Alquiler/ }));
}

const fila = (nombre: string) => screen.getByRole("row", { name: new RegExp(`^${nombre}`) });
const botonDecidir = (nombre: string) => screen.getByRole("button", { name: `Decidir qué se hace con lo pagado de alquiler de ${nombre}` });
const dialogo = () => screen.getByRole("dialog");

async function abrir(usuario: ReturnType<typeof userEvent.setup>, nombre = "Santiago Pereira") {
  await usuario.click(botonDecidir(nombre));
  return within(dialogo());
}

async function elegirYSeguir(usuario: ReturnType<typeof userEvent.setup>, destino: RegExp, nombre = "Santiago Pereira") {
  const d = await abrir(usuario, nombre);
  await usuario.click(d.getByRole("radio", { name: destino }));
  await usuario.click(d.getByRole("button", { name: "Seguir" }));
  return d;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("41A·01 · la fila con el monto «por decidir»", () => {
  it("la fila de la baja dice «Por decidir», trae «Decidir» y va arriba; el aviso dice cuánto falta y la ciudad lo marca", async () => {
    const { usuario } = montar();
    expect(screen.getByRole("button", { name: /^Rivera/ })).toHaveTextContent("2 por decidir");
    await irAAlquilerDeRivera(usuario);

    const santiago = fila("Santiago Pereira");
    expect(santiago).toHaveTextContent("Baja de la campaña el 20/10");
    expect(within(santiago).getByText("◔ Por decidir")).toBeInTheDocument();
    expect(santiago).toHaveTextContent("$U 9.250");
    expect(botonDecidir("Santiago Pereira")).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("2 colportores dados de baja tienen $U 12.250 de alquiler por decidir.")).toBeInTheDocument();

    const tabla = screen.getByRole("table", { name: "Alquiler" });
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas[0]).toHaveTextContent(/Santiago Pereira|Martín Olivera/);
    expect(filas[1]).toHaveTextContent(/Santiago Pereira|Martín Olivera/);
  });

  it("quien se dio de baja no cuenta en las cifras de lo que se debe", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    // 11 en Rivera, 6 de baja.
    expect(screen.getByText("5 × $U 18.500")).toBeInTheDocument();
  });
});

describe("41A·02 a 41A·06 · decidir devolverlo", () => {
  it("elegir, confirmar, guardar y cómo queda la fila", async () => {
    const respuesta = diferida<ResultadoDeAccion<ResultadoDeDecision>>();
    const { usuario, decidirAlquiler, datos } = montar({ decidirAlquiler: () => respuesta.promesa });
    await irAAlquilerDeRivera(usuario);
    const d = await abrir(usuario);

    // 41A·02: tres destinos, una sola elección; «Seguir» espera la elección.
    expect(d.getByRole("heading", { name: "¿Qué hacés con los $U 9.250 que pagó Santiago?" })).toBeInTheDocument();
    expect(d.getByText("Santiago Pereira se dio de baja de la campaña el 20/10. Elegí un solo destino para todo el monto.")).toBeInTheDocument();
    expect(d.getAllByRole("radio")).toHaveLength(3);
    expect(d.getByRole("radio", { name: /Devolverlo al colportor/ })).toHaveFocus();
    expect(d.getByRole("radio", { name: /Devolverlo al colportor/ })).toHaveAccessibleName(/Se anulan sus 2 pagos de alquiler\./);
    expect(d.getByRole("button", { name: "Seguir" })).toHaveAttribute("aria-disabled", "true");
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    expect(d.getByRole("radio", { name: /Devolverlo/ })).toBeInTheDocument();
    expect(fila("Santiago Pereira").className).toMatch(/inset_3px/);

    // 41A·03 y 41A·04.
    await usuario.click(d.getByRole("radio", { name: /Devolverlo al colportor/ }));
    expect(d.getByRole("radio", { name: /Devolverlo al colportor/ })).toBeChecked();
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    expect(d.getByRole("heading", { name: "¿Devolverle $U 9.250 a Santiago?" })).toBeInTheDocument();
    expect(d.getByText("Se anulan sus 2 pagos de alquiler (29/09 y 13/10). Queda registrado que lo decidiste vos, hoy.")).toBeInTheDocument();
    expect(d.getByRole("button", { name: "Volver" })).toHaveFocus();

    // 41A·05: guardando, sin volver ni cerrar; el doble toque manda una sola vez.
    await usuario.dblClick(d.getByRole("button", { name: "Sí, devolver" }));
    expect(decidirAlquiler).toHaveBeenCalledTimes(1);
    expect(decidirAlquiler).toHaveBeenCalledWith("santiago-pereira", "devolver");
    expect(d.getByRole("button", { name: "Guardando…" })).toHaveAttribute("aria-disabled", "true");
    expect(d.queryByRole("button", { name: "Volver" })).not.toBeInTheDocument();
    expect(hayTrabajoPendiente()).toBe(true);
    await usuario.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // 41A·06: la fila guarda el destino, quién y cuándo; el aviso de arriba ya no cuenta a Santiago.
    await act(async () =>
      respuesta.resolver({
        ok: true,
        valor: {
          yaEstaba: false,
          decision: {
            id: "d-nueva",
            colportorId: "santiago-pereira",
            destino: "devolver",
            monto: 9250,
            decididoPor: "Marta Pérez",
            decididoEn: "2026-10-22T17:20:00.000Z",
          },
        },
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Listo. Se devolvieron $U 9.250 a Santiago Pereira.");
    const santiago = fila("Santiago Pereira");
    expect(santiago).toHaveTextContent("Baja 20/10 · decidió Marta Pérez · 22/10 14:20");
    expect(within(santiago).getByText("↩ Devuelto al colportor")).toBeInTheDocument();
    expect(within(santiago).getByText("$U 9.250", { exact: false }).closest(".line-through")).not.toBeNull();
    expect(within(santiago).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Martín Olivera pagó $U 3.000 de alquiler después de la última decisión. Falta decidir qué se hace con ese monto.")).toBeInTheDocument();
    expect(botonDecidir("Martín Olivera")).toHaveFocus();
    expect(fila("Santiago Pereira").className).toMatch(/inset_3px/);
    expect(datos.colportores.find((c) => c.id === "santiago-pereira")).toBeDefined();

    // En Casa editora, Depositado bajó y En mano subió por lo devuelto; en Tickets, sus pagos figuran devueltos.
    await usuario.click(screen.getByRole("tab", { name: /Tickets/ }));
    expect(screen.getAllByText("↩ Devuelto").length).toBeGreaterThanOrEqual(4);

    await usuario.click(screen.getByRole("button", { name: "Cerrar el aviso" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each([
    [/Dejarlo a cuenta/, "¿Dejar $U 9.250 a cuenta del próximo depósito de Santiago?", "Sí, dejar a cuenta", "→ A cuenta del próximo depósito", "Listo. $U 9.250 de Santiago Pereira quedan a cuenta de su próximo depósito."],
    [/Quedárselo/, "¿Quedarte con los $U 9.250 de Santiago?", "Sí, quedármelo", "■ Se lo quedó el coordinador", "Listo. Los $U 9.250 de Santiago Pereira quedan con el coordinador."],
  ])("%s: la confirmación cambia el título y el botón, y la fila queda con su pastilla", async (opcion, titulo, boton, pastilla, aviso) => {
    const { usuario, decidirAlquiler } = montar();
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, opcion);
    expect(d.getByRole("heading", { name: titulo })).toBeInTheDocument();
    await usuario.click(d.getByRole("button", { name: boton }));
    expect(decidirAlquiler).toHaveBeenCalledWith("santiago-pereira", expect.stringMatching(/a-cuenta|se-lo-queda/));
    expect(await screen.findByRole("status")).toHaveTextContent(aviso);
    expect(within(fila("Santiago Pereira")).getByText(pastilla)).toBeInTheDocument();
  });

  it("dejarlo a cuenta baja la deuda con la casa editora y la fila lo dice", async () => {
    const { usuario, datos } = montar();
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Dejarlo a cuenta/);
    await usuario.click(d.getByRole("button", { name: "Sí, dejar a cuenta" }));
    await screen.findByRole("status");
    await usuario.click(screen.getByRole("tab", { name: /Casa editora/ }));
    const antes = datos.colportores.find((c) => c.id === "santiago-pereira")!;
    expect(fila("Santiago Pereira")).toHaveTextContent("Descuento por alquiler dejado a cuenta: $U 9.250");
    expect(fila("Santiago Pereira")).toHaveTextContent(`$U ${(antes.deuda - 9250).toLocaleString("es-UY").replace(/,/g, ".")}`);
  });
});

describe("41A·07 · los tres destinos, ya decididos", () => {
  it("cada fila dice su destino, quién y cuándo, y no ofrece la acción", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    const camila = fila("Camila Núñez");
    expect(camila).toHaveTextContent("Baja 07/10 · decidió Marta Pérez · 08/10 14:20");
    expect(within(camila).getByText("→ A cuenta del próximo depósito")).toBeInTheDocument();
    expect(within(fila("Emiliano Sosa")).getByText("■ Se lo quedó el coordinador")).toBeInTheDocument();
    const micaela = fila("Micaela Rodríguez");
    expect(within(micaela).getByText("↩ Devuelto al colportor")).toBeInTheDocument();
    expect(within(micaela).getByText(/devuelto/, { selector: ".sr-only" })).toBeInTheDocument();
    for (const nombre of ["Camila Núñez", "Emiliano Sosa", "Micaela Rodríguez"]) {
      expect(within(fila(nombre)).queryByRole("button")).not.toBeInTheDocument();
    }
  });
});

describe("Devolver resto · con una decisión anterior y un pago que llegó después", () => {
  it("la fila muestra lo ya decidido y lo nuevo; devolver anula solo los $U 3.000 y lo decidido queda como estaba", async () => {
    const { usuario, decidirAlquiler } = montar();
    await irAAlquilerDeRivera(usuario);
    const martin = fila("Martín Olivera");
    expect(martin).toHaveTextContent("$U 12.000 a cuenta del próximo depósito · decidió Marta Pérez · 12/10 14:20");
    expect(martin).toHaveTextContent("$U 3.000 pagados después: por decidir");
    expect(within(martin).getByText("◔ Por decidir")).toBeInTheDocument();

    const d = await abrir(usuario, "Martín Olivera");
    expect(d.getByRole("heading", { name: "¿Qué hacés con los $U 3.000 que pagó Martín después?" })).toBeInTheDocument();
    expect(d.getByRole("radio", { name: /Devolverlo al colportor/ })).toHaveAccessibleName(
      /Se anula solo el pago que llegó después\. Lo ya decidido queda como estaba\./,
    );
    await usuario.click(d.getByRole("radio", { name: /Devolverlo al colportor/ }));
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    expect(
      d.getByText(
        "Se anula solo lo que pagó después de la última decisión (20/10). Lo ya decidido ($U 12.000 a cuenta del próximo depósito) queda como estaba. Queda registrado que lo decidiste vos, hoy.",
      ),
    ).toBeInTheDocument();
    await usuario.click(d.getByRole("button", { name: "Sí, devolver" }));
    expect(decidirAlquiler).toHaveBeenCalledWith("martin-olivera", "devolver");
    expect(await screen.findByRole("status")).toHaveTextContent("Listo. Se devolvieron $U 3.000 a Martín Olivera.");

    const despues = fila("Martín Olivera");
    expect(despues).toHaveTextContent("$U 12.000 a cuenta del próximo depósito");
    expect(despues).toHaveTextContent("$U 3.000 devueltos al colportor · decidió Marta Pérez");
    expect(within(despues).getByText("→ A cuenta del próximo depósito")).toBeInTheDocument();
    expect(within(despues).getByText("↩ Devuelto al colportor")).toBeInTheDocument();
    expect(despues).toHaveTextContent("$U 12.000");
    expect(within(despues).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("la fila propia del coordinador", () => {
  it("su alquiler queda por decidir, no se ofrece la acción y dice por qué; no cuenta en el aviso ni en la ciudad", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    const marta = fila("Marta Pérez");
    expect(marta).toHaveTextContent("(vos)");
    expect(within(marta).getByText("◔ Por decidir")).toBeInTheDocument();
    expect(marta).toHaveTextContent("Es tu alquiler: lo decide otro coordinador de la campaña o un administrador.");
    expect(within(marta).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/^2 colportores dados de baja/)).toBeInTheDocument();
  });
});

describe("41B·01 · la campaña no cobra alquiler", () => {
  it("cada uno que pagó queda por decidir; quien no pagó dice «Sin pagos»", async () => {
    const base = armarCuentasSimuladas(AHORA);
    const datos: DatosDeCuentas = { ...base, alquilerPorColportor: 0, decisionesDeAlquiler: [] };
    const { usuario } = montar({ datos });
    await irAAlquilerDeRivera(usuario);
    expect(screen.getByText(/^Esta campaña no cobra alquiler y \d+ colportores habían pagado: \$U [\d.]+ por decidir\.$/)).toBeInTheDocument();
    const filas = within(screen.getByRole("table", { name: "Alquiler" })).getAllByRole("row").slice(1);
    const sinPagos = filas.filter((f) => f.textContent?.includes("Sin pagos"));
    const porDecidir = filas.filter((f) => f.textContent?.includes("◔ Por decidir"));
    expect(porDecidir.length).toBeGreaterThan(1);
    for (const f of sinPagos) expect(within(f).queryByRole("button")).not.toBeInTheDocument();
    const d = await abrir(usuario, "Bruno Techera").catch(() => null);
    if (d) expect(d.getByText(/^La campaña no cobra alquiler y Bruno Techera había pagado/)).toBeInTheDocument();
  });
});

describe("41B·02 · error al guardar", () => {
  it("dice que no cambió nada, ofrece «Reintentar» y al reintentar guarda", async () => {
    const decidirAlquiler = vi
      .fn<AccionesCuentas["decidirAlquiler"]>()
      .mockResolvedValueOnce({ ok: false, causa: "rechazado" })
      .mockResolvedValueOnce({ ok: false, causa: "sin-conexion" })
      .mockRejectedValueOnce(new Error("se cortó"));
    const { usuario, datos } = montar({ decidirAlquiler });
    decidirAlquiler.mockImplementation(crearAccionesSimuladas(datos).decidirAlquiler);
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Devolverlo al colportor/);
    await usuario.click(d.getByRole("button", { name: "Sí, devolver" }));
    expect(await d.findByRole("alert")).toHaveTextContent("No pudimos guardar la decisión. No cambió nada: probá de nuevo.");
    expect(d.getByRole("button", { name: "Reintentar" })).not.toHaveAttribute("aria-disabled", "true");
    expect(d.getByRole("button", { name: "Volver" })).toBeInTheDocument();
    expect(within(fila("Santiago Pereira")).getByText("◔ Por decidir")).toBeInTheDocument();

    await usuario.click(d.getByRole("button", { name: "Reintentar" }));
    expect(await d.findByRole("alert")).toHaveTextContent(/Sin conexión: no pudimos guardar la decisión/);
    await usuario.click(d.getByRole("button", { name: "Reintentar" }));
    expect(await d.findByRole("alert")).toHaveTextContent(/Sin conexión/);
    await usuario.click(d.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Se devolvieron $U 9.250");
    expect(decidirAlquiler).toHaveBeenCalledTimes(4);
  });

  it("muestra el texto del servidor cuando explica por qué", async () => {
    const { usuario } = montar({
      decidirAlquiler: async () => ({ ok: false, causa: "rechazado", mensaje: "No encontramos ese alquiler en tus campañas. Recargá la lista de cuentas." }),
    });
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Quedárselo/);
    await usuario.click(d.getByRole("button", { name: "Sí, quedármelo" }));
    expect(await d.findByRole("alert")).toHaveTextContent("No encontramos ese alquiler en tus campañas.");
  });

  it("si otra persona ya lo había decidido, cierra y avisa que no cambió nada", async () => {
    const { usuario } = montar({ decidirAlquiler: async () => ({ ok: true, valor: { yaEstaba: true } }) });
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Quedárselo/);
    await usuario.click(d.getByRole("button", { name: "Sí, quedármelo" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Eso ya estaba decidido y no cambió nada.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("41B·03 · sin conexión", () => {
  it("se ve el alquiler pero «Decidir» queda apagado, y vuelve al recuperar la conexión", async () => {
    const enLinea = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const { usuario, decidirAlquiler } = montar();
    await irAAlquilerDeRivera(usuario);
    expect(screen.getByText("Sin conexión. Podés ver el alquiler, pero no decidir hasta que vuelva.")).toBeInTheDocument();
    expect(screen.queryByText(/dados de baja tienen/)).not.toBeInTheDocument();
    expect(botonDecidir("Santiago Pereira")).toHaveAttribute("aria-disabled", "true");
    await usuario.click(botonDecidir("Santiago Pereira"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(decidirAlquiler).not.toHaveBeenCalled();

    enLinea.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(screen.queryByText(/^Sin conexión/)).not.toBeInTheDocument();
    expect(botonDecidir("Santiago Pereira")).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("casos límite", () => {
  it("Cancelar y Esc cierran sin mandar nada y el foco vuelve a «Decidir»; al reabrir no queda elegido nada", async () => {
    const { usuario, decidirAlquiler } = montar();
    await irAAlquilerDeRivera(usuario);
    let d = await abrir(usuario);
    await usuario.click(d.getByRole("radio", { name: /Quedárselo/ }));
    await usuario.click(d.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(botonDecidir("Santiago Pereira")).toHaveFocus();

    d = await abrir(usuario);
    for (const radio of d.getAllByRole("radio")) expect(radio).not.toBeChecked();
    await usuario.click(d.getByRole("radio", { name: /Quedárselo/ }));
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(botonDecidir("Santiago Pereira")).toHaveFocus();
    expect(decidirAlquiler).not.toHaveBeenCalled();
  });

  it("«Volver» lleva a elegir con el destino que estaba y se puede cambiar", async () => {
    const { usuario, decidirAlquiler } = montar();
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Quedárselo/);
    await usuario.click(d.getByRole("button", { name: "Volver" }));
    expect(d.getByRole("radio", { name: /Quedárselo/ })).toBeChecked();
    expect(d.getByRole("radio", { name: /Quedárselo/ })).toHaveFocus();
    await usuario.click(d.getByRole("radio", { name: /Dejarlo a cuenta/ }));
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    await usuario.click(d.getByRole("button", { name: "Sí, dejar a cuenta" }));
    expect(decidirAlquiler).toHaveBeenCalledWith("santiago-pereira", "a-cuenta");
  });

  it("el teclado: Tab no sale del diálogo y las flechas eligen el destino", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    const d = await abrir(usuario);
    await usuario.keyboard("{ArrowDown}");
    expect(d.getByRole("radio", { name: /Dejarlo a cuenta/ })).toBeChecked();
    await usuario.tab();
    expect(d.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await usuario.tab();
    expect(d.getByRole("button", { name: "Seguir" })).toHaveFocus();
    await usuario.tab();
    expect(dialogo()).toContainElement(document.activeElement as HTMLElement);
  });

  it("dos decisiones seguidas, una tras otra, se aplican las dos y el último aviso reemplaza al anterior", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    let d = await elegirYSeguir(usuario, /Quedárselo/);
    await usuario.click(d.getByRole("button", { name: "Sí, quedármelo" }));
    await screen.findByRole("status");
    d = await elegirYSeguir(usuario, /Devolverlo al colportor/, "Martín Olivera");
    await usuario.click(d.getByRole("button", { name: "Sí, devolver" }));
    expect(await screen.findByText(/Se devolvieron \$U 3\.000/)).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(within(fila("Santiago Pereira")).getByText("■ Se lo quedó el coordinador")).toBeInTheDocument();
    expect(screen.queryByText(/por decidir\.$/)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Alquiler/ })).toHaveFocus();
    expect(screen.getByRole("button", { name: /^Rivera/ })).not.toHaveTextContent("por decidir");
  });

  it("salir de la pestaña y volver conserva lo decidido", async () => {
    const { usuario } = montar();
    await irAAlquilerDeRivera(usuario);
    const d = await elegirYSeguir(usuario, /Quedárselo/);
    await usuario.click(d.getByRole("button", { name: "Sí, quedármelo" }));
    await screen.findByRole("status");
    await usuario.click(screen.getByRole("tab", { name: /Casa editora/ }));
    await usuario.click(screen.getByRole("tab", { name: /Alquiler/ }));
    expect(within(fila("Santiago Pereira")).getByText("■ Se lo quedó el coordinador")).toBeInTheDocument();
  });

  it("un nombre muy largo entra en el título del diálogo sin cortarse", async () => {
    const base = armarCuentasSimuladas(AHORA);
    const largo = "Santiago María de los Ángeles Pereira Fernández de la Concepción Rodríguez";
    const datos = { ...base, colportores: base.colportores.map((c) => (c.id === "santiago-pereira" ? { ...c, nombre: largo } : c)) };
    const { usuario } = montar({ datos });
    await irAAlquilerDeRivera(usuario);
    const d = await abrir(usuario, largo);
    expect(d.getByText(new RegExp(`^${largo} se dio de baja`))).toBeInTheDocument();
  });

  it("una ciudad sin bajas no muestra el aviso ni la columna con botones", async () => {
    const { usuario } = montar();
    await usuario.click(screen.getByRole("button", { name: /^Artigas/ }));
    await usuario.click(screen.getByRole("tab", { name: /Alquiler/ }));
    expect(within(screen.getByRole("tabpanel")).queryByText(/por decidir/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Decidir/ })).not.toBeInTheDocument();
  });
});
