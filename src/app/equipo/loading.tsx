import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** Mientras la página trae la campaña, las zonas y los acompañamientos del equipo (vista 33, HU-JOR-004). */
export default function CargandoEquipo() {
  return (
    <ContenidoPestana titulo="Equipo">
      <p role="status" className="text-nav text-tinta-suave">
        Cargando el equipo de la campaña…
      </p>
    </ContenidoPestana>
  );
}
