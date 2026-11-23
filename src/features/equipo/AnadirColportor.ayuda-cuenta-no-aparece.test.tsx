import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosAnadirColportor, ResultadoBusqueda, ResultadoInscripcion } from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { AnadirColportor } from "@/features/equipo/AnadirColportor";
import { AYUDA_CUENTA_NO_APARECE } from "@/features/equipo/candidatos";

/**
 * Vista 23, la ayuda cuando no aparece alguien (decisión de Cristian, 11/11, «Sin verificar», HU-CAM-004): una cuenta con el
 * correo sin verificar no se lista ni se puede añadir (HU-AUTH-002), y la vista le explica al coordinador por qué. La línea va
 * debajo de «Sugeridos» cuando no hay ninguno y debajo del resultado cuando la búsqueda no encuentra a nadie.
 */

const navegacion = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navegacion.push }) }));

type Inscribir = (id: string) => Promise<ResultadoInscripcion>;
type Buscar = (texto: string, despuesDe: string | null) => Promise<ResultadoBusqueda>;

const buscarEnLaSimulada: Buscar = (texto, despuesDe) => fuenteEquipoSimulada.buscarCandidatos("c", texto, despuesDe);

const TEXTO_LITERAL =
  "¿No encontrás a alguien? Aparece cuando confirma su correo con el enlace que le mandamos. Si no le llegó, que lo pida de nuevo desde la app.";
const SIN_SUGERIDOS: DatosAnadirColportor = { ...DATOS_ANADIR_COLPORTOR_SIMULADO, sugeridos: [] };

function montar(opciones: { inscribir?: Inscribir; buscar?: Buscar; datos?: DatosAnadirColportor } = {}) {
  const inscribir = vi.fn(opciones.inscribir ?? (async () => ({ ok: true as const })));
  const buscar = vi.fn(opciones.buscar ?? buscarEnLaSimulada);
  const vista = render(
    <AnadirColportor datos={opciones.datos ?? DATOS_ANADIR_COLPORTOR_SIMULADO} inscribir={inscribir} buscar={buscar} />,
  );
  return { inscribir, buscar, ...vista };
}

const caja = () => screen.getByRole("textbox", { name: "Buscar por email o nombre" });
const ayuda = () => screen.queryByText(TEXTO_LITERAL);

async function esperarResultados() {
  await waitFor(() => expect(screen.queryByText("Buscando cuentas…")).not.toBeInTheDocument());
}

async function buscarTexto(texto: string) {
  await userEvent.type(caja(), texto);
  await esperarResultados();
}

