import type { ResumenCampania as ResumenCampaniaDatos } from "@/datos/reportes/contrato";

function Fila({ etiqueta, valor, claseValor }: { etiqueta: string; valor: string; claseValor?: string }) {
  return (
    <div className="flex justify-between text-cuerpo">
      <span className="text-tinta-suave">{etiqueta}</span>
      <span className={`font-mono font-medium ${claseValor ?? "text-tinta"}`}>{valor}</span>
    </div>
  );
}

const FORMATO_ENTERO = new Intl.NumberFormat("es-UY");

/** Tarjeta "Resumen de campaña": agregados de horas, ventas y cobranza de la región. */
export function ResumenCampania({ resumen }: { resumen: ResumenCampaniaDatos }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <span className="font-serif text-titulo font-semibold text-tinta">Resumen de campaña</span>
      <Fila etiqueta="Horas totales región" valor={`${FORMATO_ENTERO.format(resumen.horasTotalesRegion)} h`} />
      <Fila etiqueta="Libros colocados" valor={FORMATO_ENTERO.format(resumen.librosColocados)} />
      <Fila etiqueta="Visitas registradas" valor={FORMATO_ENTERO.format(resumen.visitasRegistradas)} />
      <Fila etiqueta="Jornadas acompañadas" valor={`${resumen.porcentajeJornadasAcompanadas}%`} />
      <Fila
        etiqueta="Cobrado / vendido"
        valor={`${resumen.porcentajeCobradoSobreVendido}%`}
        claseValor="text-exito"
      />
    </div>
  );
}
