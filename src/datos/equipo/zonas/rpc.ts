import type {
  CasaDeCiudad,
  CiudadDeCampania,
  ColportorDeCiudad,
  ColportorEnZona,
  DatosZonas,
  EstadoDeCasa,
  Esquina,
  FormaZona,
  FuenteDatosZonas,
  PoligonoGeojson,
  Punto,
  RechazoDelMapa,
  ResultadoAgregarCiudad,
  ResultadoAsignacion,
  ResultadoEliminarZona,
  ResultadoGuardarZona,
  TipoDeCasa,
  VistaPreviaRechazada,
  VistaPreviaZona,
  ZonaDeCiudad,
} from "@/datos/equipo/zonas/contrato";
import { COLOR_ZONA_SIN_COLOR, esColorHex } from "@/datos/equipo/zonas/paleta";
import { campaniaProvisoria } from "@/datos/supabase/campania-provisoria";
import { causaDe, ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import {
  cadena,
  cadenaONula,
  esObjeto,
  filas,
  listaDeObjetos,
  nombreVisible,
  numero,
  objeto,
  RespuestaInesperada,
  UUID,
  type Objeto,
} from "@/datos/supabase/respuesta";

/**
 * Fuente de la vista 24 (HU-CAM-006) contra las RPC de Supabase (ADR-013): `campanias_del_coordinador()`,
 * `ciudades_de_campania()`, `zonas_de_ciudad()`, `colportores_de_campania()`, `ciudades_del_catalogo()`,
 * `agregar_ciudad_a_campania()`, `guardar_zona()` (también para la vista previa), `baja_zona()`, `asignar_zona()`,
 * `quitar_zona()` y, para las zonas por esquinas (#179, backend-supabase#25, migración 0036), `esquina_mas_cercana()`,
 * `tramo_por_calles()` y `poligono_por_calles()`. Habla con un `ClienteRpc`, o sea con el JWT del coordinador; de dónde
 * sale esa sesión no es cosa de este archivo.
 *
 * Acá se traducen los rechazos de la base (`CZ001`…`CZ016`, `42501`) al texto para mostrar: las pantallas no conocen
 * códigos. Una falla de conexión, de servicio o de sesión no es un rechazo y sale como excepción (la vista la muestra
 * como «sin conexión»). **Ninguna falla se toma por una lista vacía.**
 *
 * Una zona por esquinas se guarda en dos pasos: `poligono_por_calles()` engancha cada esquina a su cruce y arma el borde
 * por las calles, y `guardar_zona()` recibe ese borde y esas esquinas ya enganchadas (exige que el borde pase a 1 m o
 * menos de cada una). Una ciudad sin calles cargadas contesta `CZ015` con su aviso; el panel no lo adivina antes.
 * La superposición con otra zona y la calle compartida salen de `superposiciones` y `calles_compartidas` (0038, 0059):
 * la vista muestra una de cada una, la primera de la lista de la base.
 */

/** Cuántos caracteres de la búsqueda se mandan; el resto se descarta (el nombre de una ciudad no pasa de ahí). */
const MAX_TEXTO_BUSQUEDA = 100;

/** Los códigos de la familia del mapa y de la asignación (migraciones 0006, 0008, 0009, 0012, 0033 y 0036) cuyo `message` es el texto para mostrar. */
const CODIGOS_CON_TEXTO = new Set([
  "CZ001",
  "CZ002",
  "CZ003",
  "CZ004",
  "CZ005",
  "CZ006",
  "CZ008",
  "CZ009",
  "CZ011",
  "CZ012",
  "CZ013",
  "CZ014",
  // 0036: la ciudad no tiene calles cargadas, y no hay camino por las calles entre dos esquinas.
  "CZ015",
  "CZ016",
]);

// Los mismos textos que la base manda en el `message` de cada rechazo, por si uno llega sin mensaje o un id inválido
// se frena antes de llamar.
const SIN_PERMISO_MAPA = "Solo el coordinador de la campaña o un administrador puede cambiar su mapa.";
const SIN_PERMISO_ASIGNAR = "Solo el coordinador de la campaña puede asignar zonas en ella.";
const ZONA_INEXISTENTE = "La zona no existe o ya se dio de baja. Recargá el mapa.";
const CIUDAD_FUERA_DE_CAMPANIA = "La ciudad no está en esta campaña. Agregala con «+ Agregar ciudad» y volvé a intentar.";
const CIUDAD_INEXISTENTE = "La ciudad no está en el catálogo. Pedile a un administrador que la cargue.";
const COLPORTOR_FUERA_DE_CAMPANIA = "El colportor no está en esta campaña.";

// Cuando la base rechaza con un código que el panel no conoce (o sin mensaje).
const VISTA_PREVIA_RECHAZADA = "No se pudieron calcular las ubicaciones de la zona. Probá de nuevo más tarde.";
const GUARDAR_RECHAZADO = "No se pudo guardar la zona. Probá de nuevo más tarde.";
const ESQUINA_RECHAZADA = "No se pudo ubicar la esquina. Probá de nuevo más tarde.";
const TRAMO_RECHAZADO = "No se pudo calcular el borde entre las esquinas. Probá de nuevo más tarde.";
const ELIMINAR_RECHAZADO = "No se pudo eliminar la zona. Probá de nuevo más tarde.";
const ASIGNAR_RECHAZADO = "No se pudo asignar la zona. Probá de nuevo más tarde.";
const QUITAR_RECHAZADO = "No se pudo quitar la zona. Probá de nuevo más tarde.";
const AGREGAR_RECHAZADO = "No se pudo agregar la ciudad. Probá de nuevo más tarde.";

/** Tamaño de página de `casas_de_zona()` (su máximo es 5000): un tamaño técnico, el panel pide páginas hasta tenerlas todas. */
const CASAS_POR_PAGINA = 1000;
/** Freno de seguridad: una zona con más páginas que esto (200 000 casas) es una respuesta que no avanza, no una ciudad. */
const MAX_PAGINAS_POR_ZONA = 200;

/** El `estado` que contesta `casas_de_zona()` (el `color` de `house_status`, ADR-003); `null` es la casa sin visita. */
const ESTADOS_DE_LA_BASE: Readonly<Record<string, EstadoDeCasa>> = {
  ENTREGA_Y_COBRANZA_PENDIENTE: "ENTREGA_Y_COBRANZA_PENDIENTE",
  COBRANZA_PENDIENTE: "COBRANZA_PENDIENTE",
  ENTREVISTA_PROGRAMADA: "ENTREVISTA_PROGRAMADA",
  VENTA_COMPLETA: "VENTA_COMPLETA",
  ENTREVISTA_SIN_VENTA: "ENTREVISTA_SIN_VENTA",
  SIN_CONTESTAR: "SIN_CONTESTAR",
  RECHAZO: "RECHAZO",
};
const TIPOS_DE_CASA: ReadonlySet<string> = new Set<TipoDeCasa>(["CASA", "NEGOCIO", "EDIFICIO"]);

/** Para un colportor cuyo nombre y apellido vinieron vacíos y que no está en la lista de inscriptos. */
const CUENTA_SIN_NOMBRE = "Cuenta sin nombre";

/** Un rechazo de la regla se traduce; una caída, un 5xx o una sesión vencida siguen como excepción. */
function esRechazo(error: unknown): error is ErrorSupabase {
  return error instanceof ErrorSupabase && causaDe(error) === "rechazo";
}

/** El `message` de la base si el código es de la familia del mapa; si no, el texto de la operación. */
function textoDeRechazo(error: ErrorSupabase, sinPermiso: string, generico: string): string {
  if (error.codigo === "42501") return sinPermiso;
  return CODIGOS_CON_TEXTO.has(error.codigo) && error.message !== "" ? error.message : generico;
}

/** La campaña se terminó o se dio de baja entre una llamada y la siguiente: ya no hay campaña con zonas que mostrar. */
function campaniaYaNoVigente(error: unknown): boolean {
  return error instanceof ErrorSupabase && (error.codigo === "CZ001" || error.codigo === "CZ011");
}

function aPoligono(rpc: string, valor: unknown): PoligonoGeojson {
  const sinForma = () => new RespuestaInesperada(rpc, "`poligono_geojson` no es un polígono");
  if (!esObjeto(valor) || valor.type !== "Polygon" || !Array.isArray(valor.coordinates)) throw sinForma();
  const coordinates = valor.coordinates.map((anillo: unknown) => {
    if (!Array.isArray(anillo)) throw sinForma();
    return anillo.map((posicion: unknown): [number, number] => {
      if (!Array.isArray(posicion) || !Number.isFinite(posicion[0]) || !Number.isFinite(posicion[1])) throw sinForma();
      return [posicion[0] as number, posicion[1] as number];
    });
  });
  return { type: "Polygon", coordinates };
}

/** Las esquinas de una zona por `orden`; una calle sin nombre (columna nula) queda `""`, sin inventar una. */
function aEsquinas(rpc: string, vertices: Objeto[]): Esquina[] {
  return vertices
    .map((v) => ({
      orden: numero(rpc, v, "orden"),
      esquina: {
        lon: numero(rpc, v, "lon"),
        lat: numero(rpc, v, "lat"),
        calleA: cadenaONula(rpc, v, "calle_a") ?? "",
        calleB: cadenaONula(rpc, v, "calle_b") ?? "",
      },
    }))
    .sort((a, b) => a.orden - b.orden)
    .map((v) => v.esquina);
}

/** El cruce que contesta `esquina_mas_cercana()`; una calle sin nombre en OpenStreetMap (nula) queda `""`. */
function aEsquina(rpc: string, fila: Objeto): Esquina {
  return {
    lon: numero(rpc, fila, "lon"),
    lat: numero(rpc, fila, "lat"),
    calleA: cadenaONula(rpc, fila, "calle_a") ?? "",
    calleB: cadenaONula(rpc, fila, "calle_b") ?? "",
  };
}

/** Los puntos de `tramo_por_calles()`, de una esquina a la otra por su `orden`. */
function aTramo(rpc: string, puntos: Objeto[]): Punto[] {
  return puntos
    .map((p) => ({ orden: numero(rpc, p, "orden"), punto: { lon: numero(rpc, p, "lon"), lat: numero(rpc, p, "lat") } }))
    .sort((a, b) => a.orden - b.orden)
    .map((p) => p.punto);
}

/** El borde de una parte común (`interseccion`: un `Polygon` o un `MultiPolygon` de GeoJSON) como línea para pintar; vacío si no es eso. */
function bordeDeInterseccion(valor: unknown): Punto[] {
  if (!esObjeto(valor) || !Array.isArray(valor.coordinates)) return [];
  const primero: unknown = valor.coordinates[0];
  const anillo: unknown = valor.type === "Polygon" ? primero : valor.type === "MultiPolygon" && Array.isArray(primero) ? primero[0] : null;
  if (!Array.isArray(anillo)) return [];
  const puntos: Punto[] = [];
  for (const posicion of anillo as unknown[]) {
    if (!Array.isArray(posicion)) return [];
    const [lon, lat] = posicion as unknown[];
    if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) return [];
    puntos.push({ lon, lat });
  }
  return puntos;
}

