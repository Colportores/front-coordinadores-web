import type { CasaDeCiudad, EstadoDeCasa, TipoDeCasa } from "@/datos/equipo/zonas";

/**
 * Cómo se ve cada estado de una casa en la vista 24 (diseño 24P·01, `ST` del canvas): el mismo glifo y forma que en el mapa
 * del celular (vista 06). Círculo = visita; cuadrado = venta y cobro. El color nunca va solo: lo acompaña el glifo y la forma.
 */
export interface EstadoVisual {
  clave: EstadoDeCasa;
  nombre: string;
  forma: "circulo" | "cuadrado";
  /** Color de relleno (o, en «Sin visita», el del borde). `fondo` puede ser un degradado de rayas. */
  color: string;
  fondo: string;
  /** Borde del círculo sin visita; los demás no llevan. */
  borde: boolean;
  texto: string;
  glifo: string;
}

/** El orden de la leyenda del canvas: de la visita a la venta. */
export const ESTADOS_VISUALES: readonly EstadoVisual[] = [
  { clave: "SIN_VISITA", nombre: "Sin visita", forma: "circulo", color: "#6B7688", fondo: "#FFFFFF", borde: true, texto: "#6B7688", glifo: "" },
  { clave: "SIN_CONTESTAR", nombre: "No contestó", forma: "circulo", color: "#6B7688", fondo: "#6B7688", borde: false, texto: "#FFFFFF", glifo: "–" },
  { clave: "ENTREVISTA_PROGRAMADA", nombre: "Entrevista agendada", forma: "circulo", color: "#E0B43C", fondo: "#E0B43C", borde: false, texto: "#0E1A2B", glifo: "◷" },
  { clave: "ENTREVISTA_SIN_VENTA", nombre: "Entrevista hecha", forma: "circulo", color: "#1F6E3A", fondo: "#1F6E3A", borde: false, texto: "#FFFFFF", glifo: "✓" },
  { clave: "RECHAZO", nombre: "Rechazó", forma: "circulo", color: "#A8312A", fondo: "#A8312A", borde: false, texto: "#FFFFFF", glifo: "✕" },
  { clave: "COBRANZA_PENDIENTE", nombre: "Cobranza pendiente", forma: "cuadrado", color: "#13407A", fondo: "#13407A", borde: false, texto: "#FFFFFF", glifo: "$" },
  {
    clave: "ENTREGA_Y_COBRANZA_PENDIENTE",
    nombre: "Entrega y pago",
    forma: "cuadrado",
    color: "#13407A",
    fondo: "repeating-linear-gradient(135deg,#13407A 0 4px,#5C82B8 4px 7px)",
    borde: false,
    texto: "#FFFFFF",
    glifo: "⇢",
  },
  { clave: "VENTA_COMPLETA", nombre: "Venta completa", forma: "cuadrado", color: "#1F6E3A", fondo: "#1F6E3A", borde: false, texto: "#FFFFFF", glifo: "★" },
];

const POR_CLAVE = new Map(ESTADOS_VISUALES.map((e) => [e.clave, e]));

export function estadoVisual(clave: EstadoDeCasa): EstadoVisual {
  const visual = POR_CLAVE.get(clave);
  if (!visual) throw new Error(`Estado de casa sin diseño: ${clave}`);
  return visual;
}

export function textoDeTipo(tipo: TipoDeCasa): string {
  return tipo === "CASA" ? "Casa" : tipo === "NEGOCIO" ? "Negocio" : "Edificio";
}

/** Cuántas casas hay de cada estado; los estados sin casas cuentan 0. */
export function contarPorEstado(casas: readonly CasaDeCiudad[]): Record<EstadoDeCasa, number> {
  const cuenta = Object.fromEntries(ESTADOS_VISUALES.map((e) => [e.clave, 0])) as Record<EstadoDeCasa, number>;
  for (const casa of casas) cuenta[casa.estado]++;
  return cuenta;
}

/** Las casas cuyo estado no se destildó en la leyenda. */
export function sinOcultas(casas: readonly CasaDeCiudad[], ocultos: ReadonlySet<EstadoDeCasa>): CasaDeCiudad[] {
  return ocultos.size === 0 ? [...casas] : casas.filter((c) => !ocultos.has(c.estado));
}

/** «150 casas», «1 casa» o, con estados destildados, «26 de 150 casas». */
export function textoTotalDeCasas(total: number, mostradas: number): string {
  const casas = total === 1 ? "1 casa" : `${total} casas`;
  return mostradas === total ? casas : `${mostradas} de ${casas}`;
}

const HORA_EN_MONTEVIDEO = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Montevideo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** «14:20», en la hora de Montevideo. */
export function horaEnMontevideo(instante: Date): string {
  return HORA_EN_MONTEVIDEO.format(instante);
}

/** Más de esto en pantalla y los puntos se agrupan (regla R2 del diseño 24P·04, como en el celular: HU-UBI-003). */
export const MAX_CASAS_SIN_AGRUPAR = 200;

export interface CajaDelMapa {
  oeste: number;
  sur: number;
  este: number;
  norte: number;
}

export function estaEnLaCaja(casa: Pick<CasaDeCiudad, "lon" | "lat">, caja: CajaDelMapa): boolean {
  return casa.lon >= caja.oeste && casa.lon <= caja.este && casa.lat >= caja.sur && casa.lat <= caja.norte;
}

/**
 * Qué se dibuja: los puntos de a uno (hasta `MAX_CASAS_SIN_AGRUPAR` a la vista) o agrupados. Sin saber todavía qué abarca el
 * mapa (`caja` nula) se cuenta todo, para no armar miles de puntos de entrada.
 */
export function decidirAgrupado(casas: readonly CasaDeCiudad[], caja: CajaDelMapa | null): { agrupar: boolean; visibles: CasaDeCiudad[] } {
  const visibles = caja ? casas.filter((c) => estaEnLaCaja(c, caja)) : [...casas];
  return { agrupar: visibles.length > MAX_CASAS_SIN_AGRUPAR, visibles };
}
