"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";

import { mensajeDeRechazo } from "@/auth/sesion-vencida";
import type { AccionesPrecios, DatosDePrecios } from "@/datos/precios";
import { EnlaceEntrarDeNuevo } from "@/features/equipo/EnlaceEntrarDeNuevo";
import { cn } from "@/lib/utils";
import { esperarYSalir, estaEsperando, hayQueEsperar } from "@/shell/trabajo-pendiente";

import { AvisoDePrecios } from "./AvisoDePrecios";
import { BarraDeCambios } from "./BarraDeCambios";
import { DialogoDeCambiosGrandes } from "./DialogoDeCambiosGrandes";
import { TablaDeCiudad } from "./TablaDeCiudad";
import { TablaGeneral } from "./TablaGeneral";
import {
  armarFilasDeCiudad,
  armarFilasGenerales,
  armarPestanas,
  AVISO_GENERAL,
  bonificablesSinPrecioEnCiudad,
  bonificablesSinPrecioGeneral,
  resumirBorrador,
  SUBTITULO_GENERAL,
  subtituloDeCiudad,
  textoDeAlertaSinPrecioEnCiudad,
  textoDeAlertaSinPrecioGeneral,
} from "./modelo";
import { usePrecios } from "./usePrecios";

/** 27G·07: sin precios cargados el subtítulo se queda en la primera frase. */
export const SUBTITULO_GENERAL_VACIO = "El precio de todo el país.";
export const TEXTO_SIN_PRECIOS_GENERALES = "Todavía no hay precios generales";
export const DETALLE_SIN_PRECIOS_GENERALES =
  "Mientras no haya precio general ni excepción, los colportores no ven productos para vender. Los carga el administrador.";
export const TEXTO_SIN_CIUDADES =
  "Esta campaña todavía no tiene ciudades. Agregalas desde Ciudades y vas a poder ver y cambiar sus precios acá.";

const TEXTO_SIN_CONEXION_EN_COLA = "Sin conexión. Tus cambios quedan marcados en esta pestaña; se guardan cuando vuelva internet.";
const TEXTO_SIN_CONEXION =
  "Sin conexión. Tus cambios quedan marcados en esta pestaña; cuando vuelva internet, guardalos con «Guardar cambios».";
const TEXTO_ERROR_AL_GUARDAR = "No pudimos guardar los cambios. Siguen marcados: probá de nuevo.";

/**
 * Vista 27 (HU-CAT-005): el precio de venta es general para todo el país y cada ciudad de la campaña se aparta solo con una
 * excepción. La pestaña «General» muestra el general (el coordinador lo ve sin poder cambiarlo); cada ciudad tiene la suya,
 * con la edición en línea de la opción A: los cambios se marcan y se guardan juntos desde la barra de abajo.
 */
