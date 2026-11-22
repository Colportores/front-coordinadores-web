import type {
  DatosDeAcompanamiento,
  ResultadoAcompanamiento,
  ResultadoAcompanantes,
  ResultadoBeca,
  ResultadoJornadas,
  TipoDeBeca,
} from "@/datos/equipo/contrato";

/**
 * Lo que la vista 33 le pide al servidor después de abrirse (server actions): las jornadas entre las que elegir,
 * registrar el acompañamiento (a nombre de la coordinación o de otro colportor, con una nota opcional), y elegir la carrera o el tipo de beca de un colportor. `campaniaId` queda atado a cada acción, el navegador no lo puede cambiar. Un rechazo de la
 * regla vuelve como `ok: false`; una falla de conexión, como excepción.
 */
export interface AccionesEquipo {
  /**
   * Los coordinadores y administradores para «Quién lo acompañó». Opcional: sin ella (o si falla) el selector ofrece solo
   * a los colportores de la campaña, como antes.
   */
  acompanantesDelPanel?(): Promise<ResultadoAcompanantes>;
  jornadasParaAcompanar(colportorId: string): Promise<ResultadoJornadas>;
  registrarAcompanamiento(jornadaId: string, datos?: DatosDeAcompanamiento): Promise<ResultadoAcompanamiento>;
  elegirCarrera(colportorId: string, carreraId: string): Promise<ResultadoBeca>;
  asignarTipoDeBeca(colportorId: string, tipo: TipoDeBeca | null): Promise<ResultadoBeca>;
}
