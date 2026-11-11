"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type {
  CasaDeCiudad,
  CiudadDeCampania,
  CiudadDelCatalogo,
  DatosZonas,
  EstadoDeCasa,
  Esquina,
  FormaZona,
  FuenteDatosZonas,
  Punto,
  RechazoDelMapa,
  ResultadoAgregarCiudad,
  ResultadoAsignacion,
  ResultadoEliminarZona,
  TipoForma,
  VistaPreviaZona,
  ZonaDeCiudad,
} from "@/datos/equipo/zonas";
import { distanciaM, poligonoCircular } from "@/datos/equipo/zonas/geometria";
import { colorParaZonaNueva } from "@/datos/equipo/zonas/paleta";
import { recortarIdaYVuelta } from "@/features/equipo/zonas/borde";
import { BuscadorCiudad } from "@/features/equipo/zonas/BuscadorCiudad";
import { AvisoDeCasas, type AvisoDelMapa } from "@/features/equipo/zonas/casas/AvisoDeCasas";
import { horaEnMontevideo, sinOcultas } from "@/features/equipo/zonas/casas/estados";
import { LeyendaDeCasas } from "@/features/equipo/zonas/casas/LeyendaDeCasas";
import { useCasasDeCiudad } from "@/features/equipo/zonas/casas/useCasasDeCiudad";
import { ESPERAS } from "@/features/equipo/zonas/esperas";
import { MapaZonas } from "@/features/equipo/zonas/MapaZonas";
import { PanelDetalleZona } from "@/features/equipo/zonas/PanelDetalleZona";
import {
  formaCompleta,
  PanelFormularioZona,
  RADIO_INICIAL_M,
  TEXTO_CALCULANDO,
  textoColportoresSinZona,
} from "@/features/equipo/zonas/PanelFormularioZona";
import { PanelListaZonas } from "@/features/equipo/zonas/PanelListaZonas";
import { type DibujoEnMapa, nombreEsquina, TEXTO_CUENTA_SUSPENDIDA } from "@/features/equipo/zonas/tipos";
import { mensajeSinConexion } from "@/lib/mensajes";
import { cn } from "@/lib/utils";

/**
 * Una campaña sin ciudades (#167): antes la vista quedaba en blanco. El texto sigue al de Inicio y Precios para el mismo caso
 * («Esta campaña todavía no tiene ciudades. Agregalas…») y dice con qué botón.
 */
export const TEXTO_SIN_CIUDADES = "Esta campaña todavía no tiene ciudades. Agregalas con «+ Agregar ciudad» para dibujar sus zonas.";

/**
 * Lo que dice el formulario cuando la fuente todavía no puede dibujar zonas por esquinas (#167: antes culpaba a la conexión).
 * Sigue el molde de los otros avisos de algo que todavía no se puede («… todavía no se puede …: <qué hacer>»).
 */
export const TEXTO_ESQUINAS_SIN_CONECTAR =
  "Las zonas por esquinas todavía no se pueden dibujar ni cambiar desde el panel: elegí «Radial» para dibujar la zona.";

const QUE_HACER_CON_ESAS_ESQUINAS = "con su «×» en el mapa y marcá otra";

/**
 * Lo que dice el formulario cuando, en una esquina, el borde vuelve entero por donde llegó (#179): no hay adónde correrla.
 * Desde #182 la esquina ya está marcada cuando se calcula el borde, así que el aviso dice cuál es (`esquina`, su número)
 * y cuál es la que le sigue: sacando cualquiera de las dos el borde deja de volver.
 */
export function textoBordeVuelve(esquina: number, siguiente: number): string {
  return `En la esquina ${esquina} el borde vuelve por la misma calle por la que llegó. Quitá la esquina ${esquina} o la ${siguiente} ${QUE_HACER_CON_ESAS_ESQUINAS}.`;
}

/**
 * Lo que dice el formulario cuando no hay camino por las calles entre dos esquinas seguidas (#182): el aviso de la base
 * (que las nombra por sus calles) y, después, cuáles son por su número y qué hacer con ellas.
 */
export function textoSinCamino(rechazo: string, desde: number, hasta: number): string {
  return `${rechazo} Son las esquinas ${desde} y ${hasta}: quitá una de las dos ${QUE_HACER_CON_ESAS_ESQUINAS}.`;
}

/** A cuántos metros como mucho tiene que estar el cruce más cercano a un punto para que sea el cruce de ese punto (el metro de ADR-018). */
const METROS_MISMA_ESQUINA = 1;

const LISTA = new Intl.ListFormat("es", { type: "conjunction" });

/**
 * El aviso de que el panel corrió esquinas para que el borde no vaya y vuelva por la misma cuadra (#179).
 * `corridas` son sus posiciones en `esquinas`; `null` si no se corrió ninguna.
 */
export function textoDeEsquinasCorridas(corridas: number[], esquinas: Esquina[]): string | null {
  const motivo = "para que el borde no pase dos veces por la misma cuadra";
  if (corridas.length === 0) return null;
  if (corridas.length > 1) return `Movimos las esquinas ${LISTA.format(corridas.map((i) => String(i + 1)))} ${motivo}.`;
  const [posicion] = corridas;
  const esquina = esquinas[posicion];
  const adonde = esquina && (esquina.calleA !== "" || esquina.calleB !== "") ? ` a «${nombreEsquina(esquina)}»` : "";
  return `Movimos la esquina ${posicion + 1}${adonde} ${motivo}.`;
}

/** Las operaciones que la vista le pide a la fuente de datos, ya atadas a la campaña por la página (server actions). */
export interface AccionesZonas {
  esquinaMasCercana: FuenteDatosZonas["esquinaMasCercana"];
  tramoPorCalles: FuenteDatosZonas["tramoPorCalles"];
  vistaPreviaZona: FuenteDatosZonas["vistaPreviaZona"];
  guardarZona: FuenteDatosZonas["guardarZona"];
  asignarZona: (usuarioId: string, zonaId: string) => Promise<ResultadoAsignacion>;
  quitarZona: (usuarioId: string) => Promise<ResultadoAsignacion>;
  eliminarZona: (zonaId: string) => Promise<ResultadoEliminarZona>;
  buscarCiudades: (texto: string) => Promise<CiudadDelCatalogo[]>;
  agregarCiudad: (catalogoId: string) => Promise<ResultadoAgregarCiudad>;
  /** Las casas de esas zonas con su estado, para los puntos del mapa (`casas_de_zona()`). */
  casasDeZonas: (zonaIds: string[]) => Promise<CasaDeCiudad[]>;
}