/**
 * La primera zona con la que se superpone, con el borde de la parte común para pintarlo en rojo (`superposiciones`,
 * 0038). Solo avisa (S56): una entrada que no se entiende se saltea, no rompe la vista previa ni el guardado.
 */
function aSuperposicion(respuesta: Objeto): VistaPreviaZona["superposicion"] {
  if (!Array.isArray(respuesta.superposiciones)) return null;
  for (const entrada of respuesta.superposiciones as unknown[]) {
    if (!esObjeto(entrada) || typeof entrada.nombre !== "string") continue;
    const tramo = bordeDeInterseccion(entrada.interseccion);
    if (tramo.length > 1) return { zonaNombre: entrada.nombre, tramo };
  }
  return null;
}

/**
 * La primera calle con nombre que el borde comparte con otra zona (`calles_compartidas`, 0038 y 0059; `null` si la
 * base no lo pudo calcular). Una calle sin nombre en OpenStreetMap no se muestra: el aviso nombra la calle.
 */
function aCalleCompartida(respuesta: Objeto): VistaPreviaZona["comparteCalle"] {
  if (!Array.isArray(respuesta.calles_compartidas)) return null;
  for (const entrada of respuesta.calles_compartidas as unknown[]) {
    if (!esObjeto(entrada) || typeof entrada.nombre !== "string" || typeof entrada.calle !== "string" || entrada.calle === "") continue;
    const punto = entrada.punto;
    if (!esObjeto(punto) || punto.type !== "Point" || !Array.isArray(punto.coordinates)) continue;
    const [lon, lat] = punto.coordinates as unknown[];
    if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    return { calle: entrada.calle, zonaNombre: entrada.nombre, punto: { lon, lat } };
  }
  return null;
}

