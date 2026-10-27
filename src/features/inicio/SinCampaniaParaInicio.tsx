import Link from "next/link";

import { Button } from "@/components/ui/button";

/** La coordinadora no tiene una campaña en curso ni por empezar: no hay día que mirar. */
export function SinCampaniaParaInicio() {
  return (
    <div className="m-[22px] flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <p className="text-nav text-tinta">No tenés una campaña en curso ni por empezar, así que no hay un día para mirar todavía.</p>
      <Button asChild variant="outline" className="text-nav font-semibold text-tinta-2">
        <Link href="/equipo">Ir a Equipo</Link>
      </Button>
    </div>
  );
}
