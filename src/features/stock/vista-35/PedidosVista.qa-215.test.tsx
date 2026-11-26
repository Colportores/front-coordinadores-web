import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AccionesPedidos,
  DatosDePedidos,
  DecisionDeSolicitud,
  ResultadoDeAccion,
  SolicitudResuelta,
} from "@/datos/stock/pedidos";
import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";
import { MS_DESHACER } from "@/features/cuentas/vista-29/modelo";
import {
  hayTrabajoPendiente,
  reiniciarTrabajoPendiente,
} from "@/shell/trabajo-pendiente";

import { PedidosVista } from "./PedidosVista";

/**
 * QA de #215 (la vista 35 conectada a las RPC de la bandeja): lo que cambia cuando la decisión ya no es simulada. Una decisión que
 * la base rechaza con su propio texto, «Quitar el límite» cruzado con una decisión que vence a la vez, y el trabajo pendiente
 * que no queda trabado si el límite no se guarda.
 */

const AHORA = new Date("2026-10-22T18:00:00-03:00");
type Resultado = ResultadoDeAccion<SolicitudResuelta>;
type Limite = ResultadoDeAccion<{ limiteDeDeuda: number | null }>;

const ok = (d: DecisionDeSolicitud): Resultado => ({
  ok: true,
  valor: {
    tipo: d.tipo,
    id: d.id,
    estado: d.tipo === "pedido" ? "AUTORIZADO" : "AUTORIZADA",
    resueltoEn: AHORA.toISOString(),
    motivoDeRechazo: null,
  },
});

function acciones(
  decidir: (d: DecisionDeSolicitud) => Promise<Resultado> | Resultado = ok,
  limite: (l: number | null) => Promise<Limite> | Limite = (l) => ({
    ok: true,
    valor: { limiteDeDeuda: l },
  }),
) {
  return {
    decidir: vi.fn(async (d: DecisionDeSolicitud) => decidir(d)),
    editarLimite: vi.fn(async (l: number | null) => limite(l)),
  } satisfies AccionesPedidos;
}

function montar(a = acciones(), cambios: Partial<DatosDePedidos> = {}) {
  render(
    <PedidosVista
      datos={{ ...crearDatosDePedidosSimulados(AHORA), ...cambios }}
      acciones={a}
    />,
  );
  return a;
}

const tocar = (el: HTMLElement) => act(async () => fireEvent.click(el));
const avanzar = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });
const abrirLimite = () =>
  tocar(screen.getByRole("button", { name: "Editar límite" }));
const quitar = () => screen.getByRole("button", { name: "Quitar el límite" });
const autorizar231 = () =>
  tocar(
    screen.getByRole("button", {
      name: "Autorizar el pedido #231 de Emiliano Sosa",
    }),
  );

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  vi.useRealTimers();
  reiniciarTrabajoPendiente();
  vi.restoreAllMocks();
});

