import Link from "next/link";

export interface Pendiente {
  clave: string;
  etiqueta: string;
  texto: string;
  accion: string;
  href: string;
}

/** Los pendientes de acción de la vista 33: colportores sin zona y personas que pidieron entrar a la campaña. */
export function FranjaPendientes({ pendientes }: { pendientes: Pendiente[] }) {
  if (pendientes.length === 0) return null;
  return (
    <ul aria-label="Pendientes de acción" className="flex gap-3">
      {pendientes.map((p) => (
        <li
          key={p.clave}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-tarjeta border border-borde bg-superficie py-1.5 pr-1.5 pl-3"
        >
          <span className="flex-none rounded-sm bg-marca-clara px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-marca-media">
            {p.etiqueta}
          </span>
          <span className="min-w-0 flex-1 text-cuerpo wrap-anywhere text-tinta">{p.texto}</span>
          <Link
            href={p.href}
            className="inline-flex min-h-8 flex-none items-center rounded-control bg-marca px-3 text-[11.5px] font-semibold text-superficie hover:bg-marca-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          >
            {p.accion}
          </Link>
        </li>
      ))}
    </ul>
  );
}
