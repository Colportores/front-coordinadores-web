import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CandidatoColportor,
  DatosAnadirColportor,
  ResultadoBusqueda,
  ResultadoInscripcion,
} from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { AnadirColportor } from "@/features/equipo/AnadirColportor";

/**
 * Vista 23, cuentas de coordinación o de administración entre los candidatos (decisión de Cristian, 11/11): se pueden añadir
 * como colportor igual que antes (HU-CAM-004, 02/10), pero la fila lleva una etiqueta de advertencia junto al nombre, en los
 * sugeridos y en la búsqueda, y el detalle lo dice con palabras.
 */

const navegacion = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navegacion.push }) }));

type Inscribir = (id: string) => Promise<ResultadoInscripcion>;
type Buscar = (texto: string, despuesDe: string | null) => Promise<ResultadoBusqueda>;

const buscarEnLaSimulada: Buscar = (texto, despuesDe) => fuenteEquipoSimulada.buscarCandidatos("c", texto, despuesDe);

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

/** Los sugeridos como los dejó la demo el 11/11: una cuenta de coordinación entre las pendientes de asignación. */
const DATOS_CON_COORDINADOR: DatosAnadirColportor = {
  ...DATOS_ANADIR_COLPORTOR_SIMULADO,
  sugeridos: [COLPORTORA, COORDINADOR, ADMINISTRADORA],
};

function montar(opciones: { inscribir?: Inscribir; buscar?: Buscar; datos?: DatosAnadirColportor } = {}) {
  const inscribir = vi.fn(opciones.inscribir ?? (async () => ({ ok: true as const })));
  const buscar = vi.fn(opciones.buscar ?? buscarEnLaSimulada);
  const vista = render(
    <AnadirColportor datos={opciones.datos ?? DATOS_CON_COORDINADOR} inscribir={inscribir} buscar={buscar} />,
  );
  return { inscribir, buscar, ...vista };
}

const caja = () => screen.getByRole("textbox", { name: "Buscar por email o nombre" });
const fila = (id: string) => {
  const li = document.querySelector<HTMLElement>(`[data-candidato-id="${id}"]`);
  if (!li) throw new Error(`falta la fila ${id}`);
  return li;
};
const etiquetaDe = (id: string) => fila(id).querySelector<HTMLElement>("[data-etiqueta-rol]");

async function buscarTexto(texto: string) {
  await userEvent.type(caja(), texto);
  await waitFor(() => expect(screen.queryByText("Buscando cuentas…")).not.toBeInTheDocument());
}

