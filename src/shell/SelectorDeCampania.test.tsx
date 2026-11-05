import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CampaniaElegible, ResultadoCampanias, ResumenCoordinador } from "@/datos/shell/contrato";
import { COOKIE_CAMPANIA_ELEGIDA } from "@/shell/campania-elegida";
import {
  MS_AVISO_CAMPANIA,
  SelectorDeCampania,
  TEXTO_CARGANDO_CAMPANIAS,
  TEXTO_ERROR_CAMPANIAS,
  TEXTO_REINTENTAR,
  TEXTO_SIN_CAMPANIAS,
  TEXTO_SIN_CAMPANIAS_DETALLE,
  textoSinConexionCampanias,
} from "@/shell/SelectorDeCampania";
import { registrarEnvio, registrarFuente } from "@/shell/trabajo-pendiente";

/**
 * La vista 37 («Topbar Campana»), un artboard por estado: lista abierta (01), cargando (02), error de carga (03), sin
 * conexión (04), un solo ítem (05), vacía (06), nombre largo (07) y campaña cambiada (08), más los casos límite: doble toque,
 * falla a mitad de la acción, dos elecciones seguidas, volver a abrir y teclado.
 */

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const PRIMAVERA: CampaniaElegible = {
  id: "c-primavera",
  nombre: "Primavera 2026",
  ciudades: ["Montevideo", "Las Piedras"],
  fechaInicio: "2026-09-15",
  fechaFin: "2026-12-15",
  estado: "en-curso",
};
const PERMANENTE: CampaniaElegible = {
  id: "c-permanente",
  nombre: "Permanente 2026",
  ciudades: ["Salto"],
  fechaInicio: "2026-03-01",
  fechaFin: "2026-11-30",
  estado: "en-curso",
};
const VERANO: CampaniaElegible = {
  id: "c-verano",
  nombre: "Verano 2027",
  ciudades: ["Maldonado", "Punta del Este", "San Carlos"],
  fechaInicio: "2027-01-04",
  fechaFin: null,
  estado: "por-empezar",
};
const LARGA: CampaniaElegible = {
  id: "c-larga",
  nombre: "Campaña especial de invierno para estudiantes de Teología y Enfermería 2027",
  ciudades: ["Tacuarembó", "Rivera", "Artigas", "Paysandú"],
  fechaInicio: "2027-06-01",
  fechaFin: null,
  estado: "por-empezar",
};

const RESUMEN: ResumenCoordinador = {
  nombre: "Marta",
  iniciales: "MP",
  region: "Montevideo · Las Piedras",
  campania: "Primavera 2026",
  campaniaId: PRIMAVERA.id,
};
const BOTON = "Montevideo · Las Piedras · Primavera 2026";

const lista = (...campanias: CampaniaElegible[]): ResultadoCampanias => ({ ok: true, campanias });

/** Un pedido que contesta cuando el test quiere. */
function pedidoALaEspera() {
  const pendientes: ((r: ResultadoCampanias) => void)[] = [];
  const pedir = vi.fn(
    () =>
      new Promise<ResultadoCampanias>((resolver) => {
        pendientes.push(resolver);
      }),
  );
  return { pedir, contestar: (indice: number, r: ResultadoCampanias) => pendientes[indice](r) };
}

function montar(pedir: () => Promise<ResultadoCampanias>, resumen: ResumenCoordinador = RESUMEN) {
  return render(<SelectorDeCampania resumen={resumen} pedirCampanias={pedir} />);
}

