import type {
  CalleMapa,
  CiudadDeCampania,
  CiudadDelCatalogo,
  DatosZonas,
  Esquina,
  FormaZona,
  FuenteDatosZonas,
  PoligonoGeojson,
  Punto,
  VistaPreviaEntrada,
  VistaPreviaZona,
  ZonaDeCiudad,
} from "@/datos/equipo/zonas/contrato";
import {
  contiene,
  distanciaM,
  poligonoCircular,
  poligonoDePuntos,
  vertices,
} from "@/datos/equipo/zonas/geometria";

/**
 * Datos y "backend" simulados de la vista 24. La calle y la geometría de
 * verdad las resuelve el backend (PostGIS y pgRouting, ADR-018): acá hay una
 * grilla de calles inventada sobre cada ciudad, con los nombres del diseño.
 */

const CALLES_VERTICALES = ["Grecia", "P. Castellino", "Heredia", "Egipto", "China", "C. Tellier", "Bogotá", "Viacaba"];
const CALLES_HORIZONTALES = ["Haití", "C. M. Ramírez", "Vigo", "Pororó", "Rusia"];
const SEPARACION_LON = 0.0045;
const SEPARACION_LAT = 0.004;
/** Ubicaciones registradas por m² en los datos simulados (un círculo de 400 m incluye unas 28). */
const M2_POR_UBICACION = 17_700;
/** Puntos de muestra por cuadra y por lado para calcular superposiciones y conteos. */
const MUESTRAS_POR_LADO = 12;

const PALETA = ["#13407A", "#1F6E3A", "#A98330", "#5B6B82", "#A8312A", "#3B5C8C"];

interface Grilla {
  nodo(v: number, h: number): Esquina;
  /** Coordenadas de grilla (fraccionarias) de un punto. */
  aGrilla(p: Punto): { v: number; h: number };
  desdeGrilla(v: number, h: number): Punto;
}

function grillaDe(centro: Punto): Grilla {
  const origen = {
    lon: centro.lon - ((CALLES_VERTICALES.length - 1) / 2) * SEPARACION_LON,
    lat: centro.lat + ((CALLES_HORIZONTALES.length - 1) / 2) * SEPARACION_LAT,
  };
  return {
    nodo: (v, h) => ({
      lon: origen.lon + v * SEPARACION_LON,
      lat: origen.lat - h * SEPARACION_LAT,
      calleA: CALLES_HORIZONTALES[h],
      calleB: CALLES_VERTICALES[v],
    }),
    aGrilla: (p) => ({ v: (p.lon - origen.lon) / SEPARACION_LON, h: (origen.lat - p.lat) / SEPARACION_LAT }),
    desdeGrilla: (v, h) => ({ lon: origen.lon + v * SEPARACION_LON, lat: origen.lat - h * SEPARACION_LAT }),
  };
}

function callesDe(grilla: Grilla): CalleMapa[] {
  const verticales = CALLES_VERTICALES.map((nombre, v) => ({
    nombre,
    trazo: [grilla.desdeGrilla(v, -0.8), grilla.desdeGrilla(v, CALLES_HORIZONTALES.length - 0.2)],
  }));
  const horizontales = CALLES_HORIZONTALES.map((nombre, h) => ({
    nombre,
    trazo: [grilla.desdeGrilla(-0.8, h), grilla.desdeGrilla(CALLES_VERTICALES.length - 0.2, h)],
  }));
  return [...verticales, ...horizontales];
}

function esquinaCercana(grilla: Grilla, punto: Punto): { esquina: Esquina; v: number; h: number } {
  const { v: vf, h: hf } = grilla.aGrilla(punto);
  const v = Math.min(CALLES_VERTICALES.length - 1, Math.max(0, Math.round(vf)));
  const h = Math.min(CALLES_HORIZONTALES.length - 1, Math.max(0, Math.round(hf)));
  return { esquina: grilla.nodo(v, h), v, h };
}

/** Tramo por las calles de la grilla: primero por la calle horizontal de `a` y después por la vertical de `b`. */
function tramoEntre(grilla: Grilla, a: Punto, b: Punto): Punto[] {
  const desde = esquinaCercana(grilla, a);
  const hasta = esquinaCercana(grilla, b);
  const puntos: Punto[] = [];
  const pasoV = Math.sign(hasta.v - desde.v);
  for (let v = desde.v; v !== hasta.v; v += pasoV) puntos.push(grilla.nodo(v, desde.h));
  const pasoH = Math.sign(hasta.h - desde.h);
  for (let h = desde.h; h !== hasta.h; h += pasoH) puntos.push(grilla.nodo(hasta.v, h));
  puntos.push(grilla.nodo(hasta.v, hasta.h));
  return puntos;
}

