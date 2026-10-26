import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BecaDeColportor, DatosEquipoPorCiudad, ResultadoBeca, TipoDeBeca } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { becasDePrueba, colportor, datosDePrueba } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";
import { olvidarUnidadDeAvance } from "./unidad-de-avance";

vi.setConfig({ testTimeout: 30_000 });

const sistemas = { id: "sis", nombre: "Ingeniería en Sistemas", elegidaEl: "2026-09-01" };

const COMPLETA_DE_SISTEMAS: BecaDeColportor = {
  carrera: sistemas,
  apuntaA: "completa",
  meta: { libros: 240, monto: 360000 },
  avance: { libros: 64, monto: 90000 },
};
const MEDIA_DE_SISTEMAS: BecaDeColportor = { ...COMPLETA_DE_SISTEMAS, apuntaA: "media", meta: { libros: 120, monto: 180000 } };

const SIN_BECA_DE_SISTEMAS: BecaDeColportor = { ...COMPLETA_DE_SISTEMAS, apuntaA: null, meta: null };

function conDiferido<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (error: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

/** Acciones de becas que contestan como la base: el tipo elegido fija la meta de Sistemas. */
function crearAcciones() {
  const asignarTipoDeBeca = vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(async (_id, tipo: TipoDeBeca | null): Promise<ResultadoBeca> => ({
    ok: true,
    beca: tipo === null ? SIN_BECA_DE_SISTEMAS : tipo === "completa" ? COMPLETA_DE_SISTEMAS : MEDIA_DE_SISTEMAS,
  }));
  const elegirCarrera = vi.fn<AccionesEquipo["elegirCarrera"]>(async (_id, carreraId): Promise<ResultadoBeca> => ({
    ok: true,
    beca: {
      carrera: { id: carreraId, nombre: carreraId === "teo" ? "Teología" : "Ingeniería en Sistemas", elegidaEl: "2026-10-21" },
      apuntaA: null,
      meta: null,
      avance: { libros: 0, monto: 0 },
    },
  }));
  return {
    jornadasParaAcompanar: vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async () => ({ ok: true, jornadas: [] })),
    registrarAcompanamiento: vi.fn<AccionesEquipo["registrarAcompanamiento"]>(),
    elegirCarrera,
    asignarTipoDeBeca,
  } satisfies AccionesEquipo;
}

function mostrar(datos: DatosEquipoPorCiudad = datosDePrueba(), acciones: AccionesEquipo = crearAcciones()) {
  const resultado = render(<EquipoVista datos={datos} acciones={acciones} />);
  return { ...resultado, acciones, usuario: userEvent.setup() };
}

type Usuario = ReturnType<typeof userEvent.setup>;
const irABecas = (usuario: Usuario) => usuario.click(screen.getByRole("button", { name: "Becas" }));
const fila = (nombre: RegExp | string) => screen.getByRole("row", { name: nombre });
const tabla = () => screen.getByRole("table", { name: "Becas de cada colportor" });
const apuntarA = (nombre: string, tipo: TipoDeBeca) =>
  screen.getByRole("button", { name: `Apuntar a ${tipo === "media" ? "media beca" : "beca completa"}: ${nombre}` });
const GRUPO_DE_CARRERA = "A qué beca apunta Emiliano Sosa";

beforeEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
});

afterEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
});

