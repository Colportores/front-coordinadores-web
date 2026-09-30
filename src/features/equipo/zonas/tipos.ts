import type { CiudadDeCampania, Esquina, PoligonoGeojson, Punto, ZonaDeCiudad } from "@/datos/equipo/zonas";

/** Lo que el coordinador está dibujando, listo para pintarlo sobre el mapa. */
export interface DibujoEnMapa {
  /** Forma cerrada (o círculo) tal como la calculó el backend. */
  poligono: PoligonoGeojson | null;
  /** Camino abierto entre las esquinas ya marcadas. */
  linea: Punto[];
  esquinas: Esquina[];
  centro: Punto | null;
  radioM: number | null;
  /** Tramo que se superpone con otra zona, para marcarlo en rojo. */
  conflicto: Punto[] | null;
  /** Nombre y medida de la zona radial en curso, en su centro («Casabó · 400 m»). */
  rotuloCentro: { nombre: string; detalle: string } | null;
  /** «Pororó y Heredia · clic para agregar», junto a la esquina más cercana al puntero. */
  etiqueta: { punto: Punto; texto: string } | null;
  /** «Comparte la calle Heredia con Belvedere». */
  comparte: { punto: Punto; texto: string } | null;
}

export interface PropsMapaZonas {
  ciudad: CiudadDeCampania;
  zonas: ZonaDeCiudad[];
  zonaElegidaId: string | null;
  /** `null` cuando no se está dibujando: el clic elige zonas. */
  dibujo: DibujoEnMapa | null;
  onZonaClick(zonaId: string): void;
  onMapaClick(punto: Punto): void;
  onMapaMove(punto: Punto): void;
  onRadio(radioM: number): void;
}
