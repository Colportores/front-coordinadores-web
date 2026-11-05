import { ContenidoPestana } from "@/shell/ContenidoPestana";

export default function CargandoInicio() {
  return (
    <ContenidoPestana titulo="Inicio">
      <p role="status" className="text-nav text-tinta-suave">
        Cargando el tablero de Inicio…
      </p>
    </ContenidoPestana>
  );
}
