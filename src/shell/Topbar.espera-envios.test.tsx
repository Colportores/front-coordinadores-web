import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResultadoInscripcion } from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { RESUMEN_COORDINADOR_SIMULADO } from "@/datos/shell/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { AnadirColportor, mensajeAnadirSinConexion, MS_DESHACER } from "@/features/equipo/AnadirColportor";
import { MS_ESPERA_BUSQUEDA } from "@/features/equipo/useBusquedaCandidatos";
import { pestanasVisibles } from "@/shell/pestanas";
import { esperarTrabajoPendiente, estaEsperando, hayQueEsperar, MS_TOPE_ESPERA, registrarFuente } from "@/shell/trabajo-pendiente";
import { TEXTO_ESPERANDO_ENVIOS, Topbar } from "@/shell/Topbar";
import { fijarFlags } from "@/test/flags";

/**
 * El menú de secciones y la vista 23 juntos (decisión del 16/10 en #41, pendiente P2): con inscripciones dentro del plazo del
 * «Deshacer» o sin contestar, tocar una sección las manda, espera la respuesta y cambia de pestaña solo si salieron bien. Lo
 * mismo hacen «‹ Equipo», Esc y atrás/adelante del navegador, con una sola espera a la vez y el mismo estado en el menú.
 */

const navegacion = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/equipo/anadir",
  useRouter: () => ({ push: navegacion.push }),
}));
// Sin el router de la app, el enlace real no navega: acá alcanza con saber si el menú lo frenó o lo dejó pasar.
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: React.ComponentProps<"a">) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

const ANA = "usr-ana-martinez";
const GONZALO = "usr-gonzalo-sosa";

/** Cada llamada a `inscribir` queda esperando hasta que el test contesta esa cuenta. */
function servidorALaEspera() {
  const respuestas = new Map<string, { resolver: (r: ResultadoInscripcion) => void; rechazar: (e: Error) => void }>();
  const inscribir = vi.fn(
    (id: string) =>
      new Promise<ResultadoInscripcion>((resolver, rechazar) => respuestas.set(id, { resolver, rechazar })),
  );
  const esperando = (id: string) => {
    const respuesta = respuestas.get(id);
    if (!respuesta) throw new Error(`nadie espera la respuesta de ${id}`);
    return respuesta;
  };
  return {
    inscribir,
    async responder(id: string, resultado: ResultadoInscripcion = { ok: true }) {
      await act(async () => esperando(id).resolver(resultado));
    },
    /** La llamada se cae (sin red, un 5xx, un 429): la promesa de `inscribir` rechaza. */
    async caer(id: string) {
      await act(async () => esperando(id).rechazar(new Error("sin red")));
    },
  };
}

function montar(inscribir: (id: string) => Promise<ResultadoInscripcion>) {
  fijarFlags({ modoDev: false });
  return render(
    <ProveedorModoDev activo={false}>
      <Topbar resumen={RESUMEN_COORDINADOR_SIMULADO} pestanas={pestanasVisibles()} />
      <AnadirColportor
        datos={DATOS_ANADIR_COLPORTOR_SIMULADO}
        inscribir={inscribir}
        buscar={(texto, despuesDe) => fuenteEquipoSimulada.buscarCandidatos("c", texto, despuesDe)}
      />
    </ProveedorModoDev>,
  );
}

const menu = () => screen.getByRole("navigation", { name: "Secciones del panel" });
const seccion = (nombre: string) => within(menu()).getByRole("link", { name: nombre });
const estadoDelMenu = () => within(screen.getByRole("banner")).getByRole("status");
const anadirEnFila = (nombre: string) => screen.getByRole("button", { name: `Añadir a ${nombre}` });

async function tocar(elemento: HTMLElement, init?: MouseEventInit): Promise<boolean> {
  let sinFrenar = true;
  await act(async () => {
    sinFrenar = fireEvent.click(elemento, init);
  });
  return sinFrenar;
}

async function pasar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function cerrarPestana(): boolean {
  const evento = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(evento);
  return evento.defaultPrevented;
}

