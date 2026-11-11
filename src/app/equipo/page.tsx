import { fuenteEquipo } from "@/datos/equipo";
import { fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { SeccionHu } from "@/dev/SeccionHu";
import { EquipoVista } from "@/features/equipo/vista-33/EquipoVista";
import { EquipoVistaLocal } from "@/features/equipo/vista-33/EquipoVistaLocal";
import { SinCampaniaParaEquipo } from "@/features/equipo/vista-33/SinCampaniaParaEquipo";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/**
 * Vista 33 (HU-JOR-004, HU-CAM-006): el equipo de la campaña por ciudad, con las zonas de cada colportor (la de hoy y las
 * anteriores) y sus acompañamientos (historial, días sin acompañar y registro sobre una jornada terminada) y sus becas (V2: carrera, a qué apunta y avance, todo desde la fila). El límite de
 * pedido por colportor espera una decisión y el retoque del diseño (front-coordinadores-web#68).
 */
export default async function PestanaEquipo() {
  // Sitio de prueba (export estático, sin servidor): no hay server actions, así que la vista le habla a la fuente
  // simulada desde el navegador. La condición es literal y el `import()` está en el `else` para que el módulo con
  // las server actions no entre al build exportado. Ver README, «Sitio de prueba».
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    // Siempre la simulada, por construcción: el sitio de prueba nunca lee `fuenteEquipo` (el selector).
    const datos = await fuenteEquipoSimulada.obtenerEquipoPorCiudad();

    return (
      <ContenidoPestana titulo="Equipo" className="gap-0 overflow-hidden p-0">
        {datos ? (
          <SeccionHu hu="HU-JOR-004" className="flex min-h-0 flex-1 flex-col">
            <EquipoVistaLocal datos={datos} />
          </SeccionHu>
        ) : (
          <SeccionHu hu="HU-JOR-004">
            <SinCampaniaParaEquipo />
          </SeccionHu>
        )}
      </ContenidoPestana>
    );
  } else {
    const datos = await fuenteEquipo.obtenerEquipoPorCiudad();
    if (!datos) {
      return (
        <ContenidoPestana titulo="Equipo" className="gap-0 overflow-hidden p-0">
          <SeccionHu hu="HU-JOR-004">
            <SinCampaniaParaEquipo />
          </SeccionHu>
        </ContenidoPestana>
      );
    }
    // Server actions: el navegador pide y el servidor le habla a la fuente (las RPC de Supabase bajo el puente de
    // desarrollo, la simulada en cualquier build de producción).
    const { crearAccionesEquipo } = await import("./acciones-servidor");

    return (
      <ContenidoPestana titulo="Equipo" className="gap-0 overflow-hidden p-0">
        <SeccionHu hu="HU-JOR-004" className="flex min-h-0 flex-1 flex-col">
          <EquipoVista datos={datos} acciones={crearAccionesEquipo(datos.campaniaId)} />
        </SeccionHu>
      </ContenidoPestana>
    );
  }
}
