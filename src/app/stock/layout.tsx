import { LayoutPestanaConFlag } from "@/shell/LayoutPestanaConFlag";

// Archivo del shell (no de la pestaña). El corte principal lo hace src/proxy.ts
// antes de renderizar; esto es una segunda barrera (con el flag apagado, la ruta no se prerenderiza:
// ver LayoutPestanaConFlag).
export default function LayoutStock({ children }: LayoutProps<"/stock">) {
  return <LayoutPestanaConFlag pestana="stock">{children}</LayoutPestanaConFlag>;
}