function esquinasEn(grilla: Grilla, indices: [number, number][]): Esquina[] {
  return indices.map(([v, h]) => grilla.nodo(v, h));
}

function poligonoPorCalles(grilla: Grilla, esquinas: Esquina[]): PoligonoGeojson {
  const camino: Punto[] = [];
  for (let i = 0; i < esquinas.length; i++) {
    const tramo = tramoEntre(grilla, esquinas[i], esquinas[(i + 1) % esquinas.length]);
    camino.push(...tramo.slice(0, -1));
  }
  return poligonoDePuntos(camino);
}

function zonaEsquinas(
  grilla: Grilla,
  datos: Omit<ZonaDeCiudad, "tipoForma" | "esquinas" | "poligonoGeojson">,
  indices: [number, number][],
): ZonaDeCiudad {
  const esquinas = esquinasEn(grilla, indices);
  return { ...datos, tipoForma: "ESQUINAS", esquinas, poligonoGeojson: poligonoPorCalles(grilla, esquinas) };
}

const CENTRO_MONTEVIDEO: Punto = { lon: -56.26, lat: -34.87 };
const CENTRO_LAS_PIEDRAS: Punto = { lon: -56.22, lat: -34.73 };
const CENTRO_CANELONES: Punto = { lon: -56.28, lat: -34.52 };

function armarCiudadMontevideo(): CiudadDeCampania {
  const g = grillaDe(CENTRO_MONTEVIDEO);
  const centroArena = g.desdeGrilla(5.5, 3.5);
  const zonas: ZonaDeCiudad[] = [
    zonaEsquinas(
      g,
      {
        id: "zona-cerro-norte",
        nombre: "Cerro Norte",
        color: PALETA[0],
        colportores: [
          { id: "col-1", nombre: "Diego Rocha" },
          { id: "col-4", nombre: "Joel Cabrera" },
        ],
        ubicacionesRegistradas: 142,
      },
      [[0, 0], [3, 0], [3, 1], [2, 1], [2, 2], [0, 2]],
    ),
    zonaEsquinas(
      g,
      {
        id: "zona-la-teja",
        nombre: "La Teja",
        color: PALETA[1],
        colportores: [
          { id: "col-2", nombre: "Melina Vázquez" },
          { id: "col-6", nombre: "Noelia Acosta" },
        ],
        ubicacionesRegistradas: 118,
      },
      [[4, 0], [7, 0], [7, 2], [5, 2], [5, 1], [4, 1]],
    ),
    {
      id: "zona-paso-de-la-arena",
      nombre: "Paso de la Arena",
      tipoForma: "RADIAL",
      color: PALETA[2],
      centro: centroArena,
      radioM: 600,
      poligonoGeojson: poligonoCircular(centroArena, 600),
      colportores: [{ id: "col-3", nombre: "Laura Suárez" }],
      ubicacionesRegistradas: 64,
    },
    zonaEsquinas(
      g,
      {
        id: "zona-belvedere",
        nombre: "Belvedere",
        color: PALETA[3],
        colportores: [],
        ubicacionesRegistradas: 21,
      },
      [[0, 3], [2, 3], [2, 4], [0, 4]],
    ),
  ];
  return {
    id: "ciudad-montevideo",
    catalogoId: "cat-montevideo",
    nombre: "Montevideo",
    centro: CENTRO_MONTEVIDEO,
    zoom: 13.4,
    calles: callesDe(g),
    zonas,
    colportores: [
      { id: "col-1", nombre: "Diego Rocha", zonaId: "zona-cerro-norte", zonaNombre: "Cerro Norte" },
      { id: "col-2", nombre: "Melina Vázquez", zonaId: "zona-la-teja", zonaNombre: "La Teja" },
      { id: "col-3", nombre: "Laura Suárez", zonaId: "zona-paso-de-la-arena", zonaNombre: "Paso de la Arena" },
      { id: "col-4", nombre: "Joel Cabrera", zonaId: "zona-cerro-norte", zonaNombre: "Cerro Norte" },
      { id: "col-5", nombre: "Pablo Ferreira", zonaId: null, zonaNombre: null },
      { id: "col-6", nombre: "Noelia Acosta", zonaId: "zona-la-teja", zonaNombre: "La Teja" },
      { id: "col-7", nombre: "Sergio Píriz", zonaId: null, zonaNombre: null, suspendido: true },
    ],
  };
}

