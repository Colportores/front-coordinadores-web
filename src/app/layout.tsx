import type { Metadata } from "next";
import localFont from "next/font/local";

import type { ResultadoCierre } from "@/auth/acceso";
import { CABECERA_SIN_MARCO } from "@/auth/guarda";
import { modoDeAcceso } from "@/auth/modo";
import { TooltipProvider } from "@/components/ui/tooltip";
import { modoDevActivo } from "@/config/flags";
import { fuenteShell } from "@/datos/shell";
import type { ResultadoCampanias, ResumenCoordinador } from "@/datos/shell";
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
  const modoDev = modoDevActivo();

  // La lista de campañas del topbar se pide al abrir el selector, con una server action. Sitio de prueba (export estático,
  // sin servidor): no hay server actions, así que el topbar usa la lista simulada desde el navegador. La condición es
  // literal y el `import()` está en el `else` para que el módulo con la acción no entre al build exportado.
  // Lo mismo para «Cerrar sesión» y la pantalla de acceso (issue #18): solo hay login con las variables públicas de Supabase.
  let pedirCampanias: (() => Promise<ResultadoCampanias>) | undefined;
  let cerrarSesion: (() => Promise<ResultadoCierre>) | undefined;
  let sinMarco = false;
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    pedirCampanias = undefined;
  } else {
    const modo = modoDeAcceso();
    // La pantalla de acceso es de quien todavía no entró: sin topbar, sin pestañas y sin pedir el perfil (no hay sesión). El
    // proxy lo avisa con una cabecera; leerla vuelve dinámica la ruta, por eso solo se lee con el login prendido.
    if (modo !== "apagado") sinMarco = (await (await import("next/headers")).headers()).get(CABECERA_SIN_MARCO) === "1";
    if (!sinMarco) {
      pedirCampanias = (await import("./acciones-campanias")).listarCampaniasAccion;
      if (modo === "activo") cerrarSesion = (await import("@/auth/acciones")).cerrarSesionAccion;
    }
  }

  // Sin marco no se pide el perfil: la persona todavía no tiene sesión.
  const resumen: ResumenCoordinador | null = sinMarco ? null : await fuenteShell.obtenerResumenCoordinador();

  return (
    <html lang="es" className={`${sourceSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ProveedorModoDev activo={modoDev}>
          <TooltipProvider>
            {resumen ? (
              <MarcoDelPanel resumen={resumen} pestanas={pestanasVisibles()} pedirCampanias={pedirCampanias} cerrarSesion={cerrarSesion}>
                {children}
              </MarcoDelPanel>
            ) : (
              children
            )}
            <PanelEstadoHu />
          </TooltipProvider>
        </ProveedorModoDev>
      </body>
    </html>
  );
}