/**
 * Lo que `guardar_zona()` necesita de la forma. Una radial, su centro y su radio. Una por esquinas, el borde por las
 * calles que arma `poligono_por_calles()` y las esquinas tal como esa función las enganchó a sus cruces (no los clics:
 * `guardar_zona()` exige que el borde pase a 1 m o menos de cada una), sin centro ni radio.
 */
async function argumentosDeForma(cliente: ClienteRpc, ciudadId: string, forma: FormaZona): Promise<Record<string, unknown>> {
  if (forma.tipoForma === "RADIAL") {
    return {
      p_tipo_forma: "RADIAL",
      p_centro_lat: forma.centro?.lat ?? null,
      p_centro_lon: forma.centro?.lon ?? null,
      p_radio_m: forma.radioM === undefined ? null : Math.round(forma.radioM),
    };
  }
  const rpc = "poligono_por_calles";
  const [fila] = filas(
    rpc,
    await cliente.llamarRpc(rpc, {
      p_campania_ciudad_id: ciudadId,
      p_esquinas: (forma.esquinas ?? []).map((e) => ({ lon: e.lon, lat: e.lat })),
    }),
  );
  if (!fila) throw new RespuestaInesperada(rpc, "no devolvió el borde de la zona");
  return {
    p_tipo_forma: "ESQUINAS",
    p_vertices: listaDeObjetos(rpc, fila, "esquinas").map((e) => ({
      orden: numero(rpc, e, "orden"),
      lon: numero(rpc, e, "lon"),
      lat: numero(rpc, e, "lat"),
      calle_a: cadenaONula(rpc, e, "calle_a"),
      calle_b: cadenaONula(rpc, e, "calle_b"),
    })),
    p_poligono_geojson: aPoligono(rpc, fila.poligono_geojson),
  };
}

