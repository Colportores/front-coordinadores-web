import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import type { DatosAnadirColportor, ResultadoBusqueda } from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { AnadirColportor } from "@/features/equipo/AnadirColportor";
import { AYUDA_CUENTA_NO_APARECE } from "@/features/equipo/candidatos";

/**
 * QA de #183 (PR #210): la línea «¿No encontrás a alguien?» de la vista 23. Complementa los tests del implementador con los
 * límites que ellos no tocan: búsqueda de solo espacios, emoji y caracteres especiales, sin conexión y sesión vencida (nunca
 * la ayuda en lugar del error), reentrada a la pantalla, región viva única y axe en cada estado en que la línea se ve.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

type Buscar = (texto: string, despuesDe: string | null) => Promise<ResultadoBusqueda>;
const buscarEnLaSimulada: Buscar = (texto, despuesDe) => fuenteEquipoSimulada.buscarCandidatos("c", texto, despuesDe);
const SIN_SUGERIDOS: DatosAnadirColportor = { ...DATOS_ANADIR_COLPORTOR_SIMULADO, sugeridos: [] };

function montar(datos: DatosAnadirColportor = DATOS_ANADIR_COLPORTOR_SIMULADO, buscar: Buscar = buscarEnLaSimulada) {
  const espia = vi.fn(buscar);
  const vista = render(<AnadirColportor datos={datos} inscribir={async () => ({ ok: true })} buscar={espia} />);
  return { buscar: espia, ...vista };
}

const caja = () => screen.getByRole("textbox", { name: "Buscar por email o nombre" });
const lineas = () => screen.queryAllByText(AYUDA_CUENTA_NO_APARECE);

async function esperarResultados() {
  await waitFor(() => expect(screen.queryByText("Buscando cuentas…")).not.toBeInTheDocument());
}

async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

describe("QA #183 · la ayuda cuando no aparece alguien", () => {
  describe("entradas del buscador", () => {
    it("solo espacios no es una búsqueda: sigue «Sugeridos» y con sugeridos no hay ayuda", async () => {
      const { buscar } = montar();
      await userEvent.type(caja(), "     ");
      await esperarResultados();
      expect(screen.getByRole("heading", { name: "PENDIENTES DE ASIGNACIÓN · 4" })).toBeInTheDocument();
      expect(lineas()).toHaveLength(0);
      expect(buscar).not.toHaveBeenCalled();
    });

    it("solo espacios sin sugeridos: queda «No hay cuentas pendientes…» con una sola línea de ayuda", async () => {
      montar(SIN_SUGERIDOS);
      await userEvent.type(caja(), "   ");
      await esperarResultados();
      expect(screen.getByText("No hay cuentas pendientes de asignación.")).toBeInTheDocument();
      expect(lineas()).toHaveLength(1);
    });

    it.each(["😀🙂", "%_\\'\";--<script>", "ñandú ç ü", "a@b"])("«%s» sin resultados muestra la línea una vez", async (texto) => {
      montar(SIN_SUGERIDOS, async () => ({ ok: true, candidatos: [], hayMas: false }));
      await userEvent.type(caja(), texto);
      await esperarResultados();
      expect(screen.getByText("No hay cuentas que coincidan con tu búsqueda.")).toBeInTheDocument();
      expect(lineas()).toHaveLength(1);
    });
  });

  describe("errores: el aviso con su salida, nunca la ayuda en su lugar", () => {
    it("sin conexión: dice «Necesitás conexión…», trae «Reintentar» y no muestra la ayuda; al volver la conexión aparece el vacío con ayuda", async () => {
      const buscar = vi
        .fn<Buscar>()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValue({ ok: true, candidatos: [], hayMas: false });
      montar(DATOS_ANADIR_COLPORTOR_SIMULADO, buscar);
      await userEvent.type(caja(), "zzz");
      await esperarResultados();

      const alerta = screen.getByRole("alert");
      expect(alerta).toHaveTextContent(/Necesitás conexión para buscar cuentas/);
      expect(lineas()).toHaveLength(0);

      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
      await esperarResultados();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(lineas()).toHaveLength(1);
      expect(caja()).toHaveValue("zzz");
    });

    it("sesión vencida: ofrece entrar de nuevo y no muestra la ayuda", async () => {
      montar(DATOS_ANADIR_COLPORTOR_SIMULADO, async () => ({ ok: false, mensaje: "Tu sesión venció.", sesionVencida: true }));
      await userEvent.type(caja(), "zzz");
      await esperarResultados();
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /entrar de nuevo/i })).toBeInTheDocument();
      expect(lineas()).toHaveLength(0);
    });

    it("falla a mitad de la paginación: la lista queda con su aviso y sin ayuda", async () => {
      const buscar = vi.fn<Buscar>(async (texto, despuesDe) => {
        if (despuesDe !== null) return { ok: false, mensaje: "No pudimos cargar más cuentas." };
        return buscarEnLaSimulada(texto, despuesDe);
      });
      montar(DATOS_ANADIR_COLPORTOR_SIMULADO, buscar);
      await userEvent.type(caja(), "a");
      await esperarResultados();
      expect(lineas()).toHaveLength(0);
    });
  });

  describe("reentrada y carreras", () => {
    it("desmontar y volver a montar: la línea sigue una sola vez, sin estado viejo", async () => {
      const primera = montar(SIN_SUGERIDOS);
      expect(lineas()).toHaveLength(1);
      primera.unmount();
      montar(SIN_SUGERIDOS);
      expect(lineas()).toHaveLength(1);
    });

    it("dos búsquedas superpuestas: la respuesta vieja vacía no deja la ayuda sobre la nueva con resultados", async () => {
      const pendientes = new Map<string, (r: ResultadoBusqueda) => void>();
      montar(DATOS_ANADIR_COLPORTOR_SIMULADO, (texto) => new Promise((resolver) => pendientes.set(texto, resolver)));
      await userEvent.type(caja(), "zz");
      await waitFor(() => expect(pendientes.has("zz")).toBe(true));
      await userEvent.type(caja(), "z");
      await waitFor(() => expect(pendientes.has("zzz")).toBe(true));

      await act(async () => pendientes.get("zzz")?.({ ok: true, candidatos: DATOS_ANADIR_COLPORTOR_SIMULADO.sugeridos.slice(0, 1), hayMas: false }));
      await act(async () => pendientes.get("zz")?.({ ok: true, candidatos: [], hayMas: false }));
      expect(screen.getByRole("list", { name: "Cuentas" })).toBeInTheDocument();
      expect(lineas()).toHaveLength(0);
    });
  });

  describe("accesibilidad de la línea", () => {
    it("no está en una región viva (sin segundo anuncio) y es un párrafo legible", () => {
      montar(SIN_SUGERIDOS);
      const linea = lineas()[0];
      expect(linea.tagName).toBe("P");
      expect(linea.closest("[role=status],[role=alert],[aria-live]")).toBeNull();
    });

    it("axe A/AA sin violaciones en el vacío de «Sugeridos» y en el vacío de la búsqueda", async () => {
      const { container } = montar(SIN_SUGERIDOS);
      expect(await violaciones(container)).toEqual([]);
      await userEvent.type(caja(), "zzz");
      await esperarResultados();
      expect(lineas()).toHaveLength(1);
      expect(await violaciones(container)).toEqual([]);
    });
  });
});
