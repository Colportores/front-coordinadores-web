"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type {
  CandidatoColportor,
  DatosAnadirColportor,
  ResultadoBusqueda,
  ResultadoInscripcion,
} from "@/datos/equipo/contrato";
import {
  ayudaBloqueo,
  fechaCorta,
  iniciales,
  MAX_CARACTERES_TITULO,
  motivoBloqueo,
  recortarConPuntos,
} from "@/features/equipo/candidatos";
import { tieneFocoVisible } from "@/features/equipo/foco-visible";
import { useBusquedaCandidatos } from "@/features/equipo/useBusquedaCandidatos";
import {
  mensajeAnadirRechazado,
  mensajeAnadirSinConexion,
  useInscripcionesDiferidas,
  type Anadido,
  type CausaFallo,
} from "@/features/equipo/useInscripcionesDiferidas";
import { cn } from "@/lib/utils";
import { esperarYSalir, estaEsperando } from "@/shell/trabajo-pendiente";

export { MS_DESHACER, mensajeAnadirRechazado, mensajeAnadirSinConexion } from "@/features/equipo/useInscripcionesDiferidas";

const ETIQUETA_ESTADO = {
  pendiente_asignacion: "◔ Pendiente de asignación",
  activa: "● Activa",
  suspendida: "⊘ Suspendida",
} as const;

const CLASE_ESTADO = {
  pendiente_asignacion: "bg-alerta-fondo text-alerta",
  activa: "bg-exito-fondo text-exito",
  suspendida: "bg-peligro-fondo text-peligro",
} as const;

