import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import type { AcompanamientoDeColportor, JornadaParaAcompanar, ResultadoAcompanamiento, ResultadoJornadas } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { colportor, datosDePrueba, HOY } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";
import { textoDeOrigen } from "./modelo";

/**
 * QA de #98 (PR #118): «cargado por vos / por X» en el historial de acompañamientos de la vista 33. Cubre los cuatro
 * textos de origen, los límites del nombre (vacío, espacios, emoji, largo sin espacios, marcado HTML), que el dato de
 * quién lo cargó nunca contradiga al origen, lo que pasa al registrar (también a nombre de otro, con la jornada que ya
 * estaba y con dos seguidos), la reentrada al historial, axe y que el nombre del cargador no se filtre al `toString()`.
 */

const J1: JornadaParaAcompanar = { id: "j1", dia: "2026-10-20", horas: 5.5, acompanante: null, acompananteEsVos: false };
const J3: JornadaParaAcompanar = { id: "j3", dia: "2026-10-17", horas: 3.2, acompanante: null, acompananteEsVos: false };

const ok = (dia: string, resto: Partial<Extract<ResultadoAcompanamiento, { ok: true }>> = {}): ResultadoAcompanamiento => ({
  ok: true,
  dia,
  acompanante: "Mariana Pérez",
  yaEstaba: false,
  origen: "COORDINADOR",
  nota: null,
  ...resto,
});

function crearAcciones(jornadas: JornadaParaAcompanar[] = [J1, J3]) {
  const jornadasParaAcompanar = vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async (): Promise<ResultadoJornadas> => ({ ok: true, jornadas }));
  const registrarAcompanamiento = vi.fn<AccionesEquipo["registrarAcompanamiento"]>(async (id) => ok(jornadas.find((j) => j.id === id)?.dia ?? HOY));
  const elegirCarrera = vi.fn<AccionesEquipo["elegirCarrera"]>(async () => ({ ok: false, mensaje: "No en este test." }));
  const asignarTipoDeBeca = vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(async () => ({ ok: false, mensaje: "No en este test." }));
  return { jornadasParaAcompanar, registrarAcompanamiento, elegirCarrera, asignarTipoDeBeca } satisfies AccionesEquipo;
}

const fila = (n: number, dia: string, resto: Partial<AcompanamientoDeColportor>): AcompanamientoDeColportor => ({
  jornadaId: `a${n}`,
  dia,
  horas: 4,
  acompanante: "Tomás Ibarra",
  acompananteEsVos: false,
  origen: "COORDINADOR",
  nota: null,
  ...resto,
});

async function verHistorial(acompanamientos: AcompanamientoDeColportor[], acciones = crearAcciones()) {
  const datos = datosDePrueba({ colportores: [colportor({ id: "ana", nombre: "Ana Prueba", acompanamientos })] });
  const vista = render(<EquipoVista datos={datos} acciones={acciones} />);
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
  await usuario.click(screen.getByRole("button", { name: "Ver historial de Ana Prueba" }));
  const historial = within(screen.getByRole("region", { name: /Historial de acompañamientos de Ana Prueba/ }));
  return { ...vista, usuario, acciones, historial, filas: historial.getAllByRole("listitem") };
}

