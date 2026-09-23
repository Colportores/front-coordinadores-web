import { LayoutPestanaConFlag } from "@/shell/LayoutPestanaConFlag";

// Archivo del shell (no de la pestaña): oculta Cuentas si su flag está apagado.
export default function LayoutCuentas({ children }: LayoutProps<"/cuentas">) {
  return <LayoutPestanaConFlag pestana="cuentas">{children}</LayoutPestanaConFlag>;
}