describe("AnadirColportor · cuentas de coordinación o de administración", () => {
  afterEach(() => {
    navegacion.push.mockClear();
  });

  describe("la etiqueta junto al nombre", () => {
    it("en los sugeridos, la cuenta de coordinación dice «Coordinador» y la de administración «Administración»; la del colportor, nada", () => {
      montar();

      expect(etiquetaDe(COORDINADOR.id)).toHaveTextContent("Coordinador");
      expect(etiquetaDe(ADMINISTRADORA.id)).toHaveTextContent("Administración");
      expect(etiquetaDe(COLPORTORA.id)).toBeNull();
      // Sigue en la lista, con su estado de siempre y «Añadir» habilitado: avisa, no bloquea ni esconde.
      expect(screen.getByRole("heading", { name: "PENDIENTES DE ASIGNACIÓN · 3" })).toBeInTheDocument();
      expect(within(fila(COORDINADOR.id)).getByText("◔ Pendiente de asignación")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Añadir a Coordinador Demo" })).toBeEnabled();
    });

    it("en la búsqueda también (los datos de ejemplo traen a Tomás Ibarra, coordinador, y a Marta Rivas, de administración)", async () => {
      montar({ datos: DATOS_ANADIR_COLPORTOR_SIMULADO });

      await buscarTexto("ibarra");
      expect(etiquetaDe("usr-tomas-ibarra")).toHaveTextContent("Coordinador");
      expect(screen.getByRole("button", { name: "Añadir a Tomás Ibarra" })).toBeEnabled();

      await userEvent.clear(caja());
      await buscarTexto("marta");
      expect(etiquetaDe("usr-marta-rivas")).toHaveTextContent("Administración");
    });

    it("una búsqueda sin cuentas de coordinación no muestra ninguna etiqueta", async () => {
      montar({ datos: DATOS_ANADIR_COLPORTOR_SIMULADO });
      await buscarTexto("ana");

      expect(document.querySelector("[data-etiqueta-rol]")).toBeNull();
    });

    it("no depende del color: tiene texto, un ícono que el lector no lee y el prefijo «Atención: cuenta de»", () => {
      montar();
      const etiqueta = etiquetaDe(COORDINADOR.id)!;

      expect(etiqueta).toHaveTextContent("Atención: cuenta de Coordinador");
      expect(etiqueta.querySelector("[aria-hidden]")).toHaveTextContent("!");
      expect(etiqueta.querySelector(".sr-only")).toHaveTextContent("Atención: cuenta de");
    });

    it("los botones de la fila la llevan como descripción, sin cambiarles el nombre", () => {
      montar();

      const anadir = screen.getByRole("button", { name: "Añadir a Coordinador Demo" });
      const elegir = screen.getByRole("button", { name: "Elegir a Coordinador Demo" });
      expect(anadir).toHaveAccessibleDescription("Atención: cuenta de Coordinador");
      expect(elegir).toHaveAccessibleDescription("Atención: cuenta de Coordinador");
      // La fila de un colportor queda como estaba.
      expect(screen.getByRole("button", { name: "Añadir a Lucía Fernández" })).not.toHaveAttribute("aria-describedby");
    });

    it("una cuenta de coordinación suspendida lleva la etiqueta y el bloqueo de siempre", () => {
      const suspendida = cuenta("usr-suspendida", "Vera Vieja", { estadoCuenta: "suspendida", rolCuenta: "coordinador" });
      montar({ datos: { ...DATOS_ANADIR_COLPORTOR_SIMULADO, sugeridos: [suspendida] } });

      expect(etiquetaDe(suspendida.id)).toHaveTextContent("Coordinador");
      expect(within(fila(suspendida.id)).getByRole("note")).toHaveTextContent("Cuenta suspendida.");
      expect(screen.getByRole("button", { name: "Añadir a Vera Vieja" })).toBeDisabled();
    });

    it("con un nombre muy largo la etiqueta no se parte ni se pierde", () => {
      const largo = cuenta("usr-largo", `${"Maximiliano".repeat(12)} De Los Santos`, { rolCuenta: "administracion" });
      montar({ datos: { ...DATOS_ANADIR_COLPORTOR_SIMULADO, sugeridos: [largo] } });

      const etiqueta = etiquetaDe(largo.id)!;
      expect(etiqueta).toHaveTextContent("Administración");
      expect(etiqueta.className).toContain("whitespace-nowrap");
    });
  });

  describe("el detalle de la cuenta", () => {
    it("dice el tipo de cuenta y avisa que no es de un colportor", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Coordinador Demo" }));

      const detalle = screen.getByRole("region", { name: "Detalle de Coordinador Demo" });
      expect(within(detalle).getByText("Tipo de cuenta", { selector: "dt" })).toBeInTheDocument();
      expect(detalle.querySelector("dd [data-etiqueta-rol]")).toHaveTextContent("Coordinador");
      expect(within(detalle).getByRole("note")).toHaveTextContent("Esta cuenta es de coordinación, no de un colportor.");
      const boton = within(detalle).getByRole("button", { name: "Añadir a Verano 2026" });
      expect(boton).toBeEnabled();
      expect(boton).toHaveAccessibleDescription(/Esta cuenta es de coordinación, no de un colportor\./);
    });

    it("la de administración lo dice con su área", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Alicia Benítez" }));

      const detalle = screen.getByRole("region", { name: "Detalle de Alicia Benítez" });
      expect(within(detalle).getByRole("note")).toHaveTextContent("Esta cuenta es de administración, no de un colportor.");
    });

    it("el detalle de un colportor no tiene ni la fila «Tipo de cuenta» ni el aviso", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Elegir a Lucía Fernández" }));

      const detalle = screen.getByRole("region", { name: "Detalle de Lucía Fernández" });
      expect(within(detalle).queryByText("Tipo de cuenta")).not.toBeInTheDocument();
      expect(within(detalle).queryByRole("note")).not.toBeInTheDocument();
      expect(detalle.querySelector("[data-etiqueta-rol]")).toBeNull();
    });
  });
});