describe("QA #98 · textoDeOrigen, los cuatro textos y sus límites", () => {
  it("los cuatro textos de la HU: celular, por vos, por <nombre> y, sin quién, «desde el panel»", () => {
    expect(textoDeOrigen("COLPORTOR")).toBe("lo marcó en el celular");
    expect(textoDeOrigen("COORDINADOR", { esVos: true })).toBe("cargado por vos");
    expect(textoDeOrigen("COORDINADOR", { esVos: false, nombre: "Santiago Pereira" })).toBe("cargado por Santiago Pereira");
    expect(textoDeOrigen("COORDINADOR", null)).toBe("cargado desde el panel");
    expect(textoDeOrigen("COORDINADOR")).toBe("cargado desde el panel");
    expect(textoDeOrigen(null)).toBeNull();
  });

  it("el dato de quién lo cargó nunca contradice al origen: marcado en el celular o sin origen no dice «por vos» ni «por X»", () => {
    expect(textoDeOrigen("COLPORTOR", { esVos: true })).toBe("lo marcó en el celular");
    expect(textoDeOrigen("COLPORTOR", { esVos: false, nombre: "Santiago Pereira" })).toBe("lo marcó en el celular");
    expect(textoDeOrigen(null, { esVos: true })).toBeNull();
    expect(textoDeOrigen(null, { esVos: false, nombre: "Santiago Pereira" })).toBeNull();
  });

  it("nombre vacío, solo espacios, tabulaciones o saltos de línea: no se inventa «cargado por », queda «desde el panel»", () => {
    for (const nombre of ["", " ", "   ", "\t", "\n", "   "]) {
      const texto = textoDeOrigen("COORDINADOR", { esVos: false, nombre });
      //   lo recorta String.trim(): si no, el texto sería «cargado por » a secas.
      expect(texto, JSON.stringify(nombre)).toBe("cargado desde el panel");
    }
  });

  it("nombre con emoji, acentos, apóstrofes y marcado HTML: sale tal cual como texto, sin interpretarse", () => {
    expect(textoDeOrigen("COORDINADOR", { esVos: false, nombre: "Zoë 🙂 D'Ángelo" })).toBe("cargado por Zoë 🙂 D'Ángelo");
    expect(textoDeOrigen("COORDINADOR", { esVos: false, nombre: "<img src=x onerror=alert(1)>" })).toBe("cargado por <img src=x onerror=alert(1)>");
  });
});