describe("AnadirColportor · ayuda cuando no aparece alguien", () => {
  afterEach(() => {
    navegacion.push.mockClear();
  });

  it("el texto es el de la HU, al pie de la letra", () => {
    expect(AYUDA_CUENTA_NO_APARECE).toBe(TEXTO_LITERAL);
  });

  describe("sin sugeridos", () => {
    it("debajo de «No hay cuentas pendientes de asignación.» aparece la línea de ayuda", () => {
      montar({ datos: SIN_SUGERIDOS });
      const vacio = screen.getByText("No hay cuentas pendientes de asignación.");
      expect(ayuda()).toBeInTheDocument();
      // Va debajo: sigue al aviso de vacío dentro del mismo bloque.
      expect(vacio.nextElementSibling).toBe(ayuda());
    });

    it("la ayuda no es un `role=status` (la vista tiene un solo aviso vivo) ni un alerta", () => {
      montar({ datos: SIN_SUGERIDOS });
      expect(ayuda()?.getAttribute("role")).toBeNull();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("con sugeridos", () => {
    it("no aparece: la lista no está vacía", () => {
      montar();
      expect(ayuda()).not.toBeInTheDocument();
    });
  });

  describe("al buscar", () => {
    it("si la búsqueda no encuentra a nadie, debajo de «No hay cuentas que coincidan…» aparece la línea", async () => {
      montar();
      await buscarTexto("zzz");
      const vacio = screen.getByText("No hay cuentas que coincidan con tu búsqueda.");
      expect(ayuda()).toBeInTheDocument();
      expect(vacio.nextElementSibling).toBe(ayuda());
    });

    it("mientras busca no aparece, y tampoco si la búsqueda trae resultados", async () => {
      const pendientes = new Map<string, (r: ResultadoBusqueda) => void>();
      montar({ buscar: (texto) => new Promise((resolver) => pendientes.set(texto, resolver)) });

      await userEvent.type(caja(), "zzz");
      await waitFor(() => expect(pendientes.has("zzz")).toBe(true));
      expect(screen.getByText("Buscando cuentas…")).toBeInTheDocument();
      expect(ayuda()).not.toBeInTheDocument();

      await act(async () => pendientes.get("zzz")?.({ ok: true, candidatos: [], hayMas: false }));
      expect(ayuda()).toBeInTheDocument();
    });

    it("con resultados no aparece", async () => {
      montar();
      await buscarTexto("martinez");
      expect(screen.getByRole("list", { name: "Cuentas" })).toBeInTheDocument();
      expect(ayuda()).not.toBeInTheDocument();
    });

    it("si la búsqueda falla muestra el error y no la ayuda; «Reintentar» que ahora no encuentra a nadie la muestra", async () => {
      const buscar = vi.fn<Buscar>().mockResolvedValueOnce({ ok: false, mensaje: "Solo el coordinador de la campaña puede buscar cuentas." });
      buscar.mockImplementation(buscarEnLaSimulada);
      montar({ buscar });
      await buscarTexto("zzz");

      expect(screen.getByRole("alert")).toHaveTextContent("Solo el coordinador de la campaña puede buscar cuentas.");
      expect(ayuda()).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
      await esperarResultados();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(ayuda()).toBeInTheDocument();
      expect(caja()).toBeEnabled();
    });

    it("un texto pegado larguísimo y sin espacios no cambia la ayuda ni rompe el bloque", async () => {
      montar();
      const largo = "x".repeat(300);
      await userEvent.click(caja());
      await userEvent.paste(largo);
      await esperarResultados();
      expect(ayuda()).toBeInTheDocument();
      expect(screen.getByText("No hay cuentas que coincidan con tu búsqueda.")).toBeInTheDocument();
    });

    it("borrar la búsqueda y volver a escribirla: la línea va y viene con el estado, sin quedar de más", async () => {
      montar();
      await buscarTexto("zzz");
      expect(ayuda()).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));
      // Vuelven los sugeridos (4): ya no está la línea.
      expect(screen.getByRole("heading", { name: "PENDIENTES DE ASIGNACIÓN · 4" })).toBeInTheDocument();
      expect(ayuda()).not.toBeInTheDocument();

      await buscarTexto("qqq");
      expect(ayuda()).toBeInTheDocument();
      expect(screen.getAllByText(TEXTO_LITERAL)).toHaveLength(1);
    });
  });

  describe("sin sugeridos y con búsqueda", () => {
    it("pasa de la ayuda de «Sugeridos» a la de «búsqueda» sin duplicarse, y vuelve al borrar", async () => {
      montar({ datos: SIN_SUGERIDOS });
      expect(screen.getAllByText(TEXTO_LITERAL)).toHaveLength(1);

      await buscarTexto("zzz");
      expect(screen.getAllByText(TEXTO_LITERAL)).toHaveLength(1);
      expect(screen.getByText("No hay cuentas que coincidan con tu búsqueda.")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));
      expect(screen.getAllByText(TEXTO_LITERAL)).toHaveLength(1);
      expect(screen.getByText("No hay cuentas pendientes de asignación.")).toBeInTheDocument();
    });

    it("la ayuda es texto plano, sin botón ni enlace (no hay nada que reenviar desde el panel)", () => {
      montar({ datos: SIN_SUGERIDOS });
      const bloque = ayuda()?.parentElement as HTMLElement;
      expect(within(bloque).queryByRole("button")).not.toBeInTheDocument();
      expect(within(bloque).queryByRole("link")).not.toBeInTheDocument();
    });
  });
});
