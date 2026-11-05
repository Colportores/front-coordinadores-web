import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** Mientras la página trae los pedidos y las transferencias de la campaña. */
export default function CargandoPedidos() {
  return (
    <ContenidoPestana titulo="Pedidos y transferencias">
      <p role="status" className="text-nav text-tinta-suave">
        Cargando los pedidos y las transferencias…
      </p>
    </ContenidoPestana>
  );
}