/** Lo que `zonas_de_ciudad()` y la fila `zona` que devuelve `guardar_zona()` tienen en común. */
function aZona(
  rpc: string,
  fila: Objeto,
  datos: { idCampo: string; vertices: Objeto[] | null; colportores: ColportorEnZona[]; ubicaciones: number },
): ZonaDeCiudad {
  const tipoForma = cadena(rpc, fila, "tipo_forma");
  if (tipoForma !== "RADIAL" && tipoForma !== "ESQUINAS") throw new RespuestaInesperada(rpc, `\`tipo_forma\` desconocido (${tipoForma})`);
  const comun = {
    id: cadena(rpc, fila, datos.idCampo),
    nombre: cadena(rpc, fila, "nombre"),
    // `color` es nulable en la base (`guardar_zona()` lo permite) y el contrato del panel exige `#RRGGBB` para dibujarla:
    // sin color se pinta con un gris y se marca `sinColor`, para que al editarla no se guarde ese gris como si fuera suyo.
    ...(esColorHex(fila.color) ? { color: fila.color } : { color: COLOR_ZONA_SIN_COLOR, sinColor: true as const }),
    poligonoGeojson: aPoligono(rpc, fila.poligono_geojson),
    colportores: datos.colportores,
    ubicacionesRegistradas: datos.ubicaciones,
  };
  if (tipoForma === "RADIAL") {
    return {
      ...comun,
      tipoForma,
      centro: { lon: numero(rpc, fila, "centro_lon"), lat: numero(rpc, fila, "centro_lat") },
      radioM: numero(rpc, fila, "radio_m"),
    };
  }
  if (datos.vertices === null) throw new RespuestaInesperada(rpc, "una zona por esquinas llegó sin `esquinas`");
  return { ...comun, tipoForma, esquinas: aEsquinas(rpc, datos.vertices) };
}

function aInscripto(fila: Objeto): ColportorDeCiudad {
  const rpc = "colportores_de_campania";
  return {
    id: cadena(rpc, fila, "usuario_id"),
    nombre: nombreVisible(cadena(rpc, fila, "nombre"), cadena(rpc, fila, "apellido"), cadena(rpc, fila, "email")),
    zonaId: cadenaONula(rpc, fila, "zona_id"),
    zonaNombre: cadenaONula(rpc, fila, "zona_nombre"),
    ...(fila.suspendido === true ? { suspendido: true } : {}),
  };
}