beforeEach(() => {
  vi.useFakeTimers();
  navegacion.push.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("el menú de secciones con inscripciones por mandar (vista 23)", () => {
  it("sin nada pendiente el enlace navega como siempre: no se frena ni se espera", async () => {
    const { inscribir } = servidorALaEspera();
    montar(inscribir);

    const sinFrenar = await tocar(seccion("Ciudades"));

    expect(sinFrenar).toBe(true);
    expect(navegacion.push).not.toHaveBeenCalled();
    expect(inscribir).not.toHaveBeenCalled();
    expect(estadoDelMenu()).toBeEmptyDOMElement();
  });

  it("con una cuenta dentro del plazo: se manda ya, el menú espera la respuesta y recién entonces cambia de pestaña", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    expect(screen.getByRole("button", { name: "Deshacer: Ana Martínez" })).toBeInTheDocument();

    const sinFrenar = await tocar(seccion("Ciudades"));

    expect(sinFrenar).toBe(false);
    expect(servidor.inscribir).toHaveBeenCalledExactlyOnceWith(ANA);
    expect(estadoDelMenu()).toHaveTextContent(TEXTO_ESPERANDO_ENVIOS);
    expect(within(screen.getByRole("banner")).getAllByText(TEXTO_ESPERANDO_ENVIOS)).toHaveLength(2); // el anuncio y el texto a la vista
    expect(menu()).toHaveAttribute("aria-busy", "true");
    expect(navegacion.push).not.toHaveBeenCalled();
    // Ya no hay nada que deshacer: la inscripción salió.
    expect(screen.queryByRole("button", { name: "Deshacer: Ana Martínez" })).not.toBeInTheDocument();

    await servidor.responder(ANA);

    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
    expect(estadoDelMenu()).toBeEmptyDOMElement();
    expect(within(screen.getByRole("banner")).queryByText(TEXTO_ESPERANDO_ENVIOS)).not.toBeInTheDocument();
    expect(menu()).not.toHaveAttribute("aria-busy");
  });

  it("con el envío ya en camino (pasaron los 8 s) espera la respuesta sin volver a mandarlo", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await pasar(MS_DESHACER);
    expect(servidor.inscribir).toHaveBeenCalledTimes(1);

    const sinFrenar = await tocar(seccion("Reportes"));

    expect(sinFrenar).toBe(false);
    expect(servidor.inscribir).toHaveBeenCalledTimes(1);
    expect(navegacion.push).not.toHaveBeenCalled();

    await servidor.responder(ANA);

    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/reportes");
  });

  it("si el servidor rechaza la inscripción, el menú no cambia de pestaña: la vista se queda con el aviso de esa cuenta", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await tocar(seccion("Ciudades"));

    await servidor.responder(GONZALO, { ok: false, mensaje: "Está en campaña Otoño Norte. Reasignar primero." });

    expect(navegacion.push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Está en campaña Otoño Norte. Reasignar primero.");
    expect(estadoDelMenu()).toBeEmptyDOMElement();
    expect(menu()).not.toHaveAttribute("aria-busy");
    // La cuenta vuelve a poder añadirse y el menú no quedó trabado: sin nada pendiente, navega.
    expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();
    expect(await tocar(seccion("Ciudades"))).toBe(true);
  });

  it("si la llamada se cae, tampoco cambia de pestaña y el aviso dice qué hacer", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));

    await servidor.caer(ANA);

    expect(navegacion.push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(mensajeAnadirSinConexion("Ana Martínez"));
    expect(estadoDelMenu()).toBeEmptyDOMElement();
    // Se puede volver a intentar, y el menú no quedó trabado.
    expect(anadirEnFila("Ana Martínez")).toBeEnabled();
    expect(await tocar(seccion("Ciudades"))).toBe(true);
  });

  it("una falla y otra que salió bien: se queda, la que salió bien no se vuelve a mandar y la fallida avisa sola", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await tocar(seccion("Ciudades"));
    expect(servidor.inscribir).toHaveBeenCalledTimes(2);

    await servidor.responder(ANA);
    expect(navegacion.push).not.toHaveBeenCalled();
    await servidor.responder(GONZALO, { ok: false, mensaje: "La cuenta está suspendida." });

    expect(navegacion.push).not.toHaveBeenCalled();
    // Gonzalo es la cuenta elegida y está a la vista: el aviso es el motivo del servidor, tal cual.
    expect(screen.getByRole("alert")).toHaveTextContent("La cuenta está suspendida.");
    // Ana sigue en «Ya en tu equipo»: su inscripción salió bien y no se vuelve a mandar.
    expect(within(screen.getByRole("region", { name: "Ya en tu equipo" })).getByText("Ana Martínez")).toBeInTheDocument();

    expect(await tocar(seccion("Ciudades"))).toBe(true);
    expect(servidor.inscribir).toHaveBeenCalledTimes(2);
  });

  it(`si el servidor no contesta, a los ${MS_TOPE_ESPERA / 1000} s deja cambiar de pestaña y el menú vuelve a andar`, async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));

    await pasar(MS_TOPE_ESPERA - 1);
    expect(navegacion.push).not.toHaveBeenCalled();
    expect(estadoDelMenu()).toHaveTextContent(TEXTO_ESPERANDO_ENVIOS);

    await pasar(1);

    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
    expect(estadoDelMenu()).toBeEmptyDOMElement();
  });

  it("doble clic en la misma sección, o en dos seguidas: una sola espera, un solo envío y un solo cambio (a la primera)", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));

    const primero = await tocar(seccion("Ciudades"));
    const segundo = await tocar(seccion("Ciudades"));
    const otra = await tocar(seccion("Reportes"));

    expect([primero, segundo, otra]).toEqual([false, false, false]);
    expect(servidor.inscribir).toHaveBeenCalledTimes(1);

    await servidor.responder(ANA);

    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
  });

  it("un clic con Ctrl, ⌘, Shift o el botón del medio abre otra pestaña del navegador: no frena, no manda y no espera", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));

    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(await tocar(seccion("Ciudades"), init)).toBe(true);
    }

    expect(servidor.inscribir).not.toHaveBeenCalled();
    expect(navegacion.push).not.toHaveBeenCalled();
    // La cuenta sigue dentro de su plazo, con su «Deshacer».
    expect(screen.getByRole("button", { name: "Deshacer: Ana Martínez" })).toBeInTheDocument();
  });

  it("si se añade otra cuenta mientras el menú espera, también se espera esa", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));

    await tocar(anadirEnFila("Gonzalo Sosa"));
    await servidor.responder(ANA);

    // Ana contestó, pero Gonzalo quedó dentro del plazo: se manda y se espera antes de salir.
    expect(servidor.inscribir).toHaveBeenCalledWith(GONZALO);
    expect(navegacion.push).not.toHaveBeenCalled();

    await servidor.responder(GONZALO);

    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
  });

  it("«Deshacer» de una cuenta mientras el menú espera a otra: esa no se manda y el menú cambia al contestar la primera", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));

    await tocar(anadirEnFila("Gonzalo Sosa"));
    await tocar(screen.getByRole("button", { name: "Deshacer: Gonzalo Sosa" }));
    await servidor.responder(ANA);

    expect(servidor.inscribir).toHaveBeenCalledExactlyOnceWith(ANA);
    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
  });

  it("después de una espera que terminó mal, el menú vuelve a esperar la siguiente (no queda trabado)", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await tocar(seccion("Ciudades"));
    await servidor.responder(GONZALO, { ok: false, mensaje: "La cuenta está suspendida." });
    expect(navegacion.push).not.toHaveBeenCalled();

    await tocar(anadirEnFila("Ana Martínez"));
    const sinFrenar = await tocar(seccion("Reportes"));

    expect(sinFrenar).toBe(false);
    expect(estadoDelMenu()).toHaveTextContent(TEXTO_ESPERANDO_ENVIOS);
    await servidor.responder(ANA);
    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/reportes");
  });

  it("volver a entrar con un envío de la vista anterior todavía sin contestar: el menú también lo espera", async () => {
    const servidor = servidorALaEspera();
    const primera = montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    primera.unmount();
    montar(servidor.inscribir);

    const sinFrenar = await tocar(seccion("Ciudades"));

    expect(sinFrenar).toBe(false);
    expect(navegacion.push).not.toHaveBeenCalled();
    await servidor.responder(ANA);
    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
  });

  it("«Deshacer» antes de tocar el menú: no queda nada y el menú navega sin esperar", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(screen.getByRole("button", { name: "Deshacer: Ana Martínez" }));

    expect(await tocar(seccion("Ciudades"))).toBe(true);
    expect(servidor.inscribir).not.toHaveBeenCalled();
  });
});