describe("Becas · artboard 33C-01, la tabla de cada colportor", () => {
  it("la pestaña «Becas» va entre «Zonas» y «Acompañamientos» y muestra las columnas del diseño y el estado", async () => {
    const { usuario } = mostrar();
    expect(screen.getAllByRole("button", { name: /^(Zonas|Becas|Acompañamientos)$/ }).map((b) => b.textContent)).toEqual(["Zonas", "Becas", "Acompañamientos"]);

    await irABecas(usuario);

    expect(screen.getByRole("button", { name: "Becas" })).toHaveAttribute("aria-pressed", "true");
    expect(within(tabla().querySelector("thead") as HTMLElement).getAllByRole("columnheader").map((c) => c.textContent?.replace(/[▲▼↕]/g, ""))).toEqual(["COLPORTOR", "CARRERA", "APUNTA A", "ESTADO", "AVANCE · LIBROS BONIFICABLES"]);
  });

  it("cada fila trae la carrera con «elegida el 01/09», a qué apunta y el avance en libros", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    const emiliano = within(fila(/^Emiliano Sosa/));
    expect(emiliano.getByText("Ingeniería en Sistemas")).toBeInTheDocument();
    expect(emiliano.getByText("elegida el 01/09")).toBeInTheDocument();
    expect(emiliano.getByText("64 de 120 libros · le faltan 56 · 53 %")).toBeInTheDocument();
    expect(apuntarA("Emiliano Sosa", "media")).toHaveAttribute("aria-pressed", "true");
    expect(apuntarA("Emiliano Sosa", "completa")).toHaveAttribute("aria-pressed", "false");
    expect(within(fila(/^Florencia Pintos/)).getByText("40 de 200 libros · le faltan 160 · 20 %")).toBeInTheDocument();
    expect(apuntarA("Florencia Pintos", "completa")).toHaveAttribute("aria-pressed", "true");
  });

  it("«Ver avance en» pasa la misma meta a compra a la CES, cambia el encabezado y se recuerda al volver", async () => {
    const { usuario, unmount } = mostrar();
    await irABecas(usuario);
    const grupo = screen.getByRole("group", { name: "Ver avance en" });
    expect(within(grupo).getByRole("button", { name: "Libros" })).toHaveAttribute("aria-pressed", "true");

    await usuario.click(within(grupo).getByRole("button", { name: "Compra a la CES" }));

    expect(within(tabla()).getByRole("columnheader", { name: "AVANCE · COMPRA A LA CES" })).toBeInTheDocument();
    expect(within(fila(/^Emiliano Sosa/)).getByText("$U 90.000 de $U 180.000 · le faltan $U 90.000 · 50 %")).toBeInTheDocument();
    // Cambiar la medida no cambia la meta ni lo que está marcado.
    expect(apuntarA("Emiliano Sosa", "media")).toHaveAttribute("aria-pressed", "true");

    unmount();
    olvidarUnidadDeAvance();
    const otra = mostrar();
    await irABecas(otra.usuario);
    expect(within(tabla()).getByRole("columnheader", { name: "AVANCE · COMPRA A LA CES" })).toBeInTheDocument();
  });

  it("el selector de medida solo aparece en «Becas»", async () => {
    const { usuario } = mostrar();
    expect(screen.queryByRole("group", { name: "Ver avance en" })).not.toBeInTheDocument();

    await irABecas(usuario);
    expect(screen.getByRole("group", { name: "Ver avance en" })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    expect(screen.queryByRole("group", { name: "Ver avance en" })).not.toBeInTheDocument();
  });

  it("sin carrera: botón «Elegir carrera», «—» en «Apunta a» y «Sin meta: falta la carrera»", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    const federico = within(fila(/^Federico Da Rosa/));
    expect(federico.getByRole("button", { name: "Elegir carrera de Federico Da Rosa" })).toHaveTextContent("Elegir carrera");
    expect(federico.getByText("—")).toBeInTheDocument();
    expect(federico.getByText("Sin meta: falta la carrera")).toBeInTheDocument();
    expect(federico.queryByRole("group")).not.toBeInTheDocument();
  });

  it("con carrera pero sin tipo: queda marcado «Sin beca» y dice «Sin meta: no apunta a ninguna beca»", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    const sofia = within(fila(/^Sofía Cabral/));
    expect(sofia.getByText("Sin meta: no apunta a ninguna beca")).toBeInTheDocument();
    expect(apuntarA("Sofía Cabral", "media")).toHaveAttribute("aria-pressed", "false");
    expect(apuntarA("Sofía Cabral", "completa")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Dejar sin beca: Sofía Cabral" })).toHaveAttribute("aria-pressed", "true");
  });

  it("la colportora sin zona figura al final, bajo «Sin zona asignada», con «Elegir carrera»", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    expect(within(tabla()).getByText("Sin zona asignada")).toBeInTheDocument();
    expect(within(fila(/^Rocío Benítez/)).getByRole("button", { name: "Elegir carrera de Rocío Benítez" })).toBeInTheDocument();
    // La franja de pendientes sigue avisando de que no tiene zona (en «Zonas» ya está en la tabla).
    expect(screen.getByText("Rocío Benítez no tiene zona asignada")).toBeInTheDocument();
  });

  it("al elegir una ciudad sigue en «Becas» y solo muestra a sus colportores", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));

    expect(screen.getByRole("button", { name: "Becas" })).toHaveAttribute("aria-pressed", "true");
    expect(fila(/^Emiliano Sosa/)).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /^Sofía Cabral/ })).not.toBeInTheDocument();
  });
});

