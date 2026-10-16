import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResultadoInscripcion } from "@/datos/equipo/contrato";
import { DATOS_ANADIR_COLPORTOR_SIMULADO, fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { RESUMEN_COORDINADOR_SIMULADO } from "@/datos/shell/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { AnadirColportor, mensajeAnadirSinConexion, MS_DESHACER } from "@/features/equipo/AnadirColportor";
import { pestanasVisibles } from "@/shell/pestanas";
import { MS_TOPE_ESPERA } from "@/shell/trabajo-pendiente";
import { TEXTO_ESPERANDO_ENVIOS, Topbar } from "@/shell/Topbar";
import { fijarFlags } from "@/test/flags";

/**
 * El menú de secciones y la vista 23 juntos (decisión del 16/10 en #41, pendiente P2): con inscripciones dentro del plazo del
 * «Deshacer» o sin contestar, tocar una sección las manda, espera la respuesta y cambia de pestaña solo si salieron bien.
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

