"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FocusEvent as EventoFoco, KeyboardEvent as EventoTeclado, ReactNode } from "react";

import type { CampaniaElegible, ResultadoCampanias, ResumenCoordinador } from "@/datos/shell/contrato";
import { cn } from "@/lib/utils";
import { guardarCampaniaElegida } from "@/shell/campania-elegida";
import { textoDeFechas, textoDelBoton } from "@/shell/campanias-texto";
import { estaEsperando, esperarYSalir, hayQueEsperar } from "@/shell/trabajo-pendiente";

/**
 * Textos de la vista 37 (canvas «37 Topbar Campana», «TEXTOS PROPUESTA»). El de «sin conexión» nombra la campaña que se
 * sigue viendo para que se entienda que nada cambió.
 */
export const TEXTO_CARGANDO_CAMPANIAS = "Cargando tus campañas…";
export const TEXTO_ERROR_CAMPANIAS = "No pudimos traer tus campañas.";
export const TEXTO_SIN_CAMPANIAS = "No tenés campañas en curso ni por empezar";
export const TEXTO_SIN_CAMPANIAS_DETALLE = "Las campañas terminadas no se eligen desde acá.";
export const TEXTO_REINTENTAR = "Reintentar";
export const textoSinConexionCampanias = (campania: string | null) =>
  `Sin conexión. La lista se carga cuando vuelva internet${campania ? `; seguís viendo ${campania}` : ""}.`;
export const textoCampaniaCambiada = (nombre: string) => `Ahora ves ${nombre}.`;

/** Cuánto queda el aviso «Ahora ves …» a la vista. */
export const MS_AVISO_CAMPANIA = 5_000;

type Carga = { tipo: "cargando" } | { tipo: "lista"; campanias: CampaniaElegible[] } | { tipo: "error"; causa: "sin-conexion" | "error" };

interface Vista {
  id: string | null;
  region: string;
  campania: string;
}

const ETIQUETA_GRUPO = "font-mono text-etiqueta tracking-etiqueta text-tinta-suave";

/** Una falla de la llamada misma (la red se cayó antes de que el servidor contestara) no es un error del panel. */
function causaDeLaFalla(error: unknown): "sin-conexion" | "error" {
  const sinRed = typeof navigator !== "undefined" && navigator.onLine === false;
  return sinRed || error instanceof TypeError ? "sin-conexion" : "error";
}

/**
 * El botón del topbar («<ciudades> · <campaña> ▾») y la lista de campañas en curso y por empezar de la coordinadora
 * (decisión de Cristian del 21/10, «Qué campaña»; canvas vista 37). La lista se pide al abrirla. Elegir otra guarda la
 * elección (`guardarCampaniaElegida`), recarga la pestaña abierta con esa campaña (`router.refresh()`, el servidor la lee en
 * cada pedido) y avisa «Ahora ves …». Si hay inscripciones por mandar (vista 23) primero se esperan, igual que al cambiar
 * de pestaña: no se cambia de campaña con envíos en el aire.
 *
 * Teclado: Enter, Espacio o ↓/↑ abren; flechas, Inicio y Fin se mueven; Enter y Espacio eligen; Esc cierra y devuelve el foco
 * al botón.
 */