describe("Becas · «Apunta a»: guardar desde la fila", () => {
  it("cambiar a «Completa» guarda, fija la meta nueva en las dos medidas y lo avisa", async () => {
    const { usuario, acciones } = mostrar();
    await irABecas(usuario);

    await usuario.click(apuntarA("Emiliano Sosa", "completa"));

    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(1);
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledWith("emiliano", "completa");
    expect(await within(fila(/^Emiliano Sosa/)).findByText("64 de 240 libros · le faltan 176 · 27 %")).toBeInTheDocument();
    expect(apuntarA("Emiliano Sosa", "completa")).toHaveAttribute("aria-pressed", "true");
    expect(apuntarA("Emiliano Sosa", "media")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("Emiliano Sosa ahora apunta a beca completa: meta de 240 libros y $U 360.000 a la CES.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("elegir por primera vez a qué apunta (sin tipo) deja la meta que el servidor fijó", async () => {
    const acciones = crearAcciones();
    acciones.asignarTipoDeBeca.mockResolvedValueOnce({ ok: true, beca: { ...MEDIA_DE_SISTEMAS, avance: { libros: 12, monto: 20000 } } });
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.click(apuntarA("Sofía Cabral", "media"));

    expect(await within(fila(/^Sofía Cabral/)).findByText("12 de 120 libros · le faltan 108 · 10 %")).toBeInTheDocument();
  });

  it("mientras guarda marca lo pedido y dice «Guardando…»; el avance viejo se queda hasta que contesta", async () => {
    const acciones = crearAcciones();
    const respuesta = conDiferido<ResultadoBeca>();
    acciones.asignarTipoDeBeca.mockReturnValueOnce(respuesta.promesa);
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.click(apuntarA("Emiliano Sosa", "completa"));

    expect(apuntarA("Emiliano Sosa", "completa")).toHaveAttribute("aria-pressed", "true");
    expect(within(fila(/^Emiliano Sosa/)).getByText("Guardando…")).toBeInTheDocument();
    expect(within(fila(/^Emiliano Sosa/)).getByText(/64 de 120 libros/)).toBeInTheDocument();

    await act(async () => respuesta.resolver({ ok: true, beca: COMPLETA_DE_SISTEMAS }));
    expect(within(fila(/^Emiliano Sosa/)).queryByText("Guardando…")).not.toBeInTheDocument();
    expect(within(fila(/^Emiliano Sosa/)).getByText(/64 de 240 libros/)).toBeInTheDocument();
  });

  it("doble toque: un solo guardado", async () => {
    const acciones = crearAcciones();
    acciones.asignarTipoDeBeca.mockReturnValueOnce(conDiferido<ResultadoBeca>().promesa);
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.dblClick(apuntarA("Emiliano Sosa", "completa"));

    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(1);
  });

  it("tocar lo que ya está marcado no manda nada", async () => {
    const { usuario, acciones } = mostrar();
    await irABecas(usuario);

    await usuario.click(apuntarA("Emiliano Sosa", "media"));

    expect(acciones.asignarTipoDeBeca).not.toHaveBeenCalled();
  });

  it("falla a mitad (sin conexión): avisa qué hacer, vuelve a lo guardado y el botón queda libre para reintentar", async () => {
    const acciones = crearAcciones();
    acciones.asignarTipoDeBeca.mockRejectedValueOnce(new Error("sin red"));
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.click(apuntarA("Emiliano Sosa", "completa"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para guardar la beca. Revisá la conexión y probá de nuevo.");
    expect(apuntarA("Emiliano Sosa", "media")).toHaveAttribute("aria-pressed", "true");
    expect(apuntarA("Emiliano Sosa", "completa")).toHaveAttribute("aria-pressed", "false");
    expect(within(fila(/^Emiliano Sosa/)).queryByText("Guardando…")).not.toBeInTheDocument();
    expect(within(fila(/^Emiliano Sosa/)).getByText("64 de 120 libros · le faltan 56 · 53 %")).toBeInTheDocument();

    await usuario.click(apuntarA("Emiliano Sosa", "completa"));
    expect(await within(fila(/^Emiliano Sosa/)).findByText("64 de 240 libros · le faltan 176 · 27 %")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(2);
  });

  it("un rechazo de la regla (carrera sin meta cargada) muestra el texto de la base y no cambia el avance", async () => {
    const acciones = crearAcciones();
    acciones.asignarTipoDeBeca.mockResolvedValueOnce({
      ok: false,
      sinMeta: true,
      mensaje: "Falta configurar la meta de esta carrera. Avisale al administrador para que la cargue.",
    });
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.click(apuntarA("Emiliano Sosa", "completa"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Falta configurar la meta de esta carrera. Avisale al administrador para que la cargue.");
    expect(apuntarA("Emiliano Sosa", "media")).toHaveAttribute("aria-pressed", "true");
  });

  it("dos toques seguidos antes de que conteste el primero: salen en orden y queda lo último que se tocó", async () => {
    const acciones = crearAcciones();
    const primera = conDiferido<ResultadoBeca>();
    acciones.asignarTipoDeBeca.mockReturnValueOnce(primera.promesa);
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.click(apuntarA("Emiliano Sosa", "completa"));
    await usuario.click(apuntarA("Emiliano Sosa", "media"));

    // El segundo espera su turno: no se manda hasta que contesta el primero.
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(1);
    expect(apuntarA("Emiliano Sosa", "media")).toHaveAttribute("aria-pressed", "true");

    await act(async () => primera.resolver({ ok: true, beca: COMPLETA_DE_SISTEMAS }));
    await waitFor(() => expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(2));
    expect(acciones.asignarTipoDeBeca.mock.calls.map(([, tipo]) => tipo)).toEqual(["completa", "media"]);
    await waitFor(() => expect(within(fila(/^Emiliano Sosa/)).queryByText("Guardando…")).not.toBeInTheDocument());
    expect(apuntarA("Emiliano Sosa", "media")).toHaveAttribute("aria-pressed", "true");
    expect(within(fila(/^Emiliano Sosa/)).getByText("64 de 120 libros · le faltan 56 · 53 %")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si falla el primero y sale bien el segundo, no queda el aviso viejo", async () => {
    const acciones = crearAcciones();
    const primera = conDiferido<ResultadoBeca>();
    acciones.asignarTipoDeBeca.mockReturnValueOnce(primera.promesa);
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);
    await usuario.click(apuntarA("Emiliano Sosa", "completa"));
    await usuario.click(apuntarA("Emiliano Sosa", "media"));

    await act(async () => primera.rechazar(new Error("sin red")));

    await waitFor(() => expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(fila(/^Emiliano Sosa/)).queryByText("Guardando…")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apuntarA("Emiliano Sosa", "media")).toHaveAttribute("aria-pressed", "true");
  });

  it("colportores distintos guardan en paralelo, sin esperarse", async () => {
    const acciones = crearAcciones();
    acciones.asignarTipoDeBeca.mockReturnValue(conDiferido<ResultadoBeca>().promesa);
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);

    await usuario.click(apuntarA("Emiliano Sosa", "completa"));
    await usuario.click(apuntarA("Florencia Pintos", "media"));

    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(2);
  });

  it("volver atrás y reentrar mientras guarda: sigue marcado lo pedido, no sale un segundo envío y la respuesta se anota", async () => {
    const acciones = crearAcciones();
    const respuesta = conDiferido<ResultadoBeca>();
    acciones.asignarTipoDeBeca.mockReturnValueOnce(respuesta.promesa);
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);
    await usuario.click(apuntarA("Emiliano Sosa", "completa"));

    await usuario.click(screen.getByRole("button", { name: "Zonas" }));
    await irABecas(usuario);

    expect(apuntarA("Emiliano Sosa", "completa")).toHaveAttribute("aria-pressed", "true");
    expect(within(fila(/^Emiliano Sosa/)).getByText("Guardando…")).toBeInTheDocument();
    await usuario.click(apuntarA("Emiliano Sosa", "completa"));
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledTimes(1);

    await act(async () => respuesta.resolver({ ok: true, beca: COMPLETA_DE_SISTEMAS }));
    expect(within(fila(/^Emiliano Sosa/)).getByText(/64 de 240 libros/)).toBeInTheDocument();
  });

  it("lo guardado sigue al cambiar de ciudad y de pestaña", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);
    await usuario.click(apuntarA("Emiliano Sosa", "completa"));
    await within(fila(/^Emiliano Sosa/)).findByText(/de 240 libros/);

    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    await irABecas(usuario);

    expect(within(fila(/^Emiliano Sosa/)).getByText(/64 de 240 libros/)).toBeInTheDocument();
  });
});

describe("Becas · «Elegir carrera»", () => {
  const abrir = async (usuario: Usuario, nombre = "Federico Da Rosa") => {
    await usuario.click(screen.getByRole("button", { name: `Elegir carrera de ${nombre}` }));
    return screen.getByRole("region", { name: `Elegir la carrera de ${nombre}` });
  };

  it("abre un panel con el catálogo y avisa que la carrera se elige una sola vez", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    const panel = within(await abrir(usuario));

    expect(panel.getByRole("heading", { name: "ELEGIR CARRERA · FEDERICO DA ROSA" })).toBeInTheDocument();
    expect(panel.getByText(/Se elige una sola vez: después no se cambia desde el panel y, si hubo un error, la corrige el administrador\./)).toBeInTheDocument();
    expect(panel.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Elegí una carrera",
      "Ingeniería en Sistemas",
      "Teología",
      "Contador Público (sin meta cargada)",
    ]);
    expect(panel.getByRole("combobox", { name: "Carrera" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Elegir carrera de Federico Da Rosa" })).toHaveAttribute("aria-expanded", "true");
  });

  it("«Guardar carrera» no hace nada hasta elegir una; con una elegida guarda, cierra el panel y enfoca «Media»", async () => {
    const { usuario, acciones } = mostrar();
    await irABecas(usuario);
    const panel = within(await abrir(usuario));

    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));
    expect(acciones.elegirCarrera).not.toHaveBeenCalled();

    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "teo");
    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));

    expect(acciones.elegirCarrera).toHaveBeenCalledWith("federico", "teo");
    const federico = within(fila(/^Federico Da Rosa/));
    expect(await federico.findByText("Teología")).toBeInTheDocument();
    expect(federico.getByText("elegida el 21/10")).toBeInTheDocument();
    expect(federico.getByText("Sin meta: no apunta a ninguna beca")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Elegir la carrera/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elegir carrera de Federico Da Rosa" })).not.toBeInTheDocument();
    await waitFor(() => expect(apuntarA("Federico Da Rosa", "media")).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent("Quedó guardado el cambio de Federico Da Rosa.");
  });

  it("después de elegirla se puede asignar el tipo en la misma fila", async () => {
    const { usuario, acciones } = mostrar();
    await irABecas(usuario);
    const panel = within(await abrir(usuario));
    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "sis");
    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));
    await within(fila(/^Federico Da Rosa/)).findByText("Ingeniería en Sistemas");

    await usuario.click(apuntarA("Federico Da Rosa", "completa"));

    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledWith("federico", "completa");
    expect(await within(fila(/^Federico Da Rosa/)).findByText("64 de 240 libros · le faltan 176 · 27 %")).toBeInTheDocument();
  });

  it("«Cancelar» cierra el panel sin guardar y devuelve el foco al botón", async () => {
    const { usuario, acciones } = mostrar();
    await irABecas(usuario);
    const panel = within(await abrir(usuario));

    await usuario.click(panel.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("region", { name: /Elegir la carrera/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elegir carrera de Federico Da Rosa" })).toHaveFocus();
    expect(acciones.elegirCarrera).not.toHaveBeenCalled();
  });

  it("el botón de la fila también cierra el panel", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);
    await abrir(usuario);

    await usuario.click(screen.getByRole("button", { name: "Elegir carrera de Federico Da Rosa" }));

    expect(screen.queryByRole("region", { name: /Elegir la carrera/ })).not.toBeInTheDocument();
  });

  it("doble envío: un solo guardado, y el botón dice «Guardando…» sin perder el foco", async () => {
    const acciones = crearAcciones();
    const respuesta = conDiferido<ResultadoBeca>();
    acciones.elegirCarrera.mockReturnValueOnce(respuesta.promesa);
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);
    const panel = within(await abrir(usuario));
    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "teo");

    await usuario.dblClick(panel.getByRole("button", { name: "Guardar carrera" }));

    expect(acciones.elegirCarrera).toHaveBeenCalledTimes(1);
    const guardando = panel.getByRole("button", { name: "Guardando…" });
    expect(guardando).toHaveAttribute("aria-disabled", "true");
    expect(guardando).toHaveFocus();
    await act(async () => respuesta.resolver({ ok: false, mensaje: "x" }));
  });

  it("falla a mitad: el panel sigue abierto con el aviso, el botón vuelve a quedar libre y se puede reintentar", async () => {
    const acciones = crearAcciones();
    acciones.elegirCarrera.mockRejectedValueOnce(new Error("sin red"));
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);
    const panel = within(await abrir(usuario));
    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "teo");

    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));

    expect(await panel.findByRole("alert")).toHaveTextContent("Necesitás conexión para guardar la beca. Revisá la conexión y probá de nuevo.");
    // El aviso está en el panel, no repetido en la fila.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(panel.getByRole("button", { name: "Guardar carrera" })).toHaveAttribute("aria-disabled", "false");
    expect(panel.getByRole("combobox", { name: "Carrera" })).toHaveValue("teo");

    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));
    expect(await within(fila(/^Federico Da Rosa/)).findByText("Teología")).toBeInTheDocument();
    expect(acciones.elegirCarrera).toHaveBeenCalledTimes(2);
  });

  it("un rechazo de la base (otra persona ya eligió la carrera) se muestra con su texto", async () => {
    const acciones = crearAcciones();
    acciones.elegirCarrera.mockResolvedValueOnce({
      ok: false,
      recargar: true,
      mensaje: "Este colportor ya tiene la carrera Teología. La carrera no se cambia desde el panel: si hubo un error, la corrige el administrador.",
    });
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);
    const panel = within(await abrir(usuario));
    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "sis");

    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));

    expect(await panel.findByRole("alert")).toHaveTextContent("Este colportor ya tiene la carrera Teología.");
  });

  it("si cierra el panel y la carrera no se pudo guardar, el aviso queda en la fila", async () => {
    const acciones = crearAcciones();
    const respuesta = conDiferido<ResultadoBeca>();
    acciones.elegirCarrera.mockReturnValueOnce(respuesta.promesa);
    const { usuario } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);
    const panel = within(await abrir(usuario));
    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "teo");
    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));
    await usuario.click(panel.getByRole("button", { name: "Cancelar" }));

    await act(async () => respuesta.resolver({ ok: false, mensaje: "No se pudo guardar la carrera." }));

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo guardar la carrera.");
    expect(screen.queryByRole("region", { name: /Elegir la carrera/ })).not.toBeInTheDocument();
  });

  it("catálogo vacío: lo dice y deja cerrar el panel", async () => {
    const datos = datosDePrueba({ becas: { ...becasDePrueba(), carreras: [] } });
    const { usuario } = mostrar(datos);
    await irABecas(usuario);
    const panel = within(await abrir(usuario));

    expect(panel.getByText("El catálogo de carreras está vacío. Avisale al administrador para que las cargue.")).toBeInTheDocument();
    expect(panel.queryByRole("combobox")).not.toBeInTheDocument();
    await usuario.click(panel.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("region", { name: /Elegir la carrera/ })).not.toBeInTheDocument();
  });

  it("abre un panel por vez: abrir el de otra fila cierra el anterior", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);
    await abrir(usuario);

    await abrir(usuario, "Rocío Benítez");

    expect(screen.getAllByRole("region", { name: /Elegir la carrera/ })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Elegir la carrera de Rocío Benítez" })).toBeInTheDocument();
  });
});