function armarCiudadLasPiedras(): CiudadDeCampania {
  const g = grillaDe(CENTRO_LAS_PIEDRAS);
  const centroNorte = g.desdeGrilla(1.5, 1);
  const centroSur = g.desdeGrilla(5.5, 3);
  return {
    id: "ciudad-las-piedras",
    catalogoId: "cat-las-piedras",
    nombre: "Las Piedras",
    centro: CENTRO_LAS_PIEDRAS,
    zoom: 13.4,
    calles: callesDe(g),
    zonas: [
      {
        id: "zona-centro-las-piedras",
        nombre: "Centro",
        tipoForma: "RADIAL",
        color: PALETA[4],
        centro: centroNorte,
        radioM: 500,
        poligonoGeojson: poligonoCircular(centroNorte, 500),
        colportores: [],
        ubicacionesRegistradas: 38,
      },
      {
        id: "zona-barrio-sur-las-piedras",
        nombre: "Barrio Sur",
        tipoForma: "RADIAL",
        color: PALETA[5],
        centro: centroSur,
        radioM: 450,
        poligonoGeojson: poligonoCircular(centroSur, 450),
        colportores: [],
        ubicacionesRegistradas: 22,
      },
    ],
    colportores: [],
  };
}

function armarCiudadCanelones(): CiudadDeCampania {
  return {
    calles: callesDe(grillaDe(CENTRO_CANELONES)),
    id: "ciudad-canelones",
    catalogoId: "cat-canelones",
    nombre: "Canelones",
    centro: CENTRO_CANELONES,
    zoom: 13.4,
    zonas: [],
    colportores: [],
  };
}

export const MENSAJE_CUENTA_SUSPENDIDA = "Cuenta suspendida. Pedile a un administrador que la reactive.";

interface CiudadDeCatalogoSimulada extends CiudadDelCatalogo {
  centro: Punto;
}

/** Catálogo global inventado: las de la campaña salen de la búsqueda. */
const CATALOGO: CiudadDeCatalogoSimulada[] = [
  { id: "cat-montevideo", nombre: "Montevideo", provincia: "Montevideo", centro: CENTRO_MONTEVIDEO },
  { id: "cat-las-piedras", nombre: "Las Piedras", provincia: "Canelones", centro: CENTRO_LAS_PIEDRAS },
  { id: "cat-canelones", nombre: "Canelones", provincia: "Canelones", centro: CENTRO_CANELONES },
  { id: "cat-salto", nombre: "Salto", provincia: "Salto", centro: { lon: -57.96, lat: -31.39 } },
  { id: "cat-paysandu", nombre: "Paysandú", provincia: "Paysandú", centro: { lon: -58.08, lat: -32.32 } },
  { id: "cat-rivera", nombre: "Rivera", provincia: "Rivera", centro: { lon: -55.54, lat: -30.9 } },
  { id: "cat-maldonado", nombre: "Maldonado", provincia: "Maldonado", centro: { lon: -54.96, lat: -34.9 } },
  { id: "cat-colonia", nombre: "Colonia del Sacramento", provincia: "Colonia", centro: { lon: -57.84, lat: -34.47 } },
  { id: "cat-mercedes", nombre: "Mercedes", provincia: "Soriano", centro: { lon: -58.07, lat: -33.25 } },
  { id: "cat-melo", nombre: "Melo", provincia: "Cerro Largo", centro: { lon: -54.18, lat: -32.37 } },
  { id: "cat-tacuarembo", nombre: "Tacuarembó", provincia: "Tacuarembó", centro: { lon: -55.98, lat: -31.72 } },
  { id: "cat-durazno", nombre: "Durazno", provincia: "Durazno", centro: { lon: -56.52, lat: -33.38 } },
];

const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export const DATOS_ZONAS_SIMULADO: DatosZonas = {
  campaniaId: "campania-verano-2026",
  campania: "Verano 2026",
  ciudades: [armarCiudadMontevideo(), armarCiudadLasPiedras(), armarCiudadCanelones()],
};

