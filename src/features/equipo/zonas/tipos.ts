import type { CasaDeCiudad, CiudadDeCampania, Esquina, PoligonoGeojson, Punto, ZonaDeCiudad } from "@/datos/equipo/zonas";

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

/** Los puntos de las casas sobre el mapa (diseño 24P). */
export interface CasasEnMapa {
  /** Las de la ciudad, ya sin los estados que se destildaron en la leyenda. */
  casas: CasaDeCiudad[];
  /** La casa con la tarjeta abierta. */
  elegidaId: string | null;
  /** Elegir una casa abre su tarjeta; `null` la cierra. */
  onElegir(casaId: string | null): void;
  /** El mapa avisa si, por la cantidad a la vista, agrupó los puntos (la vista pone el aviso «Acercá el mapa…»). */
  onAgrupadas(agrupadas: boolean): void;
}

export interface PropsMapaZonas {
  ciudad: CiudadDeCampania;
  zonas: ZonaDeCiudad[];
  zonaElegidaId: string | null;
  /** `null` cuando no se está dibujando: el clic elige zonas. */
  dibujo: DibujoEnMapa | null;
  /** Sin esta prop el mapa no dibuja casas. */
  casas?: CasasEnMapa;
  onZonaClick(zonaId: string): void;
  onMapaClick(punto: Punto): void;
  onMapaMove(punto: Punto): void;
  onRadio(radioM: number): void;
  /**
   * El centro de la zona radial se movió a mano (#179): arrastrándolo (`soltado` es `false` mientras se arrastra y `true`
   * al soltarlo) o con las flechas del teclado (siempre `true`). Sin esta prop el centro no se puede mover desde el mapa.
   */
  onCentro?(punto: Punto, soltado: boolean): void;
}

/** Lo que se le dice al coordinador de una cuenta suspendida: no se le puede asignar zona (decisión del 30/09, coord #20). */
export const TEXTO_CUENTA_SUSPENDIDA = "Cuenta suspendida. Pedile a un administrador que la reactive.";

/** «Pororó y Heredia». Una esquina sin calles conocidas (`calle_a` y `calle_b` nulables en la base) no inventa nombres. */
export function nombreEsquina(esquina: Esquina): string {
  return [esquina.calleA, esquina.calleB].filter((calle) => calle !== "").join(" y ") || "Esquina sin nombre de calles";
}