function selector(): HTMLButtonElement {
  const boton = document.querySelector<HTMLButtonElement>("button[aria-haspopup='listbox']");
  if (!boton) throw new Error("no está el botón del selector de campaña");
  return boton;
}
const opciones = () => screen.getAllByRole("option");
const opcion = (nombre: string) => screen.getByRole("option", { name: new RegExp(nombre) });
const avisoLeido = () => document.querySelector("[aria-live='polite']")?.textContent ?? "";
const cookieElegida = () => document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_CAMPANIA_ELEGIDA}=`));

async function abrir() {
  await act(async () => {
    fireEvent.click(selector());
  });
}

async function pulsar(elemento: Element, tecla: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    fireEvent.keyDown(elemento, { key: tecla, ...init });
  });
}

async function elegirConClic(nombre: string) {
  await act(async () => {
    fireEvent.click(opcion(nombre));
  });
}

beforeEach(() => {
  router.refresh.mockClear();
  document.cookie = `${COOKIE_CAMPANIA_ELEGIDA}=; Max-Age=0; Path=/`;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("el botón cerrado", () => {
  it("muestra «<ciudades> · <campaña> ▾», no pide nada al cargar el panel y anuncia que abre una lista", () => {
    const pedir = vi.fn(async () => lista(PRIMAVERA));
    montar(pedir);

    const boton = selector();
    expect(boton).toHaveTextContent(`${BOTON}▾`);
    expect(boton).toHaveAttribute("aria-haspopup", "listbox");
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(boton).toHaveAttribute("title", BOTON);
    // La lista se pide al abrirla, no al cargar el panel.
    expect(pedir).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("artboard 01 · lista abierta, en curso y por empezar", () => {
  it("agrupa EN CURSO y POR EMPEZAR, marca la que se ve y muestra ciudades y fechas", async () => {
    const pedir = vi.fn(async () => lista(PRIMAVERA, PERMANENTE, VERANO));
    montar(pedir);
    await abrir();

    expect(pedir).toHaveBeenCalledTimes(1);
    expect(selector()).toHaveAttribute("aria-expanded", "true");
    expect(selector()).toHaveTextContent(`${BOTON}▴`);
    const listbox = screen.getByRole("listbox", { name: "Campañas" });
    const enCurso = within(listbox).getByRole("group", { name: "EN CURSO" });
    const porEmpezar = within(listbox).getByRole("group", { name: "POR EMPEZAR" });
    expect(within(enCurso).getAllByRole("option")).toHaveLength(2);
    expect(within(porEmpezar).getAllByRole("option")).toHaveLength(1);

    const primavera = opcion("Primavera 2026");
    expect(primavera).toHaveAttribute("aria-selected", "true");
    expect(primavera).toHaveTextContent("✓");
    expect(within(primavera).getByText("Montevideo · Las Piedras")).toBeInTheDocument();
    expect(within(primavera).getByText("15/09 – 15/12 · en curso")).toBeInTheDocument();
    expect(opcion("Permanente 2026")).toHaveAttribute("aria-selected", "false");
    expect(within(opcion("Permanente 2026")).getByText("01/03 – 30/11 · en curso")).toBeInTheDocument();
    expect(within(opcion("Verano 2027")).getByText("Maldonado · Punta del Este · San Carlos")).toBeInTheDocument();
    expect(within(opcion("Verano 2027")).getByText("empieza el 04/01/2027")).toBeInTheDocument();
  });

  it("el foco pasa a la lista y la opción activa es la que se ve", async () => {
    montar(async () => lista(PRIMAVERA, PERMANENTE, VERANO));
    await abrir();

    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveFocus();
    expect(listbox).toHaveAttribute("aria-activedescendant", opcion("Primavera 2026").id);
  });

  it("una campaña en curso sin fin dice desde cuándo (el canvas no dibuja ese caso)", async () => {
    montar(async () => lista({ ...PRIMAVERA, fechaFin: null }));
    await abrir();

    expect(within(opcion("Primavera 2026")).getByText("desde el 15/09 · en curso")).toBeInTheDocument();
  });

  it("una campaña sin ciudades todavía no inventa una línea de ciudades", async () => {
    montar(async () => lista({ ...PRIMAVERA, ciudades: [] }));
    await abrir();

    expect(within(opcion("Primavera 2026")).queryByText("Montevideo · Las Piedras")).not.toBeInTheDocument();
  });
});

describe("artboard 02 · cargando la lista", () => {
  it("dice «Cargando tus campañas…» mientras espera y deja el foco en el botón", async () => {
    const { pedir } = pedidoALaEspera();
    montar(pedir);
    await abrir();

    expect(within(screen.getByRole("status")).getByText(TEXTO_CARGANDO_CAMPANIAS)).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(selector()).toHaveFocus();
  });
});

describe("artboard 03 · error de carga", () => {
  it("avisa qué pasó y ofrece «Reintentar», con el foco en ese botón", async () => {
    montar(async () => ({ ok: false, causa: "error" }));
    await abrir();

    expect(within(screen.getByRole("alert")).getByText(TEXTO_ERROR_CAMPANIAS)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TEXTO_REINTENTAR })).toHaveFocus();
    // Una falla no se toma por «sin campañas».
    expect(screen.queryByText(TEXTO_SIN_CAMPANIAS)).not.toBeInTheDocument();
  });

  it("«Reintentar» vuelve a pedir y, si esta vez contesta, muestra la lista con el foco en ella", async () => {
    const pedir = vi
      .fn<() => Promise<ResultadoCampanias>>()
      .mockResolvedValueOnce({ ok: false, causa: "error" })
      .mockResolvedValueOnce(lista(PRIMAVERA, VERANO));
    montar(pedir);
    await abrir();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: TEXTO_REINTENTAR }));
    });

    expect(pedir).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(opciones()).toHaveLength(2);
    expect(screen.getByRole("listbox")).toHaveFocus();
  });

  it("si el reintento también falla, no queda trabado: el botón sigue ahí para otro intento", async () => {
    const pedir = vi.fn<() => Promise<ResultadoCampanias>>().mockResolvedValue({ ok: false, causa: "error" });
    montar(pedir);
    await abrir();

    for (let intento = 0; intento < 3; intento++) {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: TEXTO_REINTENTAR }));
      });
    }

    expect(pedir).toHaveBeenCalledTimes(4);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TEXTO_REINTENTAR })).toBeEnabled();
  });

  it("si la llamada misma se cae con un error que no es de red, también es un error de carga", async () => {
    montar(async () => {
      throw new Error("boom");
    });
    await abrir();

    expect(within(screen.getByRole("alert")).getByText(TEXTO_ERROR_CAMPANIAS)).toBeInTheDocument();
  });
});

describe("artboard 04 · sin conexión", () => {
  it("dice que se sigue viendo la campaña de siempre y ofrece «Reintentar»", async () => {
    montar(async () => ({ ok: false, causa: "sin-conexion" }));
    await abrir();

    expect(within(screen.getByRole("alert")).getByText(textoSinConexionCampanias("Primavera 2026"))).toBeInTheDocument();
    expect(textoSinConexionCampanias("Primavera 2026")).toBe(
      "Sin conexión. La lista se carga cuando vuelva internet; seguís viendo Primavera 2026.",
    );
    expect(screen.getByRole("button", { name: TEXTO_REINTENTAR })).toBeInTheDocument();
  });

  it("si la llamada se cae porque no hay red, es «sin conexión»", async () => {
    montar(async () => {
      throw new TypeError("Failed to fetch");
    });
    await abrir();

    expect(within(screen.getByRole("alert")).getByText(textoSinConexionCampanias("Primavera 2026"))).toBeInTheDocument();
  });

  it("si el navegador sabe que no hay internet, cualquier caída es «sin conexión»", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    montar(async () => {
      throw new Error("lo que sea");
    });
    await abrir();

    expect(within(screen.getByRole("alert")).getByText(textoSinConexionCampanias("Primavera 2026"))).toBeInTheDocument();
  });

  it("sin campaña que seguir viendo no nombra ninguna", () => {
    expect(textoSinConexionCampanias(null)).toBe("Sin conexión. La lista se carga cuando vuelva internet.");
  });
});

describe("artboard 05 · un solo ítem", () => {
  it("el botón se abre igual (el canvas lo deja abrir) y muestra la única campaña", async () => {
    montar(async () => lista(PRIMAVERA));
    await abrir();

    expect(opciones()).toHaveLength(1);
    expect(screen.getByRole("group", { name: "EN CURSO" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "POR EMPEZAR" })).not.toBeInTheDocument();
    expect(opcion("Primavera 2026")).toHaveAttribute("aria-selected", "true");
  });
});

describe("artboard 06 · vacía, sin campañas", () => {
  const SIN_CAMPANIA: ResumenCoordinador = { nombre: "Marta", iniciales: "MP", region: "", campania: "Sin campaña", campaniaId: null };

  it("el botón dice «Sin campaña» y la lista explica que no hay nada que elegir", async () => {
    montar(async () => lista(), SIN_CAMPANIA);
    expect(selector()).toHaveTextContent("Sin campaña▾");
    await abrir();

    expect(screen.getByText(TEXTO_SIN_CAMPANIAS)).toBeInTheDocument();
    expect(screen.getByText(TEXTO_SIN_CAMPANIAS_DETALLE)).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sin campaña que seguir viendo, «sin conexión» no inventa una", async () => {
    montar(async () => ({ ok: false, causa: "sin-conexion" }), SIN_CAMPANIA);
    await abrir();

    expect(within(screen.getByRole("alert")).getByText(textoSinConexionCampanias(null))).toBeInTheDocument();
  });

  it("aparece una campaña (la coordinadora la creó mientras tanto) y se puede elegir", async () => {
    montar(async () => lista(PRIMAVERA), SIN_CAMPANIA);
    await abrir();

    await elegirConClic("Primavera 2026");

    expect(selector()).toHaveTextContent(`${BOTON}▾`);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("artboard 07 · nombre largo", () => {
  const LARGO: ResumenCoordinador = {
    ...RESUMEN,
    region: LARGA.ciudades.join(" · "),
    campania: LARGA.nombre,
    campaniaId: LARGA.id,
  };

  it("el botón corta con «…» y lleva el nombre entero en el title; la lista lo muestra completo", async () => {
    montar(async () => lista(PRIMAVERA, LARGA, VERANO), LARGO);

    const boton = selector();
    expect(boton).toHaveAttribute("title", `Tacuarembó · Rivera · Artigas · Paysandú · ${LARGA.nombre}`);
    expect(boton.className).toContain("max-w-[300px]");
    expect(boton.querySelector("span.truncate")).not.toBeNull();

    await abrir();
    const larga = opcion("Campaña especial");
    expect(within(larga).getByText(LARGA.nombre)).toBeInTheDocument();
    expect(within(larga).getByText("Tacuarembó · Rivera · Artigas · Paysandú")).toBeInTheDocument();
    expect(larga).toHaveAttribute("aria-selected", "true");
    expect(within(larga).getByText(LARGA.nombre).className).toContain("wrap-anywhere");
  });

  it("una lista larga se desplaza dentro de su caja y no se sale de la pantalla", async () => {
    const muchas = Array.from({ length: 40 }, (_, i) => ({ ...PERMANENTE, id: `c-${i}`, nombre: `Campaña ${i}` }));
    montar(async () => lista(...muchas));
    await abrir();

    expect(opciones()).toHaveLength(40);
    expect(screen.getByRole("listbox").parentElement?.className).toContain("overflow-y-auto");
    expect(screen.getByRole("listbox").parentElement?.className).toContain("max-h-[70vh]");
  });
});

describe("artboard 08 · éxito, campaña cambiada", () => {
  it("elegir otra guarda la elección, recarga la pestaña, cierra la lista y avisa «Ahora ves …»", async () => {
    montar(async () => lista(PRIMAVERA, PERMANENTE, VERANO));
    await abrir();
    await elegirConClic("Verano 2027");

    expect(cookieElegida()).toBe(`${COOKIE_CAMPANIA_ELEGIDA}=${VERANO.id}`);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    const boton = selector();
    expect(boton).toHaveTextContent("Maldonado · Punta del Este · San Carlos · Verano 2027▾");
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(boton).toHaveFocus();
    expect(avisoLeido()).toBe("Ahora ves Verano 2027.");
    expect(screen.getByText("Ahora ves Verano 2027.", { selector: "div[aria-hidden]" })).toBeInTheDocument();
  });

  it("al reabrir, la marcada es la nueva", async () => {
    montar(async () => lista(PRIMAVERA, PERMANENTE, VERANO));
    await abrir();
    await elegirConClic("Verano 2027");
    await abrir();

    expect(opcion("Verano 2027")).toHaveAttribute("aria-selected", "true");
    expect(opcion("Primavera 2026")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-activedescendant", opcion("Verano 2027").id);
  });

  it("el aviso se va solo a los 5 segundos", async () => {
    vi.useFakeTimers();
    montar(async () => lista(PRIMAVERA, VERANO));
    await abrir();
    await elegirConClic("Verano 2027");
    expect(avisoLeido()).toBe("Ahora ves Verano 2027.");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MS_AVISO_CAMPANIA - 1);
    });
    expect(avisoLeido()).toBe("Ahora ves Verano 2027.");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(avisoLeido()).toBe("");
    expect(screen.queryByText("Ahora ves Verano 2027.")).not.toBeInTheDocument();
  });
});

describe("elegir la que ya se ve", () => {
  it("solo cierra la lista: no recarga nada, no guarda nada, no avisa", async () => {
    montar(async () => lista(PRIMAVERA, VERANO));
    await abrir();
    await elegirConClic("Primavera 2026");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(cookieElegida()).toBeUndefined();
    expect(avisoLeido()).toBe("");
    expect(selector()).toHaveFocus();
  });
});

describe("dos elecciones seguidas", () => {
  it("la segunda reemplaza el aviso y reinicia su plazo; ninguna se pierde", async () => {
    vi.useFakeTimers();
    montar(async () => lista(PRIMAVERA, PERMANENTE, VERANO));
    await abrir();
    await elegirConClic("Verano 2027");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    await abrir();
    await elegirConClic("Permanente 2026");
    expect(avisoLeido()).toBe("Ahora ves Permanente 2026.");
    expect(cookieElegida()).toBe(`${COOKIE_CAMPANIA_ELEGIDA}=${PERMANENTE.id}`);
    expect(router.refresh).toHaveBeenCalledTimes(2);

    // 6 s después de la primera, pero solo 3 de la segunda: el aviso sigue.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(avisoLeido()).toBe("Ahora ves Permanente 2026.");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MS_AVISO_CAMPANIA - 3_000);
    });
    expect(avisoLeido()).toBe("");
  });
});

describe("volver a abrir", () => {
  it("la lista se pide cada vez que se abre y lo último que contestó reemplaza a lo anterior", async () => {
    const pedir = vi
      .fn<() => Promise<ResultadoCampanias>>()
      .mockResolvedValueOnce(lista(PRIMAVERA))
      .mockResolvedValueOnce(lista(PRIMAVERA, VERANO));
    montar(pedir);
    await abrir();
    expect(opciones()).toHaveLength(1);

    await abrir(); // cierra
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await abrir();

    expect(pedir).toHaveBeenCalledTimes(2);
    expect(opciones()).toHaveLength(2);
  });

  it("lo que contesta tarde, después de cerrar, no se muestra ni pisa el pedido nuevo", async () => {
    const { pedir, contestar } = pedidoALaEspera();
    montar(pedir);
    await abrir();
    await pulsar(selector(), "Escape");
    await abrir();
    expect(pedir).toHaveBeenCalledTimes(2);

    await act(async () => {
      contestar(0, lista(PRIMAVERA, PERMANENTE));
    });
    // El pedido viejo no cuenta: sigue cargando el segundo.
    expect(screen.getByRole("status")).toHaveTextContent(TEXTO_CARGANDO_CAMPANIAS);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await act(async () => {
      contestar(1, lista(VERANO));
    });
    expect(opciones()).toHaveLength(1);
    expect(opcion("Verano 2027")).toBeInTheDocument();
  });

  it("si contesta después de cerrar y no se vuelve a abrir, no aparece nada ni se roba el foco", async () => {
    const { pedir, contestar } = pedidoALaEspera();
    montar(pedir);
    await abrir();
    await pulsar(selector(), "Escape");

    await act(async () => {
      contestar(0, lista(PRIMAVERA));
    });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(selector()).toHaveFocus();
  });
});

describe("teclado", () => {
  it("↓ abre la lista desde el botón", async () => {
    montar(async () => lista(PRIMAVERA, VERANO));
    await pulsar(selector(), "ArrowDown");

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("↑ también la abre", async () => {
    montar(async () => lista(PRIMAVERA, VERANO));
    await pulsar(selector(), "ArrowUp");

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("las flechas, Inicio y Fin mueven la opción activa sin pasarse de los extremos", async () => {
    montar(async () => lista(PRIMAVERA, PERMANENTE, VERANO));
    await abrir();
    const listbox = screen.getByRole("listbox");

    await pulsar(listbox, "ArrowDown");
    expect(listbox).toHaveAttribute("aria-activedescendant", opcion("Permanente 2026").id);
    await pulsar(listbox, "ArrowDown");
    await pulsar(listbox, "ArrowDown");
    expect(listbox).toHaveAttribute("aria-activedescendant", opcion("Verano 2027").id);
    await pulsar(listbox, "ArrowUp");
    expect(listbox).toHaveAttribute("aria-activedescendant", opcion("Permanente 2026").id);
    await pulsar(listbox, "Home");
    expect(listbox).toHaveAttribute("aria-activedescendant", opcion("Primavera 2026").id);
    await pulsar(listbox, "ArrowUp");
    expect(listbox).toHaveAttribute("aria-activedescendant", opcion("Primavera 2026").id);
    await pulsar(listbox, "End");
    expect(listbox).toHaveAttribute("aria-activedescendant", opcion("Verano 2027").id);
  });

  it("Enter elige la opción activa", async () => {
    montar(async () => lista(PRIMAVERA, PERMANENTE, VERANO));
    await abrir();
    const listbox = screen.getByRole("listbox");
    await pulsar(listbox, "ArrowDown");
    await pulsar(listbox, "Enter");

    expect(cookieElegida()).toBe(`${COOKIE_CAMPANIA_ELEGIDA}=${PERMANENTE.id}`);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(selector()).toHaveFocus();
  });

  it("Espacio también elige", async () => {
    montar(async () => lista(PRIMAVERA, VERANO));
    await abrir();
    const listbox = screen.getByRole("listbox");
    await pulsar(listbox, "End");
    await pulsar(listbox, " ");

    expect(cookieElegida()).toBe(`${COOKIE_CAMPANIA_ELEGIDA}=${VERANO.id}`);
  });

  it("Enter mantenido no elige dos veces", async () => {
    montar(async () => lista(PRIMAVERA, VERANO));
    await abrir();
    const listbox = screen.getByRole("listbox");
    await pulsar(listbox, "End");
    await pulsar(listbox, "Enter", { repeat: true });

    expect(router.refresh).not.toHaveBeenCalled();
    await pulsar(listbox, "Enter");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("Esc cierra, devuelve el foco al botón y no llega a la pestaña (la vista 23 saldría de la pantalla)", async () => {
    const enLaPestana = vi.fn();
    document.addEventListener("keydown", enLaPestana);
    try {
      montar(async () => lista(PRIMAVERA, VERANO));
      await abrir();
      await pulsar(screen.getByRole("listbox"), "Escape");

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(selector()).toHaveFocus();
      expect(selector()).toHaveAttribute("aria-expanded", "false");
      expect(enLaPestana).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", enLaPestana);
    }
  });

  it("con la lista cerrada, Esc sigue su camino hacia la pestaña", async () => {
    const enLaPestana = vi.fn();
    document.addEventListener("keydown", enLaPestana);
    try {
      montar(async () => lista(PRIMAVERA));
      await pulsar(selector(), "Escape");

      expect(enLaPestana).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", enLaPestana);
    }
  });

  it("Esc con el error a la vista también cierra y devuelve el foco", async () => {
    montar(async () => ({ ok: false, causa: "error" }));
    await abrir();
    await pulsar(screen.getByRole("button", { name: TEXTO_REINTENTAR }), "Escape");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(selector()).toHaveFocus();
  });

  it("las flechas no hacen nada mientras carga ni con el error a la vista", async () => {
    const { pedir } = pedidoALaEspera();
    montar(pedir);
    await abrir();
    await pulsar(selector(), "ArrowDown");

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(pedir).toHaveBeenCalledTimes(1);
  });
});

describe("cerrar sin elegir", () => {
  it("un clic fuera cierra la lista sin mover el foco", async () => {
    montar(async () => lista(PRIMAVERA, VERANO));
    await abrir();
    const afuera = document.createElement("button");
    document.body.append(afuera);
    await act(async () => {
      afuera.focus();
      fireEvent.pointerDown(afuera);
    });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(afuera).toHaveFocus();
    afuera.remove();
  });

  it("un clic dentro de la lista no la cierra", async () => {
    montar(async () => lista(PRIMAVERA, VERANO));
    await abrir();
    await act(async () => {
      fireEvent.pointerDown(screen.getByRole("listbox"));
    });

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("Tab hacia afuera la cierra", async () => {
    montar(async () => lista(PRIMAVERA, VERANO));
    await abrir();
    const afuera = document.createElement("button");
    document.body.append(afuera);
    await act(async () => {
      fireEvent.focusOut(screen.getByRole("listbox"), { relatedTarget: afuera });
    });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    afuera.remove();
  });

  it("que se quite el elemento enfocado (el foco sin destino) no la cierra", async () => {
    montar(async () => lista(PRIMAVERA, VERANO));
    await abrir();
    await act(async () => {
      fireEvent.focusOut(screen.getByRole("listbox"), { relatedTarget: null });
    });

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("el botón cierra la lista abierta", async () => {
    montar(async () => lista(PRIMAVERA, VERANO));
    await abrir();
    await abrir();

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(selector()).toHaveFocus();
  });
});

describe("con inscripciones por mandar (vista 23)", () => {
  it("no cambia de campaña hasta que contestan, y recién ahí recarga la pestaña", async () => {
    let contestar!: () => void;
    registrarEnvio(
      new Promise<void>((resolver) => {
        contestar = resolver;
      }),
    );
    montar(async () => lista(PRIMAVERA, VERANO));
    await abrir();
    await elegirConClic("Verano 2027");

    // Esperando: nada cambió todavía.
    expect(router.refresh).not.toHaveBeenCalled();
    expect(cookieElegida()).toBeUndefined();
    expect(selector()).toHaveTextContent(BOTON);

    await act(async () => {
      contestar();
    });

    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(cookieElegida()).toBe(`${COOKIE_CAMPANIA_ELEGIDA}=${VERANO.id}`);
    expect(selector()).toHaveTextContent("Verano 2027");
  });

  it("doble toque mientras espera: se elige una sola vez", async () => {
    let contestar!: () => void;
    registrarEnvio(
      new Promise<void>((resolver) => {
        contestar = resolver;
      }),
    );
    montar(async () => lista(PRIMAVERA, PERMANENTE, VERANO));
    await abrir();
    await elegirConClic("Verano 2027");
    // El segundo toque cae sobre otra opción mientras la primera espera: gana la primera.
    await elegirConClic("Permanente 2026");
    expect(screen.getByRole("listbox").parentElement).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      contestar();
    });

    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(cookieElegida()).toBe(`${COOKIE_CAMPANIA_ELEGIDA}=${VERANO.id}`);
    expect(avisoLeido()).toBe("Ahora ves Verano 2027.");
  });

  it("si una inscripción falla, la campaña no cambia, la lista se cierra y se puede volver a elegir", async () => {
    let sale = false;
    const baja = registrarFuente({ hayPorMandar: () => !sale, confirmar: async () => false });
    montar(async () => lista(PRIMAVERA, VERANO));
    await abrir();
    await elegirConClic("Verano 2027");

    expect(router.refresh).not.toHaveBeenCalled();
    expect(cookieElegida()).toBeUndefined();
    expect(selector()).toHaveTextContent(BOTON);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(avisoLeido()).toBe("");

    // La vista resolvió su aviso: ahora sí se puede.
    sale = true;
    baja();
    await abrir();
    await elegirConClic("Verano 2027");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
