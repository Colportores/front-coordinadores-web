"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import type { RespuestaDelPedido } from "@/auth/acciones-recuperacion";
import { Cartel, CLASE_DE_CAMPO, CLASE_DE_ENLACE, CLASE_DE_ETIQUETA, MarcoDeAcceso, type DatosDelAviso } from "@/features/acceso/MarcoDeAcceso";
import { esperaRestanteMs, guardarUltimoEnvio, leerCorreoAPedir, leerUltimoEnvio } from "@/features/acceso/recuperacion-almacen";
import { TEXTOS_DE_ACCESO } from "@/features/acceso/textos";
import { TEXTOS_DE_OLVIDE as T } from "@/features/acceso/textos-recuperacion";
import { normalizarCorreo, problemaDeCorreo } from "@/features/acceso/validacion";
import { useEnLinea } from "@/lib/en-linea";
import { cn } from "@/lib/utils";

/**
 * «Olvidé mi contraseña» del coordinador (vista 40A, HU-AUTH-004; el canvas dibuja ocho estados de esta pantalla):
 *
 * | artboard | cuándo |
 * |---|---|
 * | 01 pedir el enlace | el formulario, con el correo que ya estaba escrito en el login |
 * | 02 correo vacío | «Enviar enlace» apagado |
 * | 03 correo incompleto | el aviso sale en el campo al salir de él o al querer enviar, y no se manda nada |
 * | 04 enviando | campo y botón apagados hasta la respuesta |
 * | 05 enviado | la respuesta es neutra: no dice si el correo tiene cuenta (el pedido que el servidor rechaza por límite o por dirección también llega acá); «Reenviar en N s» |
 * | 06 espera vigente | al volver dentro de los 60 s del último pedido: el botón apagado y «Podés pedir otro enlace en N s.» |
 * | 07 sin conexión | el navegador está sin red |
 * | 08 no disponible | el servicio no contestó: «Reintentar» |
 *
 * Casos límite (los pide el flujo): un pedido a la vez aunque se aprieten dos veces el botón o Enter; si la acción falla a
 * mitad de camino el botón vuelve a habilitarse; la espera de 60 s sobrevive a salir de la pantalla y volver (y nunca pasa de 60 s
 * aunque el reloj se haya atrasado); un correo larguísimo se corta en la caja.
 */

export interface PropiedadesDeOlvide {
  /** Server action `pedirEnlaceAccion`. */
  pedir: (correo: string) => Promise<RespuestaDelPedido>;
}

type Fase = "formulario" | "enviado";

/** El almacenamiento no cambia mientras se ve la pantalla por otra vía que esta: no hay nada a qué suscribirse. */
const sinSuscripcion = () => () => {};

