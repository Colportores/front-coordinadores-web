import { ContenidoPestana } from "@/shell/ContenidoPestana";

export default function CargandoReportes() {
  return (
    <ContenidoPestana titulo="Reportes">
      <p role="status" className="text-nav text-tinta-suave">
        Cargando las horas de la campaña…
      </p>
    </ContenidoPestana>
  );
}
