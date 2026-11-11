import { act, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CandidatoColportor,
  DatosAnadirColportor,
  ResultadoBusqueda,
  ResultadoInscripcion,
} from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { AnadirColportor, MS_DESHACER } from "@/features/equipo/AnadirColportor";
import { confirmacionDeRol } from "@/features/equipo/candidatos";
import { MS_ESPERA_BUSQUEDA } from "@/features/equipo/useBusquedaCandidatos";

/**
 * Vista 23, confirmación antes de añadir como colportor una cuenta de coordinación o de administración (decisión de Cristian,
 * 11/11): «Añadir» abre un aviso que dice qué cuenta es y pregunta; «Añadir igual» sigue el camino de siempre (aviso con
 * «Deshacer», envío a los 8 s) y «Cancelar» o Esc no cambian nada. La cuenta de un colportor se añade sin preguntar.
 */

const navegacion = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navegacion.push }) }));

type Inscribir = (id: string) => Promise<ResultadoInscripcion>;
type Buscar = (texto: string, despuesDe: string | null) => Promise<ResultadoBusqueda>;

function cuenta(id: string, nombre: string, parcial: Partial<CandidatoColportor> = {}): CandidatoColportor {
  return {
    id,
    nombre,
    email: `${id}@example.com`,
    estadoCuenta: "pendiente_asignacion",
    campaniaActual: null,
    enOtraCampania: false,
    cuentaCreada: "2026-11-01",
    ...parcial,
  };
}

const COORDINADOR = cuenta("usr-coordinador-demo", "Coordinador Demo", { rolCuenta: "coordinador" });
const ADMINISTRADORA = cuenta("usr-admin", "Alicia Benítez", { rolCuenta: "administracion" });
const COLPORTORA = cuenta("usr-colportora", "Lucía Fernández");

const DATOS: DatosAnadirColportor = {
  ...DATOS_ANADIR_COLPORTOR_SIMULADO,
  sugeridos: [COLPORTORA, COORDINADOR, ADMINISTRADORA],
};

function montar(opciones: { inscribir?: Inscribir; buscar?: Buscar; datos?: DatosAnadirColportor } = {}) {
  const inscribir = vi.fn(opciones.inscribir ?? (async () => ({ ok: true as const })));
  const buscar = vi.fn(
    opciones.buscar ?? ((texto: string, despuesDe: string | null) => fuenteEquipoSimulada.buscarCandidatos("c", texto, despuesDe)),
  );
  const vista = render(<AnadirColportor datos={opciones.datos ?? DATOS} inscribir={inscribir} buscar={buscar} />);
  return { inscribir, buscar, ...vista };
}

async function pasar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function tocar(elemento: HTMLElement) {
  await act(async () => {
    fireEvent.click(elemento);
  });
}

async function teclear(elemento: Element, tecla: string, extra: KeyboardEventInit = {}) {
  let seguir = true;
  await act(async () => {
    seguir = fireEvent.keyDown(elemento, { key: tecla, ...extra });
  });
  return seguir;
}

const caja = () => screen.getByRole("textbox", { name: "Buscar por email o nombre" });
const anadirEnFila = (nombre: string) => screen.getByRole("button", { name: `Añadir a ${nombre}` });
const dialogo = () => screen.getByRole("alertdialog");
const sinDialogo = () => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
const cancelar = () => within(dialogo()).getByRole("button", { name: "Cancelar" });
const anadirIgual = () => within(dialogo()).getByRole("button", { name: "Añadir igual" });
const deshacer = (nombre: string) => screen.getByRole("button", { name: `Deshacer: ${nombre}` });

const TEXTO_COORDINACION =
  "Esta cuenta es de coordinación, no de un colportor. ¿Querés añadirla igual como colportor de Verano 2026?";