/** Los colportores de una zona (`zonas_de_ciudad().colportores`); sin nombre ni apellido, el de la lista de inscriptos. */
function aColportoresEnZona(fila: Objeto, inscriptos: ReadonlyMap<string, string>): ColportorEnZona[] {
  const rpc = "zonas_de_ciudad";
  return listaDeObjetos(rpc, fila, "colportores").map((c) => {
    const id = cadena(rpc, c, "usuario_id");
    return {
      id,
      nombre: nombreVisible(cadena(rpc, c, "nombre"), cadena(rpc, c, "apellido"), inscriptos.get(id) ?? CUENTA_SIN_NOMBRE),
      ...(c.suspendido === true ? { suspendido: true } : {}),
    };
  });
}

interface CiudadBase {
  id: string;
  catalogoId: string;
  nombre: string;
  centro: { lon: number; lat: number };
  zoom: number;
}

function aCiudadBase(fila: Objeto): CiudadBase {
  const rpc = "ciudades_de_campania";
  return {
    id: cadena(rpc, fila, "campania_ciudad_id"),
    catalogoId: cadena(rpc, fila, "ciudad_id"),
    nombre: cadena(rpc, fila, "nombre"),
    centro: { lon: numero(rpc, fila, "lon_centro"), lat: numero(rpc, fila, "lat_centro") },
    zoom: numero(rpc, fila, "zoom_inicial"),
  };
}

/**
 * Las ciudades de la campaña con sus zonas y los inscriptos, o solo la de `soloCiudadId`. La zona de un colportor es
 * una por campaña (su inscripción), de la ciudad que sea: cada ciudad lista a todos los inscriptos con esa zona.
 */
async function leerCiudades(cliente: ClienteRpc, campaniaId: string, soloCiudadId?: string): Promise<CiudadDeCampania[]> {
  const [respuestaCiudades, respuestaInscriptos] = await Promise.all([
    cliente.llamarRpc("ciudades_de_campania", { p_campania_id: campaniaId }),
    cliente.llamarRpc("colportores_de_campania", { p_campania_id: campaniaId }),
  ]);
  const inscriptos = filas("colportores_de_campania", respuestaInscriptos).map(aInscripto);
  const nombres = new Map(inscriptos.map((i) => [i.id, i.nombre]));
  const bases = filas("ciudades_de_campania", respuestaCiudades)
    .map(aCiudadBase)
    .filter((c) => soloCiudadId === undefined || c.id === soloCiudadId);
  if (soloCiudadId !== undefined && bases.length === 0) {
    throw new RespuestaInesperada("ciudades_de_campania", "la ciudad que se acaba de agregar no figura en la campaña");
  }

  return Promise.all(
    bases.map(async (base): Promise<CiudadDeCampania> => {
      const rpc = "zonas_de_ciudad";
      const respuesta = await cliente.llamarRpc(rpc, { p_campania_id: campaniaId, p_campania_ciudad_id: base.id });
      return {
        ...base,
        zonas: filas(rpc, respuesta).map((fila) =>
          aZona(rpc, fila, {
            idCampo: "zona_id",
            vertices: fila.tipo_forma === "ESQUINAS" ? listaDeObjetos(rpc, fila, "esquinas") : null,
            colportores: aColportoresEnZona(fila, nombres),
            ubicaciones: numero(rpc, fila, "ubicaciones_registradas"),
          }),
        ),
        colportores: inscriptos,
      };
    }),
  );
}

type CasaSinZonas = Omit<CasaDeCiudad, "zonaIds">;

function aCasa(fila: Objeto): CasaSinZonas {
  const rpc = "casas_de_zona";
  const tipo = cadena(rpc, fila, "tipo");
  if (!TIPOS_DE_CASA.has(tipo)) throw new RespuestaInesperada(rpc, `\`tipo\` desconocido (${tipo})`);
  const estadoDeLaBase = cadenaONula(rpc, fila, "estado");
  const estado = estadoDeLaBase === null ? "SIN_VISITA" : ESTADOS_DE_LA_BASE[estadoDeLaBase];
  if (estado === undefined) throw new RespuestaInesperada(rpc, `\`estado\` desconocido (${estadoDeLaBase})`);
  return {
    id: cadena(rpc, fila, "ubicacion_id"),
    lon: numero(rpc, fila, "lon"),
    lat: numero(rpc, fila, "lat"),
    tipo: tipo as TipoDeCasa,
    estado,
    // Una base que todavía no devuelve `ultimo_cambio` (backend-supabase#247) es lo mismo que una casa sin estado: sin fecha.
    ultimoCambio: cadenaONula(rpc, fila, "ultimo_cambio"),
  };
}

