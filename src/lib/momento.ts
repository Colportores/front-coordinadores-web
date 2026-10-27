/**
 * Un momento (marca de tiempo ISO que manda la base) como «22/10 a las 18:30», en la hora de Montevideo; si no es del año en curso, con el año («02/01/2024 a las 00:04»): es la hora de
 * quien carga los datos, y así el servidor y el navegador escriben lo mismo (sin diferencias de hidratación).
 */

const EN_MONTEVIDEO = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Montevideo",
  year: "numeric",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** `null` si el valor no es una fecha con hora válida: quien lo llama dice qué mostrar en su lugar. */
export function fechaYHoraEnMontevideo(iso: string | null, ahora: Date = new Date()): string | null {
  if (iso === null) return null;
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return null;
  const partes = Object.fromEntries(EN_MONTEVIDEO.formatToParts(instante).map((p) => [p.type, p.value]));
  // El año se compara en Montevideo: el 31/12 a las 22:00 de allá ya es 01/01 en UTC.
  const esteAnio = EN_MONTEVIDEO.formatToParts(ahora).find((p) => p.type === "year")?.value;
  const dia = partes.year === esteAnio ? `${partes.day}/${partes.month}` : `${partes.day}/${partes.month}/${partes.year}`;
  return `${dia} a las ${partes.hour}:${partes.minute}`;
}
