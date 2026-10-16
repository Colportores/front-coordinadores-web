import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** Mientras la página trae la campaña, el equipo y los sugeridos (vista 23, HU-CAM-004). Mismo patrón que la vista 24. */
export default function CargandoAnadirColportor() {
  return (
    <ContenidoPestana titulo="Añadir colportor">
      <p role="status" className="text-nav text-tinta-suave">
        Cargando las cuentas para añadir a la campaña…
      </p>
    </ContenidoPestana>
  );
}
