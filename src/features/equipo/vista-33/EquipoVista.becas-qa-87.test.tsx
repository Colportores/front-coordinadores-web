import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BecaDeColportor, DatosEquipoPorCiudad, ResultadoBeca, TipoDeBeca } from "@/datos/equipo/contrato";

import type { AccionesEquipo } from "./acciones";
import { colportor, datosDePrueba } from "./datos-de-prueba";
import { EquipoVista } from "./EquipoVista";
import { olvidarUnidadDeAvance } from "./unidad-de-avance";

/**
 * QA #87 (vista 33, pestaña Becas, artboard 33C-01): los escenarios literales de HU-BEC-004 y HU-BEC-006, la medida
 * «Ver avance en» sin almacenamiento, el panel «Elegir carrera» con carreras sin meta y los casos límite del avance.
 * Los tests con `skip` documentan un hallazgo del QA: el implementador saca el `skip` cuando lo arregla.
 */
vi.setConfig({ testTimeout: 60_000 });

const teologia = { id: "teo", nombre: "Teología", elegidaEl: "2026-09-01" };

function conDiferido<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

/** Un equipo de un solo colportor, con las becas que se le pasan. */
function equipoDe(nombre: string, id: string, beca: BecaDeColportor | null, extra: Partial<DatosEquipoPorCiudad> = {}): DatosEquipoPorCiudad {
  return datosDePrueba({
    colportores: [colportor({ id, nombre })],
    becas: {
      carreras: [
        { id: "teo", nombre: "Teología", metaMedia: { libros: 60, monto: 30000 }, metaCompleta: { libros: 120, monto: 60000 } },
        { id: "cont", nombre: "Contador Público", metaMedia: null, metaCompleta: null },
      ],
      porColportor: beca ? { [id]: beca } : {},
    },
    ...extra,
  });
}

function crearAcciones(respuesta: (tipo: TipoDeBeca | null) => Promise<ResultadoBeca> | ResultadoBeca) {
  return {
    jornadasParaAcompanar: vi.fn<AccionesEquipo["jornadasParaAcompanar"]>(async () => ({ ok: true, jornadas: [] })),
    registrarAcompanamiento: vi.fn<AccionesEquipo["registrarAcompanamiento"]>(),
    elegirCarrera: vi.fn<AccionesEquipo["elegirCarrera"]>(async (_id, carreraId) => ({
      ok: true,
      beca: {
        carrera: { id: carreraId, nombre: carreraId === "cont" ? "Contador Público" : "Teología", elegidaEl: "2026-10-21" },
        apuntaA: null,
        meta: null,
        avance: { libros: 0, monto: 0 },
      },
    })),
    asignarTipoDeBeca: vi.fn<AccionesEquipo["asignarTipoDeBeca"]>(async (_id, tipo) => respuesta(tipo)),
  } satisfies AccionesEquipo;
}

function mostrar(datos: DatosEquipoPorCiudad, acciones: AccionesEquipo) {
  const resultado = render(<EquipoVista datos={datos} acciones={acciones} />);
  return { ...resultado, acciones, usuario: userEvent.setup() };
}

type Usuario = ReturnType<typeof userEvent.setup>;
const irABecas = (usuario: Usuario) => usuario.click(screen.getByRole("button", { name: "Becas" }));
const fila = (nombre: RegExp | string) => screen.getByRole("row", { name: nombre });
const boton = (nombre: string) => screen.getByRole("button", { name: nombre });
const enCes = (usuario: Usuario) => usuario.click(within(screen.getByRole("group", { name: "Ver avance en" })).getByRole("button", { name: "Compra a la CES" }));

beforeEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
});

afterEach(() => {
  window.localStorage.clear();
  olvidarUnidadDeAvance();
  vi.restoreAllMocks();
});

