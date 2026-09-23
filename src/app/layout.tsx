import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import { modoDevActivo } from "@/config/flags";
import { fuenteShell } from "@/datos/shell";
import { PanelEstadoHu } from "@/dev/PanelEstadoHu";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { pestanasVisibles } from "@/shell/pestanas";
import { Topbar } from "@/shell/Topbar";

import "./globals.css";

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Colportaje · Coordinador",
  description: "Panel del coordinador: seguimiento del equipo de colportores de su región.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const resumen = await fuenteShell.obtenerResumenCoordinador();
  const modoDev = modoDevActivo();

  return (
    <html lang="es" className={`${sourceSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ProveedorModoDev activo={modoDev}>
          <TooltipProvider>
            {/* Solo escritorio: el diseño fija un ancho mínimo de 1280px. */}
            <div className="grid h-screen min-w-[1280px] grid-rows-[var(--spacing-topbar)_1fr] overflow-hidden">
              <Topbar resumen={resumen} pestanas={pestanasVisibles()} />
              <main className="relative overflow-hidden">{children}</main>
            </div>
            <PanelEstadoHu />
          </TooltipProvider>
        </ProveedorModoDev>
      </body>
    </html>
  );
}
