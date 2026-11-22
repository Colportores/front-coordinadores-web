import type { Tendencia } from "./calculo";

/** El color de la flecha cuando la cifra «juzga» (#188): verde si sube, rojo si baja; igual, sin color propio. */
const COLOR_DE_SENTIDO: Record<Tendencia["sentido"], string | undefined> = { sube: "text-exito", baja: "text-peligro", igual: undefined };

/**
 * «▲ 10%» al lado de una cifra. La flecha y el número dicen la dirección; el color la refuerza solo donde se pide
 * (`conColor`: las columnas de horas, presentaciones, ventas y monto de la tabla, #188) y nunca es el único indicador. El
 * lector de pantalla lee la frase, no el triángulo.
 */
export function TendenciaDeCifra({ tendencia, conColor = false }: { tendencia: Tendencia | null; conColor?: boolean }) {
  if (!tendencia) return null;
  return (
    <>
      <span aria-hidden="true" className={conColor ? COLOR_DE_SENTIDO[tendencia.sentido] : undefined}>
        {tendencia.texto}
      </span>
      <span className="sr-only">{tendencia.textoAccesible}</span>
    </>
  );
}
