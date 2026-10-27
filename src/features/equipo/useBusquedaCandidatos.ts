"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CandidatoColportor, ResultadoBusqueda } from "@/datos/equipo/contrato";
import { esSesionVencida } from "@/auth/sesion-vencida";
import { MENSAJE_SESION_VENCIDA, mensajeSinConexion } from "@/lib/mensajes";

/** Cuánto se espera después de la última tecla antes de buscar en el servidor. */
export const MS_ESPERA_BUSQUEDA = 250;

export type BuscarCandidatos = (texto: string, despuesDe: string | null) => Promise<ResultadoBusqueda>;

interface Respuesta {
  texto: string;
  candidatos: CandidatoColportor[];
  hayMas: boolean;
  /** Falló la primera página: no hay lista. */
  falla: string | null;
  cargandoMas: boolean;
  /** Falló una página siguiente: la lista que ya se ve queda. */
  fallaMas: string | null;
  /** El cursor de esa página ya no sirve: reintentar es buscar de nuevo desde el principio. */
  reiniciarMas: boolean;
  /** La falla (la de la primera página o la de una siguiente) es que la sesión venció: «Reintentar» no sirve, hay que entrar de nuevo. */
  sesionVencida: boolean;
}

function sinRepetir(previos: CandidatoColportor[], nuevos: CandidatoColportor[]): CandidatoColportor[] {
  const vistos = new Set(previos.map((c) => c.id));
  return [...previos, ...nuevos.filter((c) => !vistos.has(c.id))];
}

/**
 * La búsqueda de la vista 23 contra el servidor (decisión de Cristian, 30/09): se espera a que termine de teclear,
 * se piden 10 por página y las siguientes se piden al llegar al final de la lista. Sin texto no se busca: están los
 * sugeridos con los que abrió la página.
 *
 * Una respuesta que llega tarde (se siguió escribiendo) se descarta, y una que falla deja el aviso y «Reintentar» sin
 * trabar nada: ni el buscador ni la lista que ya se ve.
 */
export function useBusquedaCandidatos(buscar: BuscarCandidatos, sugeridos: CandidatoColportor[]) {
  const [consulta, setConsulta] = useState("");
  const [intento, setIntento] = useState(0);
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  /** Cuántas primeras páginas del servidor llegaron: quien guarda algo sobre una cuenta sabe cuándo ya hay un dato más nuevo. */
  const [recibidas, setRecibidas] = useState(0);
  const texto = consulta.trim();

  const buscarRef = useRef(buscar);
  const respuestaRef = useRef(respuesta);
  useEffect(() => {
    buscarRef.current = buscar;
    respuestaRef.current = respuesta;
  });
  /** El texto de la búsqueda que tiene una página siguiente en camino: corta la segunda petición. */
  const masEn = useRef<string | null>(null);

  useEffect(() => {
    if (texto === "") return;
    let vigente = true;
    const temporizador = setTimeout(async () => {
      const base = {
        texto,
        candidatos: [],
        hayMas: false,
        falla: null,
        cargandoMas: false,
        fallaMas: null,
        reiniciarMas: false,
        sesionVencida: false,
      };
      let nueva: Respuesta;
      try {
        const pagina = await buscarRef.current(texto, null);
        nueva = pagina.ok
          ? { ...base, candidatos: pagina.candidatos, hayMas: pagina.hayMas }
          : { ...base, falla: pagina.mensaje, sesionVencida: pagina.sesionVencida === true };
      } catch (error) {
        nueva = esSesionVencida(error)
          ? { ...base, falla: MENSAJE_SESION_VENCIDA, sesionVencida: true }
          : { ...base, falla: mensajeSinConexion("buscar cuentas") };
      }
      if (vigente) {
        setRespuesta(nueva);
        setRecibidas((n) => n + 1);
      }
    }, MS_ESPERA_BUSQUEDA);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [texto, intento]);

  const cargarMas = useCallback(async (despuesDeUnaFalla = false) => {
    const actual = respuestaRef.current;
    const ultimo = actual?.candidatos.at(-1);
    if (!actual || !ultimo || !actual.hayMas || (actual.fallaMas !== null && !despuesDeUnaFalla)) return;
    if (masEn.current === actual.texto) return;
    masEn.current = actual.texto;
    const delTexto = actual.texto;
    setRespuesta((p) => (p && p.texto === delTexto ? { ...p, cargandoMas: true, fallaMas: null } : p));

    let cambio: (p: Respuesta) => Respuesta;
    try {
      const pagina = await buscarRef.current(delTexto, ultimo.id);
      cambio = pagina.ok
        ? (p) => ({ ...p, candidatos: sinRepetir(p.candidatos, pagina.candidatos), hayMas: pagina.hayMas, cargandoMas: false })
        : (p) => ({
            ...p,
            cargandoMas: false,
            fallaMas: pagina.mensaje,
            reiniciarMas: pagina.reiniciar === true,
            sesionVencida: pagina.sesionVencida === true,
          });
    } catch (error) {
      cambio = esSesionVencida(error)
        ? (p) => ({ ...p, cargandoMas: false, fallaMas: MENSAJE_SESION_VENCIDA, reiniciarMas: false, sesionVencida: true })
        : (p) => ({ ...p, cargandoMas: false, fallaMas: mensajeSinConexion("cargar más cuentas"), reiniciarMas: false, sesionVencida: false });
    }
    if (masEn.current === delTexto) masEn.current = null;
    setRespuesta((p) => (p && p.texto === delTexto ? cambio(p) : p));
  }, []);

  /** Vuelve a pedir la primera página (la que falló, o desde el principio si el cursor se perdió). */
  const reintentar = useCallback(() => {
    masEn.current = null;
    setRespuesta(null);
    setIntento((n) => n + 1);
  }, []);

  const reintentarMas = useCallback(() => {
    if (respuestaRef.current?.reiniciarMas) reintentar();
    else void cargarMas(true);
  }, [reintentar, cargarMas]);

  const hayConsulta = texto !== "";
  const actual = hayConsulta && respuesta?.texto === texto ? respuesta : null;

  return {
    consulta,
    setConsulta,
    hayConsulta,
    /** El texto que se busca, sin los espacios de los costados. */
    texto,
    /** La primera página de este texto todavía no llegó. */
    buscando: hayConsulta && actual === null,
    resultados: hayConsulta ? (actual?.candidatos ?? []) : sugeridos,
    /** Cuántas veces el servidor contestó una búsqueda nueva (la primera página; las siguientes no cuentan). */
    recibidas,
    hayMas: hayConsulta && actual !== null && actual.hayMas,
    cargandoMas: actual?.cargandoMas ?? false,
    falla: actual?.falla ?? null,
    fallaMas: actual?.fallaMas ?? null,
    /** La falla que se ve es la sesión vencida: en vez de «Reintentar», hay que entrar de nuevo. */
    sesionVencida: actual?.sesionVencida ?? false,
    cargarMas,
    reintentar,
    reintentarMas,
  };
}