function ciudadPorId(ciudadId: string): CiudadDeCampania {
  const ciudad = DATOS_ZONAS_SIMULADO.ciudades.find((c) => c.id === ciudadId);
  if (!ciudad) throw new Error(`Ciudad simulada inexistente: ${ciudadId}`);
  return ciudad;
}

function poligonoDeForma(grilla: Grilla, forma: FormaZona): PoligonoGeojson | null {
  if (forma.tipoForma === "RADIAL") {
    return forma.centro && forma.radioM ? poligonoCircular(forma.centro, forma.radioM) : null;
  }
  const esquinas = forma.esquinas ?? [];
  return forma.cerrada && esquinas.length >= 3 ? poligonoPorCalles(grilla, esquinas) : null;
}

/** Puntos de muestra repartidos por dentro de cada cuadra, nunca sobre una calle. */
function muestras(grilla: Grilla): Punto[] {
  const puntos: Punto[] = [];
  const desde = { v: -2, h: -2 };
  const hasta = { v: CALLES_VERTICALES.length + 1, h: CALLES_HORIZONTALES.length + 1 };
  for (let i = 0; i < (hasta.v - desde.v) * MUESTRAS_POR_LADO; i++) {
    for (let j = 0; j < (hasta.h - desde.h) * MUESTRAS_POR_LADO; j++) {
      puntos.push(grilla.desdeGrilla(desde.v + (i + 0.5) / MUESTRAS_POR_LADO, desde.h + (j + 0.5) / MUESTRAS_POR_LADO));
    }
  }
  return puntos;
}

function ubicacionesPorMuestras(cantidad: number, grilla: Grilla): number {
  const a = grilla.desdeGrilla(0, 0);
  const b = grilla.desdeGrilla(1 / MUESTRAS_POR_LADO, 1 / MUESTRAS_POR_LADO);
  const areaMuestra = distanciaM(a, { lon: b.lon, lat: a.lat }) * distanciaM(a, { lon: a.lon, lat: b.lat });
  return Math.round((cantidad * areaMuestra) / M2_POR_UBICACION);
}

function calleCompartida(a: Esquina, b: Esquina): string | null {
  const comunes = [a.calleA, a.calleB].filter((c) => c === b.calleA || c === b.calleB);
  return comunes.length === 1 ? comunes[0] : null;
}

function comparteCalle(forma: FormaZona, otras: ZonaDeCiudad[]): VistaPreviaZona["comparteCalle"] {
  const propias = forma.esquinas ?? [];
  for (const otra of otras) {
    const compartidas = propias.filter((e) => otra.esquinas?.some((o) => o.lon === e.lon && o.lat === e.lat));
    if (compartidas.length < 2) continue;
    const calle = calleCompartida(compartidas[0], compartidas[1]);
    if (!calle) continue;
    return {
      calle,
      zonaNombre: otra.nombre,
      punto: {
        lon: (compartidas[0].lon + compartidas[1].lon) / 2,
        lat: (compartidas[0].lat + compartidas[1].lat) / 2,
      },
    };
  }
  return null;
}

function vistaPrevia(entrada: VistaPreviaEntrada): VistaPreviaZona {
  const ciudad = ciudadPorId(entrada.ciudadId);
  const grilla = grillaDe(ciudad.centro);
  const poligono = poligonoDeForma(grilla, entrada.forma);
  if (!poligono) throw new Error("La forma todavía no está completa.");

  const otras = ciudad.zonas.filter((z) => z.id !== entrada.zonaId);
  const puntos = muestras(grilla);
  const dentroNueva = puntos.filter((p) => contiene(poligono, p));

  let superposicion: VistaPreviaZona["superposicion"] = null;
  for (const otra of otras) {
    const enConflicto = dentroNueva.filter((p) => contiene(otra.poligonoGeojson, p));
    if (enConflicto.length === 0) continue;
    const vs = vertices(poligono);
    const cerca = (medio: Punto) => enConflicto.some((p) => distanciaM(p, medio) < SEPARACION_LAT * 111_320 * 0.6);
    const tramo: Punto[] = [];
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i];
      const b = vs[(i + 1) % vs.length];
      if (cerca({ lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2 })) tramo.push(a, b);
    }
    superposicion = { zonaNombre: otra.nombre, tramo: tramo.length > 0 ? tramo : vs };
    break;
  }

  return {
    poligonoGeojson: poligono,
    ubicacionesIncluidas: ubicacionesPorMuestras(dentroNueva.length, grilla),
    superposicion,
    comparteCalle: superposicion ? null : comparteCalle(entrada.forma, otras),
  };
}

