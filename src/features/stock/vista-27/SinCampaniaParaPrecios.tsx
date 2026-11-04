/**
 * Vista 27 sin campaña: el coordinador no tiene una campaña en curso ni por empezar. Sin artboard: texto provisorio (mismo
 * patrón que `SinCampaniaParaStock`).
 */
export function SinCampaniaParaPrecios() {
  return (
    <div className="flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <p role="status" className="text-nav text-tinta">
        No tenés una campaña en curso ni por empezar. Cuando tengas una, vas a ver acá los precios de venta de sus ciudades.
      </p>
    </div>
  );
}
