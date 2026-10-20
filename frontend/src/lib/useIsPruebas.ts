"use client";

import { useState, useEffect } from "react";

/**
 * Hook para detectar de forma segura y robusta si la aplicación está corriendo en el
 * entorno de "PRUEBAS CCG" (variable de entorno NEXT_PUBLIC_APP_MODE='PRUEBAS',
 * puerto 3600, o subdominio/ruta con 'pruebas').
 */
export function useIsPruebas(override?: boolean): boolean {
  const isPruebasStatic =
    process.env.NEXT_PUBLIC_APP_MODE === "PRUEBAS" ||
    process.env.NEXT_PUBLIC_APP_PORT === "3600";

  const [isPruebas, setIsPruebas] = useState<boolean>(override ?? isPruebasStatic);

  useEffect(() => {
    if (override !== undefined) {
      setIsPruebas(override);
      return;
    }
    const detected =
      isPruebasStatic ||
      (typeof window !== "undefined" &&
        (window.location.port === "3600" ||
          window.location.hostname.toLowerCase().includes("pruebas") ||
          window.location.pathname.toLowerCase().includes("/pruebas") ||
          window.location.search.toLowerCase().includes("pruebas")));

    setIsPruebas(detected);
    if (detected && typeof document !== "undefined") {
      document.title = "PRUEBAS CCG — Colegio Cerro Grande";
    }
  }, [override, isPruebasStatic]);

  return isPruebas;
}