export function SelectorDeCampania({
  resumen,
  pedirCampanias,
}: {
  resumen: ResumenCoordinador;
  pedirCampanias: () => Promise<ResultadoCampanias>;
}) {
  const router = useRouter();
  const idBase = useId();
  const idLista = `${idBase}-lista`;
  const idOpcion = (indice: number) => `${idBase}-opcion-${indice}`;

  const [vista, setVista] = useState<Vista>({ id: resumen.campaniaId, region: resumen.region, campania: resumen.campania });
  const [abierto, setAbierto] = useState(false);
  const [carga, setCarga] = useState<Carga>({ tipo: "cargando" });
  const [indiceActivo, setIndiceActivo] = useState(0);
  const [eligiendo, setEligiendo] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string } | null>(null);

  const envoltorio = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const reintentar = useRef<HTMLButtonElement>(null);
  /** Número del último pedido: la respuesta de uno viejo (se cerró o se reintentó) se descarta. */
  const pedido = useRef(0);
  const eligiendoAhora = useRef(false);

  // En curso primero y por empezar después, en el orden de la RPC dentro de cada grupo; es también el orden de las flechas.
  const opciones = carga.tipo === "lista" ? [...carga.campanias.filter((c) => c.estado === "en-curso"), ...carga.campanias.filter((c) => c.estado === "por-empezar")] : [];
  const enCurso = opciones.filter((c) => c.estado === "en-curso");
  const porEmpezar = opciones.filter((c) => c.estado === "por-empezar");
  const hayOpciones = opciones.length > 0;

  const pedirLista = useCallback(async () => {
    const numero = ++pedido.current;
    setCarga({ tipo: "cargando" });
    let resultado: ResultadoCampanias;
    try {
      resultado = await pedirCampanias();
    } catch (error) {
      resultado = { ok: false, causa: causaDeLaFalla(error) };
    }
    if (numero !== pedido.current) return;
    if (!resultado.ok) {
      setCarga({ tipo: "error", causa: resultado.causa });
      return;
    }
    setCarga({ tipo: "lista", campanias: resultado.campanias });
    const enOrden = [
      ...resultado.campanias.filter((c) => c.estado === "en-curso"),
      ...resultado.campanias.filter((c) => c.estado === "por-empezar"),
    ];
    setIndiceActivo(Math.max(0, enOrden.findIndex((c) => c.id === vista.id)));
  }, [pedirCampanias, vista.id]);

  function abrir() {
    setAbierto(true);
    void pedirLista();
  }

  const cerrar = useCallback((devolverFoco: boolean) => {
    // Lo que todavía no contestó ya no importa: la próxima vez se vuelve a pedir.
    pedido.current++;
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }, []);

  // El foco va a donde se puede actuar: la lista, o «Reintentar» si falló. Mientras carga queda en el botón.
  useEffect(() => {
    if (!abierto) return;
    if (carga.tipo === "lista" && hayOpciones) lista.current?.focus();
    else if (carga.tipo === "error") reintentar.current?.focus();
    else if (!envoltorio.current?.contains(document.activeElement)) boton.current?.focus();
  }, [abierto, carga.tipo, hayOpciones]);

  // La opción activa se ve aunque la lista sea larga.
  useEffect(() => {
    if (!abierto || carga.tipo !== "lista") return;
    document.getElementById(`${idBase}-opcion-${indiceActivo}`)?.scrollIntoView?.({ block: "nearest" });
  }, [abierto, carga.tipo, indiceActivo, idBase]);

  // Un clic fuera cierra sin tocar el foco: la persona ya lo puso donde quiso.
  useEffect(() => {
    if (!abierto) return;
    function alTocar(evento: PointerEvent) {
      if (evento.target instanceof Node && !envoltorio.current?.contains(evento.target)) cerrar(false);
    }
    document.addEventListener("pointerdown", alTocar);
    return () => document.removeEventListener("pointerdown", alTocar);
  }, [abierto, cerrar]);

  // El aviso se va solo; uno nuevo reinicia el plazo (cada uno es un objeto distinto).
  useEffect(() => {
    if (!aviso) return;
    const plazo = setTimeout(() => setAviso(null), MS_AVISO_CAMPANIA);
    return () => clearTimeout(plazo);
  }, [aviso]);

  async function elegir(campania: CampaniaElegible) {
    // Un segundo toque o un segundo Enter mientras se espera no pisa al primero.
    if (eligiendoAhora.current) return;
    if (campania.id === vista.id) {
      cerrar(true);
      return;
    }
    eligiendoAhora.current = true;
    setEligiendo(true);
    let aplicada = false;
    const aplicar = () => {
      aplicada = true;
      guardarCampaniaElegida(campania.id);
      setVista({ id: campania.id, region: campania.ciudades.join(" · "), campania: campania.nombre });
      setAviso({ texto: textoCampaniaCambiada(campania.nombre) });
      cerrar(true);
      // La pestaña abierta se vuelve a pedir al servidor, que ahora lee la campaña elegida.
      router.refresh();
    };
    try {
      if (estaEsperando() || hayQueEsperar()) await esperarYSalir(aplicar);
      else aplicar();
    } finally {
      eligiendoAhora.current = false;
      setEligiendo(false);
    }
    // Si algún envío falló (la vista se queda con su aviso) o la persona ya se fue, nada cambió: se cierra la lista.
    if (!aplicada) cerrar(false);
  }

  function alTeclear(evento: EventoTeclado<HTMLDivElement>) {
    if (evento.key === "Escape" && abierto) {
      // Solo cierra la lista: ningún Esc de la pestaña (la vista 23 sale de la pantalla con Esc) debe enterarse.
      evento.preventDefault();
      evento.stopPropagation();
      cerrar(true);
      return;
    }
    if (!abierto) {
      if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
        evento.preventDefault();
        abrir();
      }
      return;
    }
    if (carga.tipo !== "lista" || opciones.length === 0) return;
    const ultimo = opciones.length - 1;
    switch (evento.key) {
      case "ArrowDown":
        evento.preventDefault();
        setIndiceActivo((i) => Math.min(ultimo, i + 1));
        break;
      case "ArrowUp":
        evento.preventDefault();
        setIndiceActivo((i) => Math.max(0, i - 1));
        break;
      case "Home":
        evento.preventDefault();
        setIndiceActivo(0);
        break;
      case "End":
        evento.preventDefault();
        setIndiceActivo(ultimo);
        break;
      case "Enter":
      case " ": {
        // Solo con el foco en la lista: en el botón, Enter y Espacio ya hacen su clic.
        if (evento.target !== lista.current) return;
        evento.preventDefault();
        const activa = opciones[indiceActivo];
        if (activa && !evento.repeat) void elegir(activa);
        break;
      }
    }
  }

  function alSalirElFoco(evento: EventoFoco<HTMLDivElement>) {
    // Sin destino (un clic en algo que no se enfoca, un elemento que se quitó) no se cierra: eso lo ve el toque de afuera.
    const destino = evento.relatedTarget;
    if (abierto && destino instanceof Node && !envoltorio.current?.contains(destino)) cerrar(false);
  }

  const textoBoton = textoDelBoton(vista.region, vista.campania);
  const opcion = (c: CampaniaElegible): ReactNode => {
    const indice = opciones.indexOf(c);
    const elegida = c.id === vista.id;
    return (
      <div
        key={c.id}
        id={idOpcion(indice)}
        role="option"
        aria-selected={elegida}
        title={c.nombre}
        // Que el clic no mueva el foco de la lista.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void elegir(c)}
        className={cn(
          "flex cursor-pointer items-start gap-2.5 rounded-control p-2.5",
          elegida ? "bg-marca-clara" : "hover:bg-fondo",
          indice === indiceActivo && "ring-2 ring-acento ring-inset",
        )}
      >
        <span aria-hidden className="w-4 flex-none pt-px text-nav font-bold text-marca">
          {elegida ? "✓" : ""}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[13.5px] font-semibold text-tinta wrap-anywhere">{c.nombre}</span>
          {c.ciudades.length > 0 ? <span className="text-chico text-tinta-2 wrap-anywhere">{c.ciudades.join(" · ")}</span> : null}
          <span className="font-mono text-mini text-tinta-suave">{textoDeFechas(c)}</span>
        </span>
      </div>
    );
  };
  const grupo = (clave: string, titulo: string, items: CampaniaElegible[]): ReactNode =>
    items.length === 0 ? null : (
      <div role="group" aria-labelledby={`${idBase}-grupo-${clave}`} className="flex flex-col gap-0.5">
        <span id={`${idBase}-grupo-${clave}`} className={cn(ETIQUETA_GRUPO, "px-2.5 pt-2 pb-1")}>
          {titulo}
        </span>
        {items.map(opcion)}
      </div>
    );

  return (
    <div ref={envoltorio} className="relative" onKeyDown={alTeclear} onBlur={alSalirElFoco}>
      <button
        ref={boton}
        type="button"
        onClick={() => (abierto ? cerrar(true) : abrir())}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        // El nombre entero va en el title: en el botón se corta con «…».
        title={textoBoton}
        className={cn(
          "flex max-w-[300px] cursor-pointer items-center gap-1 rounded-control border bg-superficie px-3 py-[7px] text-chico whitespace-nowrap focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none",
          abierto ? "border-marca-media text-tinta" : "border-borde text-tinta-suave",
        )}
      >
        <span className="truncate">{textoBoton}</span>
        <span aria-hidden className="flex-none">
          {abierto ? "▴" : "▾"}
        </span>
      </button>

      {abierto ? (
        <div
          aria-busy={eligiendo || undefined}
          className="absolute top-[calc(100%+6px)] right-0 z-30 flex max-h-[70vh] w-[380px] flex-col gap-0.5 overflow-y-auto rounded-tarjeta border border-grafico-neutro bg-superficie p-2 shadow-lg"
        >
          {carga.tipo === "cargando" ? (
            <div role="status" className="flex flex-col gap-2.5 p-2.5">
              <span className="text-cuerpo text-tinta-suave">{TEXTO_CARGANDO_CAMPANIAS}</span>
              <span aria-hidden className="h-10 rounded-control bg-superficie-suave" />
              <span aria-hidden className="h-10 rounded-control bg-superficie-suave" />
            </div>
          ) : null}

          {carga.tipo === "error" ? (
            <div role="alert" className="flex flex-col gap-2.5 p-3">
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="grid size-5 flex-none place-items-center rounded-pastilla bg-peligro text-chico font-bold text-superficie"
                >
                  !
                </span>
                <span className="text-[13px] leading-[1.45]">
                  {carga.causa === "sin-conexion" ? textoSinConexionCampanias(vista.id ? vista.campania : null) : TEXTO_ERROR_CAMPANIAS}
                </span>
              </div>
              <button
                ref={reintentar}
                type="button"
                onClick={() => void pedirLista()}
                className="min-h-6 min-w-6 cursor-pointer self-start rounded-control border border-grafico-neutro px-3.5 py-[7px] text-cuerpo font-semibold text-marca hover:bg-fondo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
              >
                {TEXTO_REINTENTAR}
              </button>
            </div>
          ) : null}

          {carga.tipo === "lista" && opciones.length === 0 ? (
            <div className="flex flex-col gap-1.5 p-3">
              <span className="text-[13.5px] font-semibold">{TEXTO_SIN_CAMPANIAS}</span>
              <span className="text-cuerpo leading-[1.45] text-tinta-suave">{TEXTO_SIN_CAMPANIAS_DETALLE}</span>
            </div>
          ) : null}

          {carga.tipo === "lista" && opciones.length > 0 ? (
            <div
              ref={lista}
              id={idLista}
              role="listbox"
              tabIndex={-1}
              aria-label="Campañas"
              aria-activedescendant={idOpcion(indiceActivo)}
              className="flex flex-col gap-0.5 focus-visible:outline-none"
            >
              {grupo("en-curso", "EN CURSO", enCurso)}
              {grupo("por-empezar", "POR EMPEZAR", porEmpezar)}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* El lector de pantalla lo anuncia desde una región que ya estaba en la página; el aviso visible no se lee dos veces. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {aviso?.texto ?? ""}
      </div>
      {aviso ? (
        <div
          aria-hidden
          className="fixed bottom-[22px] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-tarjeta bg-tinta px-4 py-[11px] text-nav text-superficie"
        >
          <span className="text-exito-fondo">✓</span>
          {aviso.texto}
        </div>
      ) : null}
    </div>
  );
}
