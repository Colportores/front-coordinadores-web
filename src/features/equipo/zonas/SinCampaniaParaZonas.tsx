/**
 * Vista 24 sin campaña con la que armar zonas: el coordinador no tiene una campaña en curso ni por empezar (la
 * última terminó o todavía no le asignaron ninguna). Sin artboard: texto provisorio (pendiente mapa §2,
 * `front-coordinadores-web-40-impl-*`). Mismo patrón que `SinCampaniaParaAnadir` y `error.tsx`.
 */
export function SinCampaniaParaZonas() {
  return (
    <div className="flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <p role="status" className="text-nav text-tinta">
        No tenés una campaña en curso ni por empezar. Cuando tengas una, vas a poder armar acá sus ciudades y zonas.
      </p>
    </div>
  );
}
