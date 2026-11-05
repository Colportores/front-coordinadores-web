import { ContenidoPestana } from "@/shell/ContenidoPestana";

export default function CargandoCuentas() {
  return (
    <ContenidoPestana titulo="Cuentas">
      <p role="status" className="text-nav text-tinta-suave">
        Cargando las cuentas…
      </p>
    </ContenidoPestana>
  );
}
