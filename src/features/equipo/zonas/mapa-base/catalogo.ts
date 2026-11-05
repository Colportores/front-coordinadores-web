import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

/**
 * El mapa de fondo del panel (ADR-011): un PMTiles de OpenStreetMap por ciudad, publicado en el bucket público `mapas` de
 * Supabase Storage, y un estilo MapLibre compartido con la app (`estilo/colportores.json`). Este módulo es puro: lee el
 * catálogo (`catalogo.json`), elige el paquete de una ciudad y le pone al estilo la URL de sus archivos.
 * Contrato del bucket: `docs/mapas-tiles.md` de backend-supabase.
 */

/** El catálogo o el estilo no tienen la forma que dice el contrato. */
export class MapaBaseInvalido extends Error {}

export interface PaqueteDeMapa {
  /** El id de la ciudad en `public.ciudad` (`CiudadDeCampania.catalogoId`). */
  ambitoId: string;
  nombre: string;
  /** URL absoluta de cada archivo `.pmtiles` (uno, o varios si la ciudad no entró en 50 MB). */
  partes: string[];
}

export interface CatalogoDeMapas {
  /** URL absoluta de `estilo/colportores.json`. */
  estiloUrl: string;
  paquetes: PaqueteDeMapa[];
}

/** Nombre de la fuente de tiles dentro del estilo publicado; trae `pmtiles://REEMPLAZAR` hasta que el cliente la completa. */
export const FUENTE_DE_TILES = "protomaps";

export function urlDelCatalogo(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/mapas/catalogo.json`;
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

/** Una ruta del catálogo es relativa a la URL del catálogo y tiene que quedar en el mismo bucket: nada de salir a otro origen. */
function resolver(ruta: unknown, urlCatalogo: string): string | null {
  if (typeof ruta !== "string" || ruta === "") return null;
  try {
    const base = new URL(urlCatalogo);
    const url = new URL(ruta, base);
    const carpeta = base.pathname.slice(0, base.pathname.lastIndexOf("/") + 1);
    return url.origin === base.origin && url.pathname.startsWith(carpeta) ? url.href : null;
  } catch {
    return null;
  }
}

export function leerCatalogo(json: unknown, urlCatalogo: string): CatalogoDeMapas {
  if (!esObjeto(json) || !Array.isArray(json.paquetes) || !esObjeto(json.estilo)) {
    throw new MapaBaseInvalido("El catálogo de mapas no trae `estilo` y `paquetes`.");
  }
  const estiloUrl = resolver(json.estilo.url, urlCatalogo);
  if (estiloUrl === null) throw new MapaBaseInvalido("El catálogo de mapas no dice dónde está el estilo.");

  const paquetes: PaqueteDeMapa[] = [];
  for (const crudo of json.paquetes) {
    // Un paquete mal armado se saltea: no tiene que dejar sin mapa a las ciudades que sí están bien.
    if (!esObjeto(crudo) || crudo.nivel !== "ciudad" || typeof crudo.ambito_id !== "string" || !Array.isArray(crudo.partes)) continue;
    const partes = crudo.partes.map((p) => (esObjeto(p) ? resolver(p.archivo, urlCatalogo) : null));
    if (partes.length === 0 || partes.some((p) => p === null)) continue;
    paquetes.push({
      ambitoId: crudo.ambito_id,
      nombre: typeof crudo.nombre === "string" ? crudo.nombre : "",
      partes: partes as string[],
    });
  }
  return { estiloUrl, paquetes };
}

export function paqueteDeCiudad(catalogo: CatalogoDeMapas, catalogoId: string): PaqueteDeMapa | null {
  return catalogo.paquetes.find((p) => p.ambitoId === catalogoId) ?? null;
}

const nombreDeFuente = (indice: number) => (indice === 0 ? FUENTE_DE_TILES : `${FUENTE_DE_TILES}-${indice + 1}`);

/**
 * Al estilo publicado le falta el archivo de tiles: `sources.protomaps.url` trae `pmtiles://REEMPLAZAR`. Se completa con el
 * paquete de la ciudad. Con varias partes, MapLibre necesita una fuente por parte y las capas repetidas sobre cada una.
 * Glyphs y sprites ya vienen con la URL absoluta del bucket, que es lo que necesita el panel (la app, en cambio, los lleva adentro).
 */
export function estiloConPaquete(estilo: unknown, paquete: PaqueteDeMapa): StyleSpecification {
  if (!esObjeto(estilo) || !esObjeto(estilo.sources) || !esObjeto(estilo.sources[FUENTE_DE_TILES]) || !Array.isArray(estilo.layers)) {
    throw new MapaBaseInvalido("El estilo del mapa no trae la fuente de tiles esperada.");
  }
  const fuenteBase = estilo.sources[FUENTE_DE_TILES];
  const sources: Record<string, unknown> = { ...estilo.sources };
  paquete.partes.forEach((parte, i) => {
    sources[nombreDeFuente(i)] = { ...fuenteBase, url: `pmtiles://${parte}` };
  });
  const layers = (estilo.layers as LayerSpecification[]).flatMap((capa) => {
    if (!("source" in capa) || capa.source !== FUENTE_DE_TILES) return [capa];
    return paquete.partes.map((_, i) => (i === 0 ? capa : ({ ...capa, id: `${capa.id}~${i + 1}`, source: nombreDeFuente(i) } as LayerSpecification)));
  });
  return { ...estilo, sources, layers } as unknown as StyleSpecification;
}
