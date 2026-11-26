"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from "react";

import type { RespuestaDeApertura, RespuestaDeCierreDeSesiones, RespuestaDeGuardado } from "@/auth/acciones-recuperacion";
import type { TipoDeEnlace } from "@/auth/recuperacion";
import { Cartel, CLASE_DE_CAMPO, CLASE_DE_ENLACE, CLASE_DE_ETIQUETA, MarcoDeAcceso, type DatosDelAviso } from "@/features/acceso/MarcoDeAcceso";
import { TEXTOS_DE_NUEVA_CONTRASENA as T } from "@/features/acceso/textos-recuperacion";
import { guardarUltimoCorreo } from "@/features/acceso/ultimo-correo";
import { reglasDeContrasena } from "@/features/acceso/validacion";
import { useEnLinea } from "@/lib/en-linea";
import { cn } from "@/lib/utils";

/**
 * «Nueva contraseña» del coordinador (vista 40B, HU-AUTH-005), la pantalla a la que vuelve el enlace del correo. Los ocho
 * artboards del canvas son estados de esta pantalla:
 *
 * | artboard | cuándo |
 * |---|---|
 * | 01 nueva contraseña | el enlace se abrió bien: se nombra la cuenta |
 * | 02 no cumple las reglas | «Guardar contraseña» apagado; cada regla dice si cumple |
 * | 03 no coinciden | el aviso sale en «Repetila» y «Guardar» sigue apagado |
 * | 04 guardando | campos y botón apagados hasta la respuesta |
 * | 05 contraseña cambiada | «Ir al login»: se cerraron todas las sesiones, el panel no entra directo (HU-AUTH-005). Si el cierre de las otras sesiones no se pudo confirmar, no es un éxito: aviso + «Cerrar las otras sesiones» (reintenta sin pedir la contraseña); «Ir al login» ahí cierra la sesión de este navegador (alcance local) y pasa por el login con el correo escrito: nunca entra al panel |
 * | 06 enlace no válido | vencido, ya usado o sin código: una sola pantalla, sin adivinar cuál (HU-AUTH-005) |
 * | 07 error al guardar | «Reintentar», con lo escrito intacto |
 * | 08 sin conexión | el navegador está sin red |
 *
 * Estados que el canvas no dibuja y la HU o el flujo piden: «Verificando el enlace…» mientras se canjea el código; «No pudimos
 * abrir el enlace» cuando no se pudo comprobar (red o servicio: no es un enlace vencido) con «Reintentar»; contraseña igual a la
 * actual y contraseña que el servidor no aceptó (avisos bajo los campos).
 *
 * Casos límite: un guardado a la vez aunque se aprieten dos veces el botón o Enter; si la acción falla a mitad de camino el botón
 * vuelve a habilitarse y lo escrito queda; recargar o volver atrás con el enlace ya usado es «Enlace no válido» y no un error; en
 * desarrollo, React monta dos veces y el código del enlace se canjea una sola vez; contraseñas largas no rompen el diseño.
 */

export type EstadoInicialDeNuevaContrasena =
  /**
   * Vino con el código del enlace: hay que canjearlo. `tipo` es la clase de código: sin él, el `?code=` PKCE de siempre; con
   * `un-solo-uso`, el `?token_hash=` de la plantilla nueva (#217), que abre en cualquier navegador.
   */
  | { paso: "abrir"; codigo: string; tipo?: TipoDeEnlace }
  /** Sin código, pero la sesión de recuperación sigue abierta en este navegador (se recargó la página). */
  | { paso: "nueva"; correo: string }
  /** Sin código ni recuperación en curso. */
  | { paso: "no-valido" };

