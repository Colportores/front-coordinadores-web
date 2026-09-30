"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CandidatoColportor, DatosAnadirColportor, ResultadoInscripcion } from "@/datos/equipo/contrato";
import {
  ayudaBloqueo,
  buscarCandidatos,
  fechaCorta,
  iniciales,
  motivoBloqueo,
  sugeridos,
} from "@/features/equipo/candidatos";
import { cn } from "@/lib/utils";

/** Cuánto dura el aviso con "Deshacer" tras añadir (diseño 23). */
export const MS_DESHACER = 8000;

export const MENSAJE_SIN_CONEXION = "No se pudo conectar. Probá de nuevo en unos segundos.";

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

/** Aviso con «Deshacer»: cada añadido tiene el suyo y su propio plazo de 8 s. */
function AvisoAnadido({
  id,
  nombre,
  campania,
  onDeshacer,
  onExpirar,
}: {
  id: string;
  nombre: string;
  campania: string;
  onDeshacer: (id: string) => void;
  /** Tiene que ser estable: si cambia en cada render, el plazo de 8 s se reinicia. */
  onExpirar: (id: string) => void;
}) {
  useEffect(() => {
    const temporizador = setTimeout(() => onExpirar(id), MS_DESHACER);
    return () => clearTimeout(temporizador);
  }, [id, onExpirar]);

  return (
    <div
      role="status"
      className="flex items-center gap-4 rounded-tarjeta bg-marca px-4 py-3 text-nav text-superficie shadow-lg"
    >
      <span>
        Añadiste a {nombre} a {campania}.
      </span>
      <button
        type="button"
        onClick={() => onDeshacer(id)}
        aria-label={`Deshacer: ${nombre}`}
        className="cursor-pointer rounded-control font-semibold underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-superficie focus-visible:outline-none"
      >
        Deshacer
      </button>
    </div>
  );
}

interface FilaProps {
  candidato: CandidatoColportor;
  elegido: boolean;
  activo: boolean;
  anadido: boolean;
  ocupado: boolean;
  onElegir: () => void;
  onAnadir: () => void;
}