/** Todas las casas de una zona: páginas de `CASAS_POR_PAGINA` hasta que una venga con menos (un tope no esconde resultados). */
async function leerCasasDeZona(cliente: ClienteRpc, campaniaId: string, zonaId: string): Promise<CasaSinZonas[]> {
  const rpc = "casas_de_zona";
  const casas: CasaSinZonas[] = [];
  let despuesDe: string | null = null;
  for (let pagina = 0; pagina < MAX_PAGINAS_POR_ZONA; pagina++) {
    const respuesta: unknown = await cliente.llamarRpc(rpc, {
      p_campania_id: campaniaId,
      p_zona_id: zonaId,
      p_limite: CASAS_POR_PAGINA,
      ...(despuesDe === null ? {} : { p_despues_de: despuesDe }),
    });
    const leidas = filas(rpc, respuesta).map(aCasa);
    casas.push(...leidas);
    if (leidas.length < CASAS_POR_PAGINA) return casas;
    despuesDe = leidas[leidas.length - 1].id;
  }
  throw new RespuestaInesperada(rpc, "la zona no termina de paginar");
}

/**
 * `guardar_zona()` exige un nombre aun para la vista previa (no la guarda, pero valida primero). La vista previa se
 * pide antes de que haya nombre, así que va uno que no se usa y que no puede chocar con el de una zona: un UUID.
 */
function nombreDeVistaPrevia(): string {
  return crypto.randomUUID();
}

/**
 * @param campaniaElegida la campaña que eligió la coordinadora en el topbar (#70), si hay; sin ella o si ya no figura en
 *   su lista, la primera (`campaniaProvisoria`).
 */
