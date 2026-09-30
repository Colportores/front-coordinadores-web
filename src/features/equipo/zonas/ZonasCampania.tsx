"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import type {
  CiudadDeCampania,
  DatosZonas,
  Esquina,
  FormaZona,
  FuenteDatosZonas,
  Punto,
  ResultadoAsignacion,
  TipoForma,
  VistaPreviaZona,
  ZonaDeCiudad,
} from "@/datos/equipo/zonas";
import { MapaZonas } from "@/features/equipo/zonas/MapaZonas";
import { PanelDetalleZona } from "@/features/equipo/zonas/PanelDetalleZona";
import { formaCompleta, PanelFormularioZona, RADIO_INICIAL_M } from "@/features/equipo/zonas/PanelFormularioZona";
import { PanelListaZonas } from "@/features/equipo/zonas/PanelListaZonas";
import type { DibujoEnMapa } from "@/features/equipo/zonas/tipos";
import { cn } from "@/lib/utils";

/** Las operaciones que la vista le pide al BFF, ya atadas a la campaña por la página (server actions). */
export interface AccionesZonas {
  esquinaMasCercana: FuenteDatosZonas["esquinaMasCercana"];
  tramoPorCalles: FuenteDatosZonas["tramoPorCalles"];
  vistaPreviaZona: FuenteDatosZonas["vistaPreviaZona"];
  guardarZona: FuenteDatosZonas["guardarZona"];
  asignarZona: (usuarioId: string, zonaId: string) => Promise<ResultadoAsignacion>;
}

interface EstadoDibujo {
  zonaId?: string;
  nombre: string;
  forma: FormaZona;
  /** Un tramo por calles entre cada par de esquinas consecutivas ya marcadas. */
  tramos: Punto[][];
  nombreCentro: string | null;
  vistaPrevia: VistaPreviaZona | null;
  guardando: boolean;
  error: string | null;
}

type Panel =
  | { tipo: "lista"; asignandoA: string | null }
  | { tipo: "detalle"; zonaId: string; colportorId: string | null; ocupado: boolean; error: string | null }
  | ({ tipo: "dibujo" } & EstadoDibujo);

const MENSAJE_SIN_CONEXION = "No se pudo conectar. Probá de nuevo en unos segundos.";
const MS_ESPERA_HOVER = 120;
const MS_ESPERA_VISTA_PREVIA = 150;

const mismaEsquina = (a: Esquina, b: Esquina) => a.lon === b.lon && a.lat === b.lat;
const nombreEsquina = (e: Esquina) => `${e.calleA} y ${e.calleB}`;

function textoCantidadZonas(cantidad: number): string {
  if (cantidad === 0) return "sin zonas";
  return cantidad === 1 ? "1 zona" : `${cantidad} zonas`;
}

function formaVacia(tipoForma: TipoForma): FormaZona {
  return tipoForma === "RADIAL" ? { tipoForma } : { tipoForma, esquinas: [], cerrada: false };
}

function dibujoNuevo(): Panel {
  return {
    tipo: "dibujo",
    nombre: "",
    forma: formaVacia("RADIAL"),
    tramos: [],
    nombreCentro: null,
    vistaPrevia: null,
    guardando: false,
    error: null,
  };
}

function dibujoDeZona(zona: ZonaDeCiudad): Panel {
  const forma: FormaZona =
    zona.tipoForma === "RADIAL"
      ? { tipoForma: "RADIAL", centro: zona.centro, radioM: zona.radioM }
      : { tipoForma: "ESQUINAS", esquinas: zona.esquinas ?? [], cerrada: true };
  return {
    tipo: "dibujo",
    zonaId: zona.id,
    nombre: zona.nombre,
    forma,
    tramos: [],
    nombreCentro: null,
    vistaPrevia: null,
    guardando: false,
    error: null,
  };
}

function aplanar(tramos: Punto[][]): Punto[] {
  return tramos.flat();
}

interface Props {
  datos: DatosZonas;
  acciones: AccionesZonas;
}

/**
 * Vista 24 (HU-CAM-006): zonas de la campaña. Lista y formularios a la izquierda,
 * mapa a la derecha. La geometría la calcula el backend; acá solo se pide y se dibuja.
 */
