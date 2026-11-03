/**
 * Vista 32 sin campaña que consultar: el coordinador no tiene una campaña en curso ni una terminada. Sin artboard:
 * texto provisorio (pendiente mapa §2, `front-coordinadores-web-60-impl-*`). Mismo patrón que `SinCampaniaParaZonas`.
 */
export function SinCampaniaParaReportes() {
  return (
    <div className="flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <p role="status" className="text-nav text-tinta">
        Todavía no tenés una campaña con horas para mostrar. Cuando tengas una, vas a ver acá las horas de cada ciudad y de cada colportor.
      </p>
    </div>
  );
}
