/**
 * Vista 34 sin campaña: el coordinador no tiene una campaña en curso ni por empezar. Sin artboard: texto provisorio
 * (pendiente mapa §2, `front-coordinadores-web-65-impl-*`). Mismo patrón que `SinCampaniaParaEquipo`.
 */
export function SinCampaniaParaStock() {
  return (
    <div className="m-[22px] flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <p role="status" className="text-nav text-tinta">
        No tenés una campaña en curso ni por empezar. Cuando tengas una, vas a ver acá el stock de cada ciudad.
      </p>
    </div>
  );
}
