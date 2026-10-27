import type { Tendencia } from "./calculo";

/**
 * «▲ 10%» al lado de una cifra. La flecha y el número dicen la dirección; no hay verde ni rojo (el diseño no
 * juzga si subir es bueno). El lector de pantalla lee la frase, no el triángulo.
 */
export function TendenciaDeCifra({ tendencia }: { tendencia: Tendencia | null }) {
  if (!tendencia) return null;
  return (
    <>
      <span aria-hidden="true">{tendencia.texto}</span>
      <span className="sr-only">{tendencia.textoAccesible}</span>
    </>
  );
}
