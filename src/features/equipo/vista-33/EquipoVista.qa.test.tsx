import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import ErrorEquipo from "@/app/equipo/error";
import CargandoEquipo from "@/app/equipo/loading";
import type { JornadaParaAcompanar, ResultadoAcompanamiento, ResultadoJornadas } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { colportor, datosDePrueba, HOY } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";
import { SinCampaniaParaEquipo } from "./SinCampaniaParaEquipo";

/**
 * QA de la vista 33 (PR #75, issue #63): los escenarios de HU-JOR-004 con su texto, los cinco estados, los avisos de error
 * con salida, los casos límite de «Registrar acompañamiento», axe por estado y la privacidad. Los tests con `skip`
 * documentan un hallazgo del QA: el implementador saca el `skip` cuando lo arregla.
 */

const J1: JornadaParaAcompanar = { id: "j1", dia: "2026-10-20", horas: 5.5, acompanante: null, acompananteEsVos: false };
const J2: JornadaParaAcompanar = { id: "j2", dia: "2026-10-19", horas: 4, acompanante: "Tomás Ibarra", acompananteEsVos: false };
const J3: JornadaParaAcompanar = { id: "j3", dia: "2026-10-17", horas: 3.2, acompanante: null, acompananteEsVos: false };

const ok = (dia: string): ResultadoAcompanamiento => ({ ok: true, dia, acompanante: "Mariana Pérez", yaEstaba: false, origen: null, nota: null });

function acciones(jornadas: JornadaParaAcompanar[] = [J1, J2, J3]) {
  return {
    jornadasParaAcompanar: vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async (): Promise<ResultadoJornadas> => ({ ok: true, jornadas })),
    registrarAcompanamiento: vi.fn<AccionesEquipo["registrarAcompanamiento"]>(async (id) => ok(jornadas.find((j) => j.id === id)?.dia ?? HOY)),
    elegirCarrera: vi.fn<AccionesEquipo["elegirCarrera"]>(async () => ({ ok: false, mensaje: "Sin becas en este test." })),
    asignarTipoDeBeca: vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(async () => ({ ok: false, mensaje: "Sin becas en este test." })),
  } satisfies AccionesEquipo;
}

function mostrar(datos = datosDePrueba(), a: AccionesEquipo = acciones()) {
  const r = render(<EquipoVista datos={datos} acciones={a} />);
  return { ...r, a, u: userEvent.setup() };
}

type Usuario = ReturnType<typeof userEvent.setup>;
const verAcompanamientos = (u: Usuario, ciudad?: string) =>
  (async () => {
    if (ciudad) await u.click(screen.getByRole("button", { name: new RegExp(`^${ciudad}`) }));
    await u.click(screen.getByRole("button", { name: "Acompañamientos" }));
  })();
const fila = (nombre: RegExp | string) => screen.getByRole("row", { name: nombre });
const abrirRegistro = async (u: Usuario, nombre: string) => {
  await u.click(screen.getByRole("button", { name: `Registrar acompañamiento de ${nombre}` }));
  await screen.findByRole("list", { name: `Jornadas terminadas de ${nombre}` });
};
const registrarJ = (nombre: string, cuando: string) =>
  screen.getByRole("button", { name: `Registrar acompañamiento en la jornada de ${nombre} del ${cuando}` });

function conDiferido<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

afterEach(() => vi.restoreAllMocks());

