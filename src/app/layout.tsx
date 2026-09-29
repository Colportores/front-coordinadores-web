import type { Metadata } from "next";
import localFont from "next/font/local";

import { TooltipProvider } from "@/components/ui/tooltip";
import { modoDevActivo } from "@/config/flags";
import { fuenteShell } from "@/datos/shell";
import { PanelEstadoHu } from "@/dev/PanelEstadoHu";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { pestanasVisibles } from "@/shell/pestanas";
import { Topbar } from "@/shell/Topbar";

import "./globals.css";

// Fuentes locales (src/app/fuentes): el build no baja nada de la red. Ver LEEME.md de esa carpeta.
const sourceSerif = localFont({
  src: "./fuentes/source-serif-4-latin-wght-normal.woff2",
  variable: "--font-source-serif",
  weight: "200 900",
  display: "swap",
});

const inter = localFont({
  src: "./fuentes/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fuentes/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  display: "swap",
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