export interface PropiedadesDeNuevaContrasena {
  inicial: EstadoInicialDeNuevaContrasena;
  /** Server action `abrirEnlaceAccion`. */
  abrir: (codigo: string, tipo?: TipoDeEnlace) => Promise<RespuestaDeApertura>;
  /** Server action `guardarContrasenaAccion`. */
  guardar: (contrasena: string) => Promise<RespuestaDeGuardado>;
  /** Server action `cerrarOtrasSesionesAccion`: reintenta el cierre global tras un guardado `ok-sin-revocar`. */
  cerrarOtras: () => Promise<RespuestaDeCierreDeSesiones>;
  /** Server action `salirDeLaRecuperacionAccion`: cierra la sesión de ESTE navegador antes de «Ir al login» tras un `ok-sin-revocar`. */
  salirDeLaRecuperacion: () => Promise<{ tipo: "ok" }>;
  /** A dónde ir (se cambia en los tests); por defecto, una navegación completa. */
  irA?: (ruta: string) => void;
}

type Paso = "abriendo" | "no-se-pudo-abrir" | "nueva" | "cambiada" | "no-valido";

type AvisoDeGuardado = "error" | "misma" | "debil" | "larga" | null;

/** El login con el correo de esta pestaña escrito (`motivo=cerrada`: la sesión de este navegador se cerró). */
const RUTA_DEL_LOGIN_TRAS_SALIR = "/acceso?motivo=cerrada";

/** Los canjes en vuelo, por código: el código vale una sola vez y React (en desarrollo) monta el efecto dos veces. */
const canjes = new Map<string, Promise<RespuestaDeApertura>>();

function canjearUnaVez(codigo: string, tipo: TipoDeEnlace | undefined, abrir: PropiedadesDeNuevaContrasena["abrir"]): Promise<RespuestaDeApertura> {
  const enVuelo = canjes.get(codigo);
  if (enVuelo) return enVuelo;
  // El `?code=` de siempre llama con un solo argumento; solo el de un solo uso suma el tipo.
  const canje = (tipo === undefined ? abrir(codigo) : abrir(codigo, tipo)).finally(() => canjes.delete(codigo));
  canjes.set(codigo, canje);
  return canje;
}

const RUTA_DE_ESTA_PANTALLA = "/acceso/nueva-contrasena";

function Regla({ cumple, vacia, texto }: { cumple: boolean; vacia: boolean; texto: string }) {
  const estado = vacia ? "neutra" : cumple ? "cumple" : "falla";
  return (
    <li className="flex gap-2 text-[13px]">
      <span
        aria-hidden
        className={cn("font-bold", estado === "cumple" && "text-exito", estado === "falla" && "text-peligro", estado === "neutra" && "text-tinta-suave")}
      >
        {estado === "cumple" ? "✓" : estado === "falla" ? "✕" : "•"}
      </span>
      <span>
        {texto}
        {/* El glifo es solo visual: el lector de pantalla oye si la regla se cumple. */}
        {estado === "neutra" ? null : <span className="sr-only"> ({cumple ? T.cumple : T.noCumple})</span>}
      </span>
    </li>
  );
}

function CampoDeContrasena({
  etiqueta,
  nombre,
  sujeto,
  valor,
  alCambiar,
  alSalir,
  deshabilitado,
  invalido,
  descripcion,
  referencia,
}: {
  etiqueta: string;
  nombre: string;
  /** Lo que se muestra u oculta, para el nombre del botón: «la contraseña nueva». */
  sujeto: string;
  valor: string;
  alCambiar: (valor: string) => void;
  alSalir?: () => void;
  deshabilitado: boolean;
  invalido: boolean;
  descripcion?: string;
  referencia?: Ref<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col gap-[7px]">
      <label htmlFor={id} className={CLASE_DE_ETIQUETA}>
        {etiqueta}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          ref={referencia}
          type={visible ? "text" : "password"}
          name={nombre}
          autoComplete="new-password"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value)}
          onBlur={alSalir}
          disabled={deshabilitado}
          aria-invalid={invalido ? true : undefined}
          aria-describedby={descripcion}
          className={cn(CLASE_DE_CAMPO, "flex-1", invalido ? "border-peligro" : "border-grafico-neutro")}
        />
        {/* El nombre contiene el texto visible («Ver» u «Ocultar», WCAG 2.5.3) y dice qué campo es. */}
        <button type="button" onClick={() => setVisible((antes) => !antes)} aria-label={`${visible ? T.ocultar : T.ver} ${sujeto}`} className={cn(CLASE_DE_ENLACE, "flex-none px-1")}>
          {visible ? T.ocultar : T.ver}
        </button>
      </div>
    </div>
  );
}