describe("cerrar o recargar la pestaña del navegador", () => {
  it("pregunta mientras haya una cuenta dentro del plazo, sigue preguntando con el envío en camino y deja de hacerlo al contestar", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    expect(cerrarPestana()).toBe(false);

    await tocar(anadirEnFila("Ana Martínez"));
    expect(cerrarPestana()).toBe(true);

    await pasar(MS_DESHACER);
    expect(cerrarPestana()).toBe(true);

    await servidor.responder(ANA);
    expect(cerrarPestana()).toBe(false);
  });

  it("si la vista ya se fue (cambio de ruta) pero el envío no contestó, sigue preguntando hasta que conteste", async () => {
    const servidor = servidorALaEspera();
    const vista = montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));

    // Irse por otra vía que el menú (el botón «atrás», un enlace): la vista se desmonta y manda lo que tenía dentro del plazo.
    vista.unmount();

    expect(servidor.inscribir).toHaveBeenCalledExactlyOnceWith(ANA);
    expect(cerrarPestana()).toBe(true);

    await servidor.responder(ANA);

    expect(cerrarPestana()).toBe(false);
  });

  it("volver atrás y reentrar arranca limpio: sin cuentas pendientes y con el menú navegando al toque", async () => {
    const servidor = servidorALaEspera();
    const primera = montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    primera.unmount();
    await servidor.responder(ANA);

    montar(servidor.inscribir);

    expect(cerrarPestana()).toBe(false);
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    expect(await tocar(seccion("Ciudades"))).toBe(true);
  });
});

