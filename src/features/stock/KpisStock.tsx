import type { KpisStock as DatosKpisStock } from "@/datos/stock";
import { cn } from "@/lib/utils";

const TARJETAS: { clave: keyof DatosKpisStock; etiqueta: string; claseCifra: string }[] = [
  { clave: "librosEnCampo", etiqueta: "Libros en campo", claseCifra: "text-marca" },
  { clave: "pedidosEnCurso", etiqueta: "Pedidos en curso", claseCifra: "text-marca-media" },
  { clave: "transferenciasPendientes", etiqueta: "Transferencias pendientes", claseCifra: "text-alerta" },
];

export function KpisStock({ kpis }: { kpis: DatosKpisStock }) {
  return (
    <div className="grid max-w-[760px] grid-cols-3 gap-3.5">
      {TARJETAS.map((tarjeta) => (
        <div key={tarjeta.clave} className="rounded-tarjeta border border-borde bg-superficie px-4 py-3.5">
          <div className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">
            {tarjeta.etiqueta}
          </div>
          <div className={cn("font-serif text-cifra font-semibold", tarjeta.claseCifra)}>
            {kpis[tarjeta.clave]}
          </div>
        </div>
      ))}
    </div>
  );
}