export function PantallaNuevaContrasena({
  inicial,
  abrir,
  guardar,
  cerrarOtras,
  salirDeLaRecuperacion,
  irA = (ruta) => window.location.assign(ruta),
}: PropiedadesDeNuevaContrasena) {
  const [paso, setPaso] = useState<Paso>(inicial.paso === "abrir" ? "abriendo" : inicial.paso === "nueva" ? "nueva" : "no-valido");
  const [correo, setCorreo] = useState(inicial.paso === "nueva" ? inicial.correo : "");
  const [intento, setIntento] = useState(0);
  /** El `?code=` viejo (PKCE) falló por no estar el verificador de este navegador: único caso en que se nombra el navegador. */
  const [sinVerificador, setSinVerificador] = useState(false);
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [repetidaRevisada, setRepetidaRevisada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<AvisoDeGuardado>(null);
  /** La contraseña cambió pero el cierre de las otras sesiones no se confirmó. */
  const [sinRevocar, setSinRevocar] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  /** «Ir al login» cerrando la sesión de este navegador, y si no pudo. */
  const [saliendo, setSaliendo] = useState(false);
  const [noPudoSalir, setNoPudoSalir] = useState(false);
  const enLinea = useEnLinea();

  const enCurso = useRef(false);
  const cerrandoAhora = useRef(false);
  const saliendoAhora = useRef(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const campoNueva = useRef<HTMLInputElement>(null);
  const focoPendiente = useRef<"titulo" | "nueva" | null>(null);
  useEffect(() => {
    if (focoPendiente.current === "titulo") titulo.current?.focus();
    if (focoPendiente.current === "nueva") campoNueva.current?.focus();
    focoPendiente.current = null;
  });

  // Canjea el código del enlace. El resultado llega por una promesa: el estado no se cambia en el cuerpo del efecto.
  const codigo = inicial.paso === "abrir" ? inicial.codigo : null;
  const tipoDeCodigo = inicial.paso === "abrir" ? inicial.tipo : undefined;
  /**
   * El código que ya dio un resultado definitivo (abierto o no válido). El código vale una sola vez: tras `history.replaceState`
   * Next vuelve a renderizar con otra referencia de la server action (`abrir`) y el efecto correría de nuevo, canjearía un código
   * ya usado y pisaría el paso «nueva» con «Enlace no válido». Una falla de red o servicio no cuenta: ahí «Reintentar» canjea otra vez.
   */
  const resuelto = useRef<string | null>(null);
  useEffect(() => {
    if (codigo === null || resuelto.current === codigo) return;
    let vigente = true;
    canjearUnaVez(codigo, tipoDeCodigo, abrir)
      .then((respuesta) => {
        if (!vigente) return;
        if (respuesta.tipo !== "no-disponible") resuelto.current = codigo;
        if (respuesta.tipo === "ok") {
          setCorreo(respuesta.correo);
          setPaso("nueva");
          focoPendiente.current = "nueva";
          // El código ya se usó: se saca de la URL para que recargar no lo vuelva a pedir.
          try {
            window.history.replaceState(null, "", RUTA_DE_ESTA_PANTALLA);
          } catch {
            // Sin historial (un iframe, un doble de test): la pantalla ya cambió.
          }
        } else {
          setSinVerificador(respuesta.tipo === "no-valido" && respuesta.sinVerificador === true);
          setPaso(respuesta.tipo === "no-valido" ? "no-valido" : "no-se-pudo-abrir");
          focoPendiente.current = "titulo";
        }
      })
      .catch(() => {
        if (!vigente) return;
        setPaso("no-se-pudo-abrir");
        focoPendiente.current = "titulo";
      });
    return () => {
      vigente = false;
    };
  }, [codigo, tipoDeCodigo, abrir, intento]);

  function reintentarApertura() {
    setPaso("abriendo");
    setIntento((antes) => antes + 1);
  }

  const reglas = reglasDeContrasena(nueva);
  const sinEscribir = nueva === "";
  const noCoinciden = repetida !== "" && repetida !== nueva;
  // El aviso de «no coinciden» sale al salir del campo o cuando la repetición ya es tan larga como la contraseña: no con cada letra.
  const avisoDeCoincidencia = noCoinciden && (repetidaRevisada || repetida.length >= nueva.length);
  const apagado = guardando || !enLinea || !reglas.cumple || repetida === "" || noCoinciden;

  async function guardarAhora() {
    if (enCurso.current || apagado) return;
    enCurso.current = true;
    setGuardando(true);
    setAviso(null);
    try {
      const respuesta = await guardar(nueva);
      switch (respuesta.tipo) {
        case "ok":
          setNueva("");
          setRepetida("");
          setPaso("cambiada");
          focoPendiente.current = "titulo";
          return;
        case "ok-sin-revocar":
          setNueva("");
          setRepetida("");
          setSinRevocar(true);
          setPaso("cambiada");
          focoPendiente.current = "titulo";
          return;
        case "enlace-no-valido":
          setNueva("");
          setRepetida("");
          setPaso("no-valido");
          focoPendiente.current = "titulo";
          return;
        case "misma-contrasena":
          setAviso("misma");
          focoPendiente.current = "nueva";
          return;
        case "contrasena-debil":
          setAviso("debil");
          focoPendiente.current = "nueva";
          return;
        case "contrasena-larga":
          setAviso("larga");
          focoPendiente.current = "nueva";
          return;
        case "no-disponible":
          setAviso("error");
          // Los campos se apagaron mientras se guardaba: el foco volvió al <body>; vuelve al campo (como en 40A).
          focoPendiente.current = "nueva";
          return;
      }
    } catch {
      // La acción no llegó al servidor o se cortó a mitad de camino: no se sabe si se guardó. Lo escrito queda para reintentar.
      setAviso("error");
      focoPendiente.current = "nueva";
    } finally {
      enCurso.current = false;
      setGuardando(false);
    }
  }

  /** «Cerrar las otras sesiones»: una a la vez; si falla (devuelve `ok-sin-revocar` o no llega) el aviso queda y el botón se rehabilita. */
  async function cerrarOtrasAhora() {
    if (cerrandoAhora.current || saliendoAhora.current || !enLinea) return;
    cerrandoAhora.current = true;
    setCerrando(true);
    try {
      const respuesta = await cerrarOtras();
      if (respuesta.tipo === "ok") {
        setSinRevocar(false);
        focoPendiente.current = "titulo";
      }
    } catch {
      // No llegó al servidor: sigue sin confirmarse el cierre; el aviso queda.
    } finally {
      cerrandoAhora.current = false;
      setCerrando(false);
    }
  }

  /**
   * «Ir al login» con el cierre de las otras sesiones sin confirmar: la sesión de recuperación de ESTE navegador sigue abierta y
   * un enlace común al login dejaría entrar al panel. Se cierra primero (alcance local; las otras sesiones no se tocan) y recién
   * ahí se va al login con el correo escrito. Si el cierre no llega, la pantalla se queda, avisa y se puede reintentar; una a la vez.
   */
  async function salirAlLogin() {
    if (saliendoAhora.current || cerrandoAhora.current || !enLinea) return;
    saliendoAhora.current = true;
    setSaliendo(true);
    setNoPudoSalir(false);
    try {
      await salirDeLaRecuperacion();
      guardarUltimoCorreo(correo);
      irA(RUTA_DEL_LOGIN_TRAS_SALIR);
    } catch {
      setNoPudoSalir(true);
    } finally {
      saliendoAhora.current = false;
      setSaliendo(false);
    }
  }

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    void guardarAhora();
  }

  const titulos: Record<Paso, string> = {
    abriendo: T.titulo,
    "no-se-pudo-abrir": T.tituloNoSePudoAbrir,
    nueva: T.titulo,
    cambiada: T.tituloCambiada,
    "no-valido": T.tituloNoValido,
  };

  let cartel: DatosDelAviso | null = null;
  if (paso === "abriendo") cartel = { texto: T.verificando, rol: "status", tono: "info" };
  else if (paso === "no-se-pudo-abrir") cartel = { texto: T.noSePudoAbrir, rol: "alert", tono: "error" };
  else if (paso === "no-valido") cartel = { texto: sinVerificador ? T.noValidoSinVerificador : T.noValido, rol: "alert", tono: "error" };
  else if (paso === "cambiada" && sinRevocar) cartel = { texto: T.sinRevocar, rol: "alert", tono: "error" };
  else if (paso === "cambiada") cartel = { texto: T.cambiada, rol: "status", tono: "exito" };
  else if (!enLinea) cartel = { texto: T.sinConexion, rol: "status", tono: "sin-red" };
  else if (aviso === "error") cartel = { texto: T.errorAlGuardar, rol: "alert", tono: "error" };

  const errorDelCampo =
    reglas.demasiadoLarga || aviso === "larga"
      ? T.demasiadaLarga
      : aviso === "misma"
        ? T.mismaContrasena
        : aviso === "debil"
          ? T.contrasenaDebil
          : null;

  const botonPrincipal = "flex items-center justify-center gap-2.5 rounded-control px-3 py-[13px] text-[14px] font-semibold text-superficie outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2";

  return (
    <MarcoDeAcceso>
      <div className="flex flex-col gap-2">
        <h1 ref={titulo} tabIndex={-1} className="font-serif text-[28px] leading-tight font-semibold text-balance outline-none">
          {titulos[paso]}
        </h1>
        {paso === "nueva" && correo ? <p className="text-[14px] leading-normal wrap-anywhere text-pretty text-tinta-2">{T.para(correo)}</p> : null}
      </div>

      {cartel ? <Cartel aviso={cartel} /> : null}

      {paso === "nueva" ? (
        <form onSubmit={alEnviar} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <CampoDeContrasena
              etiqueta={T.nueva}
              nombre="contrasena-nueva"
              sujeto="la contraseña nueva"
              valor={nueva}
              alCambiar={(valor) => {
                setNueva(valor);
                setAviso((antes) => (antes === "misma" || antes === "debil" || antes === "larga" ? null : antes));
              }}
              deshabilitado={guardando}
              invalido={errorDelCampo !== null}
              descripcion={errorDelCampo ? "error-de-la-contrasena" : undefined}
              referencia={campoNueva}
            />
            <CampoDeContrasena
              etiqueta={T.repetida}
              nombre="contrasena-repetida"
              sujeto="la contraseña repetida"
              valor={repetida}
              alCambiar={(valor) => {
                setRepetida(valor);
                if (valor === "") setRepetidaRevisada(false);
              }}
              alSalir={() => {
                if (repetida !== "") setRepetidaRevisada(true);
              }}
              deshabilitado={guardando}
              invalido={avisoDeCoincidencia}
              descripcion={avisoDeCoincidencia ? "aviso-de-coincidencia" : undefined}
            />
            {avisoDeCoincidencia ? (
              <p id="aviso-de-coincidencia" role="alert" className="-mt-2 text-cuerpo text-peligro">
                {T.noCoinciden}
              </p>
            ) : null}
            {errorDelCampo ? (
              <p id="error-de-la-contrasena" role="alert" className="-mt-2 text-cuerpo text-peligro">
                {errorDelCampo}
              </p>
            ) : null}
            <ul aria-label={T.reglasTitulo} className="flex flex-col gap-[5px]">
              <Regla cumple={reglas.largo} vacia={sinEscribir} texto={!sinEscribir && !reglas.largo ? T.reglaLargoFaltan(reglas.faltan) : T.reglaLargo} />
              <Regla cumple={reglas.mayuscula} vacia={sinEscribir} texto={T.reglaMayuscula} />
              <Regla cumple={reglas.numero} vacia={sinEscribir} texto={T.reglaNumero} />
            </ul>
          </div>

          <button
            type="submit"
            aria-disabled={apagado || undefined}
            // Apagado no es `disabled`: el botón conserva el foco y un clic o un Enter no hacen nada (`guardarAhora` lo comprueba).
            className={cn(botonPrincipal, guardando ? "bg-marca-media" : apagado ? "bg-tinta-tenue" : "bg-marca hover:bg-marca-media")}
          >
            {guardando ? (
              <span aria-hidden className="size-3.5 animate-spin rounded-pastilla border-2 border-superficie/35 border-t-superficie" />
            ) : null}
            {guardando ? T.guardando : aviso === "error" ? T.reintentar : T.guardar}
          </button>
          {/* El lector de pantalla anuncia que se está guardando; a la vista, el botón ya lo dice. */}
          <span aria-live="polite" className="sr-only">
            {guardando ? T.guardando : null}
          </span>
        </form>
      ) : null}

      {paso === "cambiada" && sinRevocar ? (
        <>
          <button
            type="button"
            onClick={() => void cerrarOtrasAhora()}
            aria-disabled={cerrando || saliendo || !enLinea || undefined}
            className={cn(botonPrincipal, cerrando ? "bg-marca-media" : saliendo || !enLinea ? "bg-tinta-tenue" : "bg-marca hover:bg-marca-media")}
          >
            {cerrando ? (
              <span aria-hidden className="size-3.5 animate-spin rounded-pastilla border-2 border-superficie/35 border-t-superficie" />
            ) : null}
            {cerrando ? T.cerrandoOtras : T.cerrarOtras}
          </button>
          {/* Un botón y no un enlace: sin cerrar antes la sesión de este navegador, ir al login dejaría entrar al panel. */}
          <button
            type="button"
            onClick={() => void salirAlLogin()}
            aria-disabled={saliendo || cerrando || !enLinea || undefined}
            className={cn(CLASE_DE_ENLACE, "text-center")}
          >
            {saliendo ? T.saliendo : T.irAlLogin}
          </button>
          {noPudoSalir ? (
            <p role="alert" className="text-cuerpo text-peligro">
              {T.noPudoSalir}
            </p>
          ) : null}
          {/* Sin red los dos botones quedan apagados: la línea dice por qué (tono de 40B·08). */}
          {!enLinea ? <Cartel aviso={{ texto: T.sinConexionParaSalir, rol: "status", tono: "sin-red" }} /> : null}
        </>
      ) : null}

      {paso === "cambiada" && !sinRevocar ? (
        // Mismo final que «Ir al login» tras el cierre fallido (decisión del 26/11, 38·07): el login con el correo y «Cerraste sesión.».
        <a
          href={RUTA_DEL_LOGIN_TRAS_SALIR}
          onClick={() => guardarUltimoCorreo(correo)}
          className={cn(botonPrincipal, "bg-marca hover:bg-marca-media")}
        >
          {T.irAlLogin}
        </a>
      ) : null}

      {paso === "no-valido" ? (
        <>
          <a href="/acceso/olvide" className={cn(botonPrincipal, "bg-marca hover:bg-marca-media")}>
            {T.solicitarNuevo}
          </a>
          <a href="/acceso" className={cn(CLASE_DE_ENLACE, "text-center")}>
            {T.volverAlLogin}
          </a>
        </>
      ) : null}

      {paso === "no-se-pudo-abrir" ? (
        <>
          <button type="button" onClick={reintentarApertura} className={cn(botonPrincipal, "bg-marca hover:bg-marca-media")}>
            {T.reintentar}
          </button>
          <a href="/acceso" className={cn(CLASE_DE_ENLACE, "text-center")}>
            {T.volverAlLogin}
          </a>
        </>
      ) : null}
    </MarcoDeAcceso>
  );
}