describe("«‹ Equipo» y Esc muestran en el menú el mismo estado de espera", () => {
  it("«‹ Equipo» con una cuenta dentro del plazo: se ve «guardando…» en el menú hasta que contesta y recién ahí vuelve a Equipo", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));

    expect(await tocar(screen.getByRole("link", { name: "‹ Equipo" }))).toBe(false);

    expect(estadoDelMenu()).toHaveTextContent(TEXTO_ESPERANDO_ENVIOS);
    expect(menu()).toHaveAttribute("aria-busy", "true");
    expect(navegacion.push).not.toHaveBeenCalled();

    await servidor.responder(ANA);

    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/equipo");
    expect(estadoDelMenu()).toBeEmptyDOMElement();
    expect(menu()).not.toHaveAttribute("aria-busy");
  });

  it("Esc para salir con la inscripción en camino: se ve «guardando…» en el menú y, si falla, se apaga y la vista se queda", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" }); // cierra los avisos: manda ya
    });
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" }); // sale: espera la respuesta
    });

    expect(estadoDelMenu()).toHaveTextContent(TEXTO_ESPERANDO_ENVIOS);

    await servidor.responder(ANA, { ok: false, mensaje: "La cuenta está suspendida." });

    expect(estadoDelMenu()).toBeEmptyDOMElement();
    expect(navegacion.push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("La cuenta está suspendida.");
  });

  it("«‹ Equipo» sin nada pendiente no muestra ninguna espera", async () => {
    const { inscribir } = servidorALaEspera();
    montar(inscribir);

    await tocar(screen.getByRole("link", { name: "‹ Equipo" }));

    expect(estadoDelMenu()).toBeEmptyDOMElement();
  });
});

describe("una sola espera a la vez: gana el primer destino", () => {
  it("un clic en el menú mientras espera «‹ Equipo» se ignora: no manda nada de nuevo y se va solo a Equipo", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(screen.getByRole("link", { name: "‹ Equipo" }));

    const sinFrenar = await tocar(seccion("Ciudades"));

    expect(sinFrenar).toBe(false);
    expect(servidor.inscribir).toHaveBeenCalledTimes(1);
    await servidor.responder(ANA);
    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/equipo");
  });

  it("«‹ Equipo» mientras espera el menú se ignora: se va solo a la sección que tocó primero", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));

    const sinFrenar = await tocar(screen.getByRole("link", { name: "‹ Equipo" }));

    expect(sinFrenar).toBe(false);
    await servidor.responder(ANA);
    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
  });

  it("Esc mientras espera el menú se ignora: se va solo a la sección que tocó primero", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    await servidor.responder(ANA);

    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
  });

  it("Esc en una vista sin nada pendiente, mientras el menú espera un envío de la vista anterior, también se ignora", async () => {
    const servidor = servidorALaEspera();
    const primera = montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    primera.unmount();
    montar(servidor.inscribir);
    await tocar(seccion("Ciudades"));

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    await servidor.responder(ANA);

    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
  });

  it("aunque ya no quede nada por esperar, mientras la espera sigue en marcha el clic en el menú se ignora", async () => {
    const { inscribir } = servidorALaEspera();
    montar(inscribir);
    const hay = { n: 1 };
    registrarFuente({ hayPorMandar: () => hay.n > 0, confirmar: () => new Promise<boolean>(() => undefined) });
    await act(async () => {
      void esperarTrabajoPendiente();
    });
    hay.n = 0;
    expect(hayQueEsperar()).toBe(false);
    expect(estaEsperando()).toBe(true);

    expect(await tocar(seccion("Ciudades"))).toBe(false);
    expect(navegacion.push).not.toHaveBeenCalled();
  });

  it("«‹ Equipo» en una vista sin nada pendiente, mientras el menú espera un envío de la vista anterior, también se ignora", async () => {
    const servidor = servidorALaEspera();
    const primera = montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    primera.unmount();
    montar(servidor.inscribir);
    await tocar(seccion("Ciudades"));

    const sinFrenar = await tocar(screen.getByRole("link", { name: "‹ Equipo" }));

    expect(sinFrenar).toBe(false);
    await servidor.responder(ANA);
    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
  });
});

