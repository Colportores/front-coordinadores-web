import { EsqueletoDePrecios } from "@/features/stock/vista-27/EsqueletoDePrecios";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** Mientras la página trae los precios de la campaña (27G·06). */
export default function CargandoPrecios() {
  return (
    <ContenidoPestana titulo="Precios de venta">
      <EsqueletoDePrecios />
    </ContenidoPestana>
  );
}
