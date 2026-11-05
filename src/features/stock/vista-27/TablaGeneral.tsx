import { cn } from "@/lib/utils";

import { NombreDeItem } from "./NombreDeItem";
import { agruparFilas, type FilaGeneral } from "./modelo";

/** Las seis columnas de las dos tablas de la vista, con las fracciones del canvas (2,6 · 0,7 · 1 · 1 · 1 · 1,2). */
export function ColumnasDePrecios() {
  return (
    <colgroup>
      <col className="w-[34.7%]" />
      <col className="w-[9.3%]" />
      <col className="w-[13.3%]" />
      <col className="w-[13.3%]" />
      <col className="w-[13.3%]" />
      <col className="w-[16%]" />
    </colgroup>
  );
}

export const CLASE_DE_ENCABEZADO = "px-3 py-2.5 text-etiqueta font-semibold tracking-etiqueta text-tinta-suave";

export function TituloDeGrupo({ texto }: { texto: string }) {
  return (
    <tr>
      <th
        scope="colgroup"
        colSpan={6}
        className="border-t border-borde-suave bg-superficie-suave px-3 py-1.5 text-left text-etiqueta font-semibold tracking-etiqueta text-tinta-suave"
      >
        {texto}
      </th>
    </tr>
  );
}

/** La pestaña «General» (27G·01): el precio de todo el país, solo para mirar, y en cuántas ciudades se aparta. */
export function TablaGeneral({ filas }: { filas: FilaGeneral[] }) {
  return (
    <table className="w-full table-fixed border-collapse">
      <caption className="sr-only">Precio general de cada producto y colección, y en cuántas ciudades de la campaña tiene excepción</caption>
      <ColumnasDePrecios />
      <thead>
        <tr className="text-left">
          <th scope="col" className={CLASE_DE_ENCABEZADO}>
            PRODUCTO O COLECCIÓN
          </th>
          <th scope="col" className={CLASE_DE_ENCABEZADO}>
            CÓDIGO
          </th>
          <th scope="col" className={cn(CLASE_DE_ENCABEZADO, "text-right")}>
            PRECIO GENERAL
          </th>
          <th scope="col" className={cn(CLASE_DE_ENCABEZADO, "text-right")}>
            CON EXCEPCIÓN EN
          </th>
          <th scope="col" className={CLASE_DE_ENCABEZADO}>
            <span className="sr-only">Detalle</span>
          </th>
          <th scope="col" className={CLASE_DE_ENCABEZADO}>
            <span className="sr-only">Acciones</span>
          </th>
        </tr>
      </thead>
      {agruparFilas(filas).map((grupo) => (
        <tbody key={grupo.titulo}>
          <TituloDeGrupo texto={grupo.titulo} />
          {grupo.filas.map((fila) => (
            <tr key={fila.item.clave} className="border-t border-borde-suave align-middle">
              <th scope="row" className="px-3 py-2.5 text-left font-normal">
                <NombreDeItem item={fila.item} />
              </th>
              <td className="px-3 py-2.5 font-mono text-chico wrap-anywhere text-tinta-suave">{fila.item.codigo ?? "—"}</td>
              <td className={cn("px-3 py-2.5 text-right font-serif text-titulo font-semibold", fila.sinPrecio ? "text-peligro" : "text-tinta")}>
                {fila.precio}
              </td>
              <td className={cn("px-3 py-2.5 text-right text-cuerpo", fila.ciudadesConExcepcion > 0 ? "text-tinta" : "text-tinta-suave")}>
                {fila.textoDeExcepciones}
              </td>
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