export function crearFuenteZonasRpc(
  cliente: ClienteRpc,
  campaniaElegida: () => Promise<string | null> = async () => null,
): FuenteDatosZonas {
  return {
    async obtenerZonas(): Promise<DatosZonas | null> {
      const campania = await campaniaProvisoria(cliente, await campaniaElegida());
      if (!campania) return null;
      try {
        return {
          campaniaId: campania.id,
          campania: campania.nombre,
          ciudades: await leerCiudades(cliente, campania.id),
        };
      } catch (error) {
        if (campaniaYaNoVigente(error)) return null;
        throw error;
      }
    },

    async esquinaMasCercana(ciudadId, punto): Promise<Esquina | RechazoDelMapa> {
      if (!UUID.test(ciudadId)) return { rechazo: CIUDAD_FUERA_DE_CAMPANIA };
      const rpc = "esquina_mas_cercana";
      try {
        // `returns table`: una lista con una sola fila, el cruce más cercano de la ciudad.
        const [fila] = filas(rpc, await cliente.llamarRpc(rpc, { p_campania_ciudad_id: ciudadId, p_lon: punto.lon, p_lat: punto.lat }));
        if (!fila) throw new RespuestaInesperada(rpc, "no devolvió ninguna esquina");
        return aEsquina(rpc, fila);
      } catch (error) {
        if (esRechazo(error)) return { rechazo: textoDeRechazo(error, SIN_PERMISO_MAPA, ESQUINA_RECHAZADA) };
        throw error;
      }
    },

    async tramoPorCalles(ciudadId, desde, hasta): Promise<Punto[] | RechazoDelMapa> {
      if (!UUID.test(ciudadId)) return { rechazo: CIUDAD_FUERA_DE_CAMPANIA };
      const rpc = "tramo_por_calles";
      try {
        const puntos = await cliente.llamarRpc(rpc, {
          p_campania_ciudad_id: ciudadId,
          p_desde_lon: desde.lon,
          p_desde_lat: desde.lat,
          p_hasta_lon: hasta.lon,
          p_hasta_lat: hasta.lat,
        });
        return aTramo(rpc, filas(rpc, puntos));
      } catch (error) {
        if (esRechazo(error)) {
          const rechazo = textoDeRechazo(error, SIN_PERMISO_MAPA, TRAMO_RECHAZADO);
          // Sin camino entre esas dos esquinas: la vista dice además cuáles son por su número (#182).
          return error.codigo === "CZ016" ? { rechazo, sinCamino: true } : { rechazo };
        }
        throw error;
      }
    },

    async vistaPreviaZona(entrada): Promise<VistaPreviaZona | VistaPreviaRechazada> {
      const { forma } = entrada;
      if (!UUID.test(entrada.ciudadId)) return { rechazo: CIUDAD_FUERA_DE_CAMPANIA };
      if (entrada.zonaId !== undefined && !UUID.test(entrada.zonaId)) return { rechazo: ZONA_INEXISTENTE };
      try {
        const respuesta = objeto(
          "guardar_zona",
          await cliente.llamarRpc("guardar_zona", {
            p_campania_ciudad_id: entrada.ciudadId,
            p_nombre: nombreDeVistaPrevia(),
            ...(await argumentosDeForma(cliente, entrada.ciudadId, forma)),
            p_zona_id: entrada.zonaId ?? null,
            p_vista_previa: true,
          }),
        );
        if (respuesta.guardada !== false) throw new RespuestaInesperada("guardar_zona", "una vista previa no puede guardar la zona");
        return {
          poligonoGeojson: aPoligono("guardar_zona", respuesta.poligono_geojson),
          ubicacionesIncluidas: numero("guardar_zona", respuesta, "ubicaciones_incluidas"),
          superposicion: aSuperposicion(respuesta),
          comparteCalle: aCalleCompartida(respuesta),
        };
      } catch (error) {
        if (esRechazo(error)) return { rechazo: textoDeRechazo(error, SIN_PERMISO_MAPA, VISTA_PREVIA_RECHAZADA) };
        throw error;
      }
    },

    async guardarZona(entrada): Promise<ResultadoGuardarZona> {
      const { forma } = entrada;
      // El id viene del navegador: si no es una ciudad o una zona, no hay a qué guardar.
      if (!UUID.test(entrada.ciudadId)) return { ok: false, mensaje: CIUDAD_FUERA_DE_CAMPANIA };
      if (entrada.zonaId !== undefined && !UUID.test(entrada.zonaId)) return { ok: false, mensaje: ZONA_INEXISTENTE };
      try {
        const rpc = "guardar_zona";
        const respuesta = objeto(
          rpc,
          await cliente.llamarRpc(rpc, {
            p_campania_ciudad_id: entrada.ciudadId,
            p_nombre: entrada.nombre,
            // Sin color válido va sin color: la base lo permite, y al editar una zona no se pisa el suyo con uno inventado.
            ...(esColorHex(entrada.color) ? { p_color: entrada.color } : {}),
            ...(await argumentosDeForma(cliente, entrada.ciudadId, forma)),
            p_zona_id: entrada.zonaId ?? null,
          }),
        );
        if (respuesta.guardada !== true) throw new RespuestaInesperada(rpc, "la zona no quedó guardada");
        // Los colportores de una zona que se edita no cambian al redibujarla: la vista conserva los que tenía.
        const zona = aZona(rpc, objeto(rpc, respuesta.zona), {
          idCampo: "id",
          // Las esquinas que quedaron guardadas (`zona_vertice`), con sus calles: son las de la zona en la lista y en el mapa.
          vertices: forma.tipoForma === "ESQUINAS" ? listaDeObjetos(rpc, respuesta, "vertices") : null,
          colportores: [],
          ubicaciones: numero(rpc, respuesta, "ubicaciones_incluidas"),
        });
        return { ok: true, zona };
      } catch (error) {
        if (esRechazo(error)) return { ok: false, mensaje: textoDeRechazo(error, SIN_PERMISO_MAPA, GUARDAR_RECHAZADO) };
        throw error;
      }
    },

    async asignarZona(campaniaId, usuarioId, zonaId): Promise<ResultadoAsignacion> {
      if (!UUID.test(usuarioId)) return { ok: false, mensaje: COLPORTOR_FUERA_DE_CAMPANIA };
      if (!UUID.test(zonaId)) return { ok: false, mensaje: ZONA_INEXISTENTE };
      try {
        objeto("asignar_zona", await cliente.llamarRpc("asignar_zona", { p_campania_id: campaniaId, p_usuario_id: usuarioId, p_zona_id: zonaId }));
        return { ok: true };
      } catch (error) {
        if (esRechazo(error)) return { ok: false, mensaje: textoDeRechazo(error, SIN_PERMISO_ASIGNAR, ASIGNAR_RECHAZADO) };
        throw error;
      }
    },

    async quitarZona(campaniaId, usuarioId): Promise<ResultadoAsignacion> {
      if (!UUID.test(usuarioId)) return { ok: false, mensaje: COLPORTOR_FUERA_DE_CAMPANIA };
      try {
        objeto("quitar_zona", await cliente.llamarRpc("quitar_zona", { p_campania_id: campaniaId, p_usuario_id: usuarioId }));
        return { ok: true };
      } catch (error) {
        if (esRechazo(error)) return { ok: false, mensaje: textoDeRechazo(error, SIN_PERMISO_ASIGNAR, QUITAR_RECHAZADO) };
        throw error;
      }
    },

    async eliminarZona(_campaniaId, zonaId): Promise<ResultadoEliminarZona> {
      if (!UUID.test(zonaId)) return { ok: false, mensaje: ZONA_INEXISTENTE };
      try {
        const rpc = "baja_zona";
        const respuesta = objeto(rpc, await cliente.llamarRpc(rpc, { p_zona_id: zonaId }));
        if (respuesta.dada_de_baja !== true) throw new RespuestaInesperada(rpc, "la zona no quedó dada de baja");
        return { ok: true, colportoresSinZona: numero(rpc, respuesta, "colportores_sin_zona") };
      } catch (error) {
        if (esRechazo(error)) return { ok: false, mensaje: textoDeRechazo(error, SIN_PERMISO_MAPA, ELIMINAR_RECHAZADO) };
        throw error;
      }
    },

    async buscarCiudades(campaniaId, texto) {
      const rpc = "ciudades_del_catalogo";
      const buscado = texto.trim().slice(0, MAX_TEXTO_BUSQUEDA).trim();
      const respuesta = await cliente.llamarRpc(rpc, { p_campania_id: campaniaId, p_texto: buscado === "" ? null : buscado });
      // La base ya deja afuera las que están en la campaña y busca también por el departamento (0066).
      return filas(rpc, respuesta).map((fila) => ({
        id: cadena(rpc, fila, "ciudad_id"),
        nombre: cadena(rpc, fila, "nombre"),
        departamento: cadenaONula(rpc, fila, "departamento"),
      }));
    },

    async casasDeZonas(campaniaId, zonaIds): Promise<CasaDeCiudad[]> {
      const unicas = [...new Set(zonaIds)];
      if (unicas.some((id) => !UUID.test(id))) throw new RespuestaInesperada("casas_de_zona", "un id de zona no es un UUID");
      const porZona = await Promise.all(
        unicas.map(async (zonaId) => {
          try {
            return { zonaId, casas: await leerCasasDeZona(cliente, campaniaId, zonaId) };
          } catch (error) {
            // Una zona que se dio de baja mientras tanto ya no tiene casas que mostrar; cualquier otro rechazo o caída corta todo.
            if (error instanceof ErrorSupabase && error.codigo === "CZ004") return { zonaId, casas: [] };
            throw error;
          }
        }),
      );
      // Las zonas se pueden superponer: una casa que cae en dos viene dos veces y se junta en un solo punto.
      const juntas = new Map<string, CasaDeCiudad>();
      for (const { zonaId, casas } of porZona) {
        for (const casa of casas) {
          const antes = juntas.get(casa.id);
          if (antes) antes.zonaIds.push(zonaId);
          else juntas.set(casa.id, { ...casa, zonaIds: [zonaId] });
        }
      }
      return [...juntas.values()];
    },

    async agregarCiudad(campaniaId, catalogoId): Promise<ResultadoAgregarCiudad> {
      if (!UUID.test(catalogoId)) return { ok: false, mensaje: CIUDAD_INEXISTENTE };
      try {
        const rpc = "agregar_ciudad_a_campania";
        const fila = objeto(rpc, await cliente.llamarRpc(rpc, { p_campania_id: campaniaId, p_ciudad_id: catalogoId }));
        // Agregar es idempotente: si la lectura de la ciudad falla, volver a tocar «Agregar» devuelve la misma fila.
        // Una ciudad que se había quitado vuelve con las zonas que tenía.
        const [ciudad] = await leerCiudades(cliente, campaniaId, cadena(rpc, fila, "id"));
        return { ok: true, ciudad };
      } catch (error) {
        if (esRechazo(error)) return { ok: false, mensaje: textoDeRechazo(error, SIN_PERMISO_MAPA, AGREGAR_RECHAZADO) };
        throw error;
      }
    },
  };
}
