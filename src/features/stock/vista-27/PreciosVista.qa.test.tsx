import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AccionesPrecios,
  CambioDePrecio,
  DatosDePrecios,
  ResultadoDeGuardado,
} from "@/datos/precios";
import {
  CIUDADES_SIMULADAS,
  crearDatosDePreciosSimulados,
} from "@/datos/precios/simulado";
import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { PreciosVista } from "./PreciosVista";

/**
 * QA de la vista 27 (PR #137, HU-CAT-005). Complementa a `PreciosVista.test.tsx`: foco tras guardar/descartar, validación de
 * entradas raras, la confirmación de cambios grandes en el reintento automático y el aviso de un guardado de otra pestaña.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const ok: ResultadoDeGuardado = { ok: true };

function acciones(
  responder: (
    ciudadId: string,
    cambios: CambioDePrecio[],
  ) => Promise<ResultadoDeGuardado> | ResultadoDeGuardado = () => ok,
) {
  return {
    guardarPrecios: vi.fn(async (ciudadId: string, cambios: CambioDePrecio[]) =>
      responder(ciudadId, cambios),
    ),
  } satisfies AccionesPrecios;
}

function diferida() {
  let resolver!: (r: ResultadoDeGuardado) => void;
  const promesa = new Promise<ResultadoDeGuardado>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

function montar(
  datos: DatosDePrecios = crearDatosDePreciosSimulados(),
  a = acciones(),
) {
  render(<PreciosVista datos={datos} acciones={a} />);
  return a;
}

const pestana = (nombre: RegExp) => screen.getByRole("tab", { name: nombre });
const abrir = (nombre: RegExp) => userEvent.click(pestana(nombre));
const campo = (producto: string, ciudad = "Montevideo") =>
  screen.getByRole("textbox", { name: `Precio de ${producto} en ${ciudad}` });
const guardar = () =>
  screen.getByRole("button", {
    name: /^(Guardar cambios|Guardando…|Reintentar)$/,
  });
const escribir = (producto: string, texto: string, ciudad?: string) =>
  fireEvent.change(campo(producto, ciudad), { target: { value: texto } });

afterEach(() => {
  reiniciarTrabajoPendiente();
  vi.restoreAllMocks();
});

describe("QA #64 · el foco no se pierde al terminar de guardar o descartar", () => {
  it("QA #64: «Descartar» saca la barra con el botón que tenía el foco y el foco cae al <body>", async () => {
    montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(
      screen.queryByRole("button", { name: "Descartar" }),
    ).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("QA #64: guardar con éxito saca la barra (con el botón que tenía el foco) y el foco cae al <body>", async () => {
    montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    await screen.findByText(/Guardamos 1 precio/);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("QA #64: «Guardar igual» del diálogo de cambios grandes: al terminar el foco cae al <body>", async () => {
    montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "5000");
    await userEvent.click(guardar());
    await userEvent.click(
      await screen.findByRole("button", { name: "Guardar igual" }),
    );
    await screen.findByText(/Guardamos 1 precio/);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("si el guardado falla, la barra sigue y el foco queda en el botón (ahora «Reintentar»)", async () => {
    montar(
      undefined,
      acciones(() => ({ ok: false, causa: "rechazado", mensaje: "No." })),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    await screen.findByText("No.");
    expect(document.activeElement).toBe(guardar());
    expect(guardar()).toHaveTextContent("Reintentar");
  });
});

describe("QA #64 · validación de lo que se tipea en el precio", () => {
  const INVALIDOS: [string, string][] = [
    ["solo espacios", "   "],
    ["vacío tras borrar", ""],
    ["con centavos y coma", "1900,50"],
    ["con centavos y punto", "1900.50"],
    ["negativo", "-3"],
    ["cero", "0"],
    ["ceros", "0000"],
    ["letras", "abc"],
    ["notación científica", "5e3"],
    ["emoji", "💰💰"],
    ["número con emoji", "2700 💸"],
    ["dígitos de ancho completo", "２７００"],
    ["texto pegado larguísimo", "9".repeat(5000)],
    ["párrafo pegado", "Quiero que valga dos mil setecientos ".repeat(200)],
    ["inyección", "<img src=x onerror=alert(1)>"],
    ["miles mal puestos", "1.50.0"],
  ];

  it.each(INVALIDOS)(
    "%s: marca la fila, frena «Guardar cambios», no manda nada y conserva lo tipeado",
    async (_n, texto) => {
      const a = montar();
      await abrir(/^Montevideo/);
      escribir("Salud y Hogar", texto);
      expect(campo("Salud y Hogar")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("1 cambio sin guardar")).toBeInTheDocument();
      expect(
        screen.getByText("Corregí 1 precio para poder guardar."),
      ).toBeInTheDocument();
      expect(guardar()).toHaveAttribute("aria-disabled", "true");
      await userEvent.click(guardar());
      expect(a.guardarPrecios).not.toHaveBeenCalled();
      expect(campo("Salud y Hogar")).toHaveValue(texto);
      // El aviso del campo habla de lo que hay que hacer y no repite lo pegado.
      const error = screen
        .getAllByRole("alert")
        .find((n) => /precio/i.test(n.textContent ?? ""));
      expect(error?.textContent?.length ?? 0).toBeLessThan(120);
    },
  );

  it.each([
    ["con puntos de miles", "2.700", 2700],
    ["con $U adelante", "$U 2700", 2700],
    ["con espacios alrededor", "  2700  ", 2700],
    ["con ceros adelante", "002700", 2700],
    ["el tope técnico", "21474836", 21474836],
  ])(
    "%s: es un precio válido y se manda como entero",
    async (_n, texto, esperado) => {
      const a = montar();
      await abrir(/^Montevideo/);
      escribir("Salud y Hogar", texto);
      expect(campo("Salud y Hogar")).not.toHaveAttribute("aria-invalid");
      const confirmar = esperado > 2600 * 1.2 || esperado < 2600 * 0.8;
      await userEvent.click(guardar());
      if (confirmar)
        await userEvent.click(
          await screen.findByRole("button", { name: "Guardar igual" }),
        );
      await waitFor(() => expect(a.guardarPrecios).toHaveBeenCalledTimes(1));
      expect(
        (a.guardarPrecios.mock.calls[0][1] as CambioDePrecio[])[0].precio,
      ).toBe(esperado);
    },
  );

  it("pasarse del tope técnico dice el máximo", async () => {
    montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "21474837");
    expect(screen.getByText(/El precio no puede pasar de/)).toBeInTheDocument();
  });

  it("un error de un precio se corrige y el cambio vuelve a contar sin perder el resto de lo tipeado", async () => {
    const a = montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(
      screen.getByRole("button", { name: "+ Excepción: Nuestros Hijos" }),
    );
    escribir("Nuestros Hijos", "💰");
    expect(screen.getByText("2 cambios sin guardar")).toBeInTheDocument();
    expect(guardar()).toHaveAttribute("aria-disabled", "true");
    escribir("Nuestros Hijos", "2000");
    await userEvent.click(guardar());
    await waitFor(() => expect(a.guardarPrecios).toHaveBeenCalledTimes(1));
    expect(a.guardarPrecios.mock.calls[0][1]).toHaveLength(2);
  });
});

describe("QA #64 · reintento automático al volver internet", () => {
  it("un cambio grande tipeado mientras el guardado está en cola no sale sin la confirmación de 27A·03", async () => {
    let intento = 0;
    const a = montar(
      undefined,
      acciones(() =>
        ++intento === 1 ? { ok: false, causa: "sin-conexion" } : ok,
      ),
    );
    await abrir(/^Montevideo/);
    escribir("El Deseado de todas las gentes", "410");
    await userEvent.click(guardar());
    await screen.findByText(/se guardan cuando vuelva internet/);
    // Mientras está en cola, la persona sube otro precio al doble.
    escribir("Salud y Hogar", "5200");
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    // Lo esperado: el cambio grande pide confirmar antes de mandarse (el guardado automático no debería llevarlo).
    const mandado =
      a.guardarPrecios.mock.calls.length > 1
        ? (a.guardarPrecios.mock.calls[1][1] as CambioDePrecio[])
        : [];
    expect(mandado.some((c) => c.precio === 5200)).toBe(false);
  });
});

describe("QA #64 · un guardado en camino mientras la persona cambia de pestaña", () => {
  it("lo editado en la otra ciudad se conserva y el guardado de la primera termina bien", async () => {
    const d = diferida();
    const a = montar(
      undefined,
      acciones((ciudad) =>
        ciudad === CIUDADES_SIMULADAS[0].id ? d.promesa : ok,
      ),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    await abrir(/^Las Piedras/);
    await userEvent.click(
      screen.getByRole("button", { name: "+ Excepción: Salud y Hogar" }),
    );
    escribir("Salud y Hogar", "2500", "Las Piedras");
    await act(async () => d.resolver(ok));
    expect(screen.getByText("1 cambio sin guardar")).toBeInTheDocument();
    expect(campo("Salud y Hogar", "Las Piedras")).toHaveValue("2500");
    await abrir(/^Montevideo/);
    expect(campo("Salud y Hogar")).toHaveValue("2700");
    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);
  });
});

describe("QA #64 · el error de guardado se ve donde está «Reintentar»", () => {
  it("QA #64: el aviso de error vive arriba de la tabla; con la tabla scrolleada la barra fija solo dice «Reintentar» (Chromium 1280×520: aviso a -178 px)", async () => {
    montar(
      undefined,
      acciones(() => ({ ok: false, causa: "rechazado" })),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    await screen.findByText(/No pudimos guardar los cambios/);
    // La barra fija de abajo es lo único que se ve con la tabla larga: tiene que decir que falló, no solo cambiar el botón.
    const barra = guardar().closest("div.sticky") as HTMLElement;
    expect(barra.textContent).toMatch(/No pudimos guardar/);
  });
});

describe("QA #64 · el aviso de error de guardado no sobrevive a lo que describe", () => {
  it.skip("QA #64: tras un error, revertir a mano la única edición deja el aviso «Siguen marcados» sin nada marcado", async () => {
    montar(
      undefined,
      acciones(() => ({ ok: false, causa: "rechazado" })),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    await screen.findByText(/No pudimos guardar los cambios/);
    await userEvent.click(
      screen.getByRole("button", { name: "Revertir: Salud y Hogar" }),
    );
    expect(screen.queryByText(/Siguen marcados/)).not.toBeInTheDocument();
  });
});

describe("QA #64 · privacidad", () => {
  it("el aviso de error no vuelca el precio ni el nombre de la ciudad en la consola", async () => {
    const espia = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    montar(
      undefined,
      acciones(() => Promise.reject(new Error("boom"))),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    await screen.findByText(/No pudimos guardar los cambios/);
    const salida = JSON.stringify([...espia.mock.calls, ...log.mock.calls]);
    expect(salida).not.toMatch(/2700|Montevideo/);
  });
});
