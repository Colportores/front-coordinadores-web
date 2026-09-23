import { LayoutPestanaConFlag } from "@/shell/LayoutPestanaConFlag";

// Archivo del shell (no de la pestaña). El corte principal lo hace src/proxy.ts
// antes de renderizar; esto es una segunda barrera.
// Sin prerender: así el build nunca deja HTML/RSC estático de una pestaña oculta.
export const dynamic = "force-dynamic";

export default function LayoutStock({ children }: LayoutProps<"/stock">) {
  return <LayoutPestanaConFlag pestana="stock">{children}</LayoutPestanaConFlag>;
}