describe("la espera que ya venció (el servidor contesta después del tope)", () => {
  it("no manda antes de tiempo lo que se añade al volver: esa cuenta conserva sus 8 s para «Deshacer»", async () => {
    const servidor = servidorALaEspera();
    const primera = montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));
    await pasar(MS_TOPE_ESPERA);
    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
    primera.unmount();

    // Vuelve a la vista 23 y añade a otra persona; recién entonces contesta lo de Ana.
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await pasar(2_000);
    await servidor.responder(ANA);

    expect(servidor.inscribir).toHaveBeenCalledExactlyOnceWith(ANA);
    expect(screen.getByRole("button", { name: "Deshacer: Gonzalo Sosa" })).toBeInTheDocument();
    await pasar(MS_DESHACER - 2_000 - 1);
    expect(servidor.inscribir).toHaveBeenCalledTimes(1);
    await pasar(1);
    expect(servidor.inscribir).toHaveBeenLastCalledWith(GONZALO);
  });

  it("un envío colgado de antes no hace esperar de nuevo a lo que se añade después: se espera solo lo nuevo", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));
    await pasar(MS_TOPE_ESPERA);
    navegacion.push.mockClear();

    await tocar(anadirEnFila("Gonzalo Sosa"));
    await tocar(seccion("Reportes"));
    expect(servidor.inscribir).toHaveBeenLastCalledWith(GONZALO);
    expect(navegacion.push).not.toHaveBeenCalled();
    await servidor.responder(GONZALO);

    // Gonzalo contestó: se va ya, sin esperar otra vez los 10 s por Ana.
    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/reportes");
  });

  it("con un envío colgado, después del tope el menú deja de esperar: el siguiente clic navega al instante y el cierre sigue preguntando", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));
    await pasar(MS_TOPE_ESPERA);
    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");

    const sinFrenar = await tocar(seccion("Reportes"));
    const volver = await tocar(screen.getByRole("link", { name: "‹ Equipo" }));

    expect(sinFrenar).toBe(true);
    expect(estadoDelMenu()).toBeEmptyDOMElement();
    expect(volver).toBe(false); // «‹ Equipo» sale por su propio camino, pero ya no espera al colgado
    expect(navegacion.push).toHaveBeenLastCalledWith("/equipo");
    expect(cerrarPestana()).toBe(true);

    await servidor.responder(ANA);
    expect(cerrarPestana()).toBe(false);
  });
});

/** Un `window.navigation` simulado: lo único que se usa es el evento `navigate` y `traverseTo`. */
class NavegacionFalsa extends EventTarget {
  traverseTo = vi.fn<(clave: string) => unknown>();
  /** La entrada del historial donde está la persona; cambia cuando un traverse pasa sin frenarse. */
  currentEntry: { key: string } = { key: "entrada-actual" };

  /** Lo que haría el navegador al apretar «atrás» o «adelante»: devuelve el evento para ver si se frenó. */
  async mover(opciones: { tipo?: string; cancelable?: boolean; clave?: string } = {}): Promise<Event> {
    const evento = Object.assign(new Event("navigate", { cancelable: opciones.cancelable ?? true }), {
      navigationType: opciones.tipo ?? "traverse",
      destination: { key: "clave" in opciones ? opciones.clave : "entrada-anterior" },
    });
    await act(async () => {
      this.dispatchEvent(evento);
    });
    return evento;
  }
}

function instalarNavegacion(): NavegacionFalsa {
  const falsa = new NavegacionFalsa();
  Object.defineProperty(window, "navigation", { configurable: true, value: falsa });
  return falsa;
}

