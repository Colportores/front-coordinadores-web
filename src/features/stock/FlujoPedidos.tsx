/** Nota fija del diseño: cómo funciona la autorización de pedidos y transferencias (HU-STK-003). */
export function FlujoPedidos() {
  return (
    <div className="rounded-tarjeta bg-superficie-suave px-[15px] py-3.5 text-mini leading-relaxed text-tinta-2">
      <b className="text-marca">Flujo de pedidos:</b> los pedidos y transferencias los autorizás vos como
      coordinador — el administrador no interviene. Al autorizar, se genera automáticamente la deuda en la
      cuenta de cada colportor receptor.
    </div>
  );
}