export const fuenteZonasSimulada: FuenteDatosZonas = {
  async obtenerZonas() {
    return DATOS_ZONAS_SIMULADO;
  },

  async esquinaMasCercana(ciudadId, punto) {
    return esquinaCercana(grillaDe(ciudadPorId(ciudadId).centro), punto).esquina;
  },

  async tramoPorCalles(ciudadId, desde, hasta) {
    return tramoEntre(grillaDe(ciudadPorId(ciudadId).centro), desde, hasta);
  },

  async vistaPreviaZona(entrada) {
    return vistaPrevia(entrada);
  },

  /** Simulado: valida como lo haría `guardar_zona` (nombre y repetidos) y devuelve la zona, sin persistirla. */
  async guardarZona(entrada) {
    const ciudad = ciudadPorId(entrada.ciudadId);
    const nombre = entrada.nombre.trim();
    if (nombre === "") return { ok: false, mensaje: "Poné un nombre para la zona." };
    if (ciudad.zonas.some((z) => z.id !== entrada.zonaId && z.nombre.toLowerCase() === nombre.toLowerCase())) {
      return { ok: false, mensaje: `Ya hay una zona llamada «${nombre}» en ${ciudad.nombre}.` };
    }
    // Las zonas se pueden superponer (S56): el guardado no lo rechaza.
    const previa = vistaPrevia({ ciudadId: entrada.ciudadId, zonaId: entrada.zonaId, forma: entrada.forma });
    const anterior = ciudad.zonas.find((z) => z.id === entrada.zonaId);
    const { forma } = entrada;
    return {
      ok: true,
      zona: {
        id: anterior?.id ?? `zona-${ciudad.zonas.length + 1}-${nombre.toLowerCase().replace(/\s+/g, "-")}`,
        nombre,
        tipoForma: forma.tipoForma,
        color: anterior?.color ?? PALETA[ciudad.zonas.length % PALETA.length],
        centro: forma.tipoForma === "RADIAL" ? forma.centro : undefined,
        radioM: forma.tipoForma === "RADIAL" ? forma.radioM : undefined,
        esquinas: forma.tipoForma === "ESQUINAS" ? forma.esquinas : undefined,
        poligonoGeojson: previa.poligonoGeojson,
        colportores: anterior?.colportores ?? [],
        ubicacionesRegistradas: previa.ubicacionesIncluidas,
      },
    };
  },

  /** Simulado: no persiste nada; la vista lleva su propio estado local. Rechaza a una cuenta suspendida. */
  async asignarZona(_campaniaId, usuarioId) {
    const persona = DATOS_ZONAS_SIMULADO.ciudades.flatMap((c) => c.colportores).find((p) => p.id === usuarioId);
    if (persona?.suspendido) return { ok: false, mensaje: MENSAJE_CUENTA_SUSPENDIDA };
    return { ok: true };
  },

  async quitarZona() {
    return { ok: true };
  },

  async eliminarZona(_campaniaId, zonaId) {
    const zona = DATOS_ZONAS_SIMULADO.ciudades.flatMap((c) => c.zonas).find((z) => z.id === zonaId);
    return { ok: true, colportoresSinZona: zona?.colportores.length ?? 0 };
  },

  async buscarCiudades(_campaniaId, texto) {
    const enCampania = new Set(DATOS_ZONAS_SIMULADO.ciudades.map((c) => c.catalogoId));
    const buscado = sinTildes(texto.trim());
    return CATALOGO.filter(
      (c) => !enCampania.has(c.id) && (buscado === "" || sinTildes(`${c.nombre} ${c.provincia}`).includes(buscado)),
    ).map(({ id, nombre, provincia }) => ({ id, nombre, provincia }));
  },

  async agregarCiudad(_campaniaId, catalogoId) {
    const elegida = CATALOGO.find((c) => c.id === catalogoId);
    if (!elegida) return { ok: false, mensaje: "Esa ciudad ya no está en el catálogo." };
    return {
      ok: true,
      ciudad: {
        id: `ciudad-${elegida.id.replace(/^cat-/, "")}`,
        catalogoId: elegida.id,
        nombre: elegida.nombre,
        centro: elegida.centro,
        zoom: 13.4,
        calles: callesDe(grillaDe(elegida.centro)),
        zonas: [],
        colportores: [],
      },
    };
  },
};
