import { ContenidoPestana } from "@/shell/ContenidoPestana";

export default function CargandoValidarTickets() {
  return (
    <ContenidoPestana titulo="Validar tickets">
      <p role="status" className="text-nav text-tinta-suave">
        Cargando los tickets…
      </p>
    </ContenidoPestana>
  );
}