interface EstadoDibujo {
  zonaId?: string;
  nombre: string;
  forma: FormaZona;
  /** Un tramo por calles entre cada par de esquinas consecutivas ya marcadas. */
  tramos: Punto[][];
  nombreCentro: string | null;
  vistaPrevia: VistaPreviaZona | null;
  /** Guardando o eliminando: nada más se puede tocar hasta que conteste la fuente de datos. */
  guardando: boolean;
  /** Se tocó «Eliminar zona» y falta la confirmación. */
  confirmandoBaja: boolean;
  error: string | null;
  /** Un aviso que no es un error: el panel corrió una esquina para que el borde no vuelva sobre sus pasos (#179). */
  nota: string | null;
  /** El texto de `error` cuando la que falló fue la vista previa por la red: ese aviso trae «Reintentar». */
  fallaVistaPrevia: string | null;
  /**
   * La forma por esquinas cuyo borde ya se calculó, bien o mal (#182). Mientras no sea la forma vigente, falta calcular:
   * se ve «Calculando la zona…». No es un interruptor que haya que apagar, así que no puede quedar trabado.
   */
  bordeDe: FormaZona | null;
  /** Al editar, la forma tal como está guardada: mientras no se toque, solo se pide su vista previa. */
  original: FormaZona | null;
}

type Panel =
  | { tipo: "lista"; asignandoA: string | null }
  | { tipo: "detalle"; zonaId: string; colportorId: string | null; ocupado: boolean; error: string | null }
  | ({ tipo: "dibujo" } & EstadoDibujo);

const MS_ESPERA_HOVER = 120;
const MS_ESPERA_VISTA_PREVIA = 150;
/** Cuánto se espera, después de soltar el centro o de moverlo con una flecha, para preguntar qué esquina le queda más cerca. */
const MS_ESPERA_NOMBRE_CENTRO = 250;

const mismaEsquina = (a: Esquina, b: Esquina) => a.lon === b.lon && a.lat === b.lat;

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
    confirmandoBaja: false,
    error: null,
    nota: null,
    fallaVistaPrevia: null,
    bordeDe: null,
    original: null,
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
    confirmandoBaja: false,
    error: null,
    nota: null,
    fallaVistaPrevia: null,
    bordeDe: null,
    original: forma,
  };
}

function aplanar(tramos: Punto[][]): Punto[] {
  return tramos.flat();
}

/** Una forma por esquinas con dos o más tiene un borde que calcular: los tramos por las calles y, cerrada, la vista previa. */
function necesitaBorde(forma: FormaZona): boolean {
  return forma.tipoForma === "ESQUINAS" && (forma.esquinas?.length ?? 0) >= 2;
}

const claveDeTramo = (desde: Punto, hasta: Punto) => `${desde.lon},${desde.lat}>${hasta.lon},${hasta.lat}`;

/** Los pares de esquinas que une el borde: cada una con la siguiente y, con la forma cerrada, la última con la primera. */
function paresDelBorde(esquinas: Esquina[], cerrada: boolean): [Esquina, Esquina][] {
  const pares = esquinas.slice(1).map((e, i): [Esquina, Esquina] => [esquinas[i], e]);
  if (cerrada && esquinas.length >= 3) pares.push([esquinas[esquinas.length - 1], esquinas[0]]);
  return pares;
}

/**
 * El borde de una forma con lo que ya se sabe: el tramo por las calles de cada par de esquinas que ya se pidió y, del que
 * todavía no, la línea recta entre las dos. Es lo que se dibuja mientras el cálculo espera o corre (#182).
 */
function tramosDe(forma: FormaZona, conocidos: ReadonlyMap<string, Punto[]>): Punto[][] {
  return paresDelBorde(forma.esquinas ?? [], forma.cerrada === true).map(
    ([desde, hasta]) =>
      conocidos.get(claveDeTramo(desde, hasta)) ?? [
        { lon: desde.lon, lat: desde.lat },
        { lon: hasta.lon, lat: hasta.lat },
      ],
  );
}

/**
 * Si el camino que llega a una esquina y el que sale de ella van y vuelven por la misma cuadra (la base rechaza ese
 * borde: «se cruza a sí mismo»), los dos caminos recortados y el cruce donde se separan, que pasa a ser la esquina.
 * `null`: no hay nada que correr. O no comparten cuadra, o donde se separan no hay un cruce de calles (el más cercano es
 * otro): ahí la base engancharía la esquina en otro lugar, así que queda como se marcó y, si el borde no sirve, lo dice
 * ella al cerrar. `"vuelve"`: el borde desanda un tramo entero, no hay adónde correr la esquina. Un rechazo de la base
 * va tal cual; una caída de la red es una excepción. `sinCruce` recuerda los puntos donde ya se vio que no hay cruce,
 * para no volver a preguntarlo en cada cálculo.
 */