describe("atrás y adelante del navegador con inscripciones por mandar", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "navigation");
  });

  it("con una cuenta dentro del plazo se frena, se manda, se espera y recién al contestar se vuelve a la entrada elegida", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));

    const evento = await navegador.mover();

    expect(evento.defaultPrevented).toBe(true);
    expect(servidor.inscribir).toHaveBeenCalledExactlyOnceWith(ANA);
    expect(estadoDelMenu()).toHaveTextContent(TEXTO_ESPERANDO_ENVIOS);
    expect(navegador.traverseTo).not.toHaveBeenCalled();

    await servidor.responder(ANA);

    expect(navegador.traverseTo).toHaveBeenCalledExactlyOnceWith("entrada-anterior");
    expect(estadoDelMenu()).toBeEmptyDOMElement();
    expect(navegacion.push).not.toHaveBeenCalled();
  });

  it("adelante (también un traverse) hace lo mismo hacia su entrada", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));

    await navegador.mover({ clave: "entrada-siguiente" });
    await servidor.responder(ANA);

    expect(navegador.traverseTo).toHaveBeenCalledExactlyOnceWith("entrada-siguiente");
  });

  it("si la inscripción se rechaza, no vuelve: se queda con el aviso y el siguiente atrás, sin nada pendiente, pasa sin frenarse", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Gonzalo Sosa"));
    await navegador.mover();

    await servidor.responder(GONZALO, { ok: false, mensaje: "La cuenta está suspendida." });

    expect(navegador.traverseTo).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("La cuenta está suspendida.");
    expect(estadoDelMenu()).toBeEmptyDOMElement();
    expect(anadirEnFila("Gonzalo Sosa")).toBeEnabled();
    const otroAtras = await navegador.mover();
    expect(otroAtras.defaultPrevented).toBe(false);
  });

  it("si la llamada se cae, tampoco vuelve y el aviso dice qué hacer", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await navegador.mover();

    await servidor.caer(ANA);

    expect(navegador.traverseTo).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(mensajeAnadirSinConexion("Ana Martínez"));
  });

  it("sin nada pendiente navega al instante: no se frena", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);

    const evento = await navegador.mover();

    expect(evento.defaultPrevented).toBe(false);
    expect(navegador.traverseTo).not.toHaveBeenCalled();
    expect(estadoDelMenu()).toBeEmptyDOMElement();
  });

  it("si el navegador no deja frenarlo (no es cancelable), queda como hoy: no se frena y la vista manda lo que tenía al irse", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    const vista = montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));

    const evento = await navegador.mover({ cancelable: false });

    expect(evento.defaultPrevented).toBe(false);
    expect(servidor.inscribir).not.toHaveBeenCalled();
    vista.unmount();
    expect(servidor.inscribir).toHaveBeenCalledExactlyOnceWith(ANA);
    expect(navegador.traverseTo).not.toHaveBeenCalled();
  });

  it("solo frena las idas y vueltas por el historial: una navegación nueva, un reemplazo o una recarga no", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));

    for (const tipo of ["push", "replace", "reload"]) {
      expect((await navegador.mover({ tipo })).defaultPrevented).toBe(false);
    }

    expect(servidor.inscribir).not.toHaveBeenCalled();
  });

  it("sin la clave de la entrada de destino no hay a dónde volver con traverseTo: no se frena", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));

    for (const clave of ["", undefined]) {
      expect((await navegador.mover({ clave })).defaultPrevented).toBe(false);
    }

    expect(servidor.inscribir).not.toHaveBeenCalled();
  });

  it("dos atrás seguidos mientras espera: el segundo se frena y se ignora; se vuelve solo a la primera entrada, una vez", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await navegador.mover({ clave: "primera" });

    const segundo = await navegador.mover({ clave: "segunda" });
    await servidor.responder(ANA);

    expect(segundo.defaultPrevented).toBe(true);
    expect(servidor.inscribir).toHaveBeenCalledTimes(1);
    expect(navegador.traverseTo).toHaveBeenCalledExactlyOnceWith("primera");
  });

  it("atrás mientras el menú espera se frena y se ignora: gana el menú", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));

    const evento = await navegador.mover();
    await servidor.responder(ANA);

    expect(evento.defaultPrevented).toBe(true);
    expect(navegador.traverseTo).not.toHaveBeenCalled();
    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
  });

  it("un clic en el menú mientras espera un atrás se ignora: gana el atrás", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await navegador.mover();

    const sinFrenar = await tocar(seccion("Ciudades"));
    await servidor.responder(ANA);

    expect(sinFrenar).toBe(false);
    expect(navegacion.push).not.toHaveBeenCalled();
    expect(navegador.traverseTo).toHaveBeenCalledExactlyOnceWith("entrada-anterior");
  });

  it(`si el servidor no contesta, a los ${MS_TOPE_ESPERA / 1000} s vuelve igual`, async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await navegador.mover();

    await pasar(MS_TOPE_ESPERA - 1);
    expect(navegador.traverseTo).not.toHaveBeenCalled();
    await pasar(1);

    expect(navegador.traverseTo).toHaveBeenCalledExactlyOnceWith("entrada-anterior");
    expect(estadoDelMenu()).toBeEmptyDOMElement();
  });

  it("si esa entrada del historial ya no existe (traverseTo falla), no se rompe nada", async () => {
    const navegador = instalarNavegacion();
    navegador.traverseTo.mockImplementation(() => ({
      committed: Promise.reject(new Error("InvalidStateError")),
      finished: Promise.reject(new Error("InvalidStateError")),
    }));
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await navegador.mover();

    await servidor.responder(ANA);

    expect(navegador.traverseTo).toHaveBeenCalledTimes(1);
    expect(estadoDelMenu()).toBeEmptyDOMElement();
  });

  it("si traverseTo tira una excepción, tampoco se rompe nada", async () => {
    const navegador = instalarNavegacion();
    navegador.traverseTo.mockImplementation(() => {
      throw new Error("InvalidStateError");
    });
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await navegador.mover();

    await servidor.responder(ANA);

    expect(navegador.traverseTo).toHaveBeenCalledTimes(1);
    expect(estadoDelMenu()).toBeEmptyDOMElement();
  });

  it("aunque ya no quede nada por esperar, mientras la espera sigue en marcha un atrás se frena y se ignora", async () => {
    const navegador = instalarNavegacion();
    const { inscribir } = servidorALaEspera();
    montar(inscribir);
    const hay = { n: 1 };
    registrarFuente({ hayPorMandar: () => hay.n > 0, confirmar: () => new Promise<boolean>(() => undefined) });
    await act(async () => {
      void esperarTrabajoPendiente();
    });
    hay.n = 0;

    const evento = await navegador.mover();

    expect(evento.defaultPrevented).toBe(true);
    expect(navegador.traverseTo).not.toHaveBeenCalled();
  });

  it("al desmontar el menú deja de escuchar", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    const vista = montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    vista.unmount();

    const evento = await navegador.mover();

    expect(evento.defaultPrevented).toBe(false);
  });

  it("sin la Navigation API (Firefox o Safari viejos) queda como hoy: nada se frena y la vista manda lo que tenía al irse", async () => {
    const servidor = servidorALaEspera();
    const vista = montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));

    vista.unmount();

    expect("navigation" in window).toBe(false);
    expect(servidor.inscribir).toHaveBeenCalledExactlyOnceWith(ANA);
  });
});

