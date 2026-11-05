/** La base contestó que no a la lectura del tablero (por ejemplo, la cuenta no es la coordinadora de esa campaña). */
export function RechazoParaInicio({ mensaje }: { mensaje: string }) {
  return (
    <div role="alert" className="m-[22px] flex max-w-xl flex-col gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <p className="text-nav text-tinta">{mensaje}</p>
    </div>
  );
}