describe("decisiones que la base rechaza con su texto (PE001 · PE002 · TR001 · TR002)", () => {
  // Texto de la base (0112): lo escribe `rpc.ts` en `TEXTO_DEL_RECHAZO.PE002` cuando el rechazo llega sin mensaje.
  const OTRA_PERSONA =
    "Este pedido ya no está por autorizar: otra persona lo decidió. Recargá la lista para ver cómo quedó.";

  it.skip("QA #215: «otra persona lo decidió» (PE002/TR002) no puede decir a la vez «Sigue por autorizar»", async () => {
    montar(
      acciones(() => ({
        ok: false,
        causa: "rechazado",
        mensaje: OTRA_PERSONA,
      })),
    );
    await autorizar231();
    await avanzar(MS_DESHACER);

    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("otra persona lo decidió");
    expect(aviso).not.toHaveTextContent("Sigue por autorizar");
  });

  it("un rechazo con un texto propio de la base (TR003, sin stock) se ve entero y deja el pedido por autorizar", async () => {
    const TR003 =
      "Quien da no tiene el stock completo para esta transferencia. Rechazala con un motivo, o esperá a que tenga los libros.";
    const a = montar(
      acciones(() => ({ ok: false, causa: "rechazado", mensaje: TR003 })),
    );
    await tocar(screen.getByRole("tab", { name: /^Transferencias/ }));
    await tocar(screen.getByRole("button", { name: /^T-18,/ }));
    await tocar(
      screen.getByRole("button", { name: /^Autorizar la transferencia T-18/ }),
    );
    await avanzar(MS_DESHACER);

    expect(screen.getByRole("alert")).toHaveTextContent(TR003);
    expect(
      screen.getByRole("button", { name: /^Autorizar la transferencia T-18/ }),
    ).not.toHaveAttribute("aria-disabled", "true");
    expect(a.decidir).toHaveBeenCalledTimes(1);
  });

  it("después de un rechazo de la base se puede volver a decidir: el botón no queda trabado y sale una sola llamada más", async () => {
    const respuestas: Resultado[] = [
      { ok: false, causa: "rechazado", mensaje: "La base dijo que no." },
    ];
    const a = montar(acciones((d) => respuestas.shift() ?? ok(d)));
    await autorizar231();
    await avanzar(MS_DESHACER);
    expect(screen.getByRole("alert")).toHaveTextContent("La base dijo que no.");

    // El detalle abierto pasó al pedido que sigue: se vuelve a elegir el #231 de la lista.
    await tocar(screen.getByRole("button", { name: /^#231,/ }));
    await autorizar231();
    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("tab", { name: /^Autorizados/ })).toHaveTextContent(
      "2",
    );
  });
});

describe("«Quitar el límite» cruzado con una decisión que vence", () => {
  it("la decisión sale mientras el límite se está quitando y las dos quedan aplicadas, sin perder ninguna", async () => {
    let terminar!: (r: Limite) => void;
    const a = montar(
      acciones(ok, () => new Promise<Limite>((res) => (terminar = res))),
    );
    await autorizar231();
    await abrirLimite();
    await tocar(quitar());

    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledExactlyOnceWith({
      tipo: "pedido",
      id: "pedido-231",
      accion: "autorizar",
    });

    await act(async () =>
      terminar({ ok: true, valor: { limiteDeDeuda: null } }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Sin límite de deuda fijado")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Autorizados/ })).toHaveTextContent(
      "2",
    );
  });

  it("quitar el límite no se lleva el «Deshacer» de una decisión que sigue en plazo", async () => {
    const a = montar();
    await autorizar231();
    await abrirLimite();
    await tocar(quitar());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await tocar(
      screen.getByRole("button", {
        name: "Deshacer · 8 s: autorización del pedido #231",
      }),
    );
    await avanzar(MS_DESHACER);
    expect(a.decidir).not.toHaveBeenCalled();
    expect(screen.getByText("Sin límite de deuda fijado")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Autorizar el pedido #231 de Emiliano Sosa",
      }),
    ).toBeInTheDocument();
  });

  it("la decisión que falla mientras el diálogo del límite está abierto vuelve a «por autorizar» y el diálogo conserva lo escrito", async () => {
    const a = montar(acciones(() => ({ ok: false, causa: "sin-conexion" })));
    await autorizar231();
    await abrirLimite();
    const campo = within(screen.getByRole("dialog")).getByRole("textbox");
    await act(async () =>
      fireEvent.change(campo, { target: { value: "42.000" } }),
    );

    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("textbox")).toHaveValue(
      "42.000",
    );
    expect(
      screen
        .getAllByRole("alert")
        .some((x) =>
          /Necesitás conexión para autorizar el pedido #231/.test(
            x.textContent ?? "",
          ),
        ),
    ).toBe(true);
  });
});

describe("trabajo pendiente del límite", () => {
  it("mientras se quita cuenta como trabajo sin contestar y, si falla, no queda trabado", async () => {
    let terminar!: (r: Limite) => void;
    montar(acciones(ok, () => new Promise<Limite>((res) => (terminar = res))));
    expect(hayTrabajoPendiente()).toBe(false);
    await abrirLimite();
    await tocar(quitar());
    expect(hayTrabajoPendiente()).toBe(true);

    await act(async () =>
      terminar({
        ok: false,
        causa: "rechazado",
        mensaje: "La campaña ya terminó.",
      }),
    );
    expect(hayTrabajoPendiente()).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "La campaña ya terminó.",
    );
    expect(quitar()).not.toHaveAttribute("aria-disabled", "true");
  });

  it("una caída del servidor al quitar (la acción tira) tampoco deja trabajo pendiente", async () => {
    montar(acciones(ok, () => Promise.reject(new Error("sin red"))));
    await abrirLimite();
    await tocar(quitar());
    expect(hayTrabajoPendiente()).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Necesitás conexión para quitar el límite.",
    );
  });
});

describe("el límite que la fuente no puede leer (pendiente P1) con el 0 y los reintentos", () => {
  it("sin poder leerlo, guardar 0 lo fija en cero (no «sin límite») y el encabezado deja de decir «todavía no se puede mostrar»", async () => {
    const a = montar(undefined, { limiteDeDeuda: null, limiteSinLeer: true });
    expect(
      screen.getByText(
        "Límite de deuda de la campaña: todavía no se puede mostrar",
      ),
    ).toBeInTheDocument();
    await abrirLimite();
    const campo = within(screen.getByRole("dialog")).getByRole("textbox");
    await act(async () => fireEvent.change(campo, { target: { value: "0" } }));
    await tocar(screen.getByRole("button", { name: "Guardar" }));

    expect(a.editarLimite).toHaveBeenCalledExactlyOnceWith(
      0,
      "campania-primavera-2026",
    );
    expect(
      screen.queryByText(/todavía no se puede mostrar/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/^Límite de deuda de la campaña:/),
    ).toHaveTextContent("$U 0 por colportor");
  });

  it("sin poder leerlo, un campo vacío no guarda nada y lo dice (para quitarlo está el botón)", async () => {
    const a = montar(undefined, { limiteDeDeuda: null, limiteSinLeer: true });
    await abrirLimite();
    await tocar(screen.getByRole("button", { name: "Guardar" }));
    expect(a.editarLimite).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Escribí el límite por colportor, en pesos.",
    );
    expect(quitar()).toBeInTheDocument();
  });
});