describe("la persona se va por su cuenta mientras se espera: no se la lleva a un destino viejo (R3, seguimiento de #55)", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "navigation");
    window.history.replaceState(null, "", "/");
  });

  /** Lo que pasa cuando el 2.º «atrás» que Chromium no deja frenar se cumple: la persona queda en otra entrada. */
  async function atrasQueNoSeFrena(navegador: NavegacionFalsa) {
    const evento = await navegador.mover({ cancelable: false });
    expect(evento.defaultPrevented).toBe(false);
    navegador.currentEntry = { key: "entrada-anterior" };
  }

  it("menú: el servidor contesta cuando ya está en otra entrada del historial → no cambia de pestaña (y la espera termina)", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));
    expect(estadoDelMenu()).toHaveTextContent(TEXTO_ESPERANDO_ENVIOS);

    await atrasQueNoSeFrena(navegador);
    await servidor.responder(ANA);

    expect(navegacion.push).not.toHaveBeenCalled();
    expect(estadoDelMenu()).toBeEmptyDOMElement();
    expect(menu()).not.toHaveAttribute("aria-busy");
  });

  it("menú, sin la Navigation API: se compara la ruta, y si cambió tampoco cambia de pestaña", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));

    window.history.pushState(null, "", "/reportes");
    await servidor.responder(ANA);

    expect(navegacion.push).not.toHaveBeenCalled();
    expect(estadoDelMenu()).toBeEmptyDOMElement();
  });

  it("menú: si la persona volvió a la misma entrada antes de que conteste, sí cambia de pestaña (sigue donde empezó)", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));

    navegador.currentEntry = { key: "entrada-anterior" };
    navegador.currentEntry = { key: "entrada-actual" };
    await servidor.responder(ANA);

    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/ciudades");
  });

  it("«‹ Equipo»: si ya se fue por su cuenta, no la lleva a Equipo", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(screen.getByRole("link", { name: "‹ Equipo" }));

    await atrasQueNoSeFrena(navegador);
    await servidor.responder(ANA);

    expect(navegacion.push).not.toHaveBeenCalled();
    expect(estadoDelMenu()).toBeEmptyDOMElement();
  });

  it("Esc: si ya se fue por su cuenta, no la lleva a Equipo", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" }); // cierra los avisos: manda ya
    });
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" }); // sale: espera la respuesta
    });

    await atrasQueNoSeFrena(navegador);
    await servidor.responder(ANA);

    expect(navegacion.push).not.toHaveBeenCalled();
  });

  it("atrás frenado: el 2.º atrás pasa (Chromium no deja frenarlo) → al contestar no hay traverseTo que la devuelva", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    expect((await navegador.mover()).defaultPrevented).toBe(true);

    await atrasQueNoSeFrena(navegador);
    await servidor.responder(ANA);

    expect(navegador.traverseTo).not.toHaveBeenCalled();
    expect(navegacion.push).not.toHaveBeenCalled();
    expect(estadoDelMenu()).toBeEmptyDOMElement();
  });

  it("atrás frenado y la persona sigue en la misma entrada: vuelve a la que eligió (como hasta hoy)", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await navegador.mover();

    await servidor.responder(ANA);

    expect(navegador.traverseTo).toHaveBeenCalledExactlyOnceWith("entrada-anterior");
  });

  it("después de irse por su cuenta, la espera siguiente funciona normal (nada quedó trabado)", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await tocar(seccion("Ciudades"));
    await atrasQueNoSeFrena(navegador);
    await servidor.responder(ANA);
    navegacion.push.mockClear();
    navegador.currentEntry = { key: "entrada-actual" };

    await tocar(anadirEnFila("Gonzalo Sosa"));
    await tocar(seccion("Reportes"));
    await servidor.responder(GONZALO);

    expect(navegacion.push).toHaveBeenCalledExactlyOnceWith("/reportes");
  });
});

