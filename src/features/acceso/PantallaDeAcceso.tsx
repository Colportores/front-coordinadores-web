"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import type { ResultadoCierre } from "@/auth/acceso";
import type { RespuestaDeInicio } from "@/auth/acciones";
import { rutaDeAcceso, type MotivoDeAcceso } from "@/auth/guarda";
import { TEXTOS_DE_ACCESO as T, textoSinAcceso } from "@/features/acceso/textos";
import { guardarUltimoCorreo, leerUltimoCorreo, olvidarUltimoCorreo } from "@/features/acceso/ultimo-correo";
import { cn } from "@/lib/utils";

/**
 * La pantalla de acceso del coordinador (vista 38, issue #18). Los ocho artboards del canvas son estados de esta pantalla:
 *
 * | artboard | cuándo |
 * |---|---|
 * | 01 vacío | sin correo o sin contraseña: «Entrar» apagado |
 * | 02 entrando | enviado: campos y botón apagados hasta la respuesta |
 * | 03 credenciales | `credenciales-invalidas`: no dice cuál de los dos falló |
 * | 04 sin acceso | `sin-acceso` o `suspendida` al entrar, o `motivo=sin-acceso`/`suspendida` de la guarda de rutas |
 * | 05 sesión vencida | `motivo=vencida` |
 * | 06 no disponible | `no-disponible` al entrar, o `motivo=no-disponible` de la guarda |
 * | 07 sesión cerrada | `motivo=cerrada` |
 * | 08 sin conexión | el navegador está sin red |
 *
 * Casos límite (no los dibuja el canvas, los pide el flujo): un envío a la vez aunque se aprieten dos veces el botón o Enter;
 * si la acción falla a mitad de camino el botón vuelve a habilitarse; atrás y adelante no dejan nada trabado (el estado es
 * de la pantalla y la sesión vive en el servidor); correos y contraseñas largos no rompen el diseño.
 *
 * Qué NO tiene, a propósito: «¿Olvidaste tu contraseña?» (el canvas lo dibuja sin destino y pregunta adónde lleva: hasta que se
 * decida no hay un enlace sin destino). Ver el archivo de pendientes del PR.
 */

export interface PropiedadesDeAcceso {
  /** Por qué se llegó acá (`?motivo=`); `null` es la pantalla de siempre. */
  motivo: MotivoDeAcceso | null;
  /** Adónde volver después de entrar: ya validado por el servidor (`destinoSeguro`). */
  siguiente: string;
  /** El correo de la cuenta que no es de coordinador, si la guarda de rutas lo pudo saber (artboard 04). */
  correoSinAcceso?: string | null;
  /** Server action `iniciarSesionAccion`. */
  iniciar: (correo: string, contrasena: string, siguiente: string) => Promise<RespuestaDeInicio>;
  /** Server action `cerrarSesionAccion`. */
  cerrar: () => Promise<ResultadoCierre>;
  /** Cambio de pantalla completo; en los tests se cambia por un doble. */
  irA?: (ruta: string) => void;
}

type Aviso =
  | "vencida"
  | "cerrada"
  | "no-disponible"
  | "credenciales"
  | "correo-sin-verificar"
  | "demasiados-intentos"
  | "sin-conexion";

function avisoInicial(motivo: MotivoDeAcceso | null): Aviso | null {
  switch (motivo) {
    case "vencida":
      return "vencida";
    case "cerrada":
      return "cerrada";
    case "no-disponible":
      return "no-disponible";
    default:
      return null;
  }
}

