import type { DatosDeAcompanamiento, ResultadoAcompanamiento, ResultadoJornadas } from "@/datos/equipo/contrato";

/**
 * Lo que la vista 33 le pide al servidor después de abrirse (server actions): las jornadas entre las que elegir y
 * registrar el acompañamiento (a nombre de la coordinación o de otro colportor, con una nota opcional). `campaniaId` queda atado a cada acción, el navegador no lo puede cambiar. Un rechazo de la
 * regla vuelve como `ok: false`; una falla de conexión, como excepción.
 */
export interface AccionesEquipo {
  jornadasParaAcompanar(colportorId: string): Promise<ResultadoJornadas>;
  registrarAcompanamiento(jornadaId: string, datos?: DatosDeAcompanamiento): Promise<ResultadoAcompanamiento>;
}