function FilaCandidato({ candidato, elegido, activo, anadido, ocupado, onElegir, onAnadir }: FilaProps) {
  const bloqueo = motivoBloqueo(candidato);
  const deshabilitado = bloqueo !== null || anadido || ocupado;

  return (
    <li
      data-activo={activo || undefined}
      className={cn(
        "flex items-start gap-3 rounded-tarjeta border-b border-borde-suave px-3.5 py-3",
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
  ocupado: boolean;
  onAnadir: () => void;
}

function DetalleCuenta({ candidato, campania, anadido, ocupado, onAnadir }: DetalleProps) {
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
      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={bloqueo !== null || anadido || ocupado}
          onClick={onAnadir}
          className="min-h-9 text-nav font-semibold disabled:bg-borde disabled:text-tinta-suave disabled:opacity-100"
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
 * El botón "Deshacer" solo revierte lo que muestra la vista: no existe (todavía) un endpoint
 * del BFF para sacar a un colportor de la campaña.
 */
export function AnadirColportor({
  datos,
  inscribir,
}: {
  datos: DatosAnadirColportor;
  inscribir: (usuarioId: string) => Promise<ResultadoInscripcion>;
}) {
  const router = useRouter();
  const buscador = useRef<HTMLInputElement>(null);
  const [consulta, setConsulta] = useState("");
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  const [indiceActivo, setIndiceActivo] = useState(-1);
  const [anadidos, setAnadidos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<{ id: string; nombre: string }[]>([]);
  // Dos toques seguidos antes de que el estado se actualice: el ref corta el segundo.
  const inscribiendo = useRef(false);

  const hayConsulta = consulta.trim() !== "";
  const resultados = useMemo(
    () => (hayConsulta ? buscarCandidatos(datos.candidatos, consulta) : sugeridos(datos.candidatos)),
    [datos.candidatos, consulta, hayConsulta],
  );
  const elegido = resultados.find((c) => c.id === elegidoId) ?? null;

  const equipo = useMemo(
    () => [
      ...datos.equipoActual,
      ...datos.candidatos
        .filter((c) => anadidos.includes(c.id))
        .map((c) => ({ id: c.id, nombre: c.nombre, zonaNombre: null })),
    ],
    [datos.equipoActual, datos.candidatos, anadidos],
  );

  useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        router.push("/equipo");
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
  }, [router]);

  const anadir = useCallback(
    async (candidato: CandidatoColportor) => {
      if (inscribiendo.current || motivoBloqueo(candidato) !== null || anadidos.includes(candidato.id)) return;
      inscribiendo.current = true;
      setOcupado(true);
      setError(null);
      try {
        const resultado = await inscribir(candidato.id);
        if (!resultado.ok) {
          setError(resultado.mensaje);
          return;
        }
        setAnadidos((previos) => [...previos, candidato.id]);
        setAvisos((previos) => [...previos, { id: candidato.id, nombre: candidato.nombre }]);
      } catch {
        // Si la llamada se cae, nada queda «ocupado»: se puede volver a intentar.
        setError(MENSAJE_SIN_CONEXION);
      } finally {
        inscribiendo.current = false;
        setOcupado(false);
      }
    },
    [anadidos, inscribir],
  );

  const quitarAviso = useCallback((id: string) => setAvisos((previos) => previos.filter((a) => a.id !== id)), []);

  const deshacer = useCallback(
    (id: string) => {
      setAnadidos((previos) => previos.filter((x) => x !== id));
      quitarAviso(id);
    },
    [quitarAviso],
  );

  function cambiarConsulta(valor: string) {
    setConsulta(valor);
    setIndiceActivo(-1);
    setElegidoId(null);
  }

  function alTeclearEnBuscador(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (resultados.length === 0) return;
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setIndiceActivo((i) => Math.min(i + 1, resultados.length - 1));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setIndiceActivo((i) => Math.max(i - 1, 0));
    } else if (evento.key === "Enter" && indiceActivo >= 0) {
      evento.preventDefault();
      setElegidoId(resultados[indiceActivo].id);
    }
  }

  const titulo = hayConsulta
    ? `${resultados.length} ${resultados.length === 1 ? "RESULTADO" : "RESULTADOS"} PARA “${consulta.trim().toUpperCase()}”`
    : `PENDIENTES DE ASIGNACIÓN · ${resultados.length}`;

  return (
    <div className="flex flex-col gap-3.5">
      <nav aria-label="Ruta" className="flex items-center gap-2 text-cuerpo text-tinta-suave">
        <Link href="/equipo" className="font-semibold text-marca-media hover:text-marca">
          ‹ Equipo
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page">Añadir colportor</span>
      </nav>
      <h2 className="font-serif text-[21px] font-semibold whitespace-nowrap text-tinta">
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
                  className="cursor-pointer rounded-control px-1 text-chico text-tinta-suave hover:text-tinta"
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
              <h3 className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">{titulo}</h3>
            </div>
            {resultados.length === 0 ? (
              <p className="px-3.5 py-4 text-cuerpo text-tinta-suave">
                {hayConsulta
                  ? "No hay cuentas que coincidan con tu búsqueda."
                  : "No hay cuentas pendientes de asignación."}
              </p>
            ) : (
              <ul aria-label="Cuentas">
                {resultados.map((c, i) => (
                  <FilaCandidato
                    key={c.id}
                    candidato={c}
                    elegido={c.id === elegido?.id}
                    activo={i === indiceActivo}
                    anadido={anadidos.includes(c.id)}
                    ocupado={ocupado}
                    onElegir={() => setElegidoId(c.id)}
                    onAnadir={() => {
                      setElegidoId(c.id);
                      void anadir(c);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="rounded-tarjeta bg-peligro-fondo px-4 py-3 text-nav font-medium text-peligro">
              {error}
            </p>
          ) : null}
          {elegido ? (
            <DetalleCuenta
              candidato={elegido}
              campania={datos.campania}
              anadido={anadidos.includes(elegido.id)}
              ocupado={ocupado}
              onAnadir={() => void anadir(elegido)}
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
                  className="flex justify-between border-b border-borde-suave px-4 py-2 text-cuerpo text-tinta"
                >
                  <span>{m.nombre}</span>
                  <span className="text-tinta-suave">{m.zonaNombre ?? "Sin zona"}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {avisos.length > 0 ? (
        <div className="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-stretch gap-2">
          {avisos.map((a) => (
            <AvisoAnadido
              key={a.id}
              id={a.id}
              nombre={a.nombre}
              campania={datos.campania}
              onDeshacer={deshacer}
              onExpirar={quitarAviso}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