describe("QA #87 · criterios de aceptación de HU-BEC-004 y HU-BEC-006, con el texto de la HU", () => {
  it("HU-BEC-004 «Avance en monto»: Ana lleva $U 45.000 de una meta de $U 60.000 a la CES y la tabla dice 75 %", async () => {
    const ana: BecaDeColportor = { carrera: teologia, apuntaA: "completa", meta: { libros: 120, monto: 60000 }, avance: { libros: 48, monto: 45000 } };
    const { usuario } = mostrar(equipoDe("Ana Techera", "ana", ana), crearAcciones(() => ({ ok: true, beca: ana })));
    await irABecas(usuario);

    // Junto a su avance en libros (se alterna con «Ver avance en»; la misma meta en las dos medidas).
    expect(within(fila(/^Ana Techera/)).getByText("48 de 120 libros · le faltan 72 · 40 %")).toBeInTheDocument();
    await enCes(usuario);
    expect(within(fila(/^Ana Techera/)).getByText("$U 45.000 de $U 60.000 · le faltan $U 15.000 · 75 %")).toBeInTheDocument();
  });

  it("HU-BEC-006 «Asignar beca completa»: Juan estudia Teología y no tiene tipo; al asignarle «beca completa» su meta pasa a 120 libros y $U 60.000", async () => {
    const sinTipo: BecaDeColportor = { carrera: teologia, apuntaA: null, meta: null, avance: { libros: 0, monto: 0 } };
    const completa: BecaDeColportor = { carrera: teologia, apuntaA: "completa", meta: { libros: 120, monto: 60000 }, avance: { libros: 0, monto: 0 } };
    const { usuario, acciones } = mostrar(equipoDe("Juan Pérez", "juan", sinTipo), crearAcciones(() => ({ ok: true, beca: completa })));
    await irABecas(usuario);
    expect(within(fila(/^Juan Pérez/)).getByText("Sin meta: no apunta a ninguna beca")).toBeInTheDocument();

    await usuario.click(boton("Apuntar a beca completa: Juan Pérez"));

    await waitFor(() => expect(within(fila(/^Juan Pérez/)).getByText("0 de 120 libros · le faltan 120 · 0 %")).toBeInTheDocument());
    expect(acciones.asignarTipoDeBeca).toHaveBeenCalledWith("juan", "completa");
    expect(screen.getByRole("status")).toHaveTextContent("Juan Pérez ahora apunta a beca completa: meta de 120 libros y $U 60.000 a la CES.");
    await enCes(usuario);
    expect(within(fila(/^Juan Pérez/)).getByText("$U 0 de $U 60.000 · le faltan $U 60.000 · 0 %")).toBeInTheDocument();
  });

  it("HU-BEC-006 «Cambiar de media a completa»: Juan lleva 70 libros y su avance se recalcula contra 120", async () => {
    const media: BecaDeColportor = { carrera: teologia, apuntaA: "media", meta: { libros: 60, monto: 30000 }, avance: { libros: 70, monto: 35000 } };
    const completa: BecaDeColportor = { ...media, apuntaA: "completa", meta: { libros: 120, monto: 60000 } };
    const { usuario } = mostrar(equipoDe("Juan Pérez", "juan", media), crearAcciones(() => ({ ok: true, beca: completa })));
    await irABecas(usuario);
    expect(within(fila(/^Juan Pérez/)).getByText("70 de 60 libros · meta alcanzada · 117 %")).toBeInTheDocument();

    await usuario.click(boton("Apuntar a beca completa: Juan Pérez"));

    await waitFor(() => expect(within(fila(/^Juan Pérez/)).getByText("70 de 120 libros · le faltan 50 · 58 %")).toBeInTheDocument());
  });

  it("HU-BEC-006 «carrera sin meta configurada»: avisa «Falta configurar la meta de esta carrera» y pide avisar al Administrador, sin cambiar lo marcado", async () => {
    const sinTipo: BecaDeColportor = {
      carrera: { id: "cont", nombre: "Contador Público", elegidaEl: "2026-09-01" },
      apuntaA: null,
      meta: null,
      avance: { libros: 0, monto: 0 },
    };
    const { usuario } = mostrar(
      equipoDe("Juan Pérez", "juan", sinTipo),
      crearAcciones(() => ({ ok: false, sinMeta: true, mensaje: "Falta configurar la meta de esta carrera. Avisale al administrador para que la cargue." })),
    );
    await irABecas(usuario);

    await usuario.click(boton("Apuntar a media beca: Juan Pérez"));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Falta configurar la meta de esta carrera");
    expect(aviso).toHaveTextContent("Avisale al administrador");
    expect(boton("Dejar sin beca: Juan Pérez")).toHaveAttribute("aria-pressed", "true");
    expect(boton("Apuntar a media beca: Juan Pérez")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("QA #87 · «Ver avance en» y el almacenamiento del navegador", () => {
  const datos = () => equipoDe("Juan Pérez", "juan", { carrera: teologia, apuntaA: "media", meta: { libros: 60, monto: 30000 }, avance: { libros: 30, monto: 15000 } });

  it("un valor guardado que no es una medida conocida se ignora y arranca en «Libros»", async () => {
    window.localStorage.setItem("panel.equipo.unidad-de-avance", "<script>");
    const { usuario } = mostrar(datos(), crearAcciones(() => new Promise(() => {})));
    await irABecas(usuario);

    expect(within(screen.getByRole("group", { name: "Ver avance en" })).getByRole("button", { name: "Libros" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("columnheader", { name: "AVANCE · LIBROS BONIFICABLES" })).toBeInTheDocument();
  });

  it("sin almacenamiento (modo privado): leer y guardar fallan y la medida igual se puede cambiar", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denegado", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("lleno", "QuotaExceededError");
    });
    const { usuario } = mostrar(datos(), crearAcciones(() => new Promise(() => {})));
    await irABecas(usuario);

    await enCes(usuario);

    expect(screen.getByRole("columnheader", { name: "AVANCE · COMPRA A LA CES" })).toBeInTheDocument();
    expect(within(fila(/^Juan Pérez/)).getByText("$U 15.000 de $U 30.000 · le faltan $U 15.000 · 50 %")).toBeInTheDocument();
  });

  it("al cambiar de medida con un guardado en camino, la fila sigue diciendo «Guardando…» y no se pierde el pedido", async () => {
    const respuesta = conDiferido<ResultadoBeca>();
    const completa: BecaDeColportor = { carrera: teologia, apuntaA: "completa", meta: { libros: 120, monto: 60000 }, avance: { libros: 30, monto: 15000 } };
    const { usuario } = mostrar(datos(), crearAcciones(() => respuesta.promesa));
    await irABecas(usuario);

    await usuario.click(boton("Apuntar a beca completa: Juan Pérez"));
    await enCes(usuario);
    expect(within(fila(/^Juan Pérez/)).getByText("Guardando…")).toBeInTheDocument();
    expect(boton("Apuntar a beca completa: Juan Pérez")).toHaveAttribute("aria-pressed", "true");

    respuesta.resolver({ ok: true, beca: completa });
    await waitFor(() => expect(within(fila(/^Juan Pérez/)).getByText("$U 15.000 de $U 60.000 · le faltan $U 45.000 · 25 %")).toBeInTheDocument());
  });
});

describe("QA #87 · «Elegir carrera»", () => {
  const sinCarrera: BecaDeColportor = { carrera: null, apuntaA: null, meta: null, avance: { libros: 0, monto: 0 } };
  const abrir = async (usuario: Usuario) => {
    await usuario.click(boton("Elegir carrera de Juan Pérez"));
    return within(screen.getByRole("region", { name: "Elegir la carrera de Juan Pérez" }));
  };

  it("una carrera sin meta cargada se puede elegir, avisa al marcarla y al asignar el tipo dice qué hacer", async () => {
    const acciones = crearAcciones(() => ({ ok: false, sinMeta: true, mensaje: "Falta configurar la meta de esta carrera. Avisale al administrador para que la cargue." }));
    const { usuario } = mostrar(equipoDe("Juan Pérez", "juan", sinCarrera), acciones);
    await irABecas(usuario);
    const panel = await abrir(usuario);
    expect(panel.getByRole("option", { name: "Contador Público (sin meta cargada)" })).toBeInTheDocument();

    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "cont");
    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));

    expect(await within(fila(/^Juan Pérez/)).findByText("Contador Público")).toBeInTheDocument();
    await usuario.click(boton("Apuntar a beca completa: Juan Pérez"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Avisale al administrador");
    expect(boton("Dejar sin beca: Juan Pérez")).toHaveAttribute("aria-pressed", "true");
  });

  it("falla a mitad con la carrera elegida: lo elegido no se pierde, el botón queda libre y el reintento manda la misma carrera", async () => {
    const acciones = crearAcciones(() => new Promise(() => {}));
    acciones.elegirCarrera.mockResolvedValueOnce({ ok: false, mensaje: "No se pudo guardar. Probá de nuevo." });
    const { usuario } = mostrar(equipoDe("Juan Pérez", "juan", sinCarrera), acciones);
    await irABecas(usuario);
    const panel = await abrir(usuario);
    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "teo");

    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));

    expect(await panel.findByRole("alert")).toHaveTextContent("No se pudo guardar. Probá de nuevo.");
    expect(panel.getByRole("combobox", { name: "Carrera" })).toHaveValue("teo");
    expect(panel.getByRole("button", { name: "Guardar carrera" })).toHaveAttribute("aria-disabled", "false");
    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));
    expect(acciones.elegirCarrera.mock.calls).toEqual([
      ["juan", "teo"],
      ["juan", "teo"],
    ]);
  });

  it("Enter en el selector mientras guarda no manda un segundo envío, aunque se cambie de carrera en el medio", async () => {
    const respuesta = conDiferido<ResultadoBeca>();
    const acciones = crearAcciones(() => new Promise(() => {}));
    acciones.elegirCarrera.mockReturnValueOnce(respuesta.promesa);
    const { usuario } = mostrar(equipoDe("Juan Pérez", "juan", sinCarrera), acciones);
    await irABecas(usuario);
    const panel = await abrir(usuario);
    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "teo");
    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));

    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "cont");
    await usuario.keyboard("{Enter}");
    await usuario.click(panel.getByRole("button", { name: "Guardando…" }));

    expect(acciones.elegirCarrera).toHaveBeenCalledTimes(1);
    respuesta.resolver({ ok: true, beca: { carrera: teologia, apuntaA: null, meta: null, avance: { libros: 0, monto: 0 } } });
    expect(await within(fila(/^Juan Pérez/)).findByText("Teología")).toBeInTheDocument();
  });

  it.skip("el aviso para el lector de pantalla al elegir la carrera dice cuál quedó elegida", async () => {  // QA #68: el aviso de la carrera elegida dice «Quedó guardado el cambio de X» y no cuál carrera quedó (TablaBecas.tsx:518, modelo.ts:362)
    const { usuario } = mostrar(equipoDe("Juan Pérez", "juan", sinCarrera), crearAcciones(() => new Promise(() => {})));
    await irABecas(usuario);
    const panel = await abrir(usuario);
    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "teo");
    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));
    await within(fila(/^Juan Pérez/)).findByText("Teología");

    // Hoy: «Quedó guardado el cambio de Juan Pérez.» (no dice qué cambió).
    expect(screen.getByRole("status")).toHaveTextContent(/Teología/); // QA #87: el aviso de la carrera elegida no dice cuál carrera quedó
  });

  it.skip("la respuesta tarda y se cambia de ciudad: al volver a verlo, el foco no salta solo al botón «Media» de esa fila", async () => {  // QA #68: el foco pendiente de una fila oculta salta al botón «Media» cuando la fila reaparece (TablaBecas.tsx:354, 367-377)
    const respuesta = conDiferido<ResultadoBeca>();
    const acciones = crearAcciones(() => new Promise(() => {}));
    acciones.elegirCarrera.mockReturnValueOnce(respuesta.promesa);
    const datos = datosDePrueba();
    const { usuario } = mostrar(datos, acciones);
    await irABecas(usuario);
    await usuario.click(boton("Elegir carrera de Federico Da Rosa"));
    const panel = within(screen.getByRole("region", { name: "Elegir la carrera de Federico Da Rosa" }));
    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "teo");
    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));

    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    respuesta.resolver({ ok: true, beca: { carrera: teologia, apuntaA: null, meta: null, avance: { libros: 0, monto: 0 } } });
    await waitFor(() => expect(screen.queryByText(/Guardando…/)).not.toBeInTheDocument());
    const otro = screen.getByRole("button", { name: "Becas" });
    otro.focus();
    await usuario.click(screen.getByRole("button", { name: /^Bella Unión/ }));

    // QA #87: el foco pendiente de una fila que no se veía se aplica cuando reaparece, sin que nadie lo pida.
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Apuntar a media beca: Federico Da Rosa" }));
  });
});