describe("el foco al mandar ya lo que estaba dentro del plazo (R1, seguimiento de #55)", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "navigation");
  });

  const deshacerDe = (nombre: string) => screen.getByRole("button", { name: `Deshacer: ${nombre}` });
  const filaDe = (nombre: string) => screen.getByRole("button", { name: `Elegir a ${nombre}` }).closest("li");
  const caja = () => screen.getByRole("textbox", { name: "Buscar por email o nombre" });

  it("atrás con el foco en «Deshacer»: el foco pasa a la fila de la cuenta durante la espera y se queda ahí tras el rechazo", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    expect(deshacerDe("Ana Martínez")).toHaveFocus();

    await navegador.mover();

    expect(estadoDelMenu()).toHaveTextContent(TEXTO_ESPERANDO_ENVIOS);
    expect(document.body).not.toHaveFocus();
    expect(filaDe("Ana Martínez")).toHaveFocus();

    await servidor.responder(ANA, { ok: false, mensaje: "La cuenta está suspendida." });

    expect(screen.getByRole("alert")).toHaveTextContent("La cuenta está suspendida.");
    expect(filaDe("Ana Martínez")).toHaveFocus();
    expect(anadirEnFila("Ana Martínez")).toBeEnabled();
  });

  it("el menú con el foco en «Deshacer»: lo mismo (el foco no cae al body mientras espera)", async () => {
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    expect(deshacerDe("Ana Martínez")).toHaveFocus();

    await tocar(seccion("Ciudades"));

    expect(filaDe("Ana Martínez")).toHaveFocus();
    await servidor.caer(ANA);
    expect(filaDe("Ana Martínez")).toHaveFocus();
  });

  it("si la cuenta ya no está en los resultados, el foco va al buscador", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    await act(async () => {
      fireEvent.change(caja(), { target: { value: "zzzz" } });
    });
    await pasar(MS_ESPERA_BUSQUEDA);
    expect(screen.queryByRole("button", { name: "Elegir a Ana Martínez" })).not.toBeInTheDocument();
    act(() => deshacerDe("Ana Martínez").focus());

    await navegador.mover();

    expect(caja()).toHaveFocus();
  });

  it("con el foco fuera del aviso (el buscador) no se mueve", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    act(() => caja().focus());

    await navegador.mover();

    expect(estadoDelMenu()).toHaveTextContent(TEXTO_ESPERANDO_ENVIOS);
    expect(caja()).toHaveFocus();
  });

  it("con dos avisos, el foco en el de una cuenta va a la fila de esa cuenta y no toca a la otra", async () => {
    const navegador = instalarNavegacion();
    const servidor = servidorALaEspera();
    montar(servidor.inscribir);
    await tocar(anadirEnFila("Ana Martínez"));
    act(() => anadirEnFila("Gonzalo Sosa").focus());
    await tocar(anadirEnFila("Gonzalo Sosa"));
    expect(deshacerDe("Gonzalo Sosa")).toHaveFocus();

    await navegador.mover();

    expect(filaDe("Gonzalo Sosa")).toHaveFocus();
    await servidor.responder(ANA);
    await servidor.responder(GONZALO, { ok: false, mensaje: "La cuenta está suspendida." });
    expect(filaDe("Gonzalo Sosa")).toHaveFocus();
  });
});
