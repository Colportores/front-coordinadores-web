import { ESTADOS_DE_CASA } from "@colportores/lib-mapa/tokens";

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

type TokenDeEstado = (typeof ESTADOS_DE_CASA)[number];

/** Las franjas a 135° de «Entrega y pago»: `anchoOscura` px del relleno y `anchoClara` px de la clara (token `franjas`). */
function fondoDe(token: TokenDeEstado): string {
  const franjas = token.franjas;
  if (franjas === null) return token.relleno;
  const corte = franjas.anchoOscura;
  const total = franjas.anchoOscura + franjas.anchoClara;
  return `repeating-linear-gradient(${franjas.angulo}deg,${token.relleno} 0 ${corte}px,${franjas.clara} ${corte}px ${total}px)`;
}

/**
 * El orden de la leyenda del canvas: de la visita a la venta. Los colores, formas y glifos salen de los tokens de `lib-mapa`
 * (`estadosDeCasa`), los mismos que dibuja el celular.
 */
export const ESTADOS_VISUALES: readonly EstadoVisual[] = ESTADOS_DE_CASA.map(
  (token): EstadoVisual => ({
    clave: token.clave,
    nombre: token.nombre,
    forma: token.forma,
    // «Sin visita» es el único con contorno: su color es el del borde, sobre un relleno blanco.
    color: token.borde ?? token.relleno,
    fondo: fondoDe(token),
    borde: token.borde !== null,
    texto: token.tinta,
    glifo: token.glifo,
  }),
);

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
