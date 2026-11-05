import { ChipHu } from "@/dev/ChipHu";
import { husDePestana } from "@/dev/estado-hu";
import { ContenidoPestana } from "@/shell/ContenidoPestana";
import { PESTANAS, type Pestana } from "@/shell/pestanas";

/**
 * Marcador de lugar de una pestaña todavía sin UI. Lo reemplaza el trabajo de
 * cada pestaña en su `src/app/<ruta>/page.tsx`.
 */
export function StubPestana({ pestana }: { pestana: Pestana }) {
  const definicion = PESTANAS.find((p) => p.id === pestana);
  const etiqueta = definicion?.etiqueta ?? pestana;
  return (
    <ContenidoPestana titulo={etiqueta}>
      <div className="flex flex-col gap-3 rounded-tarjeta border border-dashed border-borde bg-superficie px-5 py-6">
        <span className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">
          Pestaña {etiqueta}
        </span>
        <p className="font-serif text-titulo font-semibold text-marca">Esta pestaña todavía no tiene su vista.</p>
        <div className="flex flex-wrap gap-2">
          {husDePestana(pestana).map((h) => (
            <ChipHu key={h.id} hu={h.id} />
          ))}
        </div>
      </div>
    </ContenidoPestana>
  );
}
