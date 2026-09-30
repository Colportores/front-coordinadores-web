import { ContenidoPestana } from "@/shell/ContenidoPestana";

export default function CargandoZonas() {
  return (
    <ContenidoPestana titulo="Zonas de la campaña">
      <p role="status" className="text-nav text-tinta-suave">
        Cargando las zonas de la campaña…
      </p>
    </ContenidoPestana>
  );
}