export function PreciosVista({ datos: inicial, acciones }: { datos: DatosDePrecios; acciones: AccionesPrecios }) {
  const router = useRouter();
  const e = usePrecios(inicial, acciones);
  const { datos } = e;
  const botonDeGuardar = useRef<HTMLButtonElement>(null);

  const ciudad = datos.ciudades.find((c) => c.id === e.activa) ?? null;
  const esGeneral = ciudad === null;
  const pestanas = armarPestanas(datos, e.borradores);
  const borrador = ciudad ? (e.borradores[ciudad.id] ?? {}) : {};
  const resumen = ciudad ? resumirBorrador(datos, ciudad.id, borrador) : { cambios: [], invalidos: 0 };

  // Al cerrar el diálogo de cambios grandes, el foco vuelve al botón que lo abrió.
  const habiaDialogo = useRef(false);
  useEffect(() => {
    if (e.confirmacion) habiaDialogo.current = true;
    else if (habiaDialogo.current) {
      habiaDialogo.current = false;
      botonDeGuardar.current?.focus();
    }
  }, [e.confirmacion]);

  // Si la barra se va con el foco adentro (guardó, descartó), el foco no puede caer al <body>: pasa a la pestaña abierta.
  const hayAcciones = ciudad !== null && (resumen.cambios.length > 0 || e.guardandoEn === ciudad.id);
  const habiaAcciones = useRef(false);
  useEffect(() => {
    if (habiaAcciones.current && !hayAcciones && (document.activeElement === document.body || document.activeElement === null)) {
      document.getElementById(`pestana-precios-${e.activa}`)?.focus();
    }
    habiaAcciones.current = hayAcciones;
  }, [hayAcciones, e.activa]);

  function alVolverAStock(evento: MouseEvent<HTMLAnchorElement>) {
    // Un clic con modificador abre otra pestaña y esta se queda como está.
    if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    if (!hayQueEsperar() && !estaEsperando()) return;
    evento.preventDefault();
    void esperarYSalir(() => router.push("/stock"));
  }

  const ruta = (
    <nav aria-label="Ruta" className="flex items-center gap-2 text-cuerpo text-tinta-suave">
      <Link href="/stock" onClick={alVolverAStock} className="inline-flex min-h-6 items-center font-semibold text-marca-media hover:text-marca">
        ‹ Stock
      </Link>
      <span aria-hidden>/</span>
      <span aria-current="page">Precios</span>
    </nav>
  );

  if (datos.ciudades.length === 0) {
    return (
      <div className="flex flex-col gap-3.5">
        {ruta}
        <h2 className="font-serif text-[22px] font-semibold text-tinta">Precios de venta</h2>
        <p role="status" className="max-w-xl rounded-tarjeta border border-borde bg-superficie px-[18px] py-4 text-nav text-tinta">
          {TEXTO_SIN_CIUDADES}
        </p>
      </div>
    );
  }

  const guardandoAca = ciudad !== null && e.guardandoEn === ciudad.id;
  const falla = ciudad && e.falla?.ciudadId === ciudad.id ? e.falla : null;
  const sinConexion = ciudad !== null && (!e.enLinea || falla?.tipo === "sin-conexion") && (resumen.cambios.length > 0 || falla !== null);
  const enCola = ciudad !== null && e.reintentoEnCola === ciudad.id;

  const sinCatalogo = datos.items.length === 0 || (esGeneral && datos.items.every((i) => i.precioGeneral === null));
  const alertaSinGeneral = esGeneral && !sinCatalogo ? textoDeAlertaSinPrecioGeneral(bonificablesSinPrecioGeneral(datos)) : null;
  // 27G·05: en cada ciudad, los bonificables que no tienen general ni excepción ahí (lo guardado, no lo tipeado).
  const sinPrecioAca = ciudad ? bonificablesSinPrecioEnCiudad(datos, ciudad.id) : [];
  const alertaSinPrecioAca = ciudad ? textoDeAlertaSinPrecioEnCiudad(sinPrecioAca, ciudad.nombre) : null;

  // «Agregar precio» abre el campo del primero que todavía no tiene uno en el borrador; si ya los abrió todos, solo lleva el
  // foco al primero (volver a abrirlo pisaría lo que se escribió).
  function agregarPrecioFaltante() {
    if (!ciudad || sinPrecioAca.length === 0) return;
    const libre = sinPrecioAca.find((i) => borrador[i.clave] === undefined);
    if (libre) {
      e.agregarExcepcion(ciudad.id, libre.clave, null);
      return;
    }
    document.querySelector<HTMLInputElement>(`[data-precio="${CSS.escape(sinPrecioAca[0].clave)}"]`)?.focus();
  }

  // Los avisos de un guardado (falla, sesión, sin conexión) van en la barra fija de abajo: con la tabla larga y la fila editada
  // al final, arriba de la tabla quedarían fuera de la pantalla justo donde está «Reintentar» (QA #64).
  const avisosDeGuardado = (
    <>
        {falla?.tipo === "error" && (
          <AvisoDePrecios tono="peligro" rol="alert">
            {falla.mensaje ?? TEXTO_ERROR_AL_GUARDAR}
          </AvisoDePrecios>
        )}
        {falla?.tipo === "sesion" && (
          <AvisoDePrecios tono="peligro" rol="alert" accion={<EnlaceEntrarDeNuevo motivo={falla.motivo} />}>
            {mensajeDeRechazo(falla.motivo, "guardar los precios")}
          </AvisoDePrecios>
        )}
        {sinConexion && (
          <AvisoDePrecios tono="sin-conexion" rol="status">
            {enCola ? TEXTO_SIN_CONEXION_EN_COLA : TEXTO_SIN_CONEXION}
          </AvisoDePrecios>
        )}

    </>
  );
  const hayAvisosDeGuardado = falla !== null || sinConexion;

  function moverPestana(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const ultimo = pestanas.length - 1;
    const destino =
      evento.key === "ArrowRight" ? (indice + 1) % pestanas.length
      : evento.key === "ArrowLeft" ? (indice - 1 + pestanas.length) % pestanas.length
      : evento.key === "Home" ? 0
      : evento.key === "End" ? ultimo
      : null;
    if (destino === null) return;
    evento.preventDefault();
    e.elegirPestana(pestanas[destino].id);
    // Las pestañas están siempre en el DOM: se puede enfocar la nueva sin esperar al próximo pintado.
    document.getElementById(`pestana-precios-${pestanas[destino].id}`)?.focus();
  }

  return (
    <div className="flex min-h-0 flex-col gap-3.5">
      {ruta}

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-serif text-[22px] font-semibold text-tinta">Precios de venta</h2>
          <p className="text-cuerpo text-tinta-2">{esGeneral ? (sinCatalogo ? SUBTITULO_GENERAL_VACIO : SUBTITULO_GENERAL) : subtituloDeCiudad(ciudad.nombre)}</p>
        </div>
        {!esGeneral && (
          <p className="text-chico text-tinta-suave">Tab pasa al siguiente precio · Esc descarta el valor de la celda</p>
        )}
      </div>

      <div role="tablist" aria-label="Precios por ciudad" className="flex flex-wrap gap-1 border-b border-borde">
        {pestanas.map((p, indice) => {
          const activa = p.id === e.activa;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`pestana-precios-${p.id}`}
              aria-selected={activa}
              aria-controls="panel-precios"
              tabIndex={activa ? 0 : -1}
              onClick={() => e.elegirPestana(p.id)}
              onKeyDown={(evento) => moverPestana(evento, indice)}
              className={cn(
                "inline-flex min-h-[38px] cursor-pointer items-center gap-2 px-3.5 text-nav focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none",
                activa ? "font-semibold text-marca shadow-[inset_0_-2px_0_var(--marca)]" : "text-tinta-2",
              )}
            >
              {p.nombre}
              {" "}
              {p.sinGuardar > 0 ? (
                <span className="rounded-pastilla bg-alerta-fondo px-[7px] py-0.5 text-mini font-semibold text-alerta">
                  {p.sinGuardar} sin guardar
                </span>
              ) : p.faltan ? (
                <span className="rounded-pastilla bg-alerta-fondo px-[7px] py-0.5 text-mini font-semibold text-alerta">{p.faltan}</span>
              ) : (
                p.excepciones && (
                  <span className="rounded-pastilla bg-marca-clara px-[7px] py-0.5 text-mini font-semibold text-marca-media">{p.excepciones}</span>
                )
              )}
            </button>
          );
        })}
      </div>

      <div id="panel-precios" role="tabpanel" aria-labelledby={`pestana-precios-${e.activa}`} className="flex min-h-0 flex-col gap-3.5">
        {esGeneral && <AvisoDePrecios tono="info" rol="status">{AVISO_GENERAL}</AvisoDePrecios>}
        {alertaSinGeneral && (
          <AvisoDePrecios tono="alerta" rol="alert">
            {alertaSinGeneral}
          </AvisoDePrecios>
        )}
        {alertaSinPrecioAca && (
          <AvisoDePrecios
            tono="alerta"
            rol="alert"
            accion={
              <button
                type="button"
                onClick={agregarPrecioFaltante}
                className="inline-flex min-h-6 flex-none cursor-pointer items-center rounded-control px-1 text-nav font-semibold text-marca-media hover:text-marca focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none"
              >
                Agregar precio
              </button>
            }
          >
            {alertaSinPrecioAca}
          </AvisoDePrecios>
        )}
        {sinCatalogo ? (
          <div className="flex flex-col items-center gap-1.5 rounded-tarjeta border border-borde bg-superficie px-[18px] py-10 text-center">
            <p role="status" className="font-serif text-titulo font-semibold text-tinta">
              {TEXTO_SIN_PRECIOS_GENERALES}
            </p>
            <p className="max-w-xl text-nav text-tinta-suave">{DETALLE_SIN_PRECIOS_GENERALES}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-tarjeta border border-borde bg-superficie">
            {esGeneral ? (
              <TablaGeneral filas={armarFilasGenerales(datos)} />
            ) : (
              <TablaDeCiudad
                filas={armarFilasDeCiudad(datos, ciudad.id, borrador)}
                ciudad={ciudad.nombre}
                acciones={{
                  agregar: (clave, sugerido) => e.agregarExcepcion(ciudad.id, clave, sugerido),
                  escribir: (clave, texto) => e.escribir(ciudad.id, clave, texto),
                  quitar: (clave) => e.quitarExcepcion(ciudad.id, clave),
                  revertir: (clave) => e.revertir(ciudad.id, clave),
                  soltar: (clave) => e.soltar(ciudad.id, clave),
                }}
              />
            )}
          </div>
        )}
      </div>

      {ciudad && (e.aviso?.ciudadId === ciudad.id || resumen.cambios.length > 0 || guardandoAca) && (
        <BarraDeCambios
          ciudad={ciudad.nombre}
          cambios={resumen.cambios.length}
          invalidos={resumen.invalidos}
          guardando={guardandoAca}
          reintentar={falla?.tipo === "error"}
          sinConexion={!e.enLinea}
          errorAlGuardar={falla?.tipo === "error"}
          intentoDeSalir={e.intentoDeSalir}
          aviso={e.aviso?.ciudadId === ciudad.id ? e.aviso.texto : null}
          avisos={hayAvisosDeGuardado ? avisosDeGuardado : null}
          botonDeGuardar={botonDeGuardar}
          alGuardar={() => e.guardar(ciudad.id)}
          alDescartar={() => e.descartar(ciudad.id)}
        />
      )}

      {ciudad && e.confirmacion && e.confirmacion.ciudadId === ciudad.id && (
        <DialogoDeCambiosGrandes
          grandes={e.confirmacion.grandes}
          total={resumen.cambios.length}
          enviando={guardandoAca}
          alVolver={e.volverAEditar}
          alGuardar={() => void e.enviar(ciudad.id)}
        />
      )}
    </div>
  );
}

