"use client";

import { useState, useEffect } from "react";

/**
 * Hook para detectar de forma segura si la aplicación está corriendo en el
 * entorno de "PRUEBAS CCG" (puerto 3600 o subdominio/ruta con 'pruebas').
 * 
 * Evita por completo los errores de Hydration Mismatch de React 18 / Next.js
 * (#425, #418, #423) garantizando que el renderizado inicial en cliente
 * sea exactamente idéntico al renderizado del servidor (SSR), y actualizando
 * el estado en useEffect tras el montaje en el navegador.
 */
export function useIsPruebas(override?: boolean): boolean {
  const [isPruebas, setIsPruebas] = useState<boolean>(override ?? false);

  useEffect(() => {
    if (override !== undefined) {
      setIsPruebas(override);
      return;
    }
    const detected =
      typeof window !== "undefined" &&
      (window.location.port === "3600" ||
        window.location.hostname.toLowerCase().includes("pruebas") ||
        window.location.pathname.toLowerCase().includes("/pruebas"));
    setIsPruebas(detected);
  }, [override]);

  return isPruebas;
}