describe("Becas · estados y datos límite", () => {
  it("sin la fuente de becas conectada dice por qué no hay tabla, en vez de mostrarla vacía", async () => {
    const { usuario } = mostrar(datosDePrueba({ becas: null }));
    await irABecas(usuario);

    expect(screen.getByRole("status")).toHaveTextContent("Las becas todavía no están conectadas a la base de datos.");
    expect(screen.queryByRole("table", { name: "Becas de cada colportor" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Ver avance en" })).not.toBeInTheDocument();
  });

  it("sin colportores en la campaña muestra el mensaje de siempre", async () => {
    const { usuario } = mostrar(datosDePrueba({ colportores: [] }));
    await irABecas(usuario);

    expect(screen.getByText(/Todavía no hay colportores en esta campaña/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("un colportor que las becas no traen figura sin carrera, en vez de romper la tabla", async () => {
    const datos = datosDePrueba();
    datos.colportores.push(colportor({ id: "nuevo", nombre: "Gabriela Nuevo" }));
    const { usuario } = mostrar(datos);
    await irABecas(usuario);

    expect(within(fila(/^Gabriela Nuevo/)).getByRole("button", { name: "Elegir carrera de Gabriela Nuevo" })).toBeInTheDocument();
  });

  it("la meta cumplida o superada dice «meta alcanzada» con la barra llena", async () => {
    const datos = datosDePrueba();
    if (datos.becas) datos.becas.porColportor.emiliano = { ...MEDIA_DE_SISTEMAS, avance: { libros: 150, monto: 200000 } };
    const { usuario } = mostrar(datos);
    await irABecas(usuario);

    expect(within(fila(/^Emiliano Sosa/)).getByText("150 de 120 libros · meta alcanzada · 125 %")).toBeInTheDocument();
  });

  it("listas largas: 150 colportores en una ciudad", async () => {
    const datos = datosDePrueba();
    const muchos = Array.from({ length: 150 }, (_, i) => colportor({ id: `c${i}`, nombre: `Colportor Número ${i}` }));
    datos.colportores.push(...muchos);
    for (const c of muchos) datos.becas!.porColportor[c.id] = MEDIA_DE_SISTEMAS;
    const { usuario } = mostrar(datos);
    await irABecas(usuario);

    expect(within(tabla()).getAllByRole("row")).toHaveLength(1 + 4 + 155);
    expect(within(fila(/^Colportor Número 149/)).getByText("64 de 120 libros · le faltan 56 · 53 %")).toBeInTheDocument();
  });

  it("nombres y carreras largos, sin espacios, parten en vez de salirse de la fila", async () => {
    const largo = "Hipercalifragilisticoespialidoso".repeat(3);
    const datos = datosDePrueba();
    datos.colportores.push(colportor({ id: "largo", nombre: largo }));
    datos.becas!.porColportor.largo = { ...MEDIA_DE_SISTEMAS, carrera: { id: "sis", nombre: `Ingeniería ${largo}`, elegidaEl: "2026-09-01" } };
    const { usuario } = mostrar(datos);
    await irABecas(usuario);

    const celdas = within(fila(new RegExp(`^${largo.slice(0, 20)}`))).getAllByRole("cell");
    expect(screen.getByRole("rowheader", { name: largo })).toContainHTML("wrap-anywhere");
    expect(celdas[0].innerHTML).toContain("wrap-anywhere");
  });
});

describe("Becas · accesibilidad", () => {
  async function axeDe(nodo: HTMLElement) {
    const resultado = await axe.run(nodo, {
      rules: { "color-contrast": { enabled: false } },
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
    });
    return resultado.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  }

  it("la tabla de becas, con un panel «Elegir carrera» abierto, no tiene violaciones", async () => {
    const { usuario, container } = mostrar();
    await irABecas(usuario);
    await usuario.click(screen.getByRole("button", { name: "Elegir carrera de Federico Da Rosa" }));

    expect(await axeDe(container)).toEqual([]);
  });

  it("el aviso de un guardado fallido tampoco", async () => {
    const acciones = crearAcciones();
    acciones.asignarTipoDeBeca.mockRejectedValueOnce(new Error("sin red"));
    const { usuario, container } = mostrar(datosDePrueba(), acciones);
    await irABecas(usuario);
    await usuario.click(apuntarA("Emiliano Sosa", "completa"));
    await screen.findByRole("alert");

    expect(await axeDe(container)).toEqual([]);
  });

  it("cada grupo «Apunta a» tiene nombre propio", async () => {
    const { usuario } = mostrar();
    await irABecas(usuario);

    expect(screen.getByRole("group", { name: GRUPO_DE_CARRERA })).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: /^A qué beca apunta/ })).toHaveLength(3);
  });
});