describe("QA #98 · el historial dice quién lo cargó", () => {
  it("HU-JOR-004 «Ver el historial»: las dos jornadas con su fecha y, cada una, de dónde salió y quién la cargó", async () => {
    const { filas } = await verHistorial([
      fila(1, "2026-10-09", { acompanante: "Mariana Pérez", acompananteEsVos: true, cargadoPor: { esVos: true } }),
      fila(2, "2026-10-02", { cargadoPor: { esVos: false, nombre: "Santiago Pereira" } }),
    ]);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent("vie 09/10");
    expect(filas[0]).toHaveTextContent("Origen: cargado por vos");
    expect(filas[1]).toHaveTextContent("vie 02/10");
    expect(filas[1]).toHaveTextContent("Origen: cargado por Santiago Pereira");
  });

  it("el cargador es otra persona y el acompañante también: ninguna fila confunde «Acompañó» con «cargado por»", async () => {
    const { filas } = await verHistorial([
      fila(1, "2026-10-09", { acompanante: "Mariana Pérez", acompananteEsVos: true, cargadoPor: { esVos: false, nombre: "Santiago Pereira" } }),
    ]);
    expect(filas[0]).toHaveTextContent("Acompañó: Mariana Pérez (vos)");
    expect(filas[0]).toHaveTextContent("Origen: cargado por Santiago Pereira");
  });

  it("nombre de 200 letras sin espacios y con emoji: la fila lo muestra entero y lo deja partir en vez de ensanchar la tabla", async () => {
    const largo = `${"Á".repeat(190)}🙂🙂🙂🙂🙂`;
    const { historial } = await verHistorial([fila(1, "2026-10-09", { cargadoPor: { esVos: false, nombre: largo } })]);
    const celda = historial.getByText(`cargado por ${largo}`);
    expect(celda.className).toContain("wrap-anywhere");
  });

  it("el nombre del cargador con marcado HTML se ve como texto, sin crear elementos", async () => {
    const { filas } = await verHistorial([fila(1, "2026-10-09", { cargadoPor: { esVos: false, nombre: "<b>Negrita</b>" } })]);
    expect(filas[0]).toHaveTextContent("cargado por <b>Negrita</b>");
    expect(filas[0].querySelector("b")).toBeNull();
  });

  it("muchas filas (60) mezclando los cuatro orígenes: cada una dice lo suyo y el historial no pierde ninguna", async () => {
    const casos: Array<[Partial<AcompanamientoDeColportor>, string]> = [
      [{ origen: "COLPORTOR" }, "lo marcó en el celular"],
      [{ cargadoPor: { esVos: true } }, "cargado por vos"],
      [{ cargadoPor: { esVos: false, nombre: "Otra Persona" } }, "cargado por Otra Persona"],
      [{ cargadoPor: null }, "cargado desde el panel"],
    ];
    const lista = Array.from({ length: 60 }, (_, i) => {
      const dia = new Date(Date.UTC(2026, 9, 20) - i * 86_400_000).toISOString().slice(0, 10);
      return fila(i, dia, casos[i % 4][0]);
    });
    const { filas } = await verHistorial(lista);
    expect(filas).toHaveLength(60);
    filas.forEach((f, i) => expect(f).toHaveTextContent(`Origen: ${casos[i % 4][1]}`));
  });

  it("un solo acompañamiento y ninguno: con uno dice quién; sin ninguno, el aviso de siempre (sin texto de origen)", async () => {
    const uno = await verHistorial([fila(1, "2026-10-09", { cargadoPor: { esVos: true } })]);
    expect(uno.filas).toHaveLength(1);
    uno.unmount();
    const datos = datosDePrueba({ colportores: [colportor({ id: "ana", nombre: "Ana Prueba", acompanamientos: [] })] });
    render(<EquipoVista datos={datos} acciones={crearAcciones()} />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Ana Prueba" }));
    expect(screen.getByText("Todavía no se lo acompañó en esta campaña.")).toBeInTheDocument();
    expect(screen.queryByText(/cargado por/)).not.toBeInTheDocument();
  });

  it("cerrar y volver a abrir el historial conserva quién cargó cada fila", async () => {
    const { usuario } = await verHistorial([
      fila(1, "2026-10-09", { cargadoPor: { esVos: true } }),
      fila(2, "2026-10-02", { cargadoPor: { esVos: false, nombre: "Santiago Pereira" } }),
    ]);
    await usuario.click(screen.getByRole("button", { name: "Ocultar historial de Ana Prueba" }));
    expect(screen.queryByRole("region", { name: /Historial de acompañamientos de Ana Prueba/ })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Ana Prueba" }));
    const filas = within(screen.getByRole("region", { name: /Historial de acompañamientos de Ana Prueba/ })).getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("Origen: cargado por vos");
    expect(filas[1]).toHaveTextContent("Origen: cargado por Santiago Pereira");
  });

  it("axe A/AA sin violaciones con los cuatro orígenes y un nombre largo en el historial", async () => {
    const { container } = await verHistorial([
      fila(1, "2026-10-09", { cargadoPor: { esVos: true } }),
      fila(2, "2026-10-08", { cargadoPor: { esVos: false, nombre: "Santiago Pereira de la Fuente Márquez" } }),
      fila(3, "2026-10-07", { cargadoPor: null }),
      fila(4, "2026-10-06", { origen: "COLPORTOR" }),
      fila(5, "2026-10-05", { origen: null }),
    ]);
    const r = await axe.run(container, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  });
});

describe("QA #98 · al registrar desde el panel", () => {
  async function abrirRegistro(acciones = crearAcciones(), nombre = "Florencia Pintos") {
    const vista = render(<EquipoVista datos={datosDePrueba()} acciones={acciones} />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    await usuario.click(screen.getByRole("button", { name: `Registrar acompañamiento de ${nombre}` }));
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    return { ...vista, usuario, acciones };
  }
  const botonDe = (cuando: string) => screen.getByRole("button", { name: `Registrar acompañamiento en la jornada de Florencia Pintos del ${cuando}` });
  const historialDe = () => within(screen.getByRole("region", { name: /Historial de acompañamientos de Florencia/ }));

  it("registrado a nombre de «Otro colportor» el historial dice «cargado por vos» (lo cargó quien tiene la sesión) y «Acompañó» nombra al otro", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce(ok("2026-10-20", { acompanante: "Tomás Ibarra" }));
    const { usuario } = await abrirRegistro(acciones);
    await usuario.click(botonDe("mar 20/10"));
    await screen.findByText(/Acompañamiento registrado/);
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Florencia Pintos" }));
    const [f] = historialDe().getAllByRole("listitem");
    expect(f).toHaveTextContent("Acompañó: Tomás Ibarra");
    expect(f).toHaveTextContent("Origen: cargado por vos");
  });

  it("falla a mitad de la acción: no queda ninguna fila «cargado por vos» y al reintentar entra una sola vez", async () => {
    const acciones = crearAcciones();
    acciones.registrarAcompanamiento.mockResolvedValueOnce({ ok: false, mensaje: "No se pudo guardar. Probá de nuevo." } as ResultadoAcompanamiento);
    const { usuario } = await abrirRegistro(acciones);
    await usuario.click(botonDe("mar 20/10"));
    await screen.findByRole("alert");
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Florencia Pintos" }));
    expect(historialDe().queryByText("cargado por vos")).not.toBeInTheDocument();
    expect(botonDe("mar 20/10")).toBeEnabled();

    await usuario.click(botonDe("mar 20/10"));
    await waitFor(() => expect(historialDe().getAllByText("cargado por vos")).toHaveLength(1));
  });

  it("dos toques casi a la vez sobre la misma jornada: una sola fila «cargado por vos»", async () => {
    const acciones = crearAcciones();
    let soltar!: () => void;
    const espera = new Promise<void>((r) => (soltar = r));
    acciones.registrarAcompanamiento.mockImplementation(async () => {
      await espera;
      return ok("2026-10-20");
    });
    const { usuario } = await abrirRegistro(acciones);
    const boton = botonDe("mar 20/10");
    // Los dos toques llegan con la primera respuesta todavía en vuelo; recién después contesta el servidor.
    await usuario.click(boton);
    await usuario.click(boton);
    expect(acciones.registrarAcompanamiento).toHaveBeenCalledTimes(1);
    soltar();
    await screen.findByText(/Acompañamiento registrado/);
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Florencia Pintos" }));
    expect(historialDe().getAllByText("cargado por vos")).toHaveLength(1);
    expect(acciones.registrarAcompanamiento).toHaveBeenCalledTimes(1);
  });

  it("dos jornadas seguidas más un historial que ya traía filas de otra persona: cada una conserva lo suyo", async () => {
    const datos = datosDePrueba({
      colportores: [
        colportor({
          id: "flor",
          nombre: "Florencia Pintos",
          acompanamientos: [fila(0, "2026-10-01", { cargadoPor: { esVos: false, nombre: "Santiago Pereira" } })],
        }),
      ],
    });
    render(<EquipoVista datos={datos} acciones={crearAcciones()} />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    await screen.findByRole("list", { name: /Jornadas terminadas/ });
    await usuario.click(botonDe("mar 20/10"));
    await screen.findByText(/jornada de Florencia Pintos, mar 20\/10/);
    await usuario.click(botonDe("sáb 17/10"));
    await screen.findByText(/jornada de Florencia Pintos, sáb 17\/10/);
    await usuario.click(screen.getByRole("button", { name: "Ver historial de Florencia Pintos" }));
    const filas = historialDe().getAllByRole("listitem");
    expect(filas.map((f) => f.textContent)).toEqual([
      expect.stringContaining("cargado por vos"),
      expect.stringContaining("cargado por vos"),
      expect.stringContaining("cargado por Santiago Pereira"),
    ]);
  });
});

describe("QA #98 · privacidad", () => {
  it("el nombre de quien cargó no aparece en ningún console.* al pintar el historial", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await verHistorial([fila(1, "2026-10-09", { cargadoPor: { esVos: false, nombre: "Santiago Pereira" } })]);
    for (const e of espias) {
      expect(JSON.stringify(e.mock.calls)).not.toContain("Santiago Pereira");
      e.mockRestore();
    }
  });
});
