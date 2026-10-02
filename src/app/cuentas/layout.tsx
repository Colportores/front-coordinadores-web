import { LayoutPestanaConFlag } from "@/shell/LayoutPestanaConFlag";

// Archivo del shell (no de la pestaña). El corte principal lo hace src/proxy.ts
// antes de renderizar; esto es una segunda barrera (con el flag apagado, la ruta no se prerenderiza:
// ver LayoutPestanaConFlag).
export default function LayoutCuentas({ children }: LayoutProps<"/cuentas">) {
  return <LayoutPestanaConFlag pestana="cuentas">{children}</LayoutPestanaConFlag>;
}
