import { LayoutPestanaConFlag } from "@/shell/LayoutPestanaConFlag";

// Archivo del shell (no de la pestaña): oculta Stock si su flag está apagado.
export default function LayoutStock({ children }: LayoutProps<"/stock">) {
  return <LayoutPestanaConFlag pestana="stock">{children}</LayoutPestanaConFlag>;
}