export function PantallaOlvide({ pedir }: PropiedadesDeOlvide) {
  // El correo del login (sessionStorage) se lee una vez: en el servidor y en el primer render es vacío.
  const correoDelLogin = useSyncExternalStore(sinSuscripcion, leerCorreoAPedir, () => "");
  const [correoEscrito, setCorreo] = useState<string | null>(null);
  const correo = correoEscrito ?? correoDelLogin;
  const [fase, setFase] = useState<Fase>("formulario");
  /** El correo al que se mandó el último enlace: es el que nombra la pantalla 05 y al que se reenvía. */
  const [correoEnviado, setCorreoEnviado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [reenviado, setReenviado] = useState(false);
  const [revisado, setRevisado] = useState(false);
  /** El correo que el servidor no aceptó aunque acá pareciera bien: el aviso sale mientras no se cambie. */
  const [correoRechazado, setCorreoRechazado] = useState<string | null>(null);
  const enLinea = useEnLinea();

  // La espera entre pedidos. El valor guardado es el crudo (no cambia con el reloj); lo que falta se calcula con `ahora`.
  const ultimoGuardado = useSyncExternalStore(sinSuscripcion, leerUltimoEnvio, () => 0);
  const [ultimoLocal, setUltimoLocal] = useState(0);
  const ultimoEnvio = Math.max(ultimoGuardado, ultimoLocal);
  const [ahora, setAhora] = useState(() => Date.now());
  const faltaMs = esperaRestanteMs(ultimoEnvio, ahora);
  const hayEspera = faltaMs > 0;
  const segundos = Math.ceil(faltaMs / 1000);

  useEffect(() => {
    if (!hayEspera) return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [hayEspera]);

  // Un pedido a la vez: el estado de React no alcanza (dos eventos en el mismo tick leen el mismo `enviando`).
  const enCurso = useRef(false);
  const campoCorreo = useRef<HTMLInputElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const focoPendiente = useRef<"correo" | "titulo" | null>(null);
  useEffect(() => {
    if (focoPendiente.current === "correo") campoCorreo.current?.focus();
    if (focoPendiente.current === "titulo") titulo.current?.focus();
    focoPendiente.current = null;
  });

  const correoNormalizado = normalizarCorreo(correo);
  const enviado = fase === "enviado";
  const problema = correoNormalizado === "" ? null : problemaDeCorreo(correoNormalizado);
  let avisoDelCampo: string | null = null;
  if (correoRechazado !== null && correoRechazado === correoNormalizado) avisoDelCampo = T.correoIncompleto;
  else if (revisado && problema) avisoDelCampo = problema === "caracter-no-permitido" ? TEXTOS_DE_ACCESO.correoConCaracterQueNoVa : T.correoIncompleto;
  // Apagado: enviando, sin red, en espera o sin nada escrito (el reenvío usa el correo ya enviado, no el campo).
  const apagado = enviando || !enLinea || hayEspera || (!enviado && correoNormalizado === "");

  async function pedirEnlace() {
    if (enCurso.current) return;
    if (!enLinea || hayEspera) return;
    const destino = enviado ? correoEnviado : correoNormalizado;
    if (destino === "") return;
    // Lo que no puede ser un correo no se manda: el aviso sale en el campo y el foco va ahí.
    if (!enviado && problemaDeCorreo(destino) !== null) {
      setRevisado(true);
      campoCorreo.current?.focus();
      return;
    }
    enCurso.current = true;
    setEnviando(true);
    setFallo(false);
    setReenviado(false);
    try {
      const respuesta = await pedir(destino);
      switch (respuesta.tipo) {
        case "enviado": {
          const hora = Date.now();
          guardarUltimoEnvio(hora);
          setUltimoLocal(hora);
          setAhora(hora);
          setCorreoEnviado(destino);
          if (enviado) setReenviado(true);
          else {
            setFase("enviado");
            focoPendiente.current = "titulo";
          }
          return;
        }
        case "correo-invalido":
          setCorreoRechazado(destino);
          focoPendiente.current = "correo";
          return;
        case "no-disponible":
          setFallo(true);
          focoPendiente.current = enviado ? null : "correo";
          return;
      }
    } catch {
      // La acción no llegó al servidor o se cortó a mitad de camino: no se sabe si salió el correo.
      setFallo(true);
      focoPendiente.current = enviado ? null : "correo";
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  }

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    void pedirEnlace();
  }

  let cartel: DatosDelAviso | null = null;
  if (!enLinea) cartel = { texto: T.sinConexion, rol: "status", tono: "sin-red" };
  else if (fallo) cartel = { texto: T.noDisponible, rol: "alert", tono: "error" };

  let textoDelBoton: string = enviado ? T.reenviar : T.enviar;
  if (enviando) textoDelBoton = T.enviando;
  else if (hayEspera) textoDelBoton = enviado ? T.reenviarEn(segundos) : T.enviar;
  else if (fallo) textoDelBoton = T.reintentar;

  return (
    <MarcoDeAcceso>
      <div className="flex flex-col gap-2">
        <h1 ref={titulo} tabIndex={-1} className="font-serif text-[28px] leading-tight font-semibold text-balance outline-none">
          {enviado ? T.tituloEnviado : T.titulo}
        </h1>
        <p className="text-[14px] leading-normal wrap-anywhere text-pretty text-tinta-2">{enviado ? T.textoEnviado(correoEnviado) : T.texto}</p>
      </div>

      {cartel ? <Cartel aviso={cartel} /> : null}

      <form onSubmit={alEnviar} noValidate className="flex flex-col gap-5">
        {enviado ? null : (
          <div className="flex flex-col gap-[7px]">
            <label className="flex flex-col gap-[7px]">
              <span className={CLASE_DE_ETIQUETA}>{T.correo}</span>
              <input
                ref={campoCorreo}
                type="email"
                name="correo"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                required
                placeholder={T.placeholderCorreo}
                value={correo}
                onChange={(evento) => {
                  setCorreo(evento.target.value);
                  // Vaciado el campo, se empieza de nuevo: el aviso no vuelve con la primera letra.
                  if (normalizarCorreo(evento.target.value) === "") setRevisado(false);
                }}
                onBlur={() => {
                  if (correoNormalizado !== "") setRevisado(true);
                }}
                disabled={enviando}
                aria-invalid={avisoDelCampo ? true : undefined}
                aria-describedby={avisoDelCampo ? "aviso-del-correo" : undefined}
                className={cn(CLASE_DE_CAMPO, avisoDelCampo ? "border-peligro" : "border-grafico-neutro")}
              />
            </label>
            {avisoDelCampo ? (
              <p id="aviso-del-correo" role="alert" className="text-cuerpo text-pretty text-peligro">
                {avisoDelCampo}
              </p>
            ) : null}
          </div>
        )}

        <button
          type="submit"
          aria-disabled={apagado || undefined}
          // Apagado no es `disabled`: el botón conserva el foco y un clic o un Enter no hacen nada (`pedirEnlace` lo comprueba).
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
        {/* El lector de pantalla anuncia lo que pasa; a la vista, el botón ya lo dice. */}
        <span aria-live="polite" className="sr-only">
          {enviando ? T.enviando : reenviado ? T.reenviado : null}
        </span>
      </form>

      {/* 06: la espera vigente (en la pantalla 05 el contador va en el botón). */}
      {hayEspera && !enviado && !enviando ? <p className="text-cuerpo leading-normal text-pretty text-tinta-suave">{T.espera(segundos)}</p> : null}

      <a href="/acceso" className={cn(CLASE_DE_ENLACE, "text-center")}>
        {T.volverAlLogin}
      </a>
    </MarcoDeAcceso>
  );
}
