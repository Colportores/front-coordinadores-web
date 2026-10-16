import Link from "next/link";

/**
 * Vista 23 sin campaña a la que añadir: el coordinador no tiene una en curso (todavía no empezó, terminó o no tiene).
 * Sin artboard: texto provisorio (pendiente mapa §2, `front-coordinadores-web-41-impl-*`). Mismo patrón que `error.tsx`.
 */
export function SinCampaniaParaAnadir() {
  return (
    <div className="flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <p role="status" className="text-nav text-tinta">
        No tenés una campaña en curso a la que añadir colportores.
      </p>
      <Link href="/equipo" className="inline-flex min-h-6 items-center text-nav font-semibold text-marca-media hover:text-marca">
        ‹ Equipo
      </Link>
    </div>
  );
}
