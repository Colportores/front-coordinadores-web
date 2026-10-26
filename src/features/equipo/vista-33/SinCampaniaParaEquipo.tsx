/**
 * Vista 33 sin campaña: el coordinador no tiene una campaña en curso ni por empezar (la última terminó o todavía no le
 * asignaron ninguna). Sin artboard: texto provisorio (pendiente mapa §2, `front-coordinadores-web-63-impl-*`). Mismo
 * patrón que `SinCampaniaParaZonas` y `SinCampaniaParaAnadir`.
 */
export function SinCampaniaParaEquipo() {
  return (
    <div className="m-[22px] flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <p role="status" className="text-nav text-tinta">
        No tenés una campaña en curso ni por empezar. Cuando tengas una, vas a ver acá su equipo, sus zonas y sus acompañamientos.
      </p>
    </div>
  );
}