async function correrEsquina(
  esquinaMasCercana: AccionesZonas["esquinaMasCercana"],
  sinCruce: Set<string>,
  ciudadId: string,
  llega: Punto[],
  sale: Punto[],
): Promise<{ llega: Punto[]; sale: Punto[]; esquina: Esquina } | RechazoDelMapa | "vuelve" | null> {
  const corte = recortarIdaYVuelta(llega, sale);
  if (!corte) return null;
  if (corte.llega.length < 2 || corte.sale.length < 2) return "vuelve";
  const donde = `${corte.esquina.lon},${corte.esquina.lat}`;
  if (sinCruce.has(donde)) return null;
  const cruce = await esquinaMasCercana(ciudadId, corte.esquina);
  if ("rechazo" in cruce) return cruce;
  if (distanciaM(cruce, corte.esquina) > METROS_MISMA_ESQUINA) {
    sinCruce.add(donde);
    return null;
  }
  return { llega: corte.llega, sale: corte.sale, esquina: cruce };
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
  const [buscador, setBuscador] = useState<{ ocupado: boolean; error: string | null } | null>(null);
  // Los puntos de las casas (diseño 24P): los estados que se destildaron en la leyenda, la casa con la tarjeta abierta, si el mapa
  // las agrupó, y un contador que vuelve a pedirlas cuando una zona se guardó o se eliminó (cambia qué casas incluye cada una).
  const [ocultos, setOcultos] = useState<ReadonlySet<EstadoDeCasa>>(() => new Set());
  const [casaElegidaId, setCasaElegidaId] = useState<string | null>(null);
  const [agrupadas, setAgrupadas] = useState(false);
  const [recargaCasas, setRecargaCasas] = useState(0);
  const agregandoAhora = useRef(false);
  const versionHover = useRef(0);
  const temporizadorHover = useRef<ReturnType<typeof setTimeout>>(undefined);
  // La base rechazó la esquina del puntero (la ciudad no tiene calles cargadas): no se vuelve a preguntar en cada movimiento.
  const hoverRechazado = useRef(false);
  const temporizadorNombre = useRef<ReturnType<typeof setTimeout>>(undefined);
  const versionVistaPrevia = useRef(0);
  // Cada vez que se empieza o se abandona un dibujo cambia la sesión: lo que vuelva de la fuente de datos de una sesión vieja se descarta.
  const sesion = useRef(0);
  // La forma vigente, al día dentro de un mismo turno: los clics encolados la leen de acá y no de un render viejo.
  const formaVigente = useRef<FormaZona | null>(null);
  // Los tramos por las calles que ya contestó la base en este dibujo, por sus dos esquinas (#182): al marcar o quitar una
  // esquina solo se piden los que faltan. Y los puntos donde ya se vio que no hay cruce adonde correr una esquina.
  const tramosConocidos = useRef(new Map<string, Punto[]>());
  const sinCruce = useRef(new Set<string>());
  // Los cálculos del borde van de a uno (#182): el que sigue espera al que está en vuelo, que al ver que la forma ya es
  // otra corta sin tocar nada.
  const calculos = useRef<Promise<void>>(Promise.resolve());
  // La forma cuyo borde ya quedó calculado: no se vuelve a calcular la misma.
  const bordeCalculado = useRef<FormaZona | null>(null);
  // Cambia cada vez que se cambia de tipo de forma: una esquina que venía en camino para el trazado anterior no entra al nuevo.
  const trazado = useRef(0);
  // Los clics del mapa se atienden de a uno: dos seguidos no pisan la esquina del otro.
  const cola = useRef<Promise<void>>(Promise.resolve());
  const guardandoAhora = useRef(false);
  const asignandoAhora = useRef(false);
  // Al cerrar el formulario o el detalle el foco vuelve a la fila de la zona (o a «+ Nueva zona»), no al body.
  const raiz = useRef<HTMLDivElement>(null);
  const volverFoco = useRef<string | null>(null);
  // Al abrir el formulario o el detalle, o tras asignar o quitar, el foco va a un lugar útil del panel nuevo (no queda en el <body>).
  const focoPendiente = useRef<string | null>(null);
  // Cada «Reintentar» de la vista previa suma uno: vuelve a correr el efecto que la pide.
  const [reintentosVistaPrevia, setReintentosVistaPrevia] = useState(0);

  const ciudad = ciudades.find((c) => c.id === ciudadId) ?? ciudades[0];
  const esquinasDisponibles = datos.esquinasDisponibles !== false;
  const catalogoEnCampania = useMemo(() => new Set(ciudades.map((c) => c.catalogoId)), [ciudades]);
  const guardando = panel.tipo === "dibujo" && panel.guardando;
  const agregando = buscador?.ocupado === true;
  const forma = panel.tipo === "dibujo" ? panel.forma : null;
  const zonaEnEdicionId = panel.tipo === "dibujo" ? panel.zonaId : undefined;
  const bordeDe = panel.tipo === "dibujo" ? panel.bordeDe : null;
  const formaOriginal = panel.tipo === "dibujo" ? panel.original : null;
  // Falta calcular el borde de la forma por esquinas que se ve (#182): sale de comparar, no de un interruptor.
  const calculando =
    panel.tipo === "dibujo" &&
    !panel.guardando &&
    esquinasDisponibles &&
    necesitaBorde(panel.forma) &&
    panel.forma !== panel.bordeDe;

  const casasDeLaCiudad = useCasasDeCiudad({
    ciudadId: ciudad?.id ?? "",
    zonaIds: ciudad?.zonas.map((z) => z.id) ?? [],
    pedir: acciones.casasDeZonas,
    recarga: recargaCasas,
  });
  const casasQueSeVen = useMemo(() => sinOcultas(casasDeLaCiudad.casas, ocultos), [casasDeLaCiudad.casas, ocultos]);

  const cambiarDibujo = useCallback((cambio: (d: EstadoDibujo) => Partial<EstadoDibujo>) => {
    setPanel((p) => (p.tipo === "dibujo" ? { ...p, ...cambio(p) } : p));
  }, []);

  /**
   * El cálculo de una zona por esquinas (#182), en segundo plano: los tramos por las calles que faltan (de a uno, y entre
   * uno y otro mira si la forma sigue siendo la misma), las esquinas que hay que correr para que el borde no vaya y vuelva
   * por una cuadra y, con la forma cerrada, la vista previa. Si mientras tanto se marcó o se quitó una esquina, corta sin
   * tocar nada: esa forma nueva tiene su propio cálculo. Si falla, las esquinas quedan como están y el aviso dice qué hacer.
   */
  const calcularBorde = useCallback(
    async (inicial: FormaZona, ciudadId: string, zonaId: string | undefined, soloVistaPrevia: boolean) => {
      const vigente = () => formaVigente.current === inicial;
      if (!vigente() || bordeCalculado.current === inicial) return;
      const esquinas = [...(inicial.esquinas ?? [])];
      const cerrada = inicial.cerrada === true && esquinas.length >= 3;
      const terminar = (calculada: FormaZona, resto: Partial<EstadoDibujo>) => {
        bordeCalculado.current = calculada;
        formaVigente.current = calculada;
        cambiarDibujo(() => ({
          forma: calculada,
          bordeDe: calculada,
          tramos: soloVistaPrevia ? [] : tramosDe(calculada, tramosConocidos.current),
          vistaPrevia: null,
          fallaVistaPrevia: null,
          error: null,
          nota: null,
          ...resto,
        }));
      };
      try {
        const corridas: number[] = [];
        const conCorridas = (): FormaZona => (corridas.length > 0 ? { ...inicial, esquinas } : inicial);
        const notaDeCorridas = () => textoDeEsquinasCorridas([...corridas].sort((a, b) => a - b), esquinas);
        if (!soloVistaPrevia) {
          const tramos: Punto[][] = [];
          for (const [i, [desde, hasta]] of paresDelBorde(esquinas, cerrada).entries()) {
            const clave = claveDeTramo(desde, hasta);
            let tramo = tramosConocidos.current.get(clave);
            if (!tramo) {
              const respuesta = await acciones.tramoPorCalles(ciudadId, desde, hasta);
              // El tramo sirve aunque la forma ya sea otra: el cálculo que sigue no lo vuelve a pedir.
              if (!("rechazo" in respuesta)) tramosConocidos.current.set(clave, respuesta);
              if (!vigente()) return;
              // Sin camino por las calles entre esas dos (o sin calles): las esquinas quedan y el aviso dice cuáles son.
              if ("rechazo" in respuesta) {
                const error = respuesta.sinCamino
                  ? textoSinCamino(respuesta.rechazo, i + 1, ((i + 1) % esquinas.length) + 1)
                  : respuesta.rechazo;
                terminar(inicial, { error });
                return;
              }
              tramo = respuesta;
            }
            tramos.push(tramo);
          }
          // El borde no puede ir y volver por la misma cuadra (la base lo rechaza): la esquina donde pasa se corre al punto
          // donde los dos caminos se separan. Las del medio en orden y, con la forma cerrada, la última y la primera.
          const cantidad = esquinas.length;
          const juntas = esquinas.map((_, j) => j).slice(1, -1);
          if (cerrada) juntas.push(cantidad - 1, 0);
          for (const j of juntas) {
            const llega = (j - 1 + tramos.length) % tramos.length;
            const corrida = await correrEsquina(acciones.esquinaMasCercana, sinCruce.current, ciudadId, tramos[llega], tramos[j]);
            // Buscar el cruce es otra consulta: el coordinador pudo cancelar o cambiar la forma mientras tanto.
            if (!vigente()) return;
            if (corrida === null) continue;
            const siguiente = (j + 1) % cantidad;
            if (corrida === "vuelve") {
              terminar(conCorridas(), { error: textoBordeVuelve(j + 1, siguiente + 1), nota: notaDeCorridas() });
              return;
            }
            if ("rechazo" in corrida) {
              terminar(conCorridas(), { error: corrida.rechazo, nota: notaDeCorridas() });
              return;
            }
            tramos[llega] = corrida.llega;
            tramos[j] = corrida.sale;
            esquinas[j] = corrida.esquina;
            tramosConocidos.current.set(claveDeTramo(esquinas[(j - 1 + cantidad) % cantidad], corrida.esquina), corrida.llega);
            tramosConocidos.current.set(claveDeTramo(corrida.esquina, esquinas[siguiente]), corrida.sale);
            corridas.push(j);
          }
        }
        const calculada = conCorridas();
        if (!cerrada) {
          terminar(calculada, { nota: notaDeCorridas() });
          return;
        }
        // La vista previa (ubicaciones incluidas, superposición) va al final, con las esquinas ya corregidas.
        const previa = await acciones.vistaPreviaZona({ ciudadId, zonaId, forma: calculada });
        if (!vigente()) return;
        // La base la rechazó (el borde se cruza, la campaña terminó, no hay permiso): su texto dice qué hacer, y sin vista previa no se guarda.
        terminar(calculada, "rechazo" in previa ? { error: previa.rechazo, nota: notaDeCorridas() } : { vistaPrevia: previa, nota: notaDeCorridas() });
      } catch {
        if (!vigente()) return;
        // Una caída de la red no es un rechazo: se puede reintentar sin tocar las esquinas.
        const mensaje = mensajeSinConexion("calcular la zona");
        cambiarDibujo(() => ({ bordeDe: inicial, error: mensaje, fallaVistaPrevia: mensaje }));
      }
    },
    [acciones, cambiarDibujo],
  );

  // Una zona por esquinas se calcula en segundo plano (#182): recién cuando el coordinador deja de marcar y de quitar
  // esquinas por un rato, y de a un cálculo por vez. Al editar, la forma guardada solo pide su vista previa.
  // La de una zona radial (ubicaciones incluidas, superposición) se pide al backend cada vez que la forma queda completa.
  useEffect(() => {
    if (!forma || !ciudad) return;
    if (forma.tipoForma === "ESQUINAS") {
      // Sin las zonas por esquinas conectadas no hay nada que pedir: el formulario ya dice por qué (#167).
      if (!esquinasDisponibles || !necesitaBorde(forma) || forma === bordeDe) return;
      const soloVistaPrevia = forma === formaOriginal && formaCompleta(forma);
      const lanzar = () => {
        calculos.current = calculos.current
          .then(() => calcularBorde(forma, ciudad.id, zonaEnEdicionId, soloVistaPrevia))
          .catch(() => undefined);
      };
      const espera = soloVistaPrevia ? MS_ESPERA_VISTA_PREVIA : ESPERAS.bordeMs;
      if (espera <= 0) {
        lanzar();
        return;
      }
      const temporizador = setTimeout(lanzar, espera);
      return () => clearTimeout(temporizador);
    }
    if (!formaCompleta(forma)) return;
    const version = ++versionVistaPrevia.current;
    const temporizador = setTimeout(() => {
      acciones
        .vistaPreviaZona({ ciudadId: ciudad.id, zonaId: zonaEnEdicionId, forma })
        .then((resultado) => {
          if (version !== versionVistaPrevia.current) return;
          // La base la rechazó (la campaña terminó, la ciudad se quitó, no hay permiso): su texto dice qué hacer, y sin vista previa no se guarda.
          cambiarDibujo(() =>
            "rechazo" in resultado
              ? { vistaPrevia: null, error: resultado.rechazo, fallaVistaPrevia: null }
              : { vistaPrevia: resultado, error: null, fallaVistaPrevia: null },
          );
        })
        .catch(() => {
          if (version !== versionVistaPrevia.current) return;
          // Una caída de la red no es un rechazo: se puede reintentar sin tocar la forma.
          const mensaje = mensajeSinConexion("calcular las ubicaciones de la zona");
          cambiarDibujo(() => ({ error: mensaje, fallaVistaPrevia: mensaje }));
        });
    }, MS_ESPERA_VISTA_PREVIA);
    return () => clearTimeout(temporizador);
  }, [forma, ciudad, zonaEnEdicionId, acciones, cambiarDibujo, reintentosVistaPrevia, esquinasDisponibles, bordeDe, formaOriginal, calcularBorde]);

  useEffect(
    () => () => {
      clearTimeout(temporizadorHover.current);
      clearTimeout(temporizadorNombre.current);
    },
    [],
  );

  const tipoPanel = panel.tipo;
  useEffect(() => {
    const selector = volverFoco.current;
    volverFoco.current = null;
    if (tipoPanel !== "lista" || !selector) return;
    const destino = raiz.current?.querySelector<HTMLElement>(selector) ?? raiz.current?.querySelector<HTMLElement>('[data-foco="nueva-zona"]');
    destino?.focus();
  }, [tipoPanel]);

  // Corre después de cada render: el foco pendiente se pide justo antes del cambio de panel, así que cae en el panel nuevo.
  useEffect(() => {
    const selector = focoPendiente.current;
    focoPendiente.current = null;
    if (selector) raiz.current?.querySelector<HTMLElement>(selector)?.focus();
  });

  const actualizarForma = useCallback(
    (nueva: FormaZona, resto: Partial<EstadoDibujo> = {}) => {
      formaVigente.current = nueva;
      versionVistaPrevia.current++;
      cambiarDibujo(() => ({ forma: nueva, vistaPrevia: null, fallaVistaPrevia: null, ...resto }));
    },
    [cambiarDibujo],
  );

  const nombrarCentro = useCallback(
    async (punto: Punto) => {
      if (!ciudad) return;
      try {
        const esquina = await acciones.esquinaMasCercana(ciudad.id, punto);
        // Una ciudad sin calles cargadas no tiene esquina que nombrar: el centro igual sirve, la zona radial no las necesita.
        if ("rechazo" in esquina) return;
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
      // El círculo se dibuja acá mismo mientras el radio o el centro se mueven (#179): no espera a que conteste la base, que
      // después manda el suyo (el mismo círculo) con las ubicaciones que incluye.
      poligono:
        vistaPrevia?.poligonoGeojson ?? (f.tipoForma === "RADIAL" && f.centro && f.radioM ? poligonoCircular(f.centro, f.radioM) : null),
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

  // Una campaña sin ciudades no queda en blanco (#167): se ve el título, «+ Agregar ciudad» y el aviso de qué hacer.
  const zonas = ciudad?.zonas ?? [];
  const zonaDetalle = panel.tipo === "detalle" ? zonas.find((z) => z.id === panel.zonaId) : undefined;
  const zonaEnEdicion = zonaEnEdicionId ? zonas.find((z) => z.id === zonaEnEdicionId) : undefined;
  const zonaElegidaId = zonaDetalle?.id ?? zonaEnEdicionId ?? null;

  /** El aviso de arriba del mapa (24P·04 a 24P·08): el más urgente primero, uno solo. */
  const avisoDelMapa: AvisoDelMapa | null = !ciudad
    ? null
    : casasDeLaCiudad.fase === "error"
      ? { tipo: "error", onReintentar: casasDeLaCiudad.reintentar }
      : casasDeLaCiudad.sinConexion && casasDeLaCiudad.actualizadoA
        ? { tipo: "sin-conexion", hora: horaEnMontevideo(casasDeLaCiudad.actualizadoA) }
        : casasDeLaCiudad.fase === "cargando"
          ? { tipo: "cargando", ciudad: ciudad.nombre }
          : zonas.length > 0 && casasDeLaCiudad.casas.length === 0
            ? { tipo: "vacio", ciudad: ciudad.nombre }
            : agrupadas && casasQueSeVen.length > 0
              ? { tipo: "agrupadas" }
              : null;

  function alternarEstadoDeCasa(estado: EstadoDeCasa) {
    setOcultos((antes) => {
      const despues = new Set(antes);
      if (!despues.delete(estado)) despues.add(estado);
      return despues;
    });
  }

  /**
   * «Reintentar» del aviso de la vista previa (o del cálculo de la zona por esquinas) caído por la red: lo vuelve a pedir
   * con la misma forma y las mismas esquinas.
   */
  function reintentarVistaPrevia() {
    cambiarDibujo(() => ({ error: null, fallaVistaPrevia: null, bordeDe: null }));
    setReintentosVistaPrevia((n) => n + 1);
  }

  function abandonarDibujo() {
    sesion.current++;
    versionVistaPrevia.current++;
    versionHover.current++;
    clearTimeout(temporizadorHover.current);
    clearTimeout(temporizadorNombre.current);
    hoverRechazado.current = false;
    formaVigente.current = null;
    bordeCalculado.current = null;
    trazado.current++;
    tramosConocidos.current.clear();
    sinCruce.current.clear();
    setHover(null);
  }

  function empezarDibujo(nuevo: Panel) {
    abandonarDibujo();
    if (nuevo.tipo === "dibujo") formaVigente.current = nuevo.forma;
    focoPendiente.current = '[data-foco="nombre-zona"]';
    setPanel(nuevo);
    setBuscador((b) => (b?.ocupado ? b : null));
    setAviso(null);
  }

  function elegirCiudad(id: string) {
    if (id === ciudadId || guardandoAhora.current || agregandoAhora.current) return;
    abandonarDibujo();
    setCasaElegidaId(null);
    setCiudadId(id);
    setPanel({ tipo: "lista", asignandoA: null });
    setAviso(null);
  }

  function elegirZona(zonaId: string) {
    // Mientras se guarda algo del detalle o se agrega una ciudad, la vista no cambia de lugar: el resultado caería en otra parte.
    if (panel.tipo === "dibujo" || agregando) return;
    if (panel.tipo === "detalle" && panel.ocupado) return;
    const colportorId = panel.tipo === "lista" ? panel.asignandoA : null;
    focoPendiente.current = '[data-foco="titulo-zona"]';
    setPanel({ tipo: "detalle", zonaId, colportorId, ocupado: false, error: null });
    setAviso(null);
  }

  function empezarEdicion(zona: ZonaDeCiudad) {
    empezarDibujo(dibujoDeZona(zona));
    if (zona.tipoForma === "RADIAL" && zona.centro) void nombrarCentro(zona.centro);
    if (zona.tipoForma === "ESQUINAS" && !esquinasDisponibles) cambiarDibujo(() => ({ error: TEXTO_ESQUINAS_SIN_CONECTAR }));
  }

  function cerrarDibujo() {
    // Mientras guarda no se puede abandonar: la zona quedaría guardada en el backend y ausente de la lista.
    if (guardandoAhora.current) return;
    volverFoco.current = panel.tipo === "dibujo" && panel.zonaId ? `[data-zona-id="${panel.zonaId}"]` : '[data-foco="nueva-zona"]';
    abandonarDibujo();
    setPanel({ tipo: "lista", asignandoA: null });
  }

  function cambiarTipoForma(tipo: TipoForma) {
    if (forma?.tipoForma === tipo) return;
    setHover(null);
    clearTimeout(temporizadorNombre.current);
    // Sin las zonas por esquinas conectadas, el aviso dice la causa real apenas se las elige (#167), y se va al volver a «Radial».
    const sinEsquinas = tipo === "ESQUINAS" && !esquinasDisponibles;
    const quitarAviso = !sinEsquinas && panel.tipo === "dibujo" && panel.error === TEXTO_ESQUINAS_SIN_CONECTAR;
    trazado.current++;
    tramosConocidos.current.clear();
    sinCruce.current.clear();
    actualizarForma(formaVacia(tipo), {
      tramos: [],
      nota: null,
      nombreCentro: null,
      ...(sinEsquinas ? { error: TEXTO_ESQUINAS_SIN_CONECTAR } : quitarAviso ? { error: null } : {}),
    });
  }

  /** Atiende un clic en el mapa mientras se dibuja. Corre dentro de la cola, de a un clic por vez. */
  async function procesarClic(punto: Punto, deSesion: number) {
    const inicial = formaVigente.current;
    if (!inicial || !ciudad || deSesion !== sesion.current) return;
    if (inicial.tipoForma === "RADIAL") {
      clearTimeout(temporizadorNombre.current);
      actualizarForma({ tipoForma: "RADIAL", centro: punto, radioM: inicial.radioM ?? RADIO_INICIAL_M }, { nombreCentro: null });
      // Sin esperar el nombre: el clic siguiente (mover el centro a otro lugar) no queda en la cola detrás de esa consulta.
      void nombrarCentro(punto);
      return;
    }
    if (inicial.cerrada) return;
    if (!esquinasDisponibles) {
      cambiarDibujo(() => ({ error: TEXTO_ESQUINAS_SIN_CONECTAR }));
      return;
    }
    const deTrazado = trazado.current;
    try {
      const esquina = await acciones.esquinaMasCercana(ciudad.id, punto);
      // Mientras esperaba, el coordinador pudo cancelar, cambiar de ciudad o de tipo de forma: entonces este clic ya no vale.
      // El dibujo mismo sí pudo cambiar (quitó una esquina, el cálculo corrió otra): la esquina se suma a como está ahora.
      const actual = formaVigente.current;
      if (deSesion !== sesion.current || deTrazado !== trazado.current) return;
      if (!actual || actual.tipoForma !== "ESQUINAS" || actual.cerrada) return;
      // La base no la dio (la ciudad todavía no tiene calles cargadas, la campaña terminó): su aviso dice qué hacer.
      if ("rechazo" in esquina) {
        cambiarDibujo(() => ({ error: esquina.rechazo }));
        return;
      }
      const esquinas = actual.esquinas ?? [];
      const ultima = esquinas.at(-1);
      if (ultima && mismaEsquina(ultima, esquina)) return;
      // Cerrar tocando la esquina 1.
      const cierra = esquinas.length >= 3 && mismaEsquina(esquinas[0], esquina);
      if (!cierra && esquinas.some((e) => mismaEsquina(e, esquina))) return;
      // La esquina queda marcada ya (#182): el borde por las calles se calcula después, en segundo plano, cuando el
      // coordinador deja de marcar. Hasta entonces el tramo nuevo se dibuja recto.
      const nueva: FormaZona = cierra ? { ...actual, cerrada: true } : { ...actual, esquinas: [...esquinas, esquina] };
      actualizarForma(nueva, { tramos: tramosDe(nueva, tramosConocidos.current), error: null });
      if (cierra) setHover(null);
    } catch {
      if (deSesion === sesion.current) cambiarDibujo(() => ({ error: mensajeSinConexion("marcar la esquina") }));
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
    if (panel.tipo !== "dibujo" || forma?.tipoForma !== "ESQUINAS" || forma.cerrada || !ciudad || !esquinasDisponibles) return;
    if (hoverRechazado.current) return;
    clearTimeout(temporizadorHover.current);
    const version = ++versionHover.current;
    const deSesion = sesion.current;
    temporizadorHover.current = setTimeout(() => {
      acciones
        .esquinaMasCercana(ciudad.id, punto)
        .then((esquina) => {
          if ("rechazo" in esquina) {
            // La etiqueta del puntero es una ayuda: sin ella se puede seguir. El aviso lo da el clic, con el texto de la base.
            if (deSesion === sesion.current) hoverRechazado.current = true;
            return;
          }
          if (version === versionHover.current) setHover(esquina);
        })
        .catch(() => undefined);
    }, MS_ESPERA_HOVER);
  }

  /**
   * El centro de la zona radial movido a mano (#179): arrastrándolo en el mapa o con las flechas. El círculo lo sigue en
   * vivo; la esquina que le queda más cerca (el nombre del formulario) se pregunta recién cuando deja de moverse.
   */
  function moverCentro(punto: Punto, soltado: boolean) {
    const actual = formaVigente.current;
    if (panel.tipo !== "dibujo" || guardandoAhora.current || actual?.tipoForma !== "RADIAL" || !actual.centro) return;
    clearTimeout(temporizadorNombre.current);
    if (actual.centro.lon !== punto.lon || actual.centro.lat !== punto.lat) {
      actualizarForma({ ...actual, centro: punto }, { nombreCentro: null });
    }
    if (soltado) temporizadorNombre.current = setTimeout(() => void nombrarCentro(punto), MS_ESPERA_NOMBRE_CENTRO);
  }

  /**
   * Saca una esquina del dibujo. Sin `posicion` es el «Quitar» del formulario: saca la última y reabre la forma. Con
   * `posicion` es la «×» de esa esquina en el mapa (#182): saca esa, las demás se renumeran, y una forma cerrada sigue
   * cerrada mientras le queden tres esquinas. La esquina se va al momento; el borde con las que quedan se calcula
   * después, en segundo plano, y solo se piden los tramos que no se conocían.
   */
  function quitarEsquina(posicion?: number) {
    if (panel.tipo !== "dibujo" || !ciudad || guardandoAhora.current) return;
    if (!esquinasDisponibles) {
      cambiarDibujo(() => ({ error: TEXTO_ESQUINAS_SIN_CONECTAR }));
      return;
    }
    const actual = formaVigente.current;
    if (!actual || actual.tipoForma !== "ESQUINAS") return;
    // La esquina se busca por su lugar y no por su número: si en este mismo turno se quitó otra, los números ya corrieron.
    const elegida = posicion === undefined ? undefined : panel.forma.esquinas?.[posicion];
    if (posicion !== undefined && !elegida) return;
    const antes = actual.esquinas ?? [];
    const cual = elegida ? antes.findIndex((e) => mismaEsquina(e, elegida)) : antes.length - 1;
    if (cual < 0) return;
    const esquinas = antes.filter((_, i) => i !== cual);
    const cerrada = elegida !== undefined && actual.cerrada === true && esquinas.length >= 3;
    const nueva: FormaZona = { tipoForma: "ESQUINAS", esquinas, cerrada };
    actualizarForma(nueva, { tramos: tramosDe(nueva, tramosConocidos.current), error: null, nota: null });
  }

  async function guardarZona() {
    if (panel.tipo !== "dibujo" || !ciudad || guardandoAhora.current) return;
    if (panel.forma.tipoForma === "ESQUINAS" && !esquinasDisponibles) {
      cambiarDibujo(() => ({ error: TEXTO_ESQUINAS_SIN_CONECTAR }));
      return;
    }
    guardandoAhora.current = true;
    const deSesion = sesion.current;
    cambiarDibujo(() => ({ guardando: true, error: null, fallaVistaPrevia: null }));
    try {
      const resultado = await acciones.guardarZona({
        ciudadId: ciudad.id,
        zonaId: panel.zonaId,
        nombre: panel.nombre,
        forma: panel.forma,
        // Al editar va el color de la zona (guardar sin color se lo borraría), salvo que no tenga: entonces no se le inventa uno.
        // Al crear, el que le toca de la paleta.
        color: zonaEnEdicion ? (zonaEnEdicion.sinColor ? undefined : zonaEnEdicion.color) : colorParaZonaNueva(zonas.length),
      });
      if (deSesion !== sesion.current) return;
      if (!resultado.ok) {
        cambiarDibujo(() => ({ guardando: false, error: resultado.mensaje }));
        return;
      }
      const guardada = resultado.zona;
      setCiudades((todas) =>
        todas.map((c) => {
          // La zona de un colportor es una por campaña: el nuevo nombre se ve en la lista de colportores de todas las ciudades.
          const colportores = c.colportores.map((p) => (p.zonaId === guardada.id ? { ...p, zonaNombre: guardada.nombre } : p));
          if (c.id !== ciudad.id) return { ...c, colportores };
          const existe = c.zonas.some((z) => z.id === guardada.id);
          return {
            ...c,
            // Redibujar una zona no cambia quién la trabaja: se conservan los colportores que ya tenía.
            zonas: existe ? c.zonas.map((z) => (z.id === guardada.id ? { ...guardada, colportores: z.colportores } : z)) : [...c.zonas, guardada],
            colportores,
          };
        }),
      );
      abandonarDibujo();
      setRecargaCasas((n) => n + 1);
      focoPendiente.current = '[data-foco="titulo-zona"]';
      setPanel({ tipo: "detalle", zonaId: guardada.id, colportorId: null, ocupado: false, error: null });
      setAviso(`Zona «${guardada.nombre}» guardada.`);
    } catch {
      if (deSesion === sesion.current) cambiarDibujo(() => ({ guardando: false, error: mensajeSinConexion("guardar la zona") }));
    } finally {
      guardandoAhora.current = false;
    }
  }

  /** Pone (o, con `null`, saca) la zona de un colportor en la lista de la ciudad y en los colportores de cada zona. */
  function ponerZona(colportorId: string, zona: ZonaDeCiudad | null) {
    const persona = ciudad.colportores.find((p) => p.id === colportorId);
    // La zona de un colportor es una por campaña, de la ciudad que sea: al cambiarla acá, deja la que tenía en otra ciudad.
    setCiudades((todas) =>
      todas.map((c) => ({
        ...c,
        colportores: c.colportores.map((p) =>
          p.id === colportorId ? { ...p, zonaId: zona?.id ?? null, zonaNombre: zona?.nombre ?? null } : p,
        ),
        zonas: c.zonas.map((z) => {
          const sinEl = z.colportores.filter((p) => p.id !== colportorId);
          return z.id === zona?.id && persona
            ? { ...z, colportores: [...sinEl, { id: persona.id, nombre: persona.nombre, suspendido: persona.suspendido }] }
            : { ...z, colportores: sinEl };
        }),
      })),
    );
  }

  /** «Asignar a <zona>» y «Quitar»: una sola acción sobre colportores a la vez. */
  async function cambiarZonaDeColportor(colportorId: string, accion: "asignar" | "quitar") {
    if (panel.tipo !== "detalle" || !zonaDetalle || !ciudad || asignandoAhora.current) return;
    const zona = zonaDetalle;
    const persona = ciudad.colportores.find((c) => c.id === colportorId);
    if (accion === "asignar" && persona?.suspendido) {
      setPanel({ ...panel, error: TEXTO_CUENTA_SUSPENDIDA });
      return;
    }
    asignandoAhora.current = true;
    setPanel({ ...panel, ocupado: true, error: null });
    try {
      const resultado =
        accion === "asignar" ? await acciones.asignarZona(colportorId, zona.id) : await acciones.quitarZona(colportorId);
      if (!resultado.ok) {
        setPanel((p) => (p.tipo === "detalle" && p.zonaId === zona.id ? { ...p, ocupado: false, error: resultado.mensaje } : p));
        return;
      }
      ponerZona(colportorId, accion === "asignar" ? zona : null);
      // El botón que se tocó queda apagado («ya trabaja esta zona») o desaparece con el colportor: el foco va al desplegable.
      focoPendiente.current = '[data-foco="desplegable-colportor"]';
      setPanel((p) =>
        p.tipo === "detalle" && p.zonaId === zona.id ? { ...p, colportorId: null, ocupado: false, error: null } : p,
      );
      const nombre = persona?.nombre ?? "El colportor";
      setAviso(accion === "asignar" ? `${nombre} quedó en ${zona.nombre}.` : `${nombre} quedó sin zona.`);
    } catch {
      setPanel((p) => (p.tipo === "detalle" && p.zonaId === zona.id ? { ...p, ocupado: false, error: mensajeSinConexion(accion === "asignar" ? `asignar a ${persona?.nombre ?? "el colportor"}` : `quitar a ${persona?.nombre ?? "el colportor"}`) } : p));
    } finally {
      asignandoAhora.current = false;
    }
  }

  /** «Eliminar zona», ya confirmada: los colportores asignados quedan sin zona y las ubicaciones no se tocan. */
  async function eliminarZona() {
    if (panel.tipo !== "dibujo" || !panel.zonaId || !ciudad || guardandoAhora.current) return;
    guardandoAhora.current = true;
    const zonaId = panel.zonaId;
    const nombre = zonas.find((z) => z.id === zonaId)?.nombre ?? panel.nombre;
    cambiarDibujo(() => ({ guardando: true, error: null, fallaVistaPrevia: null }));
    try {
      const resultado = await acciones.eliminarZona(zonaId);
      if (!resultado.ok) {
        cambiarDibujo(() => ({ guardando: false, error: resultado.mensaje }));
        return;
      }
      setCiudades((todas) =>
        todas.map((c) => ({
          ...c,
          zonas: c.id === ciudad.id ? c.zonas.filter((z) => z.id !== zonaId) : c.zonas,
          // Los asignados quedan sin zona en la lista de colportores de todas las ciudades (la zona es una por campaña).
          colportores: c.colportores.map((p) => (p.zonaId === zonaId ? { ...p, zonaId: null, zonaNombre: null } : p)),
        })),
      );
      abandonarDibujo();
      setRecargaCasas((n) => n + 1);
      volverFoco.current = '[data-foco="nueva-zona"]';
      setPanel({ tipo: "lista", asignandoA: null });
      setAviso(
        resultado.colportoresSinZona > 0
          ? `Zona «${nombre}» eliminada. ${textoColportoresSinZona(resultado.colportoresSinZona)}.`
          : `Zona «${nombre}» eliminada.`,
      );
    } catch {
      cambiarDibujo(() => ({ guardando: false, error: mensajeSinConexion("eliminar la zona") }));
    } finally {
      guardandoAhora.current = false;
    }
  }

  /** «+ Agregar ciudad»: suma la ciudad elegida del catálogo y la deja seleccionada. */
  async function agregarCiudad(elegida: CiudadDelCatalogo) {
    if (agregandoAhora.current || guardandoAhora.current) return;
    agregandoAhora.current = true;
    setBuscador({ ocupado: true, error: null });
    try {
      const resultado = await acciones.agregarCiudad(elegida.id);
      if (!resultado.ok) {
        setBuscador({ ocupado: false, error: resultado.mensaje });
        return;
      }
      const nueva = resultado.ciudad;
      setCiudades((todas) => (todas.some((c) => c.catalogoId === nueva.catalogoId) ? todas : [...todas, nueva]));
      abandonarDibujo();
      setCiudadId(nueva.id);
      setPanel({ tipo: "lista", asignandoA: null });
      // El buscador se desmonta: el foco pasa a la pestaña de la ciudad nueva en vez de caer al <body>.
      focoPendiente.current = '[data-foco="ciudad-elegida"]';
      setBuscador(null);
      setAviso(`«${nueva.nombre}» se agregó a la campaña.`);
    } catch {
      setBuscador({ ocupado: false, error: mensajeSinConexion("agregar la ciudad") });
    } finally {
      agregandoAhora.current = false;
    }
  }

  return (
    <div ref={raiz} className="flex flex-col gap-3.5">
      <h2 className="font-serif text-[21px] font-semibold text-tinta">Zonas · {datos.campania}</h2>

      <div className="flex items-center gap-2">
        {ciudad ? (
          <nav aria-label="Ciudades de la campaña" className="flex flex-wrap gap-2">
            {ciudades.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-current={c.id === ciudad.id ? "true" : undefined}
                data-foco={c.id === ciudad.id ? "ciudad-elegida" : undefined}
                disabled={guardando || agregando}
                onClick={() => elegirCiudad(c.id)}
                className={cn(
                  "flex cursor-pointer flex-col items-start rounded-control border px-3.5 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
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
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          // Con un dibujo a medias no se puede cambiar de ciudad: se perdería sin aviso.
          disabled={panel.tipo === "dibujo"}
          aria-expanded={buscador !== null}
          data-foco="agregar-ciudad"
          onClick={() => setBuscador((b) => (b ? (b.ocupado ? b : null) : { ocupado: false, error: null }))}
          className="text-nav font-semibold text-tinta-2"
        >
          + Agregar ciudad
        </Button>
      </div>

      {buscador ? (
        <BuscadorCiudad
          buscar={acciones.buscarCiudades}
          excluidas={catalogoEnCampania}
          ocupado={buscador.ocupado}
          error={buscador.error}
          onElegir={(c) => void agregarCiudad(c)}
          onCerrar={() => {
            setBuscador(null);
            raiz.current?.querySelector<HTMLElement>('[data-foco="agregar-ciudad"]')?.focus();
          }}
        />
      ) : null}

      {aviso ? (
        <p role="status" className="rounded-control bg-exito-fondo px-3 py-2 text-cuerpo font-medium text-exito">
          {aviso}
        </p>
      ) : null}

      {!ciudad ? (
        <p data-foco="sin-ciudades" className="rounded-tarjeta border border-borde bg-superficie px-4 py-3 text-nav text-tinta">
          {TEXTO_SIN_CIUDADES}
        </p>
      ) : (
      <div className="grid grid-cols-[360px_minmax(0,1fr)] items-start gap-4">
        <div className="flex max-h-[calc(100vh-var(--spacing-topbar)-var(--alto-aviso,0px)-230px)] min-h-[520px] flex-col gap-4 overflow-auto">
          {/* Sin zonas no hay casas que contar: la leyenda diría «0 casas» y la lista ya dice que no hay zonas. */}
          {panel.tipo === "lista" && zonas.length > 0 ? (
            <LeyendaDeCasas
              fase={casasDeLaCiudad.fase}
              casas={casasDeLaCiudad.casas}
              mostradas={casasQueSeVen.length}
              ocultos={ocultos}
              onAlternar={alternarEstadoDeCasa}
            />
          ) : null}
          {panel.tipo === "dibujo" ? (
            <PanelFormularioZona
              editando={panel.zonaId !== undefined}
              baja={
                panel.zonaId !== undefined && zonaEnEdicion
                  ? {
                      nombre: zonaEnEdicion.nombre,
                      colportores: zonaEnEdicion.colportores.length,
                      confirmando: panel.confirmandoBaja,
                      onPedir: () => cambiarDibujo(() => ({ confirmandoBaja: true, error: null })),
                      onCancelar: () => cambiarDibujo(() => ({ confirmandoBaja: false, error: null })),
                      onConfirmar: () => void eliminarZona(),
                    }
                  : undefined
              }
              nombre={panel.nombre}
              forma={panel.forma}
              nombreCentro={panel.nombreCentro}
              vistaPrevia={panel.vistaPrevia}
              guardando={panel.guardando}
              error={panel.error}
              nota={panel.nota}
              calculando={calculando}
              onNombre={(nombre) => cambiarDibujo(() => ({ nombre }))}
              onTipoForma={cambiarTipoForma}
              onRadio={(radioM) => actualizarForma({ ...panel.forma, radioM })}
              onQuitarEsquina={() => quitarEsquina()}
              onGuardar={() => void guardarZona()}
              onCancelar={cerrarDibujo}
              onReintentarVistaPrevia={
                panel.error !== null && panel.error === panel.fallaVistaPrevia ? reintentarVistaPrevia : undefined
              }
            />
          ) : panel.tipo === "detalle" && zonaDetalle ? (
            <PanelDetalleZona
              key={zonaDetalle.id + (panel.colportorId ?? "")}
              ciudad={ciudad}
              zona={zonaDetalle}
              colportorInicialId={panel.colportorId}
              ocupado={panel.ocupado}
              error={panel.error}
              onCerrar={() => {
                volverFoco.current = `[data-zona-id="${zonaDetalle.id}"]`;
                setPanel({ tipo: "lista", asignandoA: null });
              }}
              bloqueado={agregando}
              onEditarForma={() => empezarEdicion(zonaDetalle)}
              onAsignar={(id) => void cambiarZonaDeColportor(id, "asignar")}
              onQuitar={(id) => void cambiarZonaDeColportor(id, "quitar")}
            />
          ) : (
            <PanelListaZonas
              ciudad={ciudad}
              zonas={zonas}
              zonaElegidaId={zonaElegidaId}
              asignandoA={panel.tipo === "lista" ? panel.asignandoA : null}
              bloqueado={agregando}
              onNuevaZona={() => empezarDibujo(dibujoNuevo())}
              onElegirZona={elegirZona}
              onAsignar={(colportorId) => setPanel({ tipo: "lista", asignandoA: colportorId })}
              onCancelarAsignacion={() => setPanel({ tipo: "lista", asignandoA: null })}
            />
          )}
        </div>

        <div className="relative h-[calc(100vh-var(--spacing-topbar)-var(--alto-aviso,0px)-230px)] min-h-[520px] overflow-hidden rounded-tarjeta border border-borde">
          <MapaZonas
            ciudad={ciudad}
            zonas={zonas}
            zonaElegidaId={zonaElegidaId}
            dibujo={dibujo}
            casas={{ casas: casasQueSeVen, elegidaId: casaElegidaId, onElegir: setCasaElegidaId, onAgrupadas: setAgrupadas }}
            onZonaClick={elegirZona}
            onMapaClick={alHacerClicEnMapa}
            onMapaMove={alMoverEnMapa}
            onRadio={(radioM) => forma && actualizarForma({ ...forma, radioM })}
            // Mientras guarda, el centro no se agarra: la zona que se mandó es la que queda.
            onCentro={guardando ? undefined : moverCentro}
            // Cada esquina lleva su «×» (#182), salvo mientras guarda o si las zonas por esquinas no están conectadas.
            onQuitarEsquina={guardando || !esquinasDisponibles ? undefined : quitarEsquina}
          />
          {avisoDelMapa ? <AvisoDeCasas aviso={avisoDelMapa} /> : null}
          {/* El coordinador mira el mapa mientras marca: el ícono de carga también va acá (#182). Lo anuncia el formulario. */}
          {calculando ? (
            <p
              aria-hidden
              data-calculando-en-mapa
              // Debajo del aviso de las casas cuando lo hay: los dos van arriba.
              className={cn(
                "pointer-events-none absolute right-3 z-10 flex items-center gap-2 rounded-pastilla bg-superficie px-3 py-1.5 text-chico font-medium text-tinta-2 shadow",
                avisoDelMapa ? "top-[88px]" : "top-3",
              )}
            >
              <span className="size-3.5 rounded-full border-2 border-borde border-t-marca-media motion-safe:animate-spin" />
              {TEXTO_CALCULANDO}
            </p>
          ) : null}
        </div>
      </div>
      )}
    </div>
  );
}
