/**
 * Un momento (marca de tiempo ISO que manda la base) como «22/10 a las 18:30», en la hora de Montevideo: es la hora de
 * quien carga los datos, y así el servidor y el navegador escriben lo mismo (sin diferencias de hidratación).
 */

const EN_MONTEVIDEO = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Montevideo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** `null` si el valor no es una fecha con hora válida: quien lo llama dice qué mostrar en su lugar. */
export function fechaYHoraEnMontevideo(iso: string | null): string | null {
  if (iso === null) return null;
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return null;
  const partes = Object.fromEntries(EN_MONTEVIDEO.formatToParts(instante).map((p) => [p.type, p.value]));
  return `${partes.day}/${partes.month} a las ${partes.hour}:${partes.minute}`;
}
