import { EsqueletoDeCuentasDeLaRuta } from "@/features/cuentas/EsqueletoDeCuentas";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** La carga de Cuentas (41B·04): el marco de la vista con el esqueleto de la tabla y la pestaña de la dirección activa (39B·05). El resto de la página ocupa el mismo lugar. */
export default function CargandoCuentas() {
  return (
    <ContenidoPestana titulo="Cuentas" className="gap-0 overflow-hidden p-0">
      <EsqueletoDeCuentasDeLaRuta />
    </ContenidoPestana>
  );
}
