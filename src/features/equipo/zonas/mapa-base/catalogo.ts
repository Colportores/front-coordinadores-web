import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { sinBarrasFinales } from "@/lib/texto";

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
  return `${sinBarrasFinales(supabaseUrl)}/storage/v1/object/public/mapas/catalogo.json`;
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

/** El formato de `catalogo.json` que entiende el panel (el campo `version` del catálogo). */
export const FORMATO_DEL_CATALOGO = 1;

const ID_VALIDO = /^[A-Za-z0-9_-]{1,80}$/;
const SHA256_VALIDO = /^[0-9a-fA-F]{64}$/;
const NIVELES = new Set(["ciudad", "departamento", "uruguay"]);

/**
 * Las reglas del celular (`catalogo_tiles_model.dart`), las mismas en las dos apps (decisión del 10/11, lib-mapa#9 P5): la ruta
 * es relativa y simple. Nada de esquema (`https:`), `//host`, `/` al principio, `?`, `#` ni segmentos `.` o `..`.
 */
function esRutaSimple(ruta: string): boolean {
  return (
    ruta !== "" &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(ruta) &&
    !ruta.startsWith("/") &&
    !ruta.includes("?") &&
    !ruta.includes("#") &&
    !ruta.includes("\\") &&
    !ruta.split("/").some((s) => s === "." || s === "..")
  );
}

/** Una ruta del catálogo es relativa a la URL del catálogo y tiene que quedar en el mismo bucket: nada de salir a otro origen. */
function resolver(ruta: unknown, urlCatalogo: string): string | null {
  if (typeof ruta !== "string" || !esRutaSimple(ruta)) return null;
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
  // Un formato que el panel no conoce puede querer decir otra cosa con los mismos campos: no se adivina.
  if (json.version !== FORMATO_DEL_CATALOGO) throw new MapaBaseInvalido("El catálogo de mapas tiene un formato que el panel no conoce.");
  const estiloUrl = resolver(json.estilo.url, urlCatalogo);
  if (estiloUrl === null) throw new MapaBaseInvalido("El catálogo de mapas no dice dónde está el estilo.");

  const paquetes: PaqueteDeMapa[] = [];
  const vistos = new Set<string>();
  for (const crudo of json.paquetes) {
    // Un paquete mal armado se saltea: no tiene que dejar sin mapa a las ciudades que sí están bien.
    const leido = leerPaquete(crudo, urlCatalogo);
    if (leido === null) continue;
    // Dos paquetes con el mismo id: vale el primero, como en el celular.
    if (vistos.has(leido.id)) continue;
    vistos.add(leido.id);
    if (leido.nivel === "ciudad") paquetes.push(leido.paquete);
  }
  return { estiloUrl, paquetes };
}

/** Un paquete del catálogo con todo lo que pide el contrato (id, nivel, ámbito, versión y partes con tamaño y sha256), o `null`. */
function leerPaquete(crudo: unknown, urlCatalogo: string): { id: string; nivel: string; paquete: PaqueteDeMapa } | null {
  if (!esObjeto(crudo) || typeof crudo.id !== "string" || !ID_VALIDO.test(crudo.id)) return null;
  if (typeof crudo.nivel !== "string" || !NIVELES.has(crudo.nivel)) return null;
  const ambitoId = typeof crudo.ambito_id === "string" ? crudo.ambito_id.trim() : "";
  if (crudo.nivel !== "uruguay" && ambitoId === "") return null;
  if (typeof crudo.version !== "string" || crudo.version.trim() === "") return null;
  if (!Array.isArray(crudo.partes) || crudo.partes.length === 0) return null;
  const partes: string[] = [];
  for (const parte of crudo.partes) {
    if (!esObjeto(parte)) return null;
    if (!Number.isInteger(parte.tamano_bytes) || (parte.tamano_bytes as number) <= 0) return null;
    if (typeof parte.sha256 !== "string" || !SHA256_VALIDO.test(parte.sha256)) return null;
    // Si una sola parte es mala se descarta el paquete entero: no se dibuja media ciudad.
    const url = resolver(parte.archivo, urlCatalogo);
    if (url === null) return null;
    partes.push(url);
  }
  const nombre = typeof crudo.nombre === "string" ? crudo.nombre.trim() : "";
  return { id: crudo.id, nivel: crudo.nivel, paquete: { ambitoId, nombre, partes } };
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
