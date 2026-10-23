import type { ResultadoAcompanamiento, ResultadoBeca, ResultadoJornadas, TipoDeBeca } from "@/datos/equipo/contrato";

/**
 * Lo que la vista 33 le pide al servidor después de abrirse (server actions): las jornadas entre las que elegir,
 * registrar el acompañamiento, y elegir la carrera o el tipo de beca de un colportor. `campaniaId` queda atado a cada acción, el navegador no lo puede cambiar. Un rechazo de la
 * regla vuelve como `ok: false`; una falla de conexión, como excepción.
 */
export interface AccionesEquipo {
  jornadasParaAcompanar(colportorId: string): Promise<ResultadoJornadas>;
  registrarAcompanamiento(jornadaId: string): Promise<ResultadoAcompanamiento>;
  elegirCarrera(colportorId: string, carreraId: string): Promise<ResultadoBeca>;
  asignarTipoDeBeca(colportorId: string, tipo: TipoDeBeca): Promise<ResultadoBeca>;
}
