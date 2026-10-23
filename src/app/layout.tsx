import type { Metadata } from "next";
import localFont from "next/font/local";

import { TooltipProvider } from "@/components/ui/tooltip";
import { modoDevActivo } from "@/config/flags";
import { fuenteShell } from "@/datos/shell";
import type { ResultadoCampanias } from "@/datos/shell";
import { PanelEstadoHu } from "@/dev/PanelEstadoHu";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { MarcoDelPanel } from "@/shell/MarcoDelPanel";
import { pestanasVisibles } from "@/shell/pestanas";

import "./globals.css";

// Fuentes locales (src/app/fuentes): el build no baja nada de la red. Ver LEEME.md de esa carpeta.
const sourceSerif = localFont({
  src: "./fuentes/source-serif-4-latin-wght-normal.woff2",
  variable: "--font-source-serif",
  adjustFontFallback: "Times New Roman",
  weight: "200 900",
  display: "swap",
});

const inter = localFont({
  src: "./fuentes/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  adjustFontFallback: "Arial",
  weight: "100 900",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fuentes/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains-mono",
  adjustFontFallback: false,
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Colportaje · Coordinador",
  description: "Panel del coordinador: seguimiento del equipo de colportores de su región.",
  // Sitio de prueba (GitHub Pages, datos simulados): que ningún buscador lo indexe.
  ...(process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1" ? { robots: { index: false, follow: false } } : {}),
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const resumen = await fuenteShell.obtenerResumenCoordinador();
  const modoDev = modoDevActivo();

  // La lista de campañas del topbar se pide al abrir el selector, con una server action. Sitio de prueba (export estático,
  // sin servidor): no hay server actions, así que el topbar usa la lista simulada desde el navegador. La condición es
  // literal y el `import()` está en el `else` para que el módulo con la acción no entre al build exportado.
  let pedirCampanias: (() => Promise<ResultadoCampanias>) | undefined;
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    pedirCampanias = undefined;
  } else {
    pedirCampanias = (await import("./acciones-campanias")).listarCampaniasAccion;
  }

  return (
    <html lang="es" className={`${sourceSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ProveedorModoDev activo={modoDev}>
          <TooltipProvider>
            <MarcoDelPanel resumen={resumen} pestanas={pestanasVisibles()} pedirCampanias={pedirCampanias}>
              {children}
            </MarcoDelPanel>
            <PanelEstadoHu />
          </TooltipProvider>
        </ProveedorModoDev>
      </body>
    </html>
  );
}
