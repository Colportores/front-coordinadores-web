import type { PoligonoGeojson, Punto } from "@/datos/equipo/zonas/contrato";

/**
 * Geometría mínima para dibujar y para los datos simulados. El cálculo real
 * (validez, superposición, conteo) lo hace PostGIS en el backend (ADR-018).
 */

const METROS_POR_GRADO_LAT = 111_320;
/** Lados del círculo de una zona radial (128 en `0008`; 64 alcanza para dibujar). */
export const LADOS_CIRCULO = 64;

function metrosPorGradoLon(lat: number): number {
  return METROS_POR_GRADO_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Distancia en metros entre dos puntos (plano local: sobra para distancias de una ciudad). */
export function distanciaM(a: Punto, b: Punto): number {
  const dx = (b.lon - a.lon) * metrosPorGradoLon((a.lat + b.lat) / 2);
  const dy = (b.lat - a.lat) * METROS_POR_GRADO_LAT;
  return Math.hypot(dx, dy);
}

/** Punto a `metros` de `centro` hacia el este (`angulo` en radianes, 0 = este). */
export function puntoADistancia(centro: Punto, metros: number, angulo = 0): Punto {
  return {
    lon: centro.lon + (metros * Math.cos(angulo)) / metrosPorGradoLon(centro.lat),
    lat: centro.lat + (metros * Math.sin(angulo)) / METROS_POR_GRADO_LAT,
  };
}

export function poligonoDePuntos(puntos: Punto[]): PoligonoGeojson {
  const anillo = puntos.map((p): [number, number] => [p.lon, p.lat]);
  const primero = anillo[0];
  if (primero && (anillo.at(-1)?.[0] !== primero[0] || anillo.at(-1)?.[1] !== primero[1])) anillo.push(primero);
  return { type: "Polygon", coordinates: [anillo] };
}

export function poligonoCircular(centro: Punto, radioM: number): PoligonoGeojson {
  const puntos = Array.from({ length: LADOS_CIRCULO }, (_, i) =>
    puntoADistancia(centro, radioM, (2 * Math.PI * i) / LADOS_CIRCULO),
  );
  return poligonoDePuntos(puntos);
}

/** Vértices del anillo exterior sin repetir el último. */
export function vertices(poligono: PoligonoGeojson): Punto[] {
  const anillo = poligono.coordinates[0] ?? [];
  return anillo.slice(0, -1).map(([lon, lat]) => ({ lon, lat }));
}

/** Punto en polígono (par-impar). Un punto sobre el borde puede caer de cualquier lado. */
export function contiene(poligono: PoligonoGeojson, p: Punto): boolean {
  const vs = vertices(poligono);
  let dentro = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const a = vs[i];
    const b = vs[j];
    const cruza = a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}