describe("AnadirColportor · confirmar una cuenta de coordinación o de administración", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    navegacion.push.mockClear();
  });

  describe("los textos", () => {
    it("dicen qué cuenta es y preguntan, con el área de cada rol; un colportor no lleva confirmación", () => {
      expect(confirmacionDeRol(COORDINADOR, "Verano 2026")).toEqual({
        titulo: "¿Añadir a Coordinador Demo como colportor?",
        texto: TEXTO_COORDINACION,
      });
      expect(confirmacionDeRol(ADMINISTRADORA, "Libertador San Martín (demo)")).toEqual({
        titulo: "¿Añadir a Alicia Benítez como colportor?",
        texto:
          "Esta cuenta es de administración, no de un colportor. ¿Querés añadirla igual como colportor de Libertador San Martín (demo)?",
      });
      expect(confirmacionDeRol(COLPORTORA, "Verano 2026")).toBeNull();
    });
  });

  describe("al tocar «Añadir»", () => {
    it("no añade todavía: abre el aviso, con el foco en «Cancelar»", async () => {
      const { inscribir } = montar();
      await tocar(anadirEnFila("Coordinador Demo"));

      expect(dialogo()).toHaveAccessibleName("¿Añadir a Coordinador Demo como colportor?");
      expect(dialogo()).toHaveAccessibleDescription(TEXTO_COORDINACION);
      expect(dialogo()).toHaveAttribute("aria-modal", "true");
      expect(cancelar()).toHaveFocus();
      // Nada cambió: ni aviso de «Deshacer», ni «Añadido ✓», ni un envío aunque pase el plazo.
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(anadirEnFila("Coordinador Demo")).toHaveTextContent("Añadir");
      await pasar(MS_DESHACER * 2);
      expect(inscribir).not.toHaveBeenCalled();
      expect(within(screen.getByRole("region", { name: "Ya en tu equipo" })).queryByText("Coordinador Demo")).not.toBeInTheDocument();
    });

    it("la cuenta de administración pregunta con su área", async () => {
      montar();
      await tocar(anadirEnFila("Alicia Benítez"));

      expect(dialogo()).toHaveAccessibleName("¿Añadir a Alicia Benítez como colportor?");
      expect(dialogo()).toHaveAccessibleDescription(
        "Esta cuenta es de administración, no de un colportor. ¿Querés añadirla igual como colportor de Verano 2026?",
      );
    });

    it("el botón del detalle («Añadir a Verano 2026») también pregunta", async () => {
      const { inscribir } = montar();
      await tocar(screen.getByRole("button", { name: "Elegir a Coordinador Demo" }));
      const detalle = screen.getByRole("region", { name: "Detalle de Coordinador Demo" });
      await tocar(within(detalle).getByRole("button", { name: "Añadir a Verano 2026" }));

      expect(dialogo()).toHaveAccessibleName("¿Añadir a Coordinador Demo como colportor?");
      await pasar(MS_DESHACER * 2);
      expect(inscribir).not.toHaveBeenCalled();
    });

    it("la cuenta de un colportor se añade sin preguntar, como siempre", async () => {
      const { inscribir } = montar();
      await tocar(anadirEnFila("Lucía Fernández"));

      sinDialogo();
      expect(screen.getByRole("status")).toHaveTextContent("Añadiste a Lucía Fernández a Verano 2026.");
      await pasar(MS_DESHACER);
      expect(inscribir).toHaveBeenCalledExactlyOnceWith(COLPORTORA.id);
    });

    it("un doble toque en «Añadir» abre un solo aviso", async () => {
      montar();
      const boton = anadirEnFila("Coordinador Demo");
      await act(async () => {
        fireEvent.click(boton);
        fireEvent.click(boton);
      });

      expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    });

    it("sin violaciones axe A/AA con el aviso abierto", async () => {
      vi.useRealTimers();
      const { container } = montar();
      await tocar(anadirEnFila("Coordinador Demo"));

      const resultado = await axe.run(container, {
        runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        // axe en jsdom no mide contraste (no hay layout).
        rules: { "color-contrast": { enabled: false } },
      });
      expect(resultado.violations.map((v) => v.id)).toEqual([]);
    });
  });

  describe("«Cancelar» y Esc", () => {
    it("«Cancelar» cierra sin añadir y devuelve el foco al «Añadir» de la fila, que sigue habilitado", async () => {
      const { inscribir } = montar();
      anadirEnFila("Coordinador Demo").focus();
      await tocar(anadirEnFila("Coordinador Demo"));
      await tocar(cancelar());

      sinDialogo();
      expect(anadirEnFila("Coordinador Demo")).toHaveFocus();
      expect(anadirEnFila("Coordinador Demo")).toBeEnabled();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      await pasar(MS_DESHACER * 2);
      expect(inscribir).not.toHaveBeenCalled();
    });

    it("desde el detalle, «Cancelar» devuelve el foco al botón del detalle", async () => {
      montar();
      await tocar(screen.getByRole("button", { name: "Elegir a Coordinador Demo" }));
      const boton = within(screen.getByRole("region", { name: "Detalle de Coordinador Demo" })).getByRole("button", {
        name: "Añadir a Verano 2026",
      });
      boton.focus();
      await tocar(boton);
      await tocar(cancelar());

      sinDialogo();
      expect(boton).toHaveFocus();
    });

    it("Esc cancela y nada más: no borra la búsqueda, no confirma los avisos y no sale de la vista", async () => {
      const { inscribir } = montar({ datos: DATOS_ANADIR_COLPORTOR_SIMULADO });
      await act(async () => {
        fireEvent.change(caja(), { target: { value: "ibarra" } });
      });
      await pasar(MS_ESPERA_BUSQUEDA);
      anadirEnFila("Tomás Ibarra").focus();
      await tocar(anadirEnFila("Tomás Ibarra"));
      expect(cancelar()).toHaveFocus();

      await teclear(cancelar(), "Escape");

      sinDialogo();
      expect(caja()).toHaveValue("ibarra");
      expect(anadirEnFila("Tomás Ibarra")).toHaveFocus();
      expect(navegacion.push).not.toHaveBeenCalled();
      await pasar(MS_DESHACER * 2);
      expect(inscribir).not.toHaveBeenCalled();
    });

    it("Esc con un «Deshacer» de otra cuenta en pantalla cierra solo el aviso de confirmación: el plazo de la otra sigue", async () => {
      const { inscribir } = montar();
      await tocar(anadirEnFila("Lucía Fernández"));
      await tocar(anadirEnFila("Coordinador Demo"));

      await teclear(cancelar(), "Escape");

      sinDialogo();
      // El «Deshacer» de Lucía sigue ahí y todavía no se mandó (Esc sin el diálogo la habría confirmado ya).
      expect(deshacer("Lucía Fernández")).toBeInTheDocument();
      expect(inscribir).not.toHaveBeenCalled();
      await pasar(MS_DESHACER);
      expect(inscribir).toHaveBeenCalledExactlyOnceWith(COLPORTORA.id);
    });

    it("con el aviso abierto, «/» no se lleva el foco al buscador", async () => {
      montar();
      await tocar(anadirEnFila("Coordinador Demo"));
      await teclear(cancelar(), "/");

      expect(cancelar()).toHaveFocus();
    });

    it("Tab no sale del aviso: de «Añadir igual» vuelve a «Cancelar» y, hacia atrás, al revés", async () => {
      montar();
      await tocar(anadirEnFila("Coordinador Demo"));

      anadirIgual().focus();
      expect(await teclear(anadirIgual(), "Tab")).toBe(false);
      expect(cancelar()).toHaveFocus();
      expect(await teclear(cancelar(), "Tab", { shiftKey: true })).toBe(false);
      expect(anadirIgual()).toHaveFocus();
      // En el medio, Tab sigue su camino normal.
      cancelar().focus();
      expect(await teclear(cancelar(), "Tab")).toBe(true);
    });

    it("con Enter sostenido en «Añadir», las repeticiones de la tecla no aprietan «Cancelar» ni «Añadir igual»", async () => {
      montar();
      await tocar(anadirEnFila("Coordinador Demo"));

      expect(await teclear(cancelar(), "Enter", { repeat: true })).toBe(false);
      expect(await teclear(anadirIgual(), "Enter", { repeat: true })).toBe(false);
      expect(await teclear(cancelar(), "Enter")).toBe(true);
      expect(dialogo()).toBeInTheDocument();
    });

    it("un clic en el fondo no cierra el aviso", async () => {
      montar();
      await tocar(anadirEnFila("Coordinador Demo"));
      const fondo = dialogo().parentElement!;
      await act(async () => {
        fireEvent.mouseDown(fondo);
        fireEvent.click(fondo);
      });

      expect(dialogo()).toBeInTheDocument();
      expect(dialogo()).toHaveFocus();
    });
  });

  describe("«Añadir igual»", () => {
    it("sigue el camino de siempre: aviso con «Deshacer» enfocado, «Añadido ✓» y el envío a los 8 s", async () => {
      const { inscribir } = montar();
      await tocar(anadirEnFila("Coordinador Demo"));
      await tocar(anadirIgual());

      sinDialogo();
      expect(screen.getByRole("status")).toHaveTextContent("Añadiste a Coordinador Demo a Verano 2026.");
      expect(deshacer("Coordinador Demo")).toHaveFocus();
      expect(anadirEnFila("Coordinador Demo")).toBeDisabled();
      expect(anadirEnFila("Coordinador Demo")).toHaveTextContent("Añadido ✓");
      expect(within(screen.getByRole("region", { name: "Ya en tu equipo" })).getByText("Coordinador Demo")).toBeInTheDocument();
      expect(inscribir).not.toHaveBeenCalled();

      await pasar(MS_DESHACER);
      expect(inscribir).toHaveBeenCalledExactlyOnceWith(COORDINADOR.id);
    });

    it("un doble toque en «Añadir igual» añade una sola vez", async () => {
      const { inscribir } = montar();
      await tocar(anadirEnFila("Coordinador Demo"));
      const boton = anadirIgual();
      await act(async () => {
        fireEvent.click(boton);
        fireEvent.click(boton);
      });

      expect(screen.getAllByRole("status")).toHaveLength(1);
      await pasar(MS_DESHACER * 2);
      expect(inscribir).toHaveBeenCalledExactlyOnceWith(COORDINADOR.id);
    });

    it("«Deshacer» después de confirmar no manda nada, y volver a añadir pregunta de nuevo", async () => {
      const { inscribir } = montar();
      await tocar(anadirEnFila("Coordinador Demo"));
      await tocar(anadirIgual());
      await tocar(deshacer("Coordinador Demo"));

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(anadirEnFila("Coordinador Demo")).toBeEnabled();
      await pasar(MS_DESHACER * 2);
      expect(inscribir).not.toHaveBeenCalled();

      await tocar(anadirEnFila("Coordinador Demo"));
      expect(dialogo()).toHaveAccessibleName("¿Añadir a Coordinador Demo como colportor?");
    });

    it("dos seguidas sin esperar: el colportor y la cuenta de coordinación tienen cada uno su aviso y su envío", async () => {
      const { inscribir } = montar();
      await tocar(anadirEnFila("Lucía Fernández"));
      await pasar(3000);
      await tocar(anadirEnFila("Coordinador Demo"));
      await tocar(anadirIgual());

      expect(screen.getAllByRole("status")).toHaveLength(2);
      await pasar(MS_DESHACER - 3000);
      expect(inscribir).toHaveBeenCalledExactlyOnceWith(COLPORTORA.id);
      await pasar(3000);
      expect(inscribir).toHaveBeenCalledTimes(2);
      expect(inscribir).toHaveBeenLastCalledWith(COORDINADOR.id);
    });

    it("dos cuentas con aviso, una tras otra: cada «Añadir» pregunta por la suya y ninguna se pisa", async () => {
      const { inscribir } = montar();
      await tocar(anadirEnFila("Coordinador Demo"));
      await tocar(anadirIgual());
      await tocar(anadirEnFila("Alicia Benítez"));
      expect(dialogo()).toHaveAccessibleName("¿Añadir a Alicia Benítez como colportor?");
      await tocar(cancelar());

      // Cancelar la segunda no deshace la primera.
      expect(deshacer("Coordinador Demo")).toBeInTheDocument();
      await pasar(MS_DESHACER);
      expect(inscribir).toHaveBeenCalledExactlyOnceWith(COORDINADOR.id);
    });

    it("si el envío falla, avisa, «Añadir» vuelve a habilitarse y reintentar pregunta otra vez", async () => {
      const inscribir = vi
        .fn<Inscribir>()
        .mockRejectedValueOnce(new Error("sin red"))
        .mockResolvedValueOnce({ ok: true });
      montar({ inscribir });
      await tocar(anadirEnFila("Coordinador Demo"));
      await tocar(anadirIgual());
      await pasar(MS_DESHACER);

      expect(screen.getByRole("alert")).toHaveTextContent("Coordinador Demo");
      expect(anadirEnFila("Coordinador Demo")).toBeEnabled();
      expect(anadirEnFila("Coordinador Demo")).toHaveTextContent("Añadir");
      sinDialogo();

      await tocar(anadirEnFila("Coordinador Demo"));
      await tocar(anadirIgual());
      // El aviso de la falla se va al reintentar.
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      await pasar(MS_DESHACER);
      expect(inscribir).toHaveBeenCalledTimes(2);
      expect(anadirEnFila("Coordinador Demo")).toHaveTextContent("Añadido ✓");
    });

    it("un rechazo de la base se muestra con su texto y no deja nada trabado", async () => {
      const inscribir = vi.fn<Inscribir>(async () => ({ ok: false, mensaje: "La cuenta está suspendida. Contactá al administrador." }));
      montar({ inscribir });
      await tocar(anadirEnFila("Coordinador Demo"));
      await tocar(anadirIgual());
      await pasar(MS_DESHACER);

      expect(screen.getByRole("alert")).toHaveTextContent("La cuenta está suspendida. Contactá al administrador.");
      expect(anadirEnFila("Coordinador Demo")).toBeEnabled();
      sinDialogo();
    });
  });

  describe("datos límite y reentrar", () => {
    it("un nombre y una campaña muy largos entran enteros en el aviso", async () => {
      const nombre = `${"Maximiliano".repeat(10)} De Los Santos`;
      const campania = "Campaña".repeat(30);
      const largo = cuenta("usr-largo", nombre, { rolCuenta: "administracion" });
      montar({ datos: { ...DATOS, campania, sugeridos: [largo] } });
      await tocar(anadirEnFila(nombre));

      expect(dialogo()).toHaveAccessibleName(`¿Añadir a ${nombre} como colportor?`);
      expect(dialogo()).toHaveTextContent(`como colportor de ${campania}?`);
      expect(anadirIgual()).toBeInTheDocument();
    });

    it("una cuenta de coordinación bloqueada (suspendida) no abre el aviso: su «Añadir» está apagado", async () => {
      const suspendida = cuenta("usr-suspendida", "Vera Vieja", { estadoCuenta: "suspendida", rolCuenta: "coordinador" });
      const { inscribir } = montar({ datos: { ...DATOS, sugeridos: [suspendida] } });
      await tocar(anadirEnFila("Vera Vieja"));

      sinDialogo();
      await pasar(MS_DESHACER * 2);
      expect(inscribir).not.toHaveBeenCalled();
    });

    it("salir con el aviso abierto y volver a entrar arranca limpio: sin aviso y sin nada añadido", async () => {
      const { inscribir, unmount } = montar();
      await tocar(anadirEnFila("Coordinador Demo"));
      unmount();
      await pasar(MS_DESHACER * 2);
      expect(inscribir).not.toHaveBeenCalled();

      montar();
      sinDialogo();
      expect(anadirEnFila("Coordinador Demo")).toBeEnabled();
      expect(anadirEnFila("Coordinador Demo")).toHaveTextContent("Añadir");
    });
  });
});