describe("QA #63 · HU-JOR-004, criterios de aceptación", () => {
  it("Escenario «Ver el historial»: acompañé al colportor el 02/10 y el 09/10 → veo las dos jornadas con su fecha y los días cuentan desde el 09/10", async () => {
    const datos = datosDePrueba({
      colportores: [
        colportor({
          id: "x",
          nombre: "Colportor X",
          acompanamientos: [
            { jornadaId: "a", dia: "2026-10-09", horas: 4, acompanante: "Mariana Pérez", acompananteEsVos: true, origen: null, nota: null },
            { jornadaId: "b", dia: "2026-10-02", horas: 5, acompanante: "Mariana Pérez", acompananteEsVos: true, origen: null, nota: null },
          ],
        }),
      ],
    });
    const { u } = mostrar(datos);
    await verAcompanamientos(u);
    await u.click(screen.getByRole("button", { name: "Ver historial de Colportor X" }));

    const historial = screen.getByRole("region", { name: "Historial de acompañamientos de Colportor X" });
    const items = within(historial).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("vie 09/10");
    expect(items[1]).toHaveTextContent("vie 02/10");
    // 21/10 − 09/10 = 12 días corridos
    expect(fila(/^Colportor X/)).toHaveTextContent("hace 12 días");
    expect(fila(/^Colportor X/)).toHaveTextContent("último: vie 09/10");
  });

  it("Escenario «Colportor nunca acompañado»: dice «Nunca», cuenta los días desde el inicio de la campaña y el historial lo explica", async () => {
    const { u } = mostrar();
    await verAcompanamientos(u, "Rivera");
    expect(fila(/^Florencia Pintos/)).toHaveTextContent("Nunca");
    expect(fila(/^Florencia Pintos/)).toHaveTextContent("50 días desde el inicio");
    await u.click(screen.getByRole("button", { name: "Ver historial de Florencia Pintos" }));
    expect(screen.getByRole("region", { name: /Historial de acompañamientos de Florencia/ })).toHaveTextContent(
      "Todavía no se lo acompañó en esta campaña.",
    );
  });

  it("Escenario «Agregar acompañamiento retrospectivo»: registra sobre la jornada elegida, una sola vez, con el coordinador de la sesión", async () => {
    const { u, a } = mostrar();
    await verAcompanamientos(u, "Rivera");
    await abrirRegistro(u, "Florencia Pintos");
    expect(a.jornadasParaAcompanar).toHaveBeenCalledWith("florencia");
    await u.click(registrarJ("Florencia Pintos", "mar 20/10"));

    await waitFor(() => expect(a.registrarAcompanamiento).toHaveBeenCalledTimes(1));
    expect(a.registrarAcompanamiento).toHaveBeenCalledWith("j1", {});
    expect(await screen.findByRole("status")).toHaveTextContent("Acompañamiento registrado: jornada de Florencia Pintos, mar 20/10.");
    expect(fila(/^Florencia Pintos/)).toHaveTextContent("ayer");
  });
});

