import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** Mientras la página trae el stock de la campaña. */
export default function CargandoStock() {
  return (
    <ContenidoPestana titulo="Stock">
      <p role="status" className="text-nav text-tinta-suave">
        Cargando el stock de la campaña…
      </p>
    </ContenidoPestana>
  );
}