/** Si el navegador tiene red; en el servidor (y en el primer render) se da por sí. */
function useEnLinea(): boolean {
  return useSyncExternalStore(
    (alCambiar) => {
      window.addEventListener("online", alCambiar);
      window.addEventListener("offline", alCambiar);
      return () => {
        window.removeEventListener("online", alCambiar);
        window.removeEventListener("offline", alCambiar);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

interface DatosDelAviso {
  texto: string;
  /** `alert` para lo que salió mal, `status` para lo informativo. */
  rol: "alert" | "status";
  tono: "info" | "error" | "exito" | "sin-red";
}

function datosDelAviso(aviso: Aviso): DatosDelAviso | null {
  switch (aviso) {
    case "vencida":
      return { texto: T.sesionVencida, rol: "status", tono: "info" };
    case "cerrada":
      return { texto: T.sesionCerrada, rol: "status", tono: "exito" };
    case "no-disponible":
      return { texto: T.noDisponible, rol: "alert", tono: "error" };
    case "correo-sin-verificar":
      return { texto: T.correoSinVerificar, rol: "alert", tono: "error" };
    case "demasiados-intentos":
      return { texto: T.demasiadosIntentos, rol: "alert", tono: "error" };
    case "sin-conexion":
      return { texto: T.sinConexion, rol: "status", tono: "sin-red" };
    case "credenciales":
      // No es un cartel: es el mensaje bajo los campos.
      return null;
  }
}

const ESTILO_DE_TONO: Record<DatosDelAviso["tono"], { caja: string; icono: string; glifo: string }> = {
  info: { caja: "border-tinta-2", icono: "bg-tinta-2", glifo: "i" },
  error: { caja: "border-peligro", icono: "bg-peligro", glifo: "!" },
  exito: { caja: "border-exito", icono: "bg-exito", glifo: "✓" },
  "sin-red": { caja: "border-dashed border-tinta-suave", icono: "bg-tinta-suave", glifo: "✕" },
};

function Cartel({ aviso }: { aviso: DatosDelAviso }) {
  const estilo = ESTILO_DE_TONO[aviso.tono];
  return (
    <div role={aviso.rol} className={cn("flex items-start gap-3 rounded-lg border-[1.5px] bg-superficie px-3.5 py-3", estilo.caja)}>
      <span
        aria-hidden
        className={cn("grid size-5 flex-none place-items-center rounded-pastilla text-mini font-bold text-superficie", estilo.icono)}
      >
        {estilo.glifo}
      </span>
      <p className="text-[13.5px] leading-[1.45] wrap-anywhere text-pretty">{aviso.texto}</p>
    </div>
  );
}

/** El correo guardado en la pestaña no cambia mientras se ve la pantalla: no hay nada a qué suscribirse. */
const sinSuscripcion = () => () => {};

const CLASE_DE_ETIQUETA = "font-mono text-etiqueta tracking-[.14em] text-tinta-suave";

export function PantallaDeAcceso({ motivo, siguiente, correoSinAcceso = null, iniciar, cerrar, irA = (ruta) => window.location.assign(ruta) }: PropiedadesDeAcceso) {
  // 05 y 07 dejan el correo escrito (el canvas solo vacía la contraseña) si esta pestaña sabe con cuál se entró; nunca sale de la URL.
  const precargaElCorreo = motivo === "vencida" || motivo === "cerrada";
  const correoGuardado = useSyncExternalStore(sinSuscripcion, leerUltimoCorreo, () => "");
  const [correoEscrito, setCorreo] = useState<string | null>(null);
  const correo = correoEscrito ?? (precargaElCorreo ? correoGuardado : "");
  const [contrasena, setContrasena] = useState("");
  const [aviso, setAviso] = useState<Aviso | null>(avisoInicial(motivo));
  const [enviando, setEnviando] = useState(false);
  // El artboard 04: la cuenta entró (o ya tenía sesión) pero no es de coordinador.
  // `suspendida` es la misma pantalla con otro texto: «Cuenta suspendida. Contactá al administrador.».
  const [sinAcceso, setSinAcceso] = useState<{ correo: string | null; suspendida: boolean } | null>(
    motivo === "sin-acceso" ? { correo: correoSinAcceso, suspendida: false } : motivo === "suspendida" ? { correo: null, suspendida: true } : null,
  );
  const enLinea = useEnLinea();

  // Un envío a la vez: el estado de React no alcanza (dos eventos en el mismo tick leen el mismo `enviando`).
  const enCurso = useRef(false);
  const campoCorreo = useRef<HTMLInputElement>(null);
  const campoClave = useRef<HTMLInputElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  // Adónde va el foco después del próximo render: se pide junto con el cambio de estado y lo consume el efecto de abajo.
  const focoPendiente = useRef<"correo" | "titulo" | null>(null);

  useEffect(() => {
    if (focoPendiente.current === "correo") campoCorreo.current?.focus();
    if (focoPendiente.current === "titulo") titulo.current?.focus();
    focoPendiente.current = null;
  });

  // Con el correo ya escrito (05 y 07), lo que falta es la contraseña.
  const conCorreoPrecargado = precargaElCorreo && correoGuardado !== "";
  useEffect(() => {
    if (conCorreoPrecargado) campoClave.current?.focus();
  }, [conCorreoPrecargado]);

  const completo = correo.trim() !== "" && contrasena !== "";
  // «Reintentar» tras un servicio caído que vino de la guarda de rutas (sin nada escrito) vuelve a pedir la pantalla de antes.
  const reintentaLaPantalla = aviso === "no-disponible" && !completo && !sinAcceso;
  const apagado = enviando || (!enLinea && !sinAcceso) || (!completo && !reintentaLaPantalla && !sinAcceso);

  async function entrar() {
    if (enCurso.current) return;
    if (reintentaLaPantalla) {
      irA(siguiente);
      return;
    }
    if (!completo || !enLinea) return;
    enCurso.current = true;
    setEnviando(true);
    setAviso(null);
    let entro = false;
    try {
      const respuesta = await iniciar(correo, contrasena, siguiente);
      switch (respuesta.tipo) {
        case "ok":
          entro = true;
          guardarUltimoCorreo(correo.trim());
          // Carga completa: la página siguiente se pide con la cookie nueva y el marco del panel.
          irA(respuesta.destino);
          return;
        case "credenciales-invalidas":
          setAviso("credenciales");
          focoPendiente.current = "correo";
          return;
        case "correo-sin-verificar":
          setAviso("correo-sin-verificar");
          focoPendiente.current = "correo";
          return;
        case "demasiados-intentos":
          setAviso("demasiados-intentos");
          focoPendiente.current = "correo";
          return;
        case "sin-acceso":
          setSinAcceso({ correo: correo.trim(), suspendida: false });
          setContrasena("");
          focoPendiente.current = "titulo";
          return;
        case "suspendida":
          setSinAcceso({ correo: null, suspendida: true });
          setContrasena("");
          focoPendiente.current = "titulo";
          return;
        case "no-disponible":
          setAviso("no-disponible");
          // El botón se apaga mientras se envía y, con Enter desde la contraseña, el foco se pierde en el <body> (QA #18).
          focoPendiente.current = "correo";
          return;
      }
    } catch {
      // La acción no llegó al servidor o se cortó a mitad de camino: no se sabe nada de las credenciales.
      setAviso(navigator.onLine ? "no-disponible" : "sin-conexion");
      focoPendiente.current = "correo";
    } finally {
      // Entrar deja la pantalla apagada hasta que cambia la página; cualquier otra cosa la habilita de nuevo.
      if (!entro) {
        enCurso.current = false;
        setEnviando(false);
      }
    }
  }

  async function entrarConOtraCuenta() {
    if (enCurso.current) return;
    enCurso.current = true;
    setEnviando(true);
    try {
      await cerrar();
    } catch {
      // Si no se pudo cerrar, igual se puede entrar con otra: la sesión nueva reemplaza a la vieja.
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
    setSinAcceso(null);
    setAviso(null);
    olvidarUltimoCorreo();
    setCorreo("");
    setContrasena("");
    focoPendiente.current = "correo";
    try {
      window.history.replaceState(null, "", rutaDeAcceso(null, siguiente));
    } catch {
      // Sin historial (un iframe, un doble de test): la pantalla ya cambió.
    }
  }

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    void entrar();
  }

  // Sin red, el aviso que manda es ese; el mensaje bajo los campos (credenciales) se queda.
  const cartel = !enLinea && !sinAcceso ? datosDelAviso("sin-conexion") : aviso ? datosDelAviso(aviso) : null;
  const errorDeCampo = aviso === "credenciales" ? T.credenciales : null;

  let pie: string | null = null;
  if (!sinAcceso) {
    if (enviando) pie = T.pieEntrando;
    else if (!completo && !reintentaLaPantalla) pie = T.pieVacio;
  }

  let textoDelBoton: string = T.entrar;
  if (sinAcceso) textoDelBoton = T.entrarConOtraCuenta;
  else if (enviando) textoDelBoton = T.entrando;
  else if (aviso === "no-disponible") textoDelBoton = T.reintentar;

  return (
    <main className="grid min-h-screen bg-fondo lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className="hidden flex-col justify-between bg-marca p-10 text-superficie lg:flex">
        <div className="flex items-center gap-[11px]">
          <div aria-hidden className="grid size-8 place-items-center rounded-pastilla bg-superficie font-serif text-chico font-semibold text-marca">
            UU
          </div>
          <span className="font-serif text-titulo font-semibold">Colportaje</span>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="font-mono text-etiqueta tracking-[.2em] text-marca-clara">PANEL DE COORDINADORES</span>
          <span className="font-serif text-[28px] leading-tight font-semibold text-pretty">Tu campaña, ciudad por ciudad.</span>
        </div>
        <span className="text-chico text-marca-clara">Unión Uruguaya</span>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="flex w-full max-w-[380px] flex-col gap-[22px]">
          <h1 ref={titulo} tabIndex={-1} className="font-serif text-[28px] font-semibold outline-none">
            {sinAcceso ? T.tituloSinAcceso : T.tituloFormulario}
          </h1>

          {sinAcceso ? <Cartel aviso={{ texto: sinAcceso.suspendida ? T.suspendida : textoSinAcceso(sinAcceso.correo), rol: "alert", tono: "error" }} /> : cartel ? <Cartel aviso={cartel} /> : null}

          <form onSubmit={alEnviar} noValidate className="flex flex-col gap-[22px]">
            {sinAcceso ? null : (
              <div className="flex flex-col gap-[18px]">
                <label className="flex flex-col gap-[7px]">
                  <span className={CLASE_DE_ETIQUETA}>{T.correo}</span>
                  <input
                    ref={campoCorreo}
                    type="email"
                    name="correo"
                    autoComplete="username"
                    spellCheck={false}
                    maxLength={254}
                    placeholder={T.placeholderCorreo}
                    value={correo}
                    onChange={(evento) => setCorreo(evento.target.value)}
                    disabled={enviando}
                    aria-invalid={errorDeCampo ? true : undefined}
                    aria-describedby={errorDeCampo ? "error-de-acceso" : undefined}
                    className={cn(
                      "min-w-0 rounded-control border bg-superficie px-3 py-[11px] text-[14px] text-tinta outline-none focus-visible:ring-2 focus-visible:ring-acento disabled:bg-superficie-suave disabled:text-tinta-suave",
                      errorDeCampo ? "border-peligro" : "border-grafico-neutro",
                    )}
                  />
                </label>
                <label className="flex flex-col gap-[7px]">
                  <span className={CLASE_DE_ETIQUETA}>{T.contrasena}</span>
                  <input
                    ref={campoClave}
                    type="password"
                    name="contrasena"
                    autoComplete="current-password"
                    placeholder={T.placeholderContrasena}
                    value={contrasena}
                    onChange={(evento) => setContrasena(evento.target.value)}
                    disabled={enviando}
                    aria-invalid={errorDeCampo ? true : undefined}
                    aria-describedby={errorDeCampo ? "error-de-acceso" : undefined}
                    className={cn(
                      "min-w-0 rounded-control border bg-superficie px-3 py-[11px] text-[14px] text-tinta outline-none focus-visible:ring-2 focus-visible:ring-acento disabled:bg-superficie-suave disabled:text-tinta-suave",
                      errorDeCampo ? "border-peligro" : "border-grafico-neutro",
                    )}
                  />
                </label>
                {errorDeCampo ? (
                  <p id="error-de-acceso" role="alert" className="-mt-2 text-cuerpo text-peligro">
                    {errorDeCampo}
                  </p>
                ) : null}
              </div>
            )}

            <button
              type={sinAcceso ? "button" : "submit"}
              onClick={sinAcceso ? () => void entrarConOtraCuenta() : undefined}
              aria-disabled={apagado || undefined}
              // Apagado no es `disabled`: el botón conserva el foco y un clic o un Enter no hacen nada (`entrar` lo comprueba).
              className={cn(
                "flex items-center justify-center gap-2.5 rounded-control px-3 py-[13px] text-[14px] font-semibold text-superficie outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2",
                enviando ? "bg-marca-media" : apagado ? "bg-tinta-tenue" : "bg-marca hover:bg-marca-media",
              )}
            >
              {enviando ? (
                <span aria-hidden className="size-3.5 animate-spin rounded-pastilla border-2 border-superficie/35 border-t-superficie" />
              ) : null}
              {textoDelBoton}
            </button>
            {/* El lector de pantalla anuncia que se está entrando; a la vista, el botón ya lo dice. */}
            <span aria-live="polite" className="sr-only">
              {enviando && !sinAcceso ? T.entrando : null}
            </span>
          </form>

          {pie ? <p className="text-cuerpo leading-normal text-pretty text-tinta-suave">{pie}</p> : null}
        </div>
      </div>
    </main>
  );
}