describe("QA #63 · los cinco estados", () => {
  it("cargando: el texto dice qué se espera (nunca un spinner sin contexto)", () => {
    render(<CargandoEquipo />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando el equipo de la campaña…");
  });

  it("vacío: sin colportores o en una ciudad vacía, dice qué hacer", async () => {
    const { u } = mostrar(datosDePrueba({ colportores: [] }));
    expect(screen.getByRole("status")).toHaveTextContent("Añadilos con «+ Añadir colportor»");
    await u.click(screen.getByRole("button", { name: /^Bella Unión/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Cuando asignes alguno a una de sus zonas, aparece acá.");
    expect(screen.getByRole("link", { name: "+ Añadir colportor" })).toHaveAttribute("href", "/equipo/anadir");
  });

  it("sin campaña: dice por qué no hay nada que mostrar y qué pasa cuando haya una", () => {
    render(<SinCampaniaParaEquipo />);
    expect(screen.getByRole("status")).toHaveTextContent("No tenés una campaña en curso ni por empezar.");
  });

  it("error de la ruta: aviso con «Reintentar» a mano y sin detalle técnico", async () => {
    const retry = vi.fn();
    render(<ErrorEquipo error={new Error("boom: token=abc")} retry={retry} />);
    expect(screen.getByRole("alert")).not.toHaveTextContent("token");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("sin conexión al traer las jornadas: «Necesitás conexión para traer las jornadas» y «Reintentar» las vuelve a pedir", async () => {
    const a = acciones();
    a.jornadasParaAcompanar.mockRejectedValueOnce(new Error("fetch failed"));
    const { u } = mostrar(datosDePrueba(), a);
    await verAcompanamientos(u, "Rivera");
    await u.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Necesitás conexión para traer las jornadas.");
    await u.click(within(alerta).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("list", { name: /Jornadas terminadas de Florencia/ })).toBeInTheDocument();
  });

  it("sin conexión al registrar: «Necesitás conexión para registrar el acompañamiento» en la jornada y el botón vuelve a estar disponible", async () => {
    const a = acciones();
    a.registrarAcompanamiento.mockRejectedValueOnce(new Error("fetch failed"));
    const { u } = mostrar(datosDePrueba(), a);
    await verAcompanamientos(u, "Rivera");
    await abrirRegistro(u, "Florencia Pintos");
    await u.click(registrarJ("Florencia Pintos", "mar 20/10"));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Necesitás conexión para registrar el acompañamiento.");
    const boton = registrarJ("Florencia Pintos", "mar 20/10");
    expect(boton).not.toHaveAttribute("aria-disabled", "true");
    expect(boton).toHaveTextContent("Registrar");
    // lo tipeado/elegido no se pierde: sigue el panel abierto y se puede reintentar con éxito
    await u.click(boton);
    await waitFor(() => expect(a.registrarAcompanamiento).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toHaveTextContent("Acompañamiento registrado");
  });

  it("éxito: avisa con un estado que el lector de pantalla anuncia, y la jornada pasa a decir quién acompañó", async () => {
    const { u } = mostrar();
    await verAcompanamientos(u, "Rivera");
    await abrirRegistro(u, "Florencia Pintos");
    await u.click(registrarJ("Florencia Pintos", "mar 20/10"));
    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent("Acompañamiento registrado");
    const lista = screen.getByRole("list", { name: /Jornadas terminadas de Florencia/ });
    expect(within(lista).getAllByText(/Acompañó Mariana Pérez/).length).toBeGreaterThan(0);
  });
});

describe("QA #63 · casos límite de «Registrar acompañamiento»", () => {
  it("dos acciones superpuestas: si la segunda falla mientras la primera sigue en vuelo, solo la segunda vuelve a habilitarse y la primera termina bien", async () => {
    const a = acciones();
    const primera = conDiferido<ResultadoAcompanamiento>();
    a.registrarAcompanamiento.mockImplementation((id) => (id === "j1" ? primera.promesa : Promise.reject(new Error("fetch failed"))));
    const { u } = mostrar(datosDePrueba(), a);
    await verAcompanamientos(u, "Rivera");
    await abrirRegistro(u, "Florencia Pintos");

    await u.click(registrarJ("Florencia Pintos", "mar 20/10"));
    await u.click(registrarJ("Florencia Pintos", "sáb 17/10"));
    await screen.findByText(/Necesitás conexión para registrar el acompañamiento./);
    expect(registrarJ("Florencia Pintos", "sáb 17/10")).toHaveTextContent("Registrar");
    expect(registrarJ("Florencia Pintos", "mar 20/10")).toHaveTextContent("Registrando…");

    await act(async () => primera.resolver(ok("2026-10-20")));
    expect(await screen.findByText(/Acompañamiento registrado: jornada de Florencia Pintos, mar 20\/10/)).toBeInTheDocument();
    expect(fila(/^Florencia Pintos/)).toHaveTextContent("ayer");
    // la que falló sigue disponible: ningún estado «ocupado» quedó trabado
    expect(registrarJ("Florencia Pintos", "sáb 17/10")).not.toHaveAttribute("aria-disabled", "true");
  });

  it("un rechazo con recarga cuya recarga también falla deja una salida («Reintentar») y no un panel mudo", async () => {
    const a = acciones();
    a.registrarAcompanamiento.mockResolvedValueOnce({ ok: false, mensaje: "Esta jornada ya figura acompañada por Tomás Ibarra.", recargar: true });
    const { u } = mostrar(datosDePrueba(), a);
    await verAcompanamientos(u, "Rivera");
    await abrirRegistro(u, "Florencia Pintos");
    a.jornadasParaAcompanar.mockRejectedValueOnce(new Error("fetch failed"));
    await u.click(registrarJ("Florencia Pintos", "mar 20/10"));

    const alerta = await screen.findByRole("alert");
    expect(within(alerta).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    await u.click(within(alerta).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("list", { name: /Jornadas terminadas de Florencia/ })).toBeInTheDocument();
  });

  it("una respuesta de «ya figuraba a tu nombre» no suma un segundo acompañamiento a la fila", async () => {
    const a = acciones();
    a.registrarAcompanamiento.mockResolvedValue({ ok: true, dia: "2026-10-20", acompanante: "Mariana Pérez", yaEstaba: true, origen: null, nota: null });
    const { u } = mostrar(datosDePrueba(), a);
    await verAcompanamientos(u, "Rivera");
    await abrirRegistro(u, "Florencia Pintos");
    await u.click(registrarJ("Florencia Pintos", "mar 20/10"));
    await screen.findByText(/Esa jornada ya figuraba a tu nombre/);
    await u.click(screen.getByRole("button", { name: "Cerrar" }));
    await abrirRegistro(u, "Florencia Pintos");
    // vuelve a registrar la misma desde el panel nuevo: el total sigue en 1 (no se duplica por jornada)
    await u.click(registrarJ("Florencia Pintos", "sáb 17/10"));
    await waitFor(() => expect(a.registrarAcompanamiento).toHaveBeenCalledTimes(2));
    await screen.findByText(/Esa jornada ya figuraba a tu nombre/);
  });

  it("volver a entrar al registro tras un error de carga: el estado de cargando no queda trabado", async () => {
    const a = acciones();
    a.jornadasParaAcompanar.mockRejectedValueOnce(new Error("fetch failed"));
    const { u } = mostrar(datosDePrueba(), a);
    await verAcompanamientos(u, "Rivera");
    await u.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    await screen.findByRole("alert");
    await u.click(screen.getByRole("button", { name: "Cerrar" }));
    await abrirRegistro(u, "Florencia Pintos");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cargando las jornadas/)).not.toBeInTheDocument();
  });

  it("datos límite: un nombre con HTML, emoji y 200 caracteres sin espacios se muestra como texto y no rompe los nombres accesibles", async () => {
    const raro = `<img src=x onerror=alert(1)>😀${"Ñ".repeat(200)}`;
    const datos = datosDePrueba({ colportores: [colportor({ id: "raro", nombre: raro })] });
    const { u, container } = mostrar(datos);
    expect(container.querySelector("img")).toBeNull();
    await verAcompanamientos(u);
    expect(screen.getByRole("button", { name: `Registrar acompañamiento de ${raro}` })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: `Ver historial de ${raro}` }));
    expect(screen.getByRole("region", { name: `Historial de acompañamientos de ${raro}` })).toBeInTheDocument();
  });

  it("datos límite: una jornada en curso (sin horas) o un acompañamiento posterior a hoy no dan días negativos ni «NaN»", async () => {
    const datos = datosDePrueba({
      colportores: [
        colportor({ id: "f", nombre: "Futuro", acompanamientos: [{ jornadaId: "f1", dia: "2026-10-25", horas: null, acompanante: "Mariana Pérez", acompananteEsVos: true, origen: null, nota: null }] }),
      ],
    });
    const { u } = mostrar(datos);
    await verAcompanamientos(u);
    expect(fila(/^Futuro/)).not.toHaveTextContent(/NaN|-\d/);
  });
});

describe("QA #63 · accesibilidad (axe sin contraste: jsdom no lo mide; el contraste se midió en el navegador)", () => {
  async function violaciones(nodo: Element) {
    const r = await axe.run(nodo, { rules: { "color-contrast": { enabled: false } }, runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] } });
    return r.violations.filter((v) => v.id !== "region").map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(" | ")}`);
  }

  it("Zonas, Acompañamientos, historial abierto y registro abierto no tienen violaciones", async () => {
    const { u, container } = mostrar();
    expect(await violaciones(container)).toEqual([]);
    await verAcompanamientos(u, "Rivera");
    expect(await violaciones(container)).toEqual([]);
    await u.click(screen.getByRole("button", { name: "Ver historial de Emiliano Sosa" }));
    expect(await violaciones(container)).toEqual([]);
    await abrirRegistro(u, "Florencia Pintos");
    expect(await violaciones(container)).toEqual([]);
    await u.click(registrarJ("Florencia Pintos", "mar 20/10"));
    await screen.findByRole("status");
    expect(await violaciones(container)).toEqual([]);
  });

  it("la lista contraída y el estado vacío no tienen violaciones y los botones de ícono tienen nombre", async () => {
    const { u, container } = mostrar();
    await u.click(screen.getByRole("button", { name: "Contraer ciudades" }));
    expect(screen.getByRole("button", { name: "Expandir ciudades" })).toBeInTheDocument();
    expect(await violaciones(container)).toEqual([]);
  });

  it("el rechazo de la base se anuncia como «alert» con el texto de la base", async () => {
    const a = acciones();
    a.registrarAcompanamiento.mockResolvedValueOnce({ ok: false, mensaje: "La jornada no existe.", recargar: false });
    const { u } = mostrar(datosDePrueba(), a);
    await verAcompanamientos(u, "Rivera");
    await abrirRegistro(u, "Florencia Pintos");
    await u.click(registrarJ("Florencia Pintos", "mar 20/10"));
    expect(await screen.findByRole("alert")).toHaveTextContent("La jornada no existe.");
  });

  it("mientras registra, el botón queda aria-disabled y conserva su nombre accesible", async () => {
    const a = acciones();
    const d = conDiferido<ResultadoAcompanamiento>();
    a.registrarAcompanamiento.mockReturnValue(d.promesa);
    const { u } = mostrar(datosDePrueba(), a);
    await verAcompanamientos(u, "Rivera");
    await abrirRegistro(u, "Florencia Pintos");
    await u.click(registrarJ("Florencia Pintos", "mar 20/10"));
    const boton = registrarJ("Florencia Pintos", "mar 20/10");
    expect(boton).toHaveAttribute("aria-disabled", "true");
    await act(async () => d.resolver(ok("2026-10-20")));
  });
});

describe("QA #63 · tamaños: con la lista de ciudades abierta a 1280 px", () => {
  /**
   * El panel es solo escritorio (shell con `min-w-[1280px]`): a 1280 px la lista ocupa 320 px y el contenido tiene
   * 1280 − 320 − 44 (padding) − 2 (borde) = 914 px para la tabla. jsdom no hace layout, así que se calcula con el
   * `colgroup` real de la tabla: porcentajes y px fijos; el resto es lo que le queda a «Sin acompañar».
   */
  it("QA #63: a 1280 px con la lista abierta, «Sin acompañar» tiene ancho para «hace 46 días» y «último:» sin partirse ni montarse sobre el botón", async () => {
    const { u, container } = mostrar();
    await verAcompanamientos(u, "Rivera");
    const columnas = Array.from(container.querySelectorAll('table[aria-label="Acompañamientos de cada colportor"] colgroup col'));
    const ancho = 1280 - 320 - 44 - 2;
    let fijo = 0;
    let libres = 0;
    for (const col of columnas) {
      const pct = /w-\[(\d+)%\]/.exec(col.className);
      const px = /w-\[(\d+)px\]/.exec(col.className);
      if (pct) fijo += (Number(pct[1]) / 100) * ancho;
      else if (px) fijo += Number(px[1]);
      else libres += 1;
    }
    expect(libres).toBe(1);
    // «hace 46 días» en mono 12,5 px son unos 100 px más el padding de la celda
    expect(ancho - fijo).toBeGreaterThanOrEqual(120);
  });
});

describe("QA #63 · privacidad", () => {
  it("un flujo completo (abrir, registrar, rechazo, sin conexión) no escribe nombres en la consola", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const a = acciones();
    a.registrarAcompanamiento.mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValueOnce({ ok: false, mensaje: "La jornada no existe.", recargar: true });
    const { u } = mostrar(datosDePrueba(), a);
    await verAcompanamientos(u, "Rivera");
    await abrirRegistro(u, "Florencia Pintos");
    await u.click(registrarJ("Florencia Pintos", "mar 20/10"));
    await screen.findByText(/Necesitás conexión/);
    await u.click(registrarJ("Florencia Pintos", "mar 20/10"));
    await screen.findByText("La jornada no existe.");
    const llamadas = espias.flatMap((e) => e.mock.calls).map((c) => c.map(String).join(" "));
    expect(llamadas.filter((l) => /Florencia|Pintos|Emiliano|Sosa/.test(l))).toEqual([]);
  });

  it("los datos del equipo no exponen su contenido por `String()` (sin `toString` con nombres)", () => {
    const datos = datosDePrueba();
    expect(String(datos.colportores[0])).toBe("[object Object]");
  });
});