describe("QA #87 · datos límite del avance", () => {
  it.skip("a un libro de la meta no se lee «100 %»: queda en 99 % mientras falte algo", async () => {  // QA #68: 239 de 240 se lee «le falta 1 · 100 %» (modelo.ts:347 redondea 99,6 a 100)
    const casi: BecaDeColportor = { carrera: teologia, apuntaA: "completa", meta: { libros: 240, monto: 120000 }, avance: { libros: 239, monto: 119500 } };
    const { usuario } = mostrar(equipoDe("Juan Pérez", "juan", casi), crearAcciones(() => ({ ok: true, beca: casi })));
    await irABecas(usuario);

    const texto = within(fila(/^Juan Pérez/)).getByText(/^239 de 240 libros/).textContent ?? "";
    expect(texto).toContain("le falta 1");
    // QA #87: «le falta 1 · 100 %» afirma una meta cumplida que no es (el redondeo sube 99,6 a 100; la regla de P5 es no afirmar lo que no es).
    expect(texto).not.toContain("100 %");
  });

  it.skip("una meta en monto de 0 con el tipo marcado no dice «no apunta a ninguna beca» (contradice «Media» marcado)", async () => {  // QA #68: meta en $U 0 con «Media» marcado dice «Sin meta: no apunta a ninguna beca» (modelo.ts:340)
    const raro: BecaDeColportor = { carrera: teologia, apuntaA: "media", meta: { libros: 60, monto: 0 }, avance: { libros: 30, monto: 0 } };
    const { usuario } = mostrar(equipoDe("Juan Pérez", "juan", raro), crearAcciones(() => ({ ok: true, beca: raro })));
    await irABecas(usuario);
    await enCes(usuario);

    expect(boton("Apuntar a media beca: Juan Pérez")).toHaveAttribute("aria-pressed", "true");
    // QA #87: con la meta en $U en 0 la fila dice «Sin meta: no apunta a ninguna beca» con «Media» marcado.
    expect(within(fila(/^Juan Pérez/)).queryByText("Sin meta: no apunta a ninguna beca")).not.toBeInTheDocument();
  });

  it("colportor con ceros: 0 de 60 libros no divide por cero ni dibuja una barra con ancho inválido", async () => {
    const cero: BecaDeColportor = { carrera: teologia, apuntaA: "media", meta: { libros: 60, monto: 30000 }, avance: { libros: 0, monto: 0 } };
    const { usuario, container } = mostrar(equipoDe("Juan Pérez", "juan", cero), crearAcciones(() => ({ ok: true, beca: cero })));
    await irABecas(usuario);

    expect(within(fila(/^Juan Pérez/)).getByText("0 de 60 libros · le faltan 60 · 0 %")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("un avance negativo (dato roto del servidor) no pinta una barra de ancho negativo ni dice «le faltan» de más", async () => {
    const roto: BecaDeColportor = { carrera: teologia, apuntaA: "media", meta: { libros: 60, monto: 30000 }, avance: { libros: -5, monto: -100 } };
    const { usuario, container } = mostrar(equipoDe("Juan Pérez", "juan", roto), crearAcciones(() => ({ ok: true, beca: roto })));
    await irABecas(usuario);

    expect(container.innerHTML).not.toMatch(/width:\s*-/);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

describe("QA #87 · sesión vencida con la pantalla abierta", () => {
  it.skip("si el servidor rechaza el guardado porque la sesión venció, dice que hay que entrar de nuevo y no «Necesitás conexión»", async () => {  // QA #68: la marca panel-sesion-vencida se muestra como «Necesitás conexión para guardar la beca» sin salida (useBecas.ts:102)
    const media: BecaDeColportor = { carrera: teologia, apuntaA: "media", meta: { libros: 60, monto: 30000 }, avance: { libros: 30, monto: 15000 } };
    const acciones = crearAcciones(() => Promise.reject(new Error("panel-sesion-vencida")));
    const { usuario } = mostrar(equipoDe("Juan Pérez", "juan", media), acciones);
    await irABecas(usuario);

    await usuario.click(boton("Apuntar a beca completa: Juan Pérez"));

    const aviso = await screen.findByRole("alert");
    // QA #87: la marca `panel-sesion-vencida` (issue #41) no se reconoce en las becas: dice «Necesitás conexión para guardar la beca».
    expect(aviso).not.toHaveTextContent("Necesitás conexión");
    expect(within(aviso.closest("tr") as HTMLElement).getByRole("link", { name: /Entrar de nuevo/i })).toBeInTheDocument();
  });
});

describe("QA #87 · el aviso de un guardado fallido se ve sin tener que desplazar la tabla", () => {
  const sinCarrera: BecaDeColportor = { carrera: null, apuntaA: null, meta: null, avance: { libros: 0, monto: 0 } };
  const media: BecaDeColportor = { carrera: teologia, apuntaA: "media", meta: { libros: 60, monto: 30000 }, avance: { libros: 30, monto: 15000 } };

  // jsdom no calcula el diseño: se comprueba que la vista pide traer el aviso a la vista (o que lo deja antes de los botones).
  const scrollIntoView = vi.fn();
  beforeEach(() => {
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    // @ts-expect-error jsdom no define scrollIntoView: se saca el doble
    delete Element.prototype.scrollIntoView;
  });
  const traidoAVista = (aviso: HTMLElement) => scrollIntoView.mock.contexts.some((el) => el === aviso || (el as Element).contains(aviso) || aviso.contains(el as Element));

  it.skip("«Guardar carrera» sin conexión: el aviso del panel se trae a la vista o queda antes del botón (a 1280×800 queda bajo el borde de la tabla)", async () => { // QA #68: a 1280×800 el aviso del panel «Elegir carrera» queda 7 px bajo el borde visible de la tabla y el foco se queda en el botón: no se ve que falló (TablaBecas.tsx:119)
    const acciones = crearAcciones(() => new Promise(() => {}));
    acciones.elegirCarrera.mockRejectedValueOnce(new Error("Failed to fetch"));
    const { usuario } = mostrar(equipoDe("Juan Pérez", "juan", sinCarrera), acciones);
    await irABecas(usuario);
    await usuario.click(boton("Elegir carrera de Juan Pérez"));
    const panel = within(screen.getByRole("region", { name: "Elegir la carrera de Juan Pérez" }));
    await usuario.selectOptions(panel.getByRole("combobox", { name: "Carrera" }), "teo");

    await usuario.click(panel.getByRole("button", { name: "Guardar carrera" }));

    const aviso = await panel.findByRole("alert");
    const guardar = panel.getByRole("button", { name: "Guardar carrera" });
    const antes = Boolean(aviso.compareDocumentPosition(guardar) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(antes || traidoAVista(aviso)).toBe(true);
  });

  it.skip("«Apunta a» sin conexión en una fila del final: el aviso de la fila se trae a la vista", async () => { // QA #68: el aviso de la fila de abajo queda bajo el borde visible de la tabla (a 1280×800, 0 de 35 px visibles): quien toca «Completa» no ve que no se guardó (TablaBecas.tsx:528)
    const acciones = crearAcciones(() => Promise.reject(new Error("Failed to fetch")));
    const { usuario } = mostrar(equipoDe("Juan Pérez", "juan", media), acciones);
    await irABecas(usuario);

    await usuario.click(boton("Apuntar a beca completa: Juan Pérez"));

    const aviso = await screen.findByRole("alert");
    expect(traidoAVista(aviso)).toBe(true);
  });
});