function PastillaEstado({ estado }: { estado: CandidatoColportor["estadoCuenta"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-pastilla px-2 py-[3px] text-mini font-semibold whitespace-nowrap",
        CLASE_ESTADO[estado],
      )}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

function Avatar({ nombre, grande, apagado }: { nombre: string; grande?: boolean; apagado?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid flex-none place-items-center rounded-full font-semibold",
        grande ? "size-12 text-titulo" : "size-9 text-cuerpo",
        apagado ? "bg-superficie-suave text-tinta-suave" : "bg-marca-clara text-marca",
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}

function AvisoBloqueo({ texto }: { texto: string }) {
  return (
    <span role="note" className="mt-1 flex items-start gap-[7px] text-cuerpo font-medium text-peligro">
      <span
        aria-hidden
        className="grid size-4 flex-none place-items-center rounded-full bg-peligro text-etiqueta font-bold text-superficie"
      >
        !
      </span>
      {texto}
    </span>
  );
}

const idTextoAviso = (id: string) => `aviso-anadido-${id}`;

/**
 * Aviso con «Deshacer»: cada añadido tiene el suyo y su propio plazo de 8 s (lo cuenta `useInscripcionesDiferidas`).
 * Mientras el foco de teclado o de lector está en su «Deshacer», el plazo no corre (decisión de Cristian, 21/10).
 */
function AvisoAnadido({
  id,
  nombre,
  campania,
  onDeshacer,
  onPausa,
  onReanudar,
}: {
  id: string;
  nombre: string;
  campania: string;
  onDeshacer: (id: string) => void;
  onPausa: (id: string) => void;
  onReanudar: (id: string) => void;
}) {
  return (
    <div
      role="status"
      data-aviso-id={id}
      className="flex items-center gap-4 rounded-tarjeta bg-marca px-4 py-3 text-nav text-superficie shadow-lg"
    >
      <span id={idTextoAviso(id)}>
        Añadiste a {nombre} a {campania}.
      </span>
      <button
        type="button"
        onClick={() => onDeshacer(id)}
        onFocus={(e) => {
          if (tieneFocoVisible(e.currentTarget)) onPausa(id);
        }}
        onBlur={() => onReanudar(id)}
        // El foco llega acá solo al aparecer el aviso (decisión del 16/10): el lector lee el texto del aviso y después «Deshacer».
        aria-describedby={idTextoAviso(id)}
        // Con Enter sostenido en «Añadir», el foco ya pasó a este botón: las repeticiones de la tecla no lo aprietan.
        onKeyDown={(e) => {
          if (e.repeat) e.preventDefault();
        }}
        aria-label={`Deshacer: ${nombre}`}
        className="inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded-control px-1 font-semibold underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-superficie focus-visible:outline-none"
      >
        Deshacer
      </button>
    </div>
  );
}

/**
 * ¿El foco sigue en el «Añadir» de esa cuenta (o no está en ningún lado, como cuando el botón se apaga)?
 * Si el coordinador ya se fue a escribir o a otro botón mientras contestaba el servidor, no se le roba el foco.
 */
function focoSigueEnAnadir(id: string): boolean {
  const activo = document.activeElement;
  if (!(activo instanceof HTMLElement) || activo === document.body) return true;
  return activo.closest(`[data-anadir-id="${id}"]`) !== null;
}

interface FilaProps {
  candidato: CandidatoColportor;
  elegido: boolean;
  activo: boolean;
  anadido: boolean;
  onElegir: () => void;
  onAnadir: () => void;
}

function FilaCandidato({ candidato, elegido, activo, anadido, onElegir, onAnadir }: FilaProps) {
  const bloqueo = motivoBloqueo(candidato);
  const deshabilitado = bloqueo !== null || anadido;

  return (
    <li
      data-activo={activo || undefined}
      data-candidato-id={candidato.id}
      // Tras «Añadir» o «Deshacer» el botón se apaga o desaparece: el foco pasa a la fila en vez de caer al body.
      tabIndex={-1}
      className={cn(
        "flex items-start outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-inset gap-3 rounded-tarjeta border-b border-borde-suave px-3.5 py-3",
        elegido && "border-transparent bg-marca-clara/50 ring-2 ring-marca-media ring-inset",
        activo && !elegido && "bg-superficie-calida",
      )}
    >
      <button
        type="button"
        onClick={onElegir}
        aria-pressed={elegido}
        aria-label={`Elegir a ${candidato.nombre}`}
        className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-control text-left focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
      >
        <Avatar nombre={candidato.nombre} apagado={candidato.estadoCuenta === "suspendida"} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 text-[13.5px] font-semibold break-words text-tinta">{candidato.nombre}</span>
            <PastillaEstado estado={candidato.estadoCuenta} />
          </span>
          <span className="text-cuerpo break-all text-tinta-2">{candidato.email}</span>
          <span className="text-chico text-tinta-suave">
            Campaña actual: {candidato.campaniaActual ?? "sin campaña"}
          </span>
          {bloqueo ? <AvisoBloqueo texto={bloqueo} /> : null}
        </span>
      </button>
      <Button
        type="button"
        variant={elegido ? "default" : "outline"}
        disabled={deshabilitado}
        onClick={onAnadir}
        data-anadir-id={candidato.id}
        aria-label={`Añadir a ${candidato.nombre}`}
        className={cn(
          "min-h-9 text-nav font-semibold",
          !elegido && "text-tinta-2",
          bloqueo !== null && "border-borde bg-borde text-tinta-suave opacity-100",
        )}
      >
        {anadido ? "Añadido ✓" : "Añadir"}
      </Button>
    </li>
  );
}

function DatoDetalle({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-t border-borde-suave py-2.5 text-nav">
      <dt className="text-tinta-suave">{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

interface DetalleProps {
  candidato: CandidatoColportor;
  campania: string;
  anadido: boolean;
  onAnadir: () => void;
}

function DetalleCuenta({ candidato, campania, anadido, onAnadir }: DetalleProps) {
  const bloqueo = motivoBloqueo(candidato);
  const ayuda = ayudaBloqueo(candidato);

  return (
    <section
      aria-label={`Detalle de ${candidato.nombre}`}
      className="flex flex-col gap-3.5 rounded-tarjeta border border-borde bg-superficie px-[22px] py-5"
    >
      <div className="flex items-center gap-3.5">
        <Avatar nombre={candidato.nombre} grande apagado={candidato.estadoCuenta === "suspendida"} />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-serif text-[20px] font-semibold break-words text-tinta">{candidato.nombre}</h3>
          <span className="text-nav break-all text-tinta-2">{candidato.email}</span>
        </div>
      </div>
      <dl>
        <DatoDetalle etiqueta="Estado de la cuenta">
          <PastillaEstado estado={candidato.estadoCuenta} />
        </DatoDetalle>
        <DatoDetalle etiqueta="Campaña actual">{candidato.campaniaActual ?? "Sin campaña"}</DatoDetalle>
        <DatoDetalle etiqueta="Zona">Sin zona</DatoDetalle>
        <DatoDetalle etiqueta="Cuenta creada">{fechaCorta(candidato.cuentaCreada)}</DatoDetalle>
      </dl>
      {bloqueo ? <AvisoBloqueo texto={bloqueo} /> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          disabled={bloqueo !== null || anadido}
          onClick={onAnadir}
          data-anadir-id={candidato.id}
          // Con una campaña de nombre largo el texto corta línea en vez de desbordar la columna: en los espacios y, si el nombre
          // no los tiene, en medio de la palabra. `break-words` no alcanza acá: el botón es `inline-flex` y su texto es un ítem
          // flex que no baja de la palabra más larga; `wrap-anywhere` (`overflow-wrap: anywhere`) sí achica ese mínimo.
          className="h-auto min-h-9 max-w-full py-1.5 text-left text-nav font-semibold wrap-anywhere whitespace-normal disabled:bg-borde disabled:text-tinta-suave disabled:opacity-100"
        >
          {anadido ? "Añadido ✓" : `Añadir a ${campania}`}
        </Button>
        <span className="text-chico text-tinta-suave">
          {ayuda ?? (bloqueo === null ? "Le llega un aviso por email y en la app." : null)}
        </span>
      </div>
    </section>
  );
}

/**
 * Vista 23 (HU-CAM-004): añadir colportor a la campaña. Página en dos columnas:
 * buscador y resultados a la izquierda, detalle de la cuenta y equipo actual a la derecha.
 *
 * Atajos: "/" enfoca el buscador, ↑ ↓ recorren los resultados, Enter elige, Esc vuelve a Equipo.
 *
 * La búsqueda es del servidor, de a 10 por página (la siguiente se pide al llegar al final de la lista), y «Añadir»
 * demora la inscripción 8 s para dejar «Deshacer» (decisiones de Cristian, 30/09): ver los dos hooks.
 */
export function AnadirColportor({
  datos,
  inscribir,
  buscar,
}: {
  datos: DatosAnadirColportor;
  inscribir: (usuarioId: string) => Promise<ResultadoInscripcion>;
  buscar: (texto: string, despuesDe: string | null) => Promise<ResultadoBusqueda>;
}) {
  const router = useRouter();
  const buscador = useRef<HTMLInputElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const centinela = useRef<HTMLDivElement>(null);
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  const [indiceActivo, setIndiceActivo] = useState(-1);
  /** Inscripciones que no prosperaron, una por cuenta: no se pisan entre sí ni se borran al escribir. */
  const [fallos, setFallos] = useState<{ id: string; mensaje: string }[]>([]);

  /**
   * Cuentas que la base rechazó por estar en otra campaña (`CI007`) y la campaña que dijo: la fila pasa a mostrarse
   * bloqueada con el literal de la HU, en vez de seguir «sin campaña» con «Añadir» habilitado para repetir el rechazo.
   * En los resultados de una búsqueda vale hasta que el servidor contesta otra (`recibidas`): ese dato es más nuevo, y si
   * trae la cuenta libre (alguien la liberó) la fila vuelve a poder añadirse; si la trae todavía en otra campaña, se muestra
   * esa. En los sugeridos vale siempre: son los de la carga de la página y no se refrescan, así que volver a ellos tras
   * buscar y borrar el texto no tiene un dato más nuevo que lo contradiga.
   */
  const [enOtraCampania, setEnOtraCampania] = useState<ReadonlyMap<string, { campania: string; recibidas: number }>>(
    () => new Map(),
  );
  const recibidasAhora = useRef(0);

  const {
    consulta,
    setConsulta,
    hayConsulta,
    texto,
    buscando,
    resultados: encontrados,
    recibidas,
    hayMas,
    cargandoMas,
    falla,
    fallaMas,
    cargarMas,
    reintentar,
    reintentarMas,
  } = useBusquedaCandidatos(buscar, datos.sugeridos);

  useEffect(() => {
    recibidasAhora.current = recibidas;
  });

  /** Lleva el foco a la fila de la cuenta (o, si ya no está en los resultados, al buscador). */
  const enfocarFila = useCallback((id: string) => {
    const fila = raiz.current?.querySelector<HTMLElement>(`[data-candidato-id="${id}"]`);
    (fila ?? buscador.current)?.focus();
  }, []);

  /**
   * Foco y «Deshacer» (decisión del 16/10, WCAG 2.1.1): al aparecer el aviso el foco pasa a su «Deshacer», así un solo Enter
   * desde «Añadir» lo deshace sin recorrer la página dentro de los 8 s. Al cerrarse el aviso (por los 8 s o por «Deshacer»)
   * o con Esc, el foco vuelve a donde estaba, que es la fila de la cuenta (su «Añadir» queda apagado) y, si la cuenta ya no
   * está en los resultados, el buscador (lo resuelve `enfocarFila`).
   */
  const avisoPorEnfocar = useRef<string | null>(null);

  /** La cuenta cuyo detalle se ve ahora: si falla justo esa, el aviso no necesita nombrarla. */
  const elegidaVisible = useRef<string | null>(null);

  // Una cuenta tiene a lo sumo un envío, y volver a añadirla borra su aviso: no hay dos avisos de la misma.
  const registrarFallo = useCallback((cuenta: Anadido, causa: CausaFallo) => {
    const mensaje =
      causa.tipo === "sin-conexion"
        ? mensajeAnadirSinConexion(cuenta.nombre)
        : elegidaVisible.current === cuenta.id
          ? causa.mensaje
          : mensajeAnadirRechazado(cuenta.nombre, causa.mensaje);
    setFallos((previos) => [...previos, { id: cuenta.id, mensaje }]);
    if (causa.tipo === "rechazo" && causa.campaniaEnConflicto) {
      const { nombre } = causa.campaniaEnConflicto;
      const marca = { campania: nombre, recibidas: recibidasAhora.current };
      setEnOtraCampania((previas) => new Map(previas).set(cuenta.id, marca));
    }
  }, []);

  // Si el plazo vence con el foco en «Deshacer», ese botón desaparece: el foco vuelve a la fila.
  const alVencerPlazo = useCallback(
    (id: string) => {
      const activo = document.activeElement;
      const teniaFoco = activo instanceof HTMLElement && activo.closest(`[data-aviso-id="${id}"]`) !== null;
      if (teniaFoco) enfocarFila(id);
    },
    [enfocarFila],
  );

  const { anadidos, avisos, enviando, programar, deshacer, pausar, reanudar, confirmarTodas } = useInscripcionesDiferidas({
    inscribir,
    alFallar: registrarFallo,
    alVencerPlazo,
  });

  const resultados = useMemo(
    () =>
      enOtraCampania.size === 0
        ? encontrados
        : encontrados.map((c) => {
            const marca = enOtraCampania.get(c.id);
            const vigente = marca !== undefined && (!hayConsulta || marca.recibidas === recibidas);
            return vigente ? { ...c, campaniaActual: marca.campania, enOtraCampania: true } : c;
          }),
    [encontrados, enOtraCampania, recibidas, hayConsulta],
  );
  const elegido = resultados.find((c) => c.id === elegidoId) ?? null;
  useEffect(() => {
    elegidaVisible.current = elegido?.id ?? null;
  });
  const hayTrabajoPendiente = avisos.length > 0 || enviando;

  // El aviso nuevo ya está en pantalla: el foco pasa a su «Deshacer» (el más nuevo si hay varios).
  useEffect(() => {
    const id = avisoPorEnfocar.current;
    if (id === null) return;
    avisoPorEnfocar.current = null;
    raiz.current?.querySelector<HTMLElement>(`[data-aviso-id="${id}"] button`)?.focus();
  }, [avisos]);

  const equipo = useMemo(
    () => [
      ...datos.equipoActual,
      ...anadidos
        .filter((a) => !datos.equipoActual.some((m) => m.id === a.id))
        .map((a) => ({ id: a.id, nombre: a.nombre, zonaNombre: null })),
    ],
    [datos.equipoActual, anadidos],
  );

  /**
   * Vuelve a Equipo. Con inscripciones dentro del plazo o en camino las manda y espera a que contesten: si alguna
   * falla, se queda para que el aviso no se pierda al cambiar de pantalla (con un tope, por si el servidor no contesta).
   * Es el mismo camino que el menú de secciones y que atrás/adelante del navegador: una sola espera a la vez (si ya hay
   * otra, esta se ignora y gana el primer destino) y el menú muestra su estado.
   */
  const salir = useCallback(async () => {
    if (!hayTrabajoPendiente && !estaEsperando()) {
      router.push("/equipo");
      return;
    }
    await esperarYSalir(() => router.push("/equipo"));
  }, [router, hayTrabajoPendiente]);

  useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        // Con el foco en un aviso, Esc solo lo devuelve a donde estaba: el aviso sigue con su plazo y nada más cambia.
        const aviso = evento.target instanceof Element ? evento.target.closest<HTMLElement>("[data-aviso-id]") : null;
        if (aviso?.dataset.avisoId) {
          enfocarFila(aviso.dataset.avisoId);
          return;
        }
        // Provisorio (no hay diseño ni patrón para salir con trabajo a medias): Esc va de a un paso y no pierde nada sin aviso.
        if (consulta !== "") {
          setConsulta("");
          setIndiceActivo(-1);
          setElegidoId(null);
        } else if (avisos.length > 0) {
          // Cerrar los avisos es dar por hecho lo añadido: sin «Deshacer» no hay nada que esperar, se manda ya.
          void confirmarTodas();
        } else {
          void salir();
        }
        return;
      }
      const escribiendo = evento.target instanceof HTMLElement && evento.target.matches("input, textarea, select");
      const conModificador = evento.ctrlKey || evento.metaKey || evento.altKey;
      if (evento.key === "/" && !escribiendo && !conModificador) {
        evento.preventDefault();
        buscador.current?.focus();
      }
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [consulta, setConsulta, avisos.length, confirmarTodas, salir, enfocarFila]);

  // La página siguiente se pide cuando el final de la lista entra en pantalla. Sin `IntersectionObserver` quedan
  // el «↓» del teclado y el aviso de abajo.
  useEffect(() => {
    const nodo = centinela.current;
    if (!nodo || !hayMas || fallaMas !== null || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) void cargarMas();
    });
    observador.observe(nodo);
    return () => observador.disconnect();
    // `cargandoMas` y la cantidad vuelven a armar el observador: si el final sigue a la vista tras cargar, pide la que sigue.
  }, [hayMas, fallaMas, cargandoMas, resultados.length, cargarMas]);

  function anadir(candidato: CandidatoColportor) {
    if (motivoBloqueo(candidato) !== null) return;
    setFallos((previos) => previos.filter((f) => f.id !== candidato.id));
    const nueva = programar({ id: candidato.id, nombre: candidato.nombre });
    // El botón se apaga al añadir y aparece el aviso con «Deshacer»: el foco va ahí en vez de caer al body (salvo que ya
    // esté escribiendo en otro lado). Un doble toque no suma un segundo aviso ni mueve nada.
    if (nueva && focoSigueEnAnadir(candidato.id)) avisoPorEnfocar.current = candidato.id;
  }

  function alDeshacer(id: string) {
    if (deshacer(id)) enfocarFila(id);
  }

  function elegir(id: string | null) {
    setElegidoId(id);
  }

  function cambiarConsulta(valor: string) {
    setConsulta(valor);
    setIndiceActivo(-1);
    elegir(null);
  }

  function alTeclearEnBuscador(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (resultados.length === 0) return;
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      if (indiceActivo >= resultados.length - 1 && hayMas) void cargarMas();
      setIndiceActivo((i) => Math.min(i + 1, resultados.length - 1));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setIndiceActivo((i) => Math.max(i - 1, 0));
    } else if (evento.key === "Enter" && indiceActivo >= 0) {
      evento.preventDefault();
      elegir(resultados[indiceActivo].id);
    }
  }

  function alVolverAEquipo(evento: React.MouseEvent<HTMLAnchorElement>) {
    // Un clic con modificador abre otra pestaña y esta se queda como está.
    if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    if (!hayTrabajoPendiente && !estaEsperando()) return;
    evento.preventDefault();
    void salir();
  }

  // El título repite lo buscado en mayúsculas: un texto pegado muy largo (una lista de emails) se acorta, y lo que sigue sin
  // espacios se parte, para que no empuje el título por debajo de la columna del detalle. El texto entero queda en el buscador.
  const busqueda = recortarConPuntos(texto, MAX_CARACTERES_TITULO).toUpperCase();
  const titulo = !hayConsulta
    ? `PENDIENTES DE ASIGNACIÓN · ${resultados.length}`
    : buscando
      ? `BUSCANDO “${busqueda}”…`
      : falla !== null
        ? `RESULTADOS PARA “${busqueda}”`
        : `${resultados.length}${hayMas ? "+" : ""} ${resultados.length === 1 && !hayMas ? "RESULTADO" : "RESULTADOS"} PARA “${busqueda}”`;

  return (
    <div ref={raiz} className="flex flex-col gap-3.5">
      <nav aria-label="Ruta" className="flex items-center gap-2 text-cuerpo text-tinta-suave">
        <Link
          href="/equipo"
          onClick={alVolverAEquipo}
          className="inline-flex min-h-6 items-center font-semibold text-marca-media hover:text-marca"
        >
          ‹ Equipo
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page">Añadir colportor</span>
      </nav>
      <h2 className="font-serif text-[21px] font-semibold break-words text-tinta">
        Añadir colportor a {datos.campania}
      </h2>

      <div className="grid grid-cols-[minmax(0,1fr)_520px] items-start gap-5">
        <div className="flex flex-col rounded-tarjeta border border-borde bg-superficie">
          <div className="flex flex-col gap-2 px-4 pt-4 pb-1.5">
            <div className="flex min-h-10 items-center gap-2.5 rounded-control border border-grafico-neutro bg-superficie px-3 focus-within:ring-2 focus-within:ring-acento">
              <span aria-hidden className="text-tinta-suave">
                ⌕
              </span>
              <input
                ref={buscador}
                type="text"
                value={consulta}
                onChange={(e) => cambiarConsulta(e.target.value)}
                onKeyDown={alTeclearEnBuscador}
                placeholder="Buscar por email o nombre"
                aria-label="Buscar por email o nombre"
                aria-describedby="ayuda-busqueda"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-tinta outline-none placeholder:text-tinta-tenue"
              />
              {hayConsulta ? (
                <button
                  type="button"
                  aria-label="Borrar búsqueda"
                  onClick={() => {
                    cambiarConsulta("");
                    buscador.current?.focus();
                  }}
                  className="inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded-control px-1 text-chico text-tinta-suave hover:text-tinta"
                >
                  ✕
                </button>
              ) : (
                <kbd aria-hidden className="rounded-sm border border-borde px-1.5 font-mono text-mini text-tinta-suave">
                  /
                </kbd>
              )}
            </div>
            <span id="ayuda-busqueda" className="text-chico text-tinta-suave">
              Solo aparecen cuentas pendientes de asignación o activas sin campaña.
            </span>
          </div>

          <div className="px-1 pb-2">
            <div className="px-3.5 pt-3.5 pb-1.5">
              <h3 className="text-etiqueta font-semibold tracking-etiqueta wrap-anywhere text-tinta-suave">{titulo}</h3>
            </div>
            {buscando ? (
              <p role="status" className="px-3.5 py-4 text-cuerpo text-tinta-suave">
                Buscando cuentas…
              </p>
            ) : falla !== null ? (
              <div role="alert" className="flex flex-col items-start gap-2 px-3.5 py-4 text-cuerpo font-medium text-peligro">
                <p>{falla}</p>
                <Button type="button" variant="outline" onClick={reintentar} className="text-nav font-semibold">
                  Reintentar
                </Button>
              </div>
            ) : resultados.length === 0 ? (
              <p className="px-3.5 py-4 text-cuerpo text-tinta-suave">
                {hayConsulta
                  ? "No hay cuentas que coincidan con tu búsqueda."
                  : "No hay cuentas pendientes de asignación."}
              </p>
            ) : (
              <>
                <ul aria-label="Cuentas">
                  {resultados.map((c, i) => (
                    <FilaCandidato
                      key={c.id}
                      candidato={c}
                      elegido={c.id === elegido?.id}
                      activo={i === indiceActivo}
                      anadido={anadidos.some((a) => a.id === c.id)}
                      onElegir={() => elegir(c.id)}
                      onAnadir={() => {
                        setElegidoId(c.id);
                        anadir(c);
                      }}
                    />
                  ))}
                </ul>
                {hayMas ? <div ref={centinela} aria-hidden data-final-de-lista className="h-px" /> : null}
                {cargandoMas ? (
                  <p role="status" className="px-3.5 py-3 text-cuerpo text-tinta-suave">
                    Cargando más cuentas…
                  </p>
                ) : null}
                {fallaMas !== null ? (
                  <div role="alert" className="flex flex-col items-start gap-2 px-3.5 py-3 text-cuerpo font-medium text-peligro">
                    <p>{fallaMas}</p>
                    <Button type="button" variant="outline" onClick={reintentarMas} className="text-nav font-semibold">
                      Reintentar
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {fallos.map((f) => (
            <p
              key={f.id}
              role="alert"
              className="rounded-tarjeta bg-peligro-fondo px-4 py-3 text-nav font-medium text-peligro"
            >
              {f.mensaje}
            </p>
          ))}
          {elegido ? (
            <DetalleCuenta
              candidato={elegido}
              campania={datos.campania}
              anadido={anadidos.some((a) => a.id === elegido.id)}
              onAnadir={() => anadir(elegido)}
            />
          ) : (
            <p className="rounded-tarjeta border border-dashed border-borde px-[22px] py-5 text-nav text-tinta-suave">
              Elegí una cuenta para ver el detalle y añadirla.
            </p>
          )}

          <section aria-label="Ya en tu equipo" className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
            <div className="flex items-baseline justify-between border-b border-borde px-4 py-3">
              <h3 className="font-serif text-[14.5px] font-semibold text-tinta">Ya en tu equipo</h3>
              <span className="font-mono text-mini text-tinta-suave">{equipo.length}</span>
            </div>
            <ul>
              {equipo.map((m) => (
                <li
                  key={m.id}
                  className="flex justify-between gap-3 border-b border-borde-suave px-4 py-2 text-cuerpo text-tinta"
                >
                  {/* Un nombre o una zona largos sin espacios se parten en vez de empujar al otro fuera de la tarjeta. */}
                  <span className="min-w-0 wrap-anywhere">{m.nombre}</span>
                  <span className="max-w-[45%] flex-none text-right wrap-anywhere text-tinta-suave">
                    {m.zonaNombre ?? "Sin zona"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {avisos.length > 0 ? (
        <div className="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-stretch gap-2">
          {avisos.map((a) => (
            <AvisoAnadido key={a.id} id={a.id} nombre={a.nombre} campania={datos.campania} onDeshacer={alDeshacer} onPausa={pausar} onReanudar={reanudar} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