export function ZonasCampania({ datos, acciones }: Props) {
  const [ciudades, setCiudades] = useState<CiudadDeCampania[]>(datos.ciudades);
  const [ciudadId, setCiudadId] = useState(datos.ciudades[0]?.id ?? "");
  const [panel, setPanel] = useState<Panel>({ tipo: "lista", asignandoA: null });
  const [aviso, setAviso] = useState<string | null>(null);
  const [hover, setHover] = useState<Esquina | null>(null);
  const versionHover = useRef(0);
  const temporizadorHover = useRef<ReturnType<typeof setTimeout>>(undefined);
  const versionVistaPrevia = useRef(0);
  // Cada vez que se empieza o se abandona un dibujo cambia la sesión: lo que vuelva del BFF de una sesión vieja se descarta.
  const sesion = useRef(0);
  // La forma vigente, al día dentro de un mismo turno: los clics encolados la leen de acá y no de un render viejo.
  const formaVigente = useRef<FormaZona | null>(null);
  // Los clics del mapa se atienden de a uno: dos seguidos no pisan la esquina ni el tramo del otro.
  const cola = useRef<Promise<void>>(Promise.resolve());
  const guardandoAhora = useRef(false);
  const asignandoAhora = useRef(false);

  const ciudad = ciudades.find((c) => c.id === ciudadId) ?? ciudades[0];
  const forma = panel.tipo === "dibujo" ? panel.forma : null;
  const zonaEnEdicionId = panel.tipo === "dibujo" ? panel.zonaId : undefined;

  const cambiarDibujo = useCallback((cambio: (d: EstadoDibujo) => Partial<EstadoDibujo>) => {
    setPanel((p) => (p.tipo === "dibujo" ? { ...p, ...cambio(p) } : p));
  }, []);

  // La vista previa (ubicaciones incluidas, superposición) se pide al backend cada vez que la forma queda completa.
  useEffect(() => {
    if (!forma || !ciudad || !formaCompleta(forma)) return;
    const version = ++versionVistaPrevia.current;
    const temporizador = setTimeout(() => {
      acciones
        .vistaPreviaZona({ ciudadId: ciudad.id, zonaId: zonaEnEdicionId, forma })
        .then((vistaPrevia) => {
          if (version === versionVistaPrevia.current) cambiarDibujo(() => ({ vistaPrevia, error: null }));
        })
        .catch(() => {
          if (version === versionVistaPrevia.current) cambiarDibujo(() => ({ error: MENSAJE_SIN_CONEXION }));
        });
    }, MS_ESPERA_VISTA_PREVIA);
    return () => clearTimeout(temporizador);
  }, [forma, ciudad, zonaEnEdicionId, acciones, cambiarDibujo]);

  useEffect(() => () => clearTimeout(temporizadorHover.current), []);

  const actualizarForma = useCallback(
    (nueva: FormaZona, resto: Partial<EstadoDibujo> = {}) => {
      formaVigente.current = nueva;
      versionVistaPrevia.current++;
      cambiarDibujo(() => ({ forma: nueva, vistaPrevia: null, ...resto }));
    },
    [cambiarDibujo],
  );

  const nombrarCentro = useCallback(
    async (punto: Punto) => {
      if (!ciudad) return;
      try {
        const esquina = await acciones.esquinaMasCercana(ciudad.id, punto);
        cambiarDibujo((d) =>
          d.forma.centro?.lon === punto.lon && d.forma.centro?.lat === punto.lat
            ? { nombreCentro: nombreEsquina(esquina) }
            : {},
        );
      } catch {
        // El nombre es solo una ayuda: sin él, el formulario dice «Punto elegido en el mapa».
      }
    },
    [ciudad, acciones, cambiarDibujo],
  );

  const dibujo: DibujoEnMapa | null = useMemo(() => {
    if (panel.tipo !== "dibujo") return null;
    const { forma: f, tramos, vistaPrevia } = panel;
    return {
      poligono: vistaPrevia?.poligonoGeojson ?? null,
      linea: f.cerrada && vistaPrevia ? [] : aplanar(tramos),
      esquinas: f.esquinas ?? [],
      centro: f.centro ?? null,
      radioM: f.radioM ?? null,
      rotuloCentro:
        f.tipoForma === "RADIAL" && f.centro && f.radioM
          ? { nombre: panel.nombre.trim() || "Nueva zona", detalle: `${f.radioM} m` }
          : null,
      conflicto: vistaPrevia?.superposicion?.tramo ?? null,
      etiqueta:
        hover && f.tipoForma === "ESQUINAS" && !f.cerrada
          ? {
              punto: hover,
              texto: `${nombreEsquina(hover)} · clic para agregar`,
            }
          : null,
      comparte: vistaPrevia?.comparteCalle
        ? {
            punto: vistaPrevia.comparteCalle.punto,
            texto: `Comparte la calle ${vistaPrevia.comparteCalle.calle} con ${vistaPrevia.comparteCalle.zonaNombre}`,
          }
        : null,
    };
  }, [panel, hover]);

  if (!ciudad) return null;

  const zonas = ciudad.zonas;
  const zonaDetalle = panel.tipo === "detalle" ? zonas.find((z) => z.id === panel.zonaId) : undefined;
  const zonaElegidaId = zonaDetalle?.id ?? zonaEnEdicionId ?? null;

  function abandonarDibujo() {
    sesion.current++;
    versionVistaPrevia.current++;
    versionHover.current++;
    clearTimeout(temporizadorHover.current);
    formaVigente.current = null;
    setHover(null);
  }

  function empezarDibujo(nuevo: Panel) {
    abandonarDibujo();
    if (nuevo.tipo === "dibujo") formaVigente.current = nuevo.forma;
    setPanel(nuevo);
    setAviso(null);
  }

  function elegirCiudad(id: string) {
    if (id === ciudadId) return;
    abandonarDibujo();
    setCiudadId(id);
    setPanel({ tipo: "lista", asignandoA: null });
    setAviso(null);
  }

  function elegirZona(zonaId: string) {
    if (panel.tipo === "dibujo") return;
    const colportorId = panel.tipo === "lista" ? panel.asignandoA : null;
    setPanel({ tipo: "detalle", zonaId, colportorId, ocupado: false, error: null });
    setAviso(null);
  }

  function empezarEdicion(zona: ZonaDeCiudad) {
    empezarDibujo(dibujoDeZona(zona));
    if (zona.tipoForma === "RADIAL" && zona.centro) void nombrarCentro(zona.centro);
  }

  function cerrarDibujo() {
    abandonarDibujo();
    setPanel({ tipo: "lista", asignandoA: null });
  }

  function cambiarTipoForma(tipo: TipoForma) {
    if (forma?.tipoForma === tipo) return;
    setHover(null);
    actualizarForma(formaVacia(tipo), { tramos: [], nombreCentro: null });
  }

  /** Atiende un clic en el mapa mientras se dibuja. Corre dentro de la cola, de a un clic por vez. */
  async function procesarClic(punto: Punto, deSesion: number) {
    const inicial = formaVigente.current;
    if (!inicial || !ciudad || deSesion !== sesion.current) return;
    if (inicial.tipoForma === "RADIAL") {
      actualizarForma({ tipoForma: "RADIAL", centro: punto, radioM: inicial.radioM ?? RADIO_INICIAL_M }, { nombreCentro: null });
      await nombrarCentro(punto);
      return;
    }
    if (inicial.cerrada) return;
    const esquinas = inicial.esquinas ?? [];
    try {
      const esquina = await acciones.esquinaMasCercana(ciudad.id, punto);
      const ultima = esquinas.at(-1);
      if (ultima && mismaEsquina(ultima, esquina)) return;
      const cierra = esquinas.length >= 3 && mismaEsquina(esquinas[0], esquina);
      if (!cierra && esquinas.some((e) => mismaEsquina(e, esquina))) return;
      // Cerrar tocando la esquina 1: el último tramo vuelve a la primera.
      const tramo = cierra
        ? await acciones.tramoPorCalles(ciudad.id, esquinas[esquinas.length - 1], esquinas[0])
        : ultima
          ? await acciones.tramoPorCalles(ciudad.id, ultima, esquina)
          : null;
      // Mientras esperaba, el coordinador pudo cancelar, cambiar de ciudad o de forma: entonces este clic ya no vale.
      if (deSesion !== sesion.current || formaVigente.current !== inicial) return;
      if (tramo) cambiarDibujo((d) => ({ tramos: [...d.tramos, tramo] }));
      actualizarForma(cierra ? { ...inicial, cerrada: true } : { ...inicial, esquinas: [...esquinas, esquina] }, { error: null });
      if (cierra) setHover(null);
    } catch {
      if (deSesion === sesion.current) cambiarDibujo(() => ({ error: MENSAJE_SIN_CONEXION }));
    }
  }

  function encolar(tarea: () => Promise<void>) {
    cola.current = cola.current.then(tarea).catch(() => undefined);
  }

  function alHacerClicEnMapa(punto: Punto) {
    if (panel.tipo !== "dibujo") return;
    const deSesion = sesion.current;
    encolar(() => procesarClic(punto, deSesion));
  }

  function alMoverEnMapa(punto: Punto) {
    if (panel.tipo !== "dibujo" || forma?.tipoForma !== "ESQUINAS" || forma.cerrada || !ciudad) return;
    clearTimeout(temporizadorHover.current);
    const version = ++versionHover.current;
    temporizadorHover.current = setTimeout(() => {
      acciones
        .esquinaMasCercana(ciudad.id, punto)
        .then((esquina) => {
          if (version === versionHover.current) setHover(esquina);
        })
        .catch(() => undefined);
    }, MS_ESPERA_HOVER);
  }

  function quitarEsquina() {
    if (panel.tipo !== "dibujo" || !ciudad) return;
    const deSesion = sesion.current;
    encolar(async () => {
      const inicial = formaVigente.current;
      if (!inicial || deSesion !== sesion.current) return;
      const esquinas = (inicial.esquinas ?? []).slice(0, -1);
      const nueva: FormaZona = { tipoForma: "ESQUINAS", esquinas, cerrada: false };
      actualizarForma(nueva, { tramos: [], error: null });
      try {
        const tramos = await Promise.all(
          esquinas.slice(1).map((e, i) => acciones.tramoPorCalles(ciudad.id, esquinas[i], e)),
        );
        if (deSesion === sesion.current && formaVigente.current === nueva) cambiarDibujo(() => ({ tramos }));
      } catch {
        if (deSesion === sesion.current) cambiarDibujo(() => ({ error: MENSAJE_SIN_CONEXION }));
      }
    });
  }

  async function guardarZona() {
    if (panel.tipo !== "dibujo" || !ciudad || guardandoAhora.current) return;
    guardandoAhora.current = true;
    const deSesion = sesion.current;
    cambiarDibujo(() => ({ guardando: true, error: null }));
    try {
      const resultado = await acciones.guardarZona({
        ciudadId: ciudad.id,
        zonaId: panel.zonaId,
        nombre: panel.nombre,
        forma: panel.forma,
      });
      if (deSesion !== sesion.current) return;
      if (!resultado.ok) {
        cambiarDibujo(() => ({ guardando: false, error: resultado.mensaje }));
        return;
      }
      const guardada = resultado.zona;
      setCiudades((todas) =>
        todas.map((c) => {
          if (c.id !== ciudad.id) return c;
          const existe = c.zonas.some((z) => z.id === guardada.id);
          return {
            ...c,
            zonas: existe ? c.zonas.map((z) => (z.id === guardada.id ? guardada : z)) : [...c.zonas, guardada],
            colportores: c.colportores.map((p) => (p.zonaId === guardada.id ? { ...p, zonaNombre: guardada.nombre } : p)),
          };
        }),
      );
      abandonarDibujo();
      setPanel({ tipo: "detalle", zonaId: guardada.id, colportorId: null, ocupado: false, error: null });
      setAviso(`Zona «${guardada.nombre}» guardada.`);
    } catch {
      if (deSesion === sesion.current) cambiarDibujo(() => ({ guardando: false, error: MENSAJE_SIN_CONEXION }));
    } finally {
      guardandoAhora.current = false;
    }
  }

  async function asignar(colportorId: string) {
    if (panel.tipo !== "detalle" || !zonaDetalle || !ciudad || asignandoAhora.current) return;
    asignandoAhora.current = true;
    const zona = zonaDetalle;
    setPanel({ ...panel, ocupado: true, error: null });
    try {
      const resultado = await acciones.asignarZona(colportorId, zona.id);
      if (!resultado.ok) {
        setPanel((p) => (p.tipo === "detalle" ? { ...p, ocupado: false, error: resultado.mensaje } : p));
        return;
      }
      const persona = ciudad.colportores.find((c) => c.id === colportorId);
      setCiudades((todas) =>
        todas.map((c) =>
          c.id !== ciudad.id
            ? c
            : {
                ...c,
                colportores: c.colportores.map((p) =>
                  p.id === colportorId ? { ...p, zonaId: zona.id, zonaNombre: zona.nombre } : p,
                ),
                zonas: c.zonas.map((z) => {
                  const sinEl = z.colportores.filter((p) => p.id !== colportorId);
                  return z.id === zona.id && persona
                    ? { ...z, colportores: [...sinEl, { id: persona.id, nombre: persona.nombre }] }
                    : { ...z, colportores: sinEl };
                }),
              },
        ),
      );
      setPanel((p) =>
        p.tipo === "detalle" && p.zonaId === zona.id ? { ...p, colportorId: null, ocupado: false, error: null } : p,
      );
      setAviso(`${persona?.nombre ?? "El colportor"} quedó en ${zona.nombre}.`);
    } catch {
      setPanel((p) => (p.tipo === "detalle" ? { ...p, ocupado: false, error: MENSAJE_SIN_CONEXION } : p));
    } finally {
      asignandoAhora.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="font-serif text-[21px] font-semibold text-tinta">Zonas · {datos.campania}</h2>

      <div className="flex items-center gap-2">
        <nav aria-label="Ciudades de la campaña" className="flex flex-wrap gap-2">
          {ciudades.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-current={c.id === ciudad.id ? "true" : undefined}
              onClick={() => elegirCiudad(c.id)}
              className={cn(
                "flex cursor-pointer flex-col items-start rounded-control border px-3.5 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none",
                c.id === ciudad.id
                  ? "border-marca bg-marca-clara text-marca"
                  : "border-borde bg-superficie text-tinta-2 hover:bg-fondo",
              )}
            >
              <span className="text-nav font-semibold">{c.nombre}</span>
              <span className="text-mini text-tinta-suave">{textoCantidadZonas(c.zonas.length)}</span>
            </button>
          ))}
        </nav>
        {/* El formulario para agregar una ciudad del catálogo todavía no está diseñado: queda sin comportamiento. */}
        <AccionNoDisponible variant="outline" size="sm" className="text-nav font-semibold text-tinta-2">
          + Agregar ciudad
        </AccionNoDisponible>
      </div>

      {aviso ? (
        <p role="status" className="rounded-control bg-exito-fondo px-3 py-2 text-cuerpo font-medium text-exito">
          {aviso}
        </p>
      ) : null}

      <div className="grid grid-cols-[360px_minmax(0,1fr)] items-start gap-4">
        <div className="max-h-[calc(100vh-var(--spacing-topbar)-230px)] min-h-[520px] overflow-auto">
          {panel.tipo === "dibujo" ? (
            <PanelFormularioZona
              editando={panel.zonaId !== undefined}
              nombre={panel.nombre}
              forma={panel.forma}
              nombreCentro={panel.nombreCentro}
              vistaPrevia={panel.vistaPrevia}
              guardando={panel.guardando}
              error={panel.error}
              onNombre={(nombre) => cambiarDibujo(() => ({ nombre }))}
              onTipoForma={cambiarTipoForma}
              onRadio={(radioM) => actualizarForma({ ...panel.forma, radioM })}
              onQuitarEsquina={quitarEsquina}
              onGuardar={() => void guardarZona()}
              onCancelar={cerrarDibujo}
            />
          ) : panel.tipo === "detalle" && zonaDetalle ? (
            <PanelDetalleZona
              key={zonaDetalle.id + (panel.colportorId ?? "")}
              ciudad={ciudad}
              zona={zonaDetalle}
              colportorInicialId={panel.colportorId}
              ocupado={panel.ocupado}
              error={panel.error}
              onCerrar={() => setPanel({ tipo: "lista", asignandoA: null })}
              onEditarForma={() => empezarEdicion(zonaDetalle)}
              onAsignar={(id) => void asignar(id)}
            />
          ) : (
            <PanelListaZonas
              ciudad={ciudad}
              zonas={zonas}
              zonaElegidaId={zonaElegidaId}
              asignandoA={panel.tipo === "lista" ? panel.asignandoA : null}
              onNuevaZona={() => empezarDibujo(dibujoNuevo())}
              onElegirZona={elegirZona}
              onAsignar={(colportorId) => setPanel({ tipo: "lista", asignandoA: colportorId })}
              onCancelarAsignacion={() => setPanel({ tipo: "lista", asignandoA: null })}
            />
          )}
        </div>

        <div className="relative h-[calc(100vh-var(--spacing-topbar)-230px)] min-h-[520px] overflow-hidden rounded-tarjeta border border-borde">
          <MapaZonas
            ciudad={ciudad}
            zonas={zonas}
            zonaElegidaId={zonaElegidaId}
            dibujo={dibujo}
            onZonaClick={elegirZona}
            onMapaClick={alHacerClicEnMapa}
            onMapaMove={alMoverEnMapa}
            onRadio={(radioM) => forma && actualizarForma({ ...forma, radioM })}
          />
        </div>
      </div>
    </div>
  );
}
